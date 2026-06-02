import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { db } from "@/db/drizzle"
import { trades, strategies } from "@/db/schema"
import { eq, and, inArray, isNotNull, desc } from "drizzle-orm"
import { z } from "zod"
import { dataSourceSchema } from "@/lib/validations/monte-carlo"
import type { SourceStats } from "@/types/monte-carlo"

const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as Record<string, unknown>
		const validated = dataSourceSchema.parse(body)

		let tradesList: Array<{
			outcome: string | null
			pnl: number | string | null
			realizedRMultiple: string | null
			plannedRiskAmount: number | string | null
			commission: number | string | null
			fees: number | string | null
			strategyId: string | null
			entryDate: Date
		}> = []
		let sourceName = ""
		let strategiesCount = 0
		let accountsCount = 1

		const tradeColumns = {
			outcome: true,
			pnl: true,
			realizedRMultiple: true,
			plannedRiskAmount: true,
			commission: true,
			fees: true,
			strategyId: true,
			entryDate: true,
		} as const

		if (validated.type === "strategy") {
			const strategy = await db.query.strategies.findFirst({
				where: and(
					eq(strategies.id, validated.strategyId),
					eq(strategies.userId, auth.userId)
				),
			})
			if (!strategy) {
				return archError(
					"Strategy not found",
					[{ code: "NOT_FOUND", detail: "Strategy not found" }],
					404
				)
			}
			sourceName = strategy.name
			strategiesCount = 1

			const rawTrades = await db.query.trades.findMany({
				where: and(
					eq(trades.strategyId, validated.strategyId),
					isNotNull(trades.outcome)
				),
				orderBy: [desc(trades.entryDate)],
				columns: tradeColumns,
			})
			tradesList = rawTrades
		} else if (validated.type === "all_strategies") {
			sourceName = "All Strategies"

			const accountStrategies = await db.query.strategies.findMany({
				where: eq(strategies.userId, auth.userId),
			})
			strategiesCount = accountStrategies.length

			const rawTrades = await db.query.trades.findMany({
				where: and(
					eq(trades.accountId, auth.accountId),
					isNotNull(trades.outcome)
				),
				orderBy: [desc(trades.entryDate)],
				columns: tradeColumns,
			})
			tradesList = rawTrades
		} else if (validated.type === "universal") {
			if (!auth.showAllAccounts) {
				return archError(
					"Universal source requires show all accounts enabled",
					[
						{
							code: "NOT_ALLOWED",
							detail: "Enable show all accounts in settings",
						},
					],
					403
				)
			}
			sourceName = "All Accounts & Strategies"
			accountsCount = auth.allAccountIds.length

			const allStrategies = await db.query.strategies.findMany({
				where: eq(strategies.userId, auth.userId),
			})
			strategiesCount = allStrategies.length

			const rawTrades = await db.query.trades.findMany({
				where: and(
					inArray(trades.accountId, auth.allAccountIds),
					isNotNull(trades.outcome)
				),
				orderBy: [desc(trades.entryDate)],
				columns: tradeColumns,
			})
			tradesList = rawTrades
		}

		if (tradesList.length === 0) {
			return archError(
				`No completed trades found for source: ${sourceName}`,
				[{ code: "NO_TRADES", detail: "No completed trades found" }],
				404
			)
		}

		const wins = tradesList.filter((t) => t.outcome === "win")
		const losses = tradesList.filter((t) => t.outcome === "loss")
		const decidedCount = wins.length + losses.length
		const winRate = decidedCount > 0 ? (wins.length / decidedCount) * 100 : 0

		const tradesWithR = tradesList.filter(
			(t) => t.realizedRMultiple !== null && t.realizedRMultiple !== undefined
		)
		const winningR = tradesWithR
			.filter((t) => parseFloat(t.realizedRMultiple!) > 0)
			.map((t) => parseFloat(t.realizedRMultiple!))
		const losingR = tradesWithR
			.filter((t) => parseFloat(t.realizedRMultiple!) < 0)
			.map((t) => Math.abs(parseFloat(t.realizedRMultiple!)))

		const avgWinR =
			winningR.length > 0
				? winningR.reduce((a, b) => a + b, 0) / winningR.length
				: 1
		const avgLossR =
			losingR.length > 0
				? losingR.reduce((a, b) => a + b, 0) / losingR.length
				: 1
		const avgRewardRiskRatio = avgWinR / avgLossR || 1

		const totalCommission = tradesList.reduce(
			(sum, t) => sum + (Number(t.commission) || 0) + (Number(t.fees) || 0),
			0
		)
		const avgCommissionPerTradeCents =
			tradesList.length > 0
				? Math.round(totalCommission / tradesList.length)
				: 0
		const breakevenCount = tradesList.length - wins.length - losses.length
		const breakevenRate =
			tradesList.length > 0 ? (breakevenCount / tradesList.length) * 100 : 0
		const totalRisk = tradesList.reduce(
			(sum, t) => sum + (Number(t.plannedRiskAmount) || 0),
			0
		)
		const commissionImpactR =
			totalRisk > 0 ? (totalCommission / totalRisk) * 100 : 0

		const grossProfit = wins.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)
		const grossLoss = Math.abs(
			losses.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)
		)
		const profitFactor =
			grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

		const allR = tradesWithR.map((t) => parseFloat(t.realizedRMultiple!))
		const avgR =
			allR.length > 0 ? allR.reduce((a, b) => a + b, 0) / allR.length : 0

		let strategiesBreakdown: SourceStats["strategiesBreakdown"]
		if (validated.type !== "strategy") {
			const breakdown = new Map<
				string,
				{ name: string; tradesCount: number; wins: number; losses: number }
			>()
			const strategyIds = [
				...new Set(tradesList.map((t) => t.strategyId).filter(Boolean)),
			] as string[]
			const strategiesMap = new Map<string, string>()

			if (strategyIds.length > 0) {
				const strategyRecords = await db.query.strategies.findMany({
					where: inArray(strategies.id, strategyIds),
					columns: { id: true, name: true },
				})
				for (const s of strategyRecords) {
					strategiesMap.set(s.id, s.name)
				}
			}

			for (const trade of tradesList) {
				const name = trade.strategyId
					? strategiesMap.get(trade.strategyId) || "No Strategy"
					: "No Strategy"
				if (!breakdown.has(name)) {
					breakdown.set(name, { name, tradesCount: 0, wins: 0, losses: 0 })
				}
				const entry = breakdown.get(name)!
				entry.tradesCount++
				if (trade.outcome === "win") {
					entry.wins++
				}
				if (trade.outcome === "loss") {
					entry.losses++
				}
			}

			strategiesBreakdown = Array.from(breakdown.values()).map((s) => {
				const decided = s.wins + s.losses
				return {
					name: s.name,
					tradesCount: s.tradesCount,
					winRate: decided > 0 ? (s.wins / decided) * 100 : 0,
				}
			})
		}

		const dates = tradesList.map((t) => new Date(t.entryDate))
		const dateRange = {
			from: new Date(Math.min(...dates.map((d) => d.getTime()))),
			to: new Date(Math.max(...dates.map((d) => d.getTime()))),
		}

		const roundTo2 = (n: number): number => Math.round(n * 100) / 100

		const stats: SourceStats = {
			sourceType: validated.type,
			sourceName,
			totalTrades: tradesList.length,
			winRate: roundTo2(winRate),
			avgRewardRiskRatio: roundTo2(avgRewardRiskRatio),
			avgRiskPerTrade: 1,
			avgCommissionImpact: roundTo2(commissionImpactR),
			dateRange,
			profitFactor: roundTo2(profitFactor),
			avgR: roundTo2(avgR),
			avgWinR: roundTo2(avgWinR),
			avgLossR: roundTo2(avgLossR),
			commissionImpactR: roundTo2(commissionImpactR),
			avgCommissionPerTradeCents,
			breakevenRate: roundTo2(breakevenRate),
			strategiesCount,
			accountsCount: validated.type === "universal" ? accountsCount : undefined,
			strategiesBreakdown,
		}

		return archSuccess("Stats retrieved", stats)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError(
				"Validation failed",
				error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				}))
			)
		}

		return archError(
			"Failed to retrieve simulation stats",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
