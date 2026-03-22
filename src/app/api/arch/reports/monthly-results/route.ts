import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradingAccounts } from "@/db/schema"
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm"
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from "date-fns"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { getUserDek, decryptTradeFields, decryptAccountFields } from "@/lib/user-crypto"
import { calculateReportSummary } from "../../_lib/report-summary"

const calculatePropProfit = (
	grossProfit: number,
	isPropAccount: boolean,
	profitSharePercent: number,
	dayTradeTaxRate: number,
	showTaxEstimates: boolean
) => {
	if (grossProfit <= 0) {
		return {
			grossProfit,
			propFirmShare: 0,
			traderShare: grossProfit,
			estimatedTax: 0,
			netProfit: grossProfit,
		}
	}

	const sharePercent = isPropAccount ? profitSharePercent : 100
	const traderShare = grossProfit * (sharePercent / 100)
	const propFirmShare = grossProfit - traderShare
	const estimatedTax = showTaxEstimates ? traderShare * (dayTradeTaxRate / 100) : 0
	const netProfit = traderShare - estimatedTax

	return { grossProfit, propFirmShare, traderShare, estimatedTax, netProfit }
}

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
			return archError("Trading account not found", [
				{ code: "NOT_FOUND", detail: "Account not found" },
			], 404)
		}

		const dek = await getUserDek(auth.userId)
		const monthTrades = dek
			? rawMonthTrades.map((t) => decryptTradeFields(t, dek))
			: rawMonthTrades
		const decryptedAccount = dek
			? decryptAccountFields(account as unknown as Record<string, unknown>, dek) as unknown as typeof account
			: account

		// Calculate report summary
		const summary = calculateReportSummary(monthTrades)

		// Best/worst day
		const dailyPnl = new Map<string, number>()
		for (const trade of monthTrades) {
			const day = formatDateKey(new Date(trade.entryDate))
			dailyPnl.set(day, (dailyPnl.get(day) || 0) + fromCents(trade.pnl))
		}

		let bestDay: { date: string; pnl: number } | null = null
		let worstDay: { date: string; pnl: number } | null = null
		for (const [date, pnl] of dailyPnl) {
			if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl }
			if (!worstDay || pnl < worstDay.pnl) worstDay = { date, pnl }
		}

		// Weekly breakdown
		const weeklyBreakdown: Array<{
			weekStart: string; weekEnd: string; tradeCount: number; pnl: number; winRate: number
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

		// Prop profit calculation
		const isPropAccount = decryptedAccount.accountType === "prop"
		const profitSharePercentage = Number(decryptedAccount.profitSharePercentage) || 100
		const dayTradeTaxRate = Number(decryptedAccount.dayTradeTaxRate) || 0
		const showTaxEstimates = decryptedAccount.showTaxEstimates ?? false

		const prop = calculatePropProfit(
			summary.netPnl,
			isPropAccount,
			profitSharePercentage,
			dayTradeTaxRate,
			showTaxEstimates
		)

		return archSuccess("Monthly results with prop calculations retrieved", {
			monthStart: formatDateKey(monthStart),
			monthEnd: formatDateKey(monthEnd),
			report: { ...summary, bestDay, worstDay },
			prop,
			settings: {
				isPropAccount,
				propFirmName: decryptedAccount.propFirmName,
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
