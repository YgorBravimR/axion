import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm"
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from "date-fns"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { calculateReportSummary } from "../../_lib/report-summary"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
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
		const monthOffset = parseInt(searchParams.get("monthOffset") ?? "0", 10) || 0

		if (yearParam && monthParam) {
			referenceDate = new Date(parseInt(yearParam, 10), parseInt(monthParam, 10) - 1, 15)
		} else {
			referenceDate = subMonths(new Date(), monthOffset)
		}

		const monthStart = startOfMonth(referenceDate)
		const monthEnd = endOfMonth(referenceDate)

		const rawMonthTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, monthStart),
				lte(trades.entryDate, monthEnd)
			),
			orderBy: [desc(trades.entryDate)],
		})

		const dek = await getUserDek(auth.userId)
		const monthTrades = dek
			? rawMonthTrades.map((t) => decryptTradeFields(t, dek))
			: rawMonthTrades

		if (monthTrades.length === 0) {
			return archSuccess("Monthly report retrieved", {
				monthStart: formatDateKey(monthStart),
				monthEnd: formatDateKey(monthEnd),
				summary: {
					totalTrades: 0, winCount: 0, lossCount: 0, breakevenCount: 0,
					grossPnl: 0, netPnl: 0, totalFees: 0, winRate: 0,
					avgWin: 0, avgLoss: 0, profitFactor: 0, avgR: 0,
					bestDay: null, worstDay: null,
				},
				weeklyBreakdown: [],
				assetBreakdown: [],
			})
		}

		const summary = calculateReportSummary(monthTrades)

		// Best/worst day
		const dailyPnl = new Map<string, number>()
		for (const trade of monthTrades) {
			const day = formatDateKey(new Date(trade.entryDate))
			const currentPnl = dailyPnl.get(day) || 0
			dailyPnl.set(day, currentPnl + fromCents(trade.pnl))
		}

		let bestDay: { date: string; pnl: number } | null = null
		let worstDay: { date: string; pnl: number } | null = null
		for (const [date, pnl] of dailyPnl) {
			if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl }
			if (!worstDay || pnl < worstDay.pnl) worstDay = { date, pnl }
		}

		// Weekly breakdown
		const weeklyBreakdown: Array<{
			weekStart: string
			weekEnd: string
			tradeCount: number
			pnl: number
			winRate: number
		}> = []
		let currentWeekStart = startOfWeek(monthStart, { weekStartsOn: 1 })

		while (currentWeekStart <= monthEnd) {
			const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
			const weekTrades = monthTrades.filter((t) => {
				const entryDate = new Date(t.entryDate)
				return entryDate >= currentWeekStart && entryDate <= currentWeekEnd
			})

			if (weekTrades.length > 0) {
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

		// Asset breakdown
		const assetMap = new Map<string, { tradeCount: number; pnl: number; winCount: number; lossCount: number }>()
		for (const trade of monthTrades) {
			const current = assetMap.get(trade.asset) || { tradeCount: 0, pnl: 0, winCount: 0, lossCount: 0 }
			assetMap.set(trade.asset, {
				tradeCount: current.tradeCount + 1,
				pnl: current.pnl + fromCents(trade.pnl),
				winCount: current.winCount + (trade.outcome === "win" ? 1 : 0),
				lossCount: current.lossCount + (trade.outcome === "loss" ? 1 : 0),
			})
		}

		const assetBreakdown = Array.from(assetMap.entries())
			.map(([asset, data]) => {
				const decided = data.winCount + data.lossCount
				return {
					asset,
					tradeCount: data.tradeCount,
					pnl: data.pnl,
					winRate: decided > 0 ? (data.winCount / decided) * 100 : 0,
				}
			})
			.toSorted((a, b) => b.pnl - a.pnl)

		return archSuccess("Monthly report retrieved", {
			monthStart: formatDateKey(monthStart),
			monthEnd: formatDateKey(monthEnd),
			summary: { ...summary, bestDay, worstDay },
			weeklyBreakdown,
			assetBreakdown,
		})
	} catch (error) {
		return archError(
			"Failed to fetch monthly report",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
