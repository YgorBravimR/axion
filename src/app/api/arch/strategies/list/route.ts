import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { strategies, trades, strategyConditions, strategyScenarios } from "@/db/schema"
import { eq, and, desc, inArray, sql } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"

/**
 * GET /api/arch/strategies/list
 *
 * Lists all active strategies with performance stats, conditions count, and scenarios count.
 * Strategies are user-level (not account-scoped). Trade stats respect the showAllAccounts setting.
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const userStrategies = await db
			.select()
			.from(strategies)
			.where(
				and(
					eq(strategies.userId, auth.userId),
					eq(strategies.isActive, true)
				)
			)
			.orderBy(desc(strategies.createdAt))

		if (userStrategies.length === 0) {
			return archSuccess("Strategies retrieved", { items: [] })
		}

		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		const dek = await getUserDek(auth.userId)

		const strategyStats = await Promise.all(
			userStrategies.map(async (strategy) => {
				const rawTrades = await db.query.trades.findMany({
					where: and(
						eq(trades.strategyId, strategy.id),
						accountCondition,
						eq(trades.isArchived, false)
					),
				})

				const strategyTrades = dek
					? rawTrades.map((trade) => decryptTradeFields(trade, dek))
					: rawTrades

				let totalPnl = 0
				let winCount = 0
				let lossCount = 0
				let grossProfit = 0
				let grossLoss = 0
				let totalR = 0
				let rCount = 0
				let trackedPlanCount = 0
				let followedPlanCount = 0

				for (const trade of strategyTrades) {
					const pnl = fromCents(trade.pnl)
					totalPnl += pnl

					if (trade.outcome === "win") {
						winCount++
						grossProfit += pnl
					} else if (trade.outcome === "loss") {
						lossCount++
						grossLoss += Math.abs(pnl)
					}

					if (trade.realizedRMultiple) {
						totalR += Number(trade.realizedRMultiple)
						rCount++
					}

					if (trade.followedPlan !== null) {
						trackedPlanCount++
						if (trade.followedPlan) followedPlanCount++
					}
				}

				const compliance =
					trackedPlanCount > 0
						? (followedPlanCount / trackedPlanCount) * 100
						: 0

				const [conditionCountResult] = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(strategyConditions)
					.where(eq(strategyConditions.strategyId, strategy.id))

				const [scenarioCountResult] = await db
					.select({ count: sql<number>`count(*)::int` })
					.from(strategyScenarios)
					.where(eq(strategyScenarios.strategyId, strategy.id))

				const tradeCount = strategyTrades.length

				return {
					id: strategy.id,
					code: strategy.code,
					name: strategy.name,
					description: strategy.description,
					entryCriteria: strategy.entryCriteria,
					exitCriteria: strategy.exitCriteria,
					riskRules: strategy.riskRules,
					targetRMultiple: strategy.targetRMultiple
						? Number(strategy.targetRMultiple)
						: null,
					maxRiskPercent: strategy.maxRiskPercent
						? Number(strategy.maxRiskPercent)
						: null,
					screenshotUrl: strategy.screenshotUrl,
					notes: strategy.notes,
					isActive: strategy.isActive,
					createdAt: strategy.createdAt,
					updatedAt: strategy.updatedAt,
					stats: {
						tradeCount,
						winCount,
						lossCount,
						totalPnl: Math.round(totalPnl * 100) / 100,
						winRate: calculateWinRate(winCount, tradeCount),
						profitFactor: calculateProfitFactor(grossProfit, grossLoss),
						avgR: rCount > 0 ? Math.round((totalR / rCount) * 100) / 100 : 0,
						compliance: Math.round(compliance * 100) / 100,
					},
					conditionCount: conditionCountResult?.count ?? 0,
					scenarioCount: scenarioCountResult?.count ?? 0,
				}
			})
		)

		return archSuccess("Strategies retrieved", { items: strategyStats })
	} catch (error) {
		return archError(
			"Failed to fetch strategies",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
