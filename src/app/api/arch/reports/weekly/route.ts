import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm"
import { startOfWeek, endOfWeek, subWeeks, eachDayOfInterval } from "date-fns"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { calculateReportSummary } from "../../_lib/report-summary"
import type { WeeklyReport, DailyBreakdown } from "@/app/actions/reports"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const weekStartParam = searchParams.get("weekStart")
		const weekOffsetParam = searchParams.get("weekOffset")

		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		let referenceDate = new Date()
		if (weekStartParam) {
			referenceDate = new Date(weekStartParam)
		} else if (weekOffsetParam) {
			const offset = parseInt(weekOffsetParam, 10)
			if (!Number.isNaN(offset)) {
				referenceDate = subWeeks(new Date(), offset)
			}
		}

		const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 })
		const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 })

		const rawWeekTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, weekStart),
				lte(trades.entryDate, weekEnd)
			),
			orderBy: [desc(trades.entryDate)],
		})

		const dek = await getUserDek(auth.userId)
		const weekTrades = dek
			? rawWeekTrades.map((t) => decryptTradeFields(t, dek))
			: rawWeekTrades

		if (weekTrades.length === 0) {
			const emptyReport: WeeklyReport = {
				weekStart: formatDateKey(weekStart),
				weekEnd: formatDateKey(weekEnd),
				summary: {
					totalTrades: 0,
					winCount: 0,
					lossCount: 0,
					breakevenCount: 0,
					grossPnl: 0,
					netPnl: 0,
					totalFees: 0,
					winRate: 0,
					avgWin: 0,
					avgLoss: 0,
					profitFactor: 0,
					avgR: 0,
					bestTrade: 0,
					worstTrade: 0,
				},
				dailyBreakdown: [],
				topWins: [],
				topLosses: [],
			}
			return archSuccess("No trades found for this week", emptyReport)
		}

		const summary = calculateReportSummary(weekTrades)

		const pnlValues = weekTrades
			.map((t) => fromCents(t.pnl))
			.filter((p) => p !== 0)

		const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
		const dailyBreakdown: DailyBreakdown[] = days.map((day) => {
			const dayTrades = weekTrades.filter(
				(t) => formatDateKey(new Date(t.entryDate)) === formatDateKey(day)
			)
			const dayWins = dayTrades.filter((t) => t.outcome === "win").length
			const dayLosses = dayTrades.filter((t) => t.outcome === "loss").length
			const dayPnl = dayTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0)
			const dayDecided = dayWins + dayLosses
			return {
				date: formatDateKey(day),
				tradeCount: dayTrades.length,
				winCount: dayWins,
				lossCount: dayLosses,
				pnl: dayPnl,
				winRate: dayDecided > 0 ? (dayWins / dayDecided) * 100 : 0,
			}
		})

		const sortedByPnl = weekTrades
			.filter((t) => t.pnl)
			.toSorted((a, b) => fromCents(b.pnl) - fromCents(a.pnl))

		const topWins = sortedByPnl
			.filter((t) => fromCents(t.pnl) > 0)
			.slice(0, 3)
			.map((t) => ({
				id: t.id,
				asset: t.asset,
				pnl: fromCents(t.pnl),
				r: t.realizedRMultiple ? parseFloat(t.realizedRMultiple) : null,
				direction: t.direction,
				date: formatDateKey(new Date(t.entryDate)),
			}))

		const topLosses = sortedByPnl
			.filter((t) => fromCents(t.pnl) < 0)
			.slice(-3)
			.reverse()
			.map((t) => ({
				id: t.id,
				asset: t.asset,
				pnl: fromCents(t.pnl),
				r: t.realizedRMultiple ? parseFloat(t.realizedRMultiple) : null,
				direction: t.direction,
				date: formatDateKey(new Date(t.entryDate)),
			}))

		const report: WeeklyReport = {
			weekStart: formatDateKey(weekStart),
			weekEnd: formatDateKey(weekEnd),
			summary: {
				...summary,
				bestTrade: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
				worstTrade: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
			},
			dailyBreakdown,
			topWins,
			topLosses,
		}

		return archSuccess("Weekly report retrieved", report)
	} catch (error) {
		return archError(
			"Failed to retrieve weekly report",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
