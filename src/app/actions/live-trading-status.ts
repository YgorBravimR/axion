"use server"

import { db } from "@/db/drizzle"
import { trades, riskManagementProfiles } from "@/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { resolveLiveStatus } from "@/lib/live-trading-status"
import { resolveDay, resolveBehavior } from "@/lib/fractal-plan/resolver"
import { adaptDecisionTree } from "@/lib/risk-profiles/cents-shape"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"
import type { ActionResponse } from "@/types"
import type { DecisionTreeConfig } from "@/types/risk-profile"
import type {
	LiveTradingStatusResult,
	TradeSummary,
} from "@/types/live-trading-status"

/**
 * Phase 4b: caps + active risk profile come from the fractal-plan cascade.
 * The decision tree (R-shape) is adapted to cents at the boundary using
 * `oneRCents` from `resolveDay`.
 */
export const getLiveTradingStatus = async (
	date?: Date
): Promise<ActionResponse<LiveTradingStatusResult>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { accountId } = await requireAuth()

		const today = date ? new Date(date) : await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		const day = await resolveDay(accountId, today)
		if (!day) {
			return {
				status: "success",
				message: t("actionErrors.noRiskProfile"),
				data: { hasProfile: false, fallbackRiskCents: null },
			}
		}

		const behavior = await resolveBehavior({ accountId, date: today })
		if (!behavior.riskProfileId) {
			return {
				status: "success",
				message: t("actionErrors.noRiskProfile"),
				data: { hasProfile: false, fallbackRiskCents: day.oneRCents },
			}
		}

		const [profileRow] = await db
			.select()
			.from(riskManagementProfiles)
			.where(eq(riskManagementProfiles.id, behavior.riskProfileId))
			.limit(1)

		if (!profileRow) {
			return {
				status: "success",
				message: t("actionErrors.riskProfileNotFound"),
				data: { hasProfile: false, fallbackRiskCents: day.oneRCents },
			}
		}

		let tree: DecisionTreeConfig
		try {
			tree = JSON.parse(profileRow.decisionTree) as DecisionTreeConfig
		} catch (e) {
			console.error(
				`[live-trading-status] Failed to parse decisionTree for profile ${behavior.riskProfileId}:`,
				e instanceof Error ? e.message : String(e)
			)
			return {
				status: "success",
				message: t("actionErrors.riskProfileNotFound"),
				data: { hasProfile: false, fallbackRiskCents: day.oneRCents },
			}
		}
		const decisionTree = adaptDecisionTree(tree, day.oneRCents)

		const oneRCents = day.oneRCents
		const dailyLossCents = Math.round(Number(day.dailyLossR.value) * oneRCents)
		const dailyTargetCents = Math.round(
			Number(day.dailyTargetR.value) * oneRCents
		)

		const rawTodaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: (t, { asc }) => [asc(t.entryDate)],
		})
		const todaysTrades = rawTodaysTrades

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

		return {
			status: "success",
			message: t("actionErrors.statusResolved"),
			data: { hasProfile: true, status, tradeSummaries },
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actionErrors.fetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getLiveTradingStatus"),
				},
			],
		}
	}
}
