import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradingAccounts } from "@/db/schema"
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm"
import {
	startOfMonth,
	endOfMonth,
	startOfWeek,
	endOfWeek,
	subMonths,
} from "date-fns"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { calculateReportSummary } from "../../_lib/report-summary"
import { getDayTradeIrRate } from "@/lib/tax/legal-rates"
import { calculatePropProfit } from "@/lib/reports/calculate-prop-profit"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		// Determine month boundaries
		let referenceDate: Date
		const yearParam = searchParams.get("year")
		const monthParam = searchParams.get("month")
		const monthOffset =
			parseInt(searchParams.get("monthOffset") ?? "0", 10) || 0

		if (yearParam && monthParam) {
			referenceDate = new Date(
				parseInt(yearParam, 10),
				parseInt(monthParam, 10) - 1,
				15
			)
		} else {
			referenceDate = subMonths(new Date(), monthOffset)
		}

		const monthStart = startOfMonth(referenceDate)
		const monthEnd = endOfMonth(referenceDate)

		// Fetch account and trades in parallel
		const [account, rawMonthTrades] = await Promise.all([
			db.query.tradingAccounts.findFirst({
				where: eq(tradingAccounts.id, auth.accountId),
			}),
			db.query.trades.findMany({
				where: and(
					accountCondition,
					eq(trades.isArchived, false),
					gte(trades.entryDate, monthStart),
					lte(trades.entryDate, monthEnd)
				),
				orderBy: [desc(trades.entryDate)],
			}),
		])

		if (!account) {
			return archError(
				"Trading account not found",
				[{ code: "NOT_FOUND", detail: "Account not found" }],
				404
			)
		}

		// Calculate report summary
		const summary = calculateReportSummary(rawMonthTrades)

		// Pre-index trades by day and week, track best/worst day in single pass
		const dailyPnl = new Map<string, number>()
		const tradesByWeek = new Map<string, typeof rawMonthTrades>()
		let bestDay: { date: string; pnl: number } | null = null
		let worstDay: { date: string; pnl: number } | null = null

		for (const trade of rawMonthTrades) {
			const entryDate = new Date(trade.entryDate)
			const day = formatDateKey(entryDate)
			const weekStart = startOfWeek(entryDate, { weekStartsOn: 1 })
			const weekKey = formatDateKey(weekStart)

			// Accumulate daily PnL
			const dayPnl = (dailyPnl.get(day) || 0) + fromCents(trade.pnl)
			dailyPnl.set(day, dayPnl)

			// Track best/worst day
			if (!bestDay || dayPnl > bestDay.pnl) {
				bestDay = { date: day, pnl: dayPnl }
			}
			if (!worstDay || dayPnl < worstDay.pnl) {
				worstDay = { date: day, pnl: dayPnl }
			}

			// Index trades by week
			if (!tradesByWeek.has(weekKey)) {
				tradesByWeek.set(weekKey, [])
			}
			tradesByWeek.get(weekKey)!.push(trade)
		}

		// Weekly breakdown using pre-indexed trades
		const weeklyBreakdown: Array<{
			weekStart: string
			weekEnd: string
			tradeCount: number
			pnl: number
			winRate: number
		}> = []
		let currentWeekStart = startOfWeek(monthStart, { weekStartsOn: 1 })

		while (currentWeekStart <= monthEnd) {
			const weekKey = formatDateKey(currentWeekStart)
			const weekTrades = tradesByWeek.get(weekKey)

			if (weekTrades && weekTrades.length > 0) {
				const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
				const weekWins = weekTrades.filter((t) => t.outcome === "win").length
				const weekLosses = weekTrades.filter((t) => t.outcome === "loss").length
				const weekPnl = weekTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0)
				const weekDecided = weekWins + weekLosses

				weeklyBreakdown.push({
					weekStart: formatDateKey(currentWeekStart),
					weekEnd: formatDateKey(currentWeekEnd),
					tradeCount: weekTrades.length,
					pnl: weekPnl,
					winRate: weekDecided > 0 ? (weekWins / weekDecided) * 100 : 0,
				})
			}

			currentWeekStart = new Date(currentWeekStart)
			currentWeekStart.setDate(currentWeekStart.getDate() + 7)
		}

		// Prop profit calculation. IR rate sourced from legal-rates by month year —
		// matches cockpit + recompute. Account override column ignored.
		const isPropAccount = account.accountType === "prop"
		const profitSharePercentage = Number(account.profitSharePercentage) || 100
		const dayTradeTaxRate = getDayTradeIrRate(monthStart.getUTCFullYear()) * 100
		const showTaxEstimates = account.showTaxEstimates ?? false

		const prop = calculatePropProfit(summary.netPnl, {
			isPropAccount,
			profitSharePercentage,
			dayTradeTaxRate,
			showTaxEstimates,
		})

		return archSuccess("Monthly results with prop calculations retrieved", {
			monthStart: formatDateKey(monthStart),
			monthEnd: formatDateKey(monthEnd),
			report: { ...summary, bestDay, worstDay },
			prop,
			settings: {
				isPropAccount,
				propFirmName: account.propFirmName,
				profitSharePercentage,
				dayTradeTaxRate,
			},
			weeklyBreakdown,
		})
	} catch (error) {
		return archError(
			"Failed to fetch monthly results",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
