import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, monthlyRiskConfig } from "@/db/schema"
import { eq, and, gte, lte, desc } from "drizzle-orm"
import { getUserDek, decryptMonthlyPlanFields } from "@/lib/user-crypto"
import { fromCents, toCents } from "@/lib/money"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/command-center/circuit-breaker
 *
 * Returns the circuit breaker status for a given date, including daily/monthly
 * P&L tracking, risk limits, and all trigger states.
 *
 * Query params:
 * - date (optional): ISO date string, defaults to today
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	const { userId, accountId } = authResult.auth

	try {
		const dateParam = request.nextUrl.searchParams.get("date")
		const today = dateParam ? new Date(dateParam) : new Date()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Get today's trades
		const todaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: [desc(trades.entryDate)],
		})

		// Get monthly plan for current month
		const currentYear = today.getFullYear()
		const currentMonth = today.getMonth() + 1

		const rawMonthlyRiskConfig = await db.query.monthlyRiskConfig.findFirst({
			where: and(
				eq(monthlyRiskConfig.accountId, accountId),
				eq(monthlyRiskConfig.year, currentYear),
				eq(monthlyRiskConfig.month, currentMonth)
			),
		})

		// Decrypt monthly plan fields if DEK is available
		const dek = await getUserDek(userId)
		const monthlyRiskConfigRow = rawMonthlyRiskConfig && dek
			? decryptMonthlyPlanFields(rawMonthlyRiskConfig as unknown as Record<string, unknown>, dek) as unknown as typeof rawMonthlyRiskConfig
			: rawMonthlyRiskConfig

		// Calculate metrics
		let dailyPnL = 0
		let consecutiveLosses = 0
		let maxConsecutiveLossesCount = 0

		// Sort trades by entry date for proper consecutive loss tracking
		const sortedTrades = todaysTrades.toSorted(
			(a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
		)

		// Breakevens are invisible to trade counts, max trades, and consecutive losses
		const nonBreakevenCount = sortedTrades.filter((t) => t.outcome !== "breakeven").length

		for (const trade of sortedTrades) {
			dailyPnL += fromCents(trade.pnl)

			if (trade.outcome === "loss") {
				consecutiveLosses++
				maxConsecutiveLossesCount = Math.max(maxConsecutiveLossesCount, consecutiveLosses)
			} else if (trade.outcome === "win") {
				consecutiveLosses = 0
			}
		}

		// Current consecutive losses (from the most recent non-breakeven trades)
		let currentConsecutiveLosses = 0
		for (let i = sortedTrades.length - 1; i >= 0; i--) {
			if (sortedTrades[i].outcome === "breakeven") continue
			if (sortedTrades[i].outcome === "loss") {
				currentConsecutiveLosses++
			} else {
				break
			}
		}

		// Calculate risk used today (sum of plannedRiskAmount from today's trades)
		const riskUsedTodayCents = todaysTrades.reduce(
			(sum, trade) => sum + (Number(trade.plannedRiskAmount) || 0),
			0
		)

		// Resolve limits from monthly plan (single source of truth)
		const dailyLossLimitCents = Number(monthlyRiskConfigRow?.dailyLossCents) || 0
		const profitTargetCents = Number(monthlyRiskConfigRow?.dailyProfitTargetCents) || 0
		const rawMaxTrades = monthlyRiskConfigRow?.maxDailyTrades ?? monthlyRiskConfigRow?.derivedMaxDailyTrades ?? null
		const maxConsecutiveLossesValue = monthlyRiskConfigRow?.maxConsecutiveLosses ?? null

		// Ensure maxTrades is at least maxConsecutiveLosses so the circuit breaker
		// doesn't show a contradictory cap when a recovery profile is linked
		const maxTradesValue =
			rawMaxTrades !== null && maxConsecutiveLossesValue !== null && maxConsecutiveLossesValue > rawMaxTrades
				? maxConsecutiveLossesValue
				: rawMaxTrades

		// Calculate remaining daily risk
		const remainingDailyRiskCents = Math.max(
			0,
			dailyLossLimitCents - Math.abs(Math.min(0, toCents(dailyPnL)))
		)

		// Get monthly P&L (using the target date's month)
		const monthStart = new Date(today)
		monthStart.setDate(1)

		const monthlyTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, monthStart),
				eq(trades.isArchived, false)
			),
		})
		const monthlyPnL = monthlyTrades.reduce(
			(sum, trade) => sum + fromCents(trade.pnl),
			0
		)

		// Monthly loss limit (plan-only)
		const monthlyLossLimitCents = Number(monthlyRiskConfigRow?.monthlyLossCents) || 0
		const remainingMonthlyCents =
			monthlyLossLimitCents > 0
				? Math.max(0, monthlyLossLimitCents - Math.abs(Math.min(0, toCents(monthlyPnL))))
				: Infinity
		const isMonthlyLimitHit =
			monthlyLossLimitCents > 0 && monthlyPnL <= -fromCents(monthlyLossLimitCents)

		// Calculate recommended risk (plan-only)
		let recommendedRiskCents = Number(monthlyRiskConfigRow?.riskPerTradeCents) || 0

		// Risk reduction after consecutive losses
		const shouldReduceRisk = monthlyRiskConfigRow?.reduceRiskAfterLoss ?? false
		const reductionFactor = monthlyRiskConfigRow?.riskReductionFactor
			? parseFloat(monthlyRiskConfigRow.riskReductionFactor)
			: null

		if (shouldReduceRisk && currentConsecutiveLosses > 0 && reductionFactor) {
			recommendedRiskCents = Math.round(
				recommendedRiskCents * Math.pow(reductionFactor, currentConsecutiveLosses)
			)
		}

		// Win risk adjustment (increase or cap -- mutually exclusive)
		if (monthlyRiskConfigRow?.profitReinvestmentPercent) {
			const reinvestmentPercent = parseFloat(monthlyRiskConfigRow.profitReinvestmentPercent)

			if (monthlyRiskConfigRow.increaseRiskAfterWin) {
				// INCREASE: add % of last win's profit to base risk
				const lastTrade = sortedTrades.at(-1)
				const lastPnl = Number(lastTrade?.pnl) || 0
				if (lastTrade?.outcome === "win" && lastPnl > 0) {
					const bonusCents = Math.round(lastPnl * reinvestmentPercent / 100)
					recommendedRiskCents = recommendedRiskCents + bonusCents
				}
			} else if (monthlyRiskConfigRow.capRiskAfterWin) {
				// CAP: find first winning trade of the day, cap risk to min(base, profit * %)
				const firstWin = sortedTrades.find((t) => t.outcome === "win" && t.pnl && Number(t.pnl) > 0)
				const firstWinPnl = Number(firstWin?.pnl) || 0
				if (firstWinPnl > 0 && sortedTrades.length > 1) {
					const capCents = Math.round(firstWinPnl * reinvestmentPercent / 100)
					recommendedRiskCents = Math.min(recommendedRiskCents, capCents)
				}
			}
		}

		// Cap at remaining budgets
		recommendedRiskCents = Math.min(
			recommendedRiskCents,
			remainingDailyRiskCents > 0 ? remainingDailyRiskCents : recommendedRiskCents,
			remainingMonthlyCents !== Infinity ? remainingMonthlyCents : recommendedRiskCents
		)

		// Check second op block (plan-only)
		const allowSecondOp = monthlyRiskConfigRow?.allowSecondOpAfterLoss ?? true
		const isSecondOpBlocked =
			allowSecondOp === false &&
			currentConsecutiveLosses > 0 &&
			nonBreakevenCount > 0

		// Calculate circuit breaker triggers
		const profitTargetHit = profitTargetCents > 0
			? dailyPnL >= fromCents(profitTargetCents)
			: false
		const lossLimitHit = dailyLossLimitCents > 0
			? dailyPnL <= -fromCents(dailyLossLimitCents)
			: false
		const maxTradesHit = maxTradesValue
			? nonBreakevenCount >= maxTradesValue
			: false
		const maxConsecutiveLossesHit = maxConsecutiveLossesValue
			? currentConsecutiveLosses >= maxConsecutiveLossesValue
			: false

		const shouldStopTrading =
			profitTargetHit ||
			lossLimitHit ||
			maxTradesHit ||
			maxConsecutiveLossesHit ||
			isMonthlyLimitHit ||
			isSecondOpBlocked

		// Build alerts
		const alerts: string[] = []
		if (profitTargetHit) alerts.push("profitTargetHit")
		if (lossLimitHit) alerts.push("lossLimitHit")
		if (maxTradesHit) alerts.push("maxTradesHit")
		if (maxConsecutiveLossesHit) alerts.push("maxConsecutiveLossesHit")
		if (isMonthlyLimitHit) alerts.push("monthlyLimitHit")
		if (isSecondOpBlocked) alerts.push("secondOpBlocked")

		return archSuccess("Circuit breaker status retrieved", {
			dailyPnL,
			tradesCount: nonBreakevenCount,
			consecutiveLosses: currentConsecutiveLosses,
			profitTargetHit,
			lossLimitHit,
			maxTradesHit,
			maxConsecutiveLossesHit,
			shouldStopTrading,
			alerts,
			profitTargetCents,
			dailyLossLimitCents,
			maxTrades: maxTradesValue,
			maxConsecutiveLosses: maxConsecutiveLossesValue,
			reduceRiskAfterLoss: shouldReduceRisk,
			riskReductionFactor: monthlyRiskConfigRow?.riskReductionFactor ?? null,
			riskUsedTodayCents,
			remainingDailyRiskCents,
			recommendedRiskCents,
			monthlyPnL,
			monthlyLossLimitCents,
			remainingMonthlyCents: remainingMonthlyCents === Infinity ? 0 : remainingMonthlyCents,
			isMonthlyLimitHit,
			isSecondOpBlocked,
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError("Failed to get circuit breaker status", [
			{ code: "FETCH_FAILED", detail: message },
		], 500)
	}
}

export { GET }
