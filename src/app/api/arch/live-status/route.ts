import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, riskManagementProfiles } from "@/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { resolveLiveStatus } from "@/lib/live-trading-status"
import { resolveDay, resolveBehavior } from "@/lib/fractal-plan/resolver"
import { adaptDecisionTree } from "@/lib/risk-profiles/cents-shape"
import { archAuth } from "../_lib/auth"
import { archSuccess, archError } from "../_lib/helpers"
import type { DecisionTreeConfig } from "@/types/risk-profile"
import type { TradeSummary } from "@/types/live-trading-status"

/**
 * GET /api/arch/live-status
 *
 * Phase 4b: powered by the fractal-plan resolver. The active risk profile
 * comes from `resolveBehavior(...).riskProfileId` (cascades month → year);
 * the decision tree (R-shape) is adapted to cents at the boundary using
 * `oneRCents` from `resolveDay`. Daily caps, max trades, and profit targets
 * all read from the cascade.
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	const { accountId } = authResult.auth

	try {
		const dateParam = request.nextUrl.searchParams.get("date")
		const today = dateParam ? new Date(dateParam) : new Date()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		const day = await resolveDay(accountId, today)
		if (!day) {
			return archSuccess("No fractal plan configured", {
				hasProfile: false,
				fallbackRiskCents: null,
			})
		}
		const behavior = await resolveBehavior({ accountId, date: today })

		if (!behavior.riskProfileId) {
			return archSuccess("No risk profile linked", {
				hasProfile: false,
				fallbackRiskCents: day.oneRCents,
			})
		}

		const [profileRow] = await db
			.select()
			.from(riskManagementProfiles)
			.where(eq(riskManagementProfiles.id, behavior.riskProfileId))
			.limit(1)

		if (!profileRow) {
			return archSuccess("Risk profile not found", {
				hasProfile: false,
				fallbackRiskCents: day.oneRCents,
			})
		}

		const tree = JSON.parse(profileRow.decisionTree) as DecisionTreeConfig
		const decisionTree = adaptDecisionTree(tree, day.oneRCents)

		const oneRCents = day.oneRCents
		const dailyLossCents = Math.round(Number(day.dailyLossR.value) * oneRCents)
		const dailyTargetCents = Math.round(
			Number(day.dailyTargetR.value) * oneRCents
		)

		const todaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: (t, { asc }) => [asc(t.entryDate)],
		})

		const tradeInputs = todaysTrades.map((trade) => ({
			pnlCents: Number(trade.pnl) || 0,
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
		}))

		const derivedMaxTrades =
			oneRCents > 0 && dailyLossCents > 0
				? Math.floor(dailyLossCents / oneRCents)
				: null

		const status = resolveLiveStatus({
			trades: tradeInputs,
			decisionTree,
			profileName: profileRow.name,
			dailyLossCents,
			dailyProfitTargetCents: dailyTargetCents > 0 ? dailyTargetCents : null,
			maxTrades: derivedMaxTrades,
		})

		const tradeSummaries: TradeSummary[] = todaysTrades.map((trade, index) => ({
			tradeStepNumber: status.tradeStepNumbers[index] ?? index + 1,
			pnlCents: Number(trade.pnl) || 0,
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
			direction: trade.direction,
			asset: trade.asset,
			positionSize: Number(trade.positionSize) || 0,
			riskAmountCents: trade.plannedRiskAmount
				? Number(trade.plannedRiskAmount)
				: null,
		}))

		return archSuccess("Live trading status resolved", {
			hasProfile: true,
			status,
			tradeSummaries,
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError(
			"Failed to get live trading status",
			[{ code: "FETCH_FAILED", detail: message }],
			500
		)
	}
}

export { GET }
