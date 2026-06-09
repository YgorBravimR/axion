"use server"

import { db } from "@/db/drizzle"
import { trades, tags, tradeTags, tradingAccounts } from "@/db/schema"
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm"
import {
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	eachDayOfInterval,
	subWeeks,
	subMonths,
	differenceInBusinessDays,
} from "date-fns"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import { getUserSettings } from "./settings"
import { calculatePropProfit } from "@/lib/reports/calculate-prop-profit"
import type {
	DailyBreakdown,
	WeeklyReport,
	MonthlyReport,
	CommissionFeeImpact,
	MistakeCostAnalysis,
	MonthlyResultsWithProp,
	MonthlyProjection,
	MonthComparison,
	YearlyOverview,
	ReportSummaryBase,
	PropCalcSettings,
} from "./reports.types"
import { requireAuth } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getDayTradeIrRate } from "@/lib/tax/legal-rates"
import { getTranslations } from "next-intl/server"
import { isFrameworkSignal } from "@/lib/error-utils"

// ============================================================================
// SHARED SUMMARY CALCULATION
// ============================================================================

/**
 * Calculate summary stats from a list of trades.
 * Shared between weekly and monthly report generation.
 */
const calculateReportSummary = (
	tradeList: Array<{
		pnl: number | string | null
		commission: number | string | null
		fees: number | string | null
		outcome: string | null
		realizedRMultiple: string | null
	}>
): ReportSummaryBase => {
	const summary = tradeList.reduce(
		(acc, t) => {
			const pnlVal = fromCents(t.pnl)
			const isWin = t.outcome === "win"
			const isLoss = t.outcome === "loss"
			const isBreakeven = t.outcome === "breakeven"
			const hasR = t.realizedRMultiple !== null

			return {
				netPnl: acc.netPnl + pnlVal,
				totalFees: acc.totalFees + fromCents(t.commission) + fromCents(t.fees),
				winCount: acc.winCount + (isWin ? 1 : 0),
				lossCount: acc.lossCount + (isLoss ? 1 : 0),
				breakevenCount: acc.breakevenCount + (isBreakeven ? 1 : 0),
				grossProfit: acc.grossProfit + (isWin ? pnlVal : 0),
				grossLossDenom: acc.grossLossDenom + (isLoss ? pnlVal : 0),
				avgWinSum: acc.avgWinSum + (isWin ? pnlVal : 0),
				avgLossSum: acc.avgLossSum + (isLoss ? pnlVal : 0),
				rSum: acc.rSum + (hasR ? parseFloat(t.realizedRMultiple!) : 0),
				rCount: acc.rCount + (hasR ? 1 : 0),
			}
		},
		{
			netPnl: 0,
			totalFees: 0,
			winCount: 0,
			lossCount: 0,
			breakevenCount: 0,
			grossProfit: 0,
			grossLossDenom: 0,
			avgWinSum: 0,
			avgLossSum: 0,
			rSum: 0,
			rCount: 0,
		}
	)

	const grossPnl = summary.netPnl + summary.totalFees
	const grossLoss = Math.abs(summary.grossLossDenom)
	const avgWin = summary.winCount > 0 ? summary.avgWinSum / summary.winCount : 0
	const avgLoss =
		summary.lossCount > 0 ? summary.avgLossSum / summary.lossCount : 0
	const avgR = summary.rCount > 0 ? summary.rSum / summary.rCount : 0
	const decidedCount = summary.winCount + summary.lossCount

	return {
		totalTrades: tradeList.length,
		winCount: summary.winCount,
		lossCount: summary.lossCount,
		breakevenCount: summary.breakevenCount,
		grossPnl,
		netPnl: summary.netPnl,
		totalFees: summary.totalFees,
		winRate: decidedCount > 0 ? (summary.winCount / decidedCount) * 100 : 0,
		avgWin,
		avgLoss,
		profitFactor: grossLoss > 0 ? summary.grossProfit / grossLoss : 0,
		avgR,
	}
}

// ============================================================================
// WEEKLY REPORT
// ============================================================================

export const getWeeklyReport = async (
	weekOffset = 0
): Promise<{
	status: "success" | "error"
	data?: WeeklyReport
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = await requireAuth()
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const effectiveNow = await getServerEffectiveNow()
		const referenceDate = subWeeks(effectiveNow, weekOffset)
		const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 })
		const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 })

		const weekTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, weekStart),
				lte(trades.entryDate, weekEnd)
			),
			orderBy: [desc(trades.entryDate)],
		})

		if (weekTrades.length === 0) {
			return {
				status: "success",
				data: {
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
				},
			}
		}

		// Calculate summary using shared helper
		const summary = calculateReportSummary(weekTrades)

		const { pnlValues, sortedByPnl } = weekTrades.reduce(
			(acc, t) => {
				const pnl = fromCents(t.pnl)
				if (pnl !== 0) {
					acc.pnlValues.push(pnl)
				}
				acc.sortedByPnl.push({ trade: t, pnl })
				return acc
			},
			{
				pnlValues: [] as number[],
				sortedByPnl: [] as Array<{
					trade: (typeof weekTrades)[0]
					pnl: number
				}>,
			}
		)

		sortedByPnl.sort((a, b) => b.pnl - a.pnl)

		const topWins = sortedByPnl
			.filter((item) => item.pnl > 0)
			.slice(0, 3)
			.map(({ trade: t }) => ({
				id: t.id,
				asset: t.asset,
				pnl: fromCents(t.pnl),
				r: t.realizedRMultiple ? parseFloat(t.realizedRMultiple) : null,
				direction: t.direction,
				date: formatDateKey(new Date(t.entryDate)),
			}))

		const topLosses = sortedByPnl
			.filter((item) => item.pnl < 0)
			.slice(-3)
			.reverse()
			.map(({ trade: t }) => ({
				id: t.id,
				asset: t.asset,
				pnl: fromCents(t.pnl),
				r: t.realizedRMultiple ? parseFloat(t.realizedRMultiple) : null,
				direction: t.direction,
				date: formatDateKey(new Date(t.entryDate)),
			}))

		// Daily breakdown
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

		return {
			status: "success",
			data: {
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
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching weekly report:", error)
		}
		return { status: "error", message: t("actions.weeklyFetchFailed") }
	}
}

// ============================================================================
// MONTHLY REPORT
// ============================================================================

export const getMonthlyReport = async (
	monthOffset = 0
): Promise<{
	status: "success" | "error"
	data?: MonthlyReport
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = await requireAuth()
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const effectiveNow = await getServerEffectiveNow()
		const referenceDate = subMonths(effectiveNow, monthOffset)
		const monthStart = startOfMonth(referenceDate)
		const monthEnd = endOfMonth(referenceDate)

		const monthTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, monthStart),
				lte(trades.entryDate, monthEnd)
			),
			orderBy: [desc(trades.entryDate)],
		})

		if (monthTrades.length === 0) {
			return {
				status: "success",
				data: {
					monthStart: formatDateKey(monthStart),
					monthEnd: formatDateKey(monthEnd),
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
						bestDay: null,
						worstDay: null,
					},
					weeklyBreakdown: [],
					assetBreakdown: [],
				},
			}
		}

		// Calculate summary using shared helper
		const summary = calculateReportSummary(monthTrades)

		// Daily P&L for best/worst day
		const dailyPnl = new Map<string, number>()
		for (const trade of monthTrades) {
			const day = formatDateKey(new Date(trade.entryDate))
			const currentPnl = dailyPnl.get(day) || 0
			dailyPnl.set(day, currentPnl + fromCents(trade.pnl))
		}

		let bestDay: { date: string; pnl: number } | null = null
		let worstDay: { date: string; pnl: number } | null = null

		for (const [date, pnl] of dailyPnl) {
			if (!bestDay || pnl > bestDay.pnl) {
				bestDay = { date, pnl }
			}
			if (!worstDay || pnl < worstDay.pnl) {
				worstDay = { date, pnl }
			}
		}

		// Weekly breakdown - calculate 4-5 weeks in the month
		const weeklyBreakdown: MonthlyReport["weeklyBreakdown"] = []
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
		const assetMap = new Map<
			string,
			{ tradeCount: number; pnl: number; winCount: number; lossCount: number }
		>()
		for (const trade of monthTrades) {
			const current = assetMap.get(trade.asset) || {
				tradeCount: 0,
				pnl: 0,
				winCount: 0,
				lossCount: 0,
			}
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

		return {
			status: "success",
			data: {
				monthStart: formatDateKey(monthStart),
				monthEnd: formatDateKey(monthEnd),
				summary: {
					...summary,
					bestDay,
					worstDay,
				},
				weeklyBreakdown,
				assetBreakdown,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching monthly report:", error)
		}
		return { status: "error", message: t("actions.monthlyFetchFailed") }
	}
}

// ============================================================================
// MISTAKE COST ANALYSIS
// ============================================================================

export const getMistakeCostAnalysis = async (): Promise<{
	status: "success" | "error"
	data?: MistakeCostAnalysis
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = await requireAuth()

		// Get only the current user's mistake tags
		const mistakeTags = await db.query.tags.findMany({
			where: and(eq(tags.type, "mistake"), eq(tags.userId, authContext.userId)),
		})

		if (mistakeTags.length === 0) {
			return {
				status: "success",
				data: {
					mistakes: [],
					totalMistakeCost: 0,
					mostCostlyMistake: null,
				},
			}
		}

		// Get all trade-tag associations for mistake tags (filtered by account through trade)
		const tagIdsList = mistakeTags.map((t) => t.id)
		const tradeTagAssociations = await db.query.tradeTags.findMany({
			where: inArray(tradeTags.tagId, tagIdsList),
			with: {
				trade: true,
				tag: true,
			},
		})

		// Filter by account (through trade relation) - support all accounts mode
		const filteredAssociations = tradeTagAssociations.filter((assoc) => {
			if (!assoc.trade.accountId) {
				return false
			}
			return authContext.showAllAccounts
				? authContext.allAccountIds.includes(assoc.trade.accountId)
				: assoc.trade.accountId === authContext.accountId
		})

		// Calculate cost per mistake
		const mistakeStats = new Map<
			string,
			{
				tagName: string
				color: string | null
				totalLoss: number
				tradeCount: number
			}
		>()

		for (const association of filteredAssociations) {
			const pnl = fromCents(association.trade.pnl)

			// Only count losses (negative P&L)
			if (pnl < 0) {
				const current = mistakeStats.get(association.tagId) || {
					tagName: association.tag.name,
					color: association.tag.color,
					totalLoss: 0,
					tradeCount: 0,
				}
				mistakeStats.set(association.tagId, {
					...current,
					totalLoss: current.totalLoss + Math.abs(pnl),
					tradeCount: current.tradeCount + 1,
				})
			}
		}

		const mistakes = Array.from(mistakeStats.entries())
			.map(([tagId, data]) => ({
				tagId,
				tagName: data.tagName,
				color: data.color,
				tradeCount: data.tradeCount,
				totalLoss: data.totalLoss,
				avgLoss: data.tradeCount > 0 ? data.totalLoss / data.tradeCount : 0,
			}))
			.toSorted((a, b) => b.totalLoss - a.totalLoss)

		const totalMistakeCost = mistakes.reduce((sum, m) => sum + m.totalLoss, 0)
		const mostCostlyMistake = mistakes[0]?.tagName ?? null

		return {
			status: "success",
			data: {
				mistakes,
				totalMistakeCost,
				mostCostlyMistake,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching mistake cost analysis:", error)
		}
		return { status: "error", message: t("actions.mistakeFetchFailed") }
	}
}

// ============================================================================
// PROP TRADING CALCULATIONS
// ============================================================================

// dayTradeTaxRate is transient (computed from legal-rates by year), not DB-backed.
// Canonical implementation lives at src/lib/reports/calculate-prop-profit.ts

// Get business days in a month (excluding weekends)
const getBusinessDaysInMonth = (date: Date): number => {
	const start = startOfMonth(date)
	const end = endOfMonth(date)
	return differenceInBusinessDays(end, start) + 1
}

// Get unique trading days from trades
const getUniqueTradingDays = (
	tradeList: Array<{ entryDate: Date }>
): number => {
	const uniqueDays = new Set<string>()
	for (const trade of tradeList) {
		const dateKey = formatDateKey(new Date(trade.entryDate))
		uniqueDays.add(dateKey)
	}
	return uniqueDays.size
}

// ============================================================================
// MONTHLY RESULTS WITH PROP CALCULATIONS
// ============================================================================

const getMonthlyResultsWithPropInternal = async (
	monthOffset = 0,
	prefetchedData?: {
		account: Awaited<ReturnType<typeof db.query.tradingAccounts.findFirst>>
		settingsResult: Awaited<ReturnType<typeof getUserSettings>>
		authContext: Awaited<ReturnType<typeof requireAuth>>
	}
): Promise<{
	status: "success" | "error"
	data?: MonthlyResultsWithProp
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = prefetchedData?.authContext ?? (await requireAuth())
		const account =
			prefetchedData?.account ??
			(await db.query.tradingAccounts.findFirst({
				where: eq(tradingAccounts.id, authContext.accountId),
			}))
		const settingsResult =
			prefetchedData?.settingsResult ?? (await getUserSettings())
		const reportResult = await getMonthlyReport(monthOffset)

		if (!account) {
			return { status: "error", message: t("actions.accountNotFound") }
		}

		if (settingsResult.status !== "success" || !settingsResult.data) {
			return { status: "error", message: t("actions.settingsFetchFailed") }
		}

		if (reportResult.status !== "success" || !reportResult.data) {
			return { status: "error", message: t("actions.monthlyFetchFailed") }
		}

		const userSettings = settingsResult.data
		const report = reportResult.data

		// Account fields are plaintext
		const decryptedAccount = account

		// Use account-specific settings (from tradingAccounts table)
		// isPropAccount is determined by accountType, other settings come from account.
		// Day-trade IR rate sourced from legal-rates (Lei 11.033/2004) — single source
		// of truth shared with cockpit + recompute. Account override column ignored.
		const isPropAccount = decryptedAccount.accountType === "prop"
		const profitSharePercentage = Number(decryptedAccount.profitSharePercentage)
		const reportYear = Number(report.monthStart.slice(0, 4))
		const dayTradeTaxRate = getDayTradeIrRate(reportYear) * 100

		// Build settings object for prop calculator (only needs the specific fields)
		const calcSettings: PropCalcSettings = {
			isPropAccount,
			profitSharePercentage,
			dayTradeTaxRate,
			showTaxEstimates: decryptedAccount.showTaxEstimates,
		}

		// Calculate prop profit breakdown using account-specific settings
		const prop = calculatePropProfit(report.summary.netPnl, calcSettings)

		return {
			status: "success",
			data: {
				monthStart: report.monthStart,
				monthEnd: report.monthEnd,
				report: report.summary,
				prop,
				settings: {
					isPropAccount,
					propFirmName: decryptedAccount.propFirmName,
					profitSharePercentage,
					dayTradeTaxRate,
				},
				weeklyBreakdown: report.weeklyBreakdown,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching monthly results with prop:", error)
		}
		return { status: "error", message: t("actions.monthlyResultsFetchFailed") }
	}
}

export const getMonthlyResultsWithProp = async (
	monthOffset = 0
): Promise<{
	status: "success" | "error"
	data?: MonthlyResultsWithProp
	message?: string
}> => getMonthlyResultsWithPropInternal(monthOffset)

// ============================================================================
// MONTHLY PROJECTION
// ============================================================================

export const getMonthlyProjection = async (): Promise<{
	status: "success" | "error"
	data?: MonthlyProjection
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = await requireAuth()
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const now = await getServerEffectiveNow()
		const monthStart = startOfMonth(now)
		const monthEnd = endOfMonth(now)

		// Get account, user settings, and current month trades in parallel
		const [account, settingsResult, monthTrades] = await Promise.all([
			db.query.tradingAccounts.findFirst({
				where: eq(tradingAccounts.id, authContext.accountId),
			}),
			getUserSettings(),
			db.query.trades.findMany({
				where: and(
					accountCondition,
					eq(trades.isArchived, false),
					gte(trades.entryDate, monthStart),
					lte(trades.entryDate, now)
				),
			}),
		])

		if (!account) {
			return { status: "error", message: t("actions.accountNotFound") }
		}

		if (settingsResult.status !== "success" || !settingsResult.data) {
			return { status: "error", message: t("actions.settingsFetchFailed") }
		}

		const userSettings = settingsResult.data
		const decryptedAccount = account
		const totalTradingDays = getBusinessDaysInMonth(now)
		const daysTraded = getUniqueTradingDays(monthTrades)
		const tradingDaysRemaining = Math.max(
			0,
			differenceInBusinessDays(monthEnd, now)
		)

		const currentProfit = monthTrades.reduce(
			(sum, t) => sum + fromCents(t.pnl),
			0
		)
		const dailyAverage = daysTraded > 0 ? currentProfit / daysTraded : 0
		const projectedMonthlyProfit =
			currentProfit + dailyAverage * tradingDaysRemaining

		// Use account-specific settings for projection. IR rate from legal-rates
		// table by year of the projected month (matches cockpit + recompute).
		const projectionYear = monthStart.getUTCFullYear()
		const projectionSettings: PropCalcSettings = {
			isPropAccount: decryptedAccount.accountType === "prop",
			profitSharePercentage: Number(decryptedAccount.profitSharePercentage),
			dayTradeTaxRate: getDayTradeIrRate(projectionYear) * 100,
			showTaxEstimates: decryptedAccount.showTaxEstimates,
		}

		// Calculate projected prop values using account-specific settings
		const projectedProp = calculatePropProfit(
			projectedMonthlyProfit,
			projectionSettings
		)

		return {
			status: "success",
			data: {
				daysTraded,
				totalTradingDays,
				tradingDaysRemaining,
				currentProfit,
				dailyAverage,
				projectedMonthlyProfit,
				projectedTraderShare: projectedProp.traderShare,
				projectedNetProfit: projectedProp.netProfit,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching monthly projection:", error)
		}
		return { status: "error", message: t("actions.projectionFetchFailed") }
	}
}

// ============================================================================
// MONTH COMPARISON
// ============================================================================

export const getMonthComparison = async (
	monthOffset = 0
): Promise<{
	status: "success" | "error"
	data?: MonthComparison
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		// Prefetch shared account and settings data once
		const authContext = await requireAuth()
		const [account, settingsResult] = await Promise.all([
			db.query.tradingAccounts.findFirst({
				where: eq(tradingAccounts.id, authContext.accountId),
			}),
			getUserSettings(),
		])

		const prefetchedData = {
			account,
			settingsResult,
			authContext,
		}

		// Get current and previous month results with prefetched data
		const [currentResult, previousResult] = await Promise.all([
			getMonthlyResultsWithPropInternal(monthOffset, prefetchedData),
			getMonthlyResultsWithPropInternal(monthOffset + 1, prefetchedData),
		])

		if (currentResult.status !== "success" || !currentResult.data) {
			return { status: "error", message: t("actions.currentMonthFetchFailed") }
		}

		const current = currentResult.data
		const previous =
			previousResult.status === "success" ? previousResult.data : null

		// Calculate changes
		const profitChange = previous
			? current.report.netPnl - previous.report.netPnl
			: 0
		const profitChangePercent =
			previous && previous.report.netPnl !== 0
				? ((current.report.netPnl - previous.report.netPnl) /
						Math.abs(previous.report.netPnl)) *
					100
				: 0
		const winRateChange = previous
			? current.report.winRate - previous.report.winRate
			: 0
		const avgRChange = previous ? current.report.avgR - previous.report.avgR : 0
		const tradeCountChange = previous
			? current.report.totalTrades - previous.report.totalTrades
			: 0

		return {
			status: "success",
			data: {
				currentMonth: current,
				previousMonth: previous ?? null,
				changes: {
					profitChange,
					profitChangePercent,
					winRateChange,
					avgRChange,
					tradeCountChange,
				},
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching month comparison:", error)
		}
		return { status: "error", message: t("actions.comparisonFetchFailed") }
	}
}

// ============================================================================
// YEARLY OVERVIEW
// ============================================================================

export const getYearlyOverview = async (
	year?: number
): Promise<{
	status: "success" | "error"
	data?: YearlyOverview
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = await requireAuth()
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const effectiveNow = await getServerEffectiveNow()
		const targetYear = year || effectiveNow.getFullYear()
		const yearStart = new Date(targetYear, 0, 1)
		const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59)

		// Get all trades for the year
		const yearTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, yearStart),
				lte(trades.entryDate, yearEnd)
			),
		})

		// Group by month
		const monthlyData = new Map<
			number,
			{ netPnl: number; tradeCount: number }
		>()

		for (const trade of yearTrades) {
			const month = new Date(trade.entryDate).getMonth()
			const current = monthlyData.get(month) || { netPnl: 0, tradeCount: 0 }
			monthlyData.set(month, {
				netPnl: current.netPnl + fromCents(trade.pnl),
				tradeCount: current.tradeCount + 1,
			})
		}

		// Build months array
		const tMonths = await getTranslations("months")
		const monthNames = Array.from({ length: 12 }, (_, i) => tMonths(String(i)))

		const months = monthNames.map((name, index) => {
			const data = monthlyData.get(index)
			return {
				month: index,
				monthName: name,
				netPnl: data?.netPnl || 0,
				tradeCount: data?.tradeCount || 0,
				hasTrades: (data?.tradeCount || 0) > 0,
			}
		})

		return {
			status: "success",
			data: {
				year: targetYear,
				months,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching yearly overview:", error)
		}
		return { status: "error", message: t("actions.yearlyFetchFailed") }
	}
}

// ============================================================================
// COMMISSION & FEE IMPACT
// ============================================================================

export const getCommissionFeeImpact = async (): Promise<{
	status: "success" | "error"
	data?: CommissionFeeImpact
	message?: string
}> => {
	const t = await getTranslations("reports")
	try {
		const authContext = await requireAuth()
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const effectiveNow = await getServerEffectiveNow()

		const allTrades = await db.query.trades.findMany({
			where: and(accountCondition, eq(trades.isArchived, false)),
			orderBy: [desc(trades.entryDate)],
		})

		if (allTrades.length === 0) {
			return {
				status: "success",
				data: {
					summary: {
						totalFees: 0,
						totalCommission: 0,
						totalExchangeFees: 0,
						grossPnl: 0,
						feesAsPercentOfGross: 0,
						avgFeePerTrade: 0,
						totalTrades: 0,
					},
					assetBreakdown: [],
					monthlyTrend: [],
					hasData: false,
				},
			}
		}

		// Aggregate totals
		let totalCommission = 0
		let totalExchangeFees = 0
		let totalNetPnl = 0
		let hasData = false

		// Group by asset
		const assetMap = new Map<
			string,
			{ totalFees: number; tradeCount: number }
		>()

		// Group by month (last 6 months)
		const sixMonthsAgo = subMonths(startOfMonth(effectiveNow), 5)
		const monthMap = new Map<
			string,
			{ totalFees: number; grossPnl: number; tradeCount: number }
		>()

		for (const trade of allTrades) {
			const commission = fromCents(trade.commission)
			const fees = fromCents(trade.fees)
			const tradeFee = commission + fees
			const netPnl = fromCents(trade.pnl)

			totalCommission += commission
			totalExchangeFees += fees
			totalNetPnl += netPnl

			if (tradeFee > 0) {
				hasData = true
			}

			// Asset breakdown
			const assetEntry = assetMap.get(trade.asset) || {
				totalFees: 0,
				tradeCount: 0,
			}
			assetMap.set(trade.asset, {
				totalFees: assetEntry.totalFees + tradeFee,
				tradeCount: assetEntry.tradeCount + 1,
			})

			// Monthly trend (only last 6 months)
			const entryDate = new Date(trade.entryDate)
			if (entryDate >= sixMonthsAgo) {
				const monthKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}`
				const monthEntry = monthMap.get(monthKey) || {
					totalFees: 0,
					grossPnl: 0,
					tradeCount: 0,
				}
				monthMap.set(monthKey, {
					totalFees: monthEntry.totalFees + tradeFee,
					grossPnl: monthEntry.grossPnl + netPnl + tradeFee,
					tradeCount: monthEntry.tradeCount + 1,
				})
			}
		}

		const totalFees = totalCommission + totalExchangeFees
		const grossPnl = totalNetPnl + totalFees

		const summary = {
			totalFees,
			totalCommission,
			totalExchangeFees,
			grossPnl,
			feesAsPercentOfGross: grossPnl > 0 ? (totalFees / grossPnl) * 100 : 0,
			avgFeePerTrade: allTrades.length > 0 ? totalFees / allTrades.length : 0,
			totalTrades: allTrades.length,
		}

		const assetBreakdown = Array.from(assetMap.entries())
			.map(([asset, data]) => ({
				asset,
				totalFees: data.totalFees,
				tradeCount: data.tradeCount,
				avgFeePerTrade:
					data.tradeCount > 0 ? data.totalFees / data.tradeCount : 0,
			}))
			.toSorted((a, b) => b.totalFees - a.totalFees)

		const monthlyTrend = Array.from(monthMap.entries())
			.map(([month, data]) => ({
				month,
				totalFees: data.totalFees,
				grossPnl: data.grossPnl,
				feesAsPercentOfGross:
					data.grossPnl > 0 ? (data.totalFees / data.grossPnl) * 100 : 0,
				tradeCount: data.tradeCount,
			}))
			.toSorted((a, b) => a.month.localeCompare(b.month))

		return {
			status: "success",
			data: {
				summary,
				assetBreakdown,
				monthlyTrend,
				hasData,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error fetching commission fee impact:", error)
		}
		return {
			status: "error",
			message: t("actions.commissionFetchFailed"),
		}
	}
}
