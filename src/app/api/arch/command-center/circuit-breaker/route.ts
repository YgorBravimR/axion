import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, gte, lte, desc } from "drizzle-orm"
import { fromCents, toCents } from "@/lib/money"
import {
	resolveDay,
	resolveBehavior,
} from "@/lib/fractal-plan/resolver"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/command-center/circuit-breaker
 *
 * Phase 4b: powered exclusively by the fractal-plan resolver. Daily/monthly
 * caps come from `resolveDay`; adaptive behavior (max consec losses,
 * second-op gating, risk reduction, post-win adjustments) comes from
 * `resolveBehavior`. The legacy `monthlyRiskConfig` table is no longer read.
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	const { accountId } = authResult.auth

	try {
		const dateParam = request.nextUrl.searchParams.get("date")
		const today = dateParam ? new Date(dateParam) : new Date()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		const day = await resolveDay(accountId, today)
		if (!day) {
			return archError(
				"No fractal plan configured for this account/date",
				[{ code: "NO_PLAN", detail: `No yearly plan for ${today.getFullYear()}` }],
				404,
			)
		}
		const behavior = await resolveBehavior({ accountId, date: today })

		const oneRCents = day.oneRCents
		const dailyLossLimitCents = Math.round(Number(day.dailyLossR.value) * oneRCents)
		const profitTargetCents = Math.round(Number(day.dailyTargetR.value) * oneRCents)
		const monthlyLossLimitCents = Math.round(Number(day.monthlyLossR.value) * oneRCents)
		const recommendedRiskBaseCents = oneRCents

		const todaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false),
			),
			orderBy: [desc(trades.entryDate)],
		})

		let dailyPnL = 0
		let consecutiveLosses = 0
		let maxConsecutiveLossesCount = 0

		const sortedTrades = todaysTrades.toSorted(
			(a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime(),
		)
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

		let currentConsecutiveLosses = 0
		for (let i = sortedTrades.length - 1; i >= 0; i--) {
			if (sortedTrades[i].outcome === "breakeven") continue
			if (sortedTrades[i].outcome === "loss") {
				currentConsecutiveLosses++
			} else {
				break
			}
		}

		const riskUsedTodayCents = todaysTrades.reduce(
			(sum, trade) => sum + (Number(trade.plannedRiskAmount) || 0),
			0,
		)

		const maxConsecutiveLossesValue = behavior.maxConsecutiveLosses
		const derivedMaxTrades =
			recommendedRiskBaseCents > 0 && dailyLossLimitCents > 0
				? Math.floor(dailyLossLimitCents / recommendedRiskBaseCents)
				: null
		const maxTradesValue =
			derivedMaxTrades !== null && maxConsecutiveLossesValue !== null
				? Math.max(derivedMaxTrades, maxConsecutiveLossesValue)
				: derivedMaxTrades

		const remainingDailyRiskCents = Math.max(
			0,
			dailyLossLimitCents - Math.abs(Math.min(0, toCents(dailyPnL))),
		)

		const monthStart = new Date(today)
		monthStart.setDate(1)

		const monthlyTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, monthStart),
				eq(trades.isArchived, false),
			),
		})
		const monthlyPnL = monthlyTrades.reduce((sum, trade) => sum + fromCents(trade.pnl), 0)
		const remainingMonthlyCents =
			monthlyLossLimitCents > 0
				? Math.max(0, monthlyLossLimitCents - Math.abs(Math.min(0, toCents(monthlyPnL))))
				: Infinity
		const isMonthlyLimitHit =
			monthlyLossLimitCents > 0 && monthlyPnL <= -fromCents(monthlyLossLimitCents)

		let recommendedRiskCents = recommendedRiskBaseCents

		if (
			behavior.reduceRiskAfterLoss &&
			currentConsecutiveLosses > 0 &&
			behavior.riskReductionFactor !== null
		) {
			recommendedRiskCents = Math.round(
				recommendedRiskCents *
					Math.pow(behavior.riskReductionFactor, currentConsecutiveLosses),
			)
		}

		if (behavior.profitReinvestmentPercent !== null) {
			const reinvestmentPercent = behavior.profitReinvestmentPercent
			if (behavior.increaseRiskAfterWin) {
				const lastTrade = sortedTrades.at(-1)
				const lastPnl = Number(lastTrade?.pnl) || 0
				if (lastTrade?.outcome === "win" && lastPnl > 0) {
					const bonusCents = Math.round((lastPnl * reinvestmentPercent) / 100)
					recommendedRiskCents = recommendedRiskCents + bonusCents
				}
			} else if (behavior.capRiskAfterWin) {
				const firstWin = sortedTrades.find(
					(t) => t.outcome === "win" && t.pnl && Number(t.pnl) > 0,
				)
				const firstWinPnl = Number(firstWin?.pnl) || 0
				if (firstWinPnl > 0 && sortedTrades.length > 1) {
					const capCents = Math.round((firstWinPnl * reinvestmentPercent) / 100)
					recommendedRiskCents = Math.min(recommendedRiskCents, capCents)
				}
			}
		}

		recommendedRiskCents = Math.min(
			recommendedRiskCents,
			remainingDailyRiskCents > 0 ? remainingDailyRiskCents : recommendedRiskCents,
			remainingMonthlyCents !== Infinity ? remainingMonthlyCents : recommendedRiskCents,
		)

		const isSecondOpBlocked =
			behavior.allowSecondOpAfterLoss === false &&
			currentConsecutiveLosses > 0 &&
			nonBreakevenCount > 0

		const profitTargetHit =
			profitTargetCents > 0 ? dailyPnL >= fromCents(profitTargetCents) : false
		const lossLimitHit =
			dailyLossLimitCents > 0 ? dailyPnL <= -fromCents(dailyLossLimitCents) : false
		const maxTradesHit = maxTradesValue ? nonBreakevenCount >= maxTradesValue : false
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
			reduceRiskAfterLoss: behavior.reduceRiskAfterLoss,
			riskReductionFactor:
				behavior.riskReductionFactor !== null ? String(behavior.riskReductionFactor) : null,
			riskUsedTodayCents,
			remainingDailyRiskCents,
			recommendedRiskCents,
			monthlyPnL,
			monthlyLossLimitCents,
			remainingMonthlyCents:
				remainingMonthlyCents === Infinity ? 0 : remainingMonthlyCents,
			isMonthlyLimitHit,
			isSecondOpBlocked,
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError(
			"Failed to get circuit breaker status",
			[{ code: "FETCH_FAILED", detail: message }],
			500,
		)
	}
}

export { GET }
