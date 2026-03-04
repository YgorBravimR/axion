"use server"

import { db } from "@/db/drizzle"
import { trades, monthlyPlans } from "@/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { getRiskProfile } from "@/app/actions/risk-profiles"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { resolveLiveStatus } from "@/lib/live-trading-status"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import type { LiveTradingStatusResult, TradeSummary } from "@/types/live-trading-status"

/**
 * Fetches today's trades and resolves the live trading status
 * using the active monthly plan's linked risk profile.
 */
const getLiveTradingStatus = async (date?: Date): Promise<ActionResponse<LiveTradingStatusResult>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const today = date ? new Date(date) : await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Get current month's plan
		const effectiveNow = date ? new Date(date) : await getServerEffectiveNow()
		const currentYear = effectiveNow.getFullYear()
		const currentMonth = effectiveNow.getMonth() + 1

		const rawMonthlyPlan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, currentYear),
				eq(monthlyPlans.month, currentMonth)
			),
		})

		// Decrypt monthly plan fields if DEK is available
		const dek = await getUserDek(userId)
		const { decryptMonthlyPlanFields } = await import("@/lib/user-crypto")
		const monthlyPlan = rawMonthlyPlan && dek
			? decryptMonthlyPlanFields(rawMonthlyPlan as unknown as Record<string, unknown>, dek) as unknown as typeof rawMonthlyPlan
			: rawMonthlyPlan

		if (!monthlyPlan?.riskProfileId) {
			return {
				status: "success",
				message: "No risk profile linked",
				data: {
					hasProfile: false,
					fallbackRiskCents: monthlyPlan?.riskPerTradeCents
						? Number(monthlyPlan.riskPerTradeCents)
						: null,
				},
			}
		}

		// Fetch the linked risk profile
		const profileResult = await getRiskProfile(monthlyPlan.riskProfileId)

		if (profileResult.status !== "success" || !profileResult.data) {
			return {
				status: "success",
				message: "Risk profile not found",
				data: {
					hasProfile: false,
					fallbackRiskCents: monthlyPlan.riskPerTradeCents
						? Number(monthlyPlan.riskPerTradeCents)
						: null,
				},
			}
		}

		const profile = profileResult.data

		// The monthly plan is the single source of truth for computed values.
		// When using percentage-based sizing, the plan derives actual amounts from
		// the account balance (e.g., 1.25% of R$20k = R$250), while the profile
		// stores static fallback amounts for a reference balance.
		const planRiskPerTradeCents = Number(monthlyPlan.riskPerTradeCents) || profile.decisionTree.baseTrade.riskCents
		const planDailyLossCents = Number(monthlyPlan.dailyLossCents) || profile.dailyLossCents
		const planDailyProfitTargetCents = Number(monthlyPlan.dailyProfitTargetCents) || profile.dailyProfitTargetCents

		// Override the decision tree's static base risk with the plan-derived value
		const decisionTree = {
			...profile.decisionTree,
			baseTrade: {
				...profile.decisionTree.baseTrade,
				riskCents: planRiskPerTradeCents,
			},
		}

		// Fetch today's trades (same pattern as circuit breaker)
		const rawTodaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: (t, { asc }) => [asc(t.entryDate)],
		})

		// Decrypt trade fields for accurate P&L and position data
		const todaysTrades = dek
			? rawTodaysTrades.map((t) => decryptTradeFields(t as unknown as Record<string, unknown>, dek) as unknown as typeof t)
			: rawTodaysTrades

		// Map trades to the lightweight input shape
		const tradeInputs = todaysTrades.map((trade) => ({
			pnlCents: Number(trade.pnl) || 0,
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
		}))

		// Resolve max trades from explicit plan value or derived fallback
		const maxTrades = monthlyPlan.maxDailyTrades ?? monthlyPlan.derivedMaxDailyTrades ?? null

		const status = resolveLiveStatus({
			trades: tradeInputs,
			decisionTree,
			profileName: profile.name,
			dailyLossCents: planDailyLossCents,
			dailyProfitTargetCents: planDailyProfitTargetCents,
			maxTrades,
		})

		// Build trade summaries by zipping decrypted trades with step numbers
		const tradeSummaries: TradeSummary[] = todaysTrades.map((trade, index) => ({
			tradeStepNumber: status.tradeStepNumbers[index] ?? index + 1,
			pnlCents: Number(trade.pnl) || 0,
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
			direction: trade.direction,
			asset: trade.asset,
			positionSize: Number(trade.positionSize) || 0,
			riskAmountCents: trade.plannedRiskAmount ? Number(trade.plannedRiskAmount) : null,
		}))

		return {
			status: "success",
			message: "Live trading status resolved",
			data: { hasProfile: true, status, tradeSummaries },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to get live trading status",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getLiveTradingStatus") }],
		}
	}
}

export { getLiveTradingStatus }
