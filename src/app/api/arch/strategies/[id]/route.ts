import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { strategies, trades, strategyConditions, strategyScenarios } from "@/db/schema"
import { eq, and, inArray, sql } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"

interface RouteParams {
	params: Promise<{ id: string }>
}

/**
 * GET /api/arch/strategies/[id]
 *
 * Returns a single strategy by ID with performance stats, conditions, and scenarios.
 */
const GET = async (request: NextRequest, { params }: RouteParams) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const { id } = await params

		const strategy = await db.query.strategies.findFirst({
			where: and(
				eq(strategies.id, id),
				eq(strategies.userId, auth.userId)
			),
			with: {
				strategyConditions: {
					with: { condition: true },
				},
				scenarios: {
					with: { images: true },
				},
			},
		})

		if (!strategy) {
			return archError(
				"Strategy not found",
				[{ code: "NOT_FOUND", detail: "Strategy does not exist or does not belong to this user" }],
				404
			)
		}

		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		const rawTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.strategyId, strategy.id),
				accountCondition,
				eq(trades.isArchived, false)
			),
		})

		const dek = await getUserDek(auth.userId)
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

		return archSuccess("Strategy retrieved", {
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
			conditions: strategy.strategyConditions.map((sc) => ({
				id: sc.id,
				conditionId: sc.conditionId,
				conditionName: sc.condition.name,
				conditionDescription: sc.condition.description,
				conditionCategory: sc.condition.category,
				tier: sc.tier,
				sortOrder: sc.sortOrder,
			})),
			scenarios: strategy.scenarios.map((scenario) => ({
				id: scenario.id,
				name: scenario.name,
				description: scenario.description,
				sortOrder: scenario.sortOrder,
				images: scenario.images.map((image) => ({
					id: image.id,
					url: image.url,
					sortOrder: image.sortOrder,
				})),
			})),
		})
	} catch (error) {
		return archError(
			"Failed to fetch strategy",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
