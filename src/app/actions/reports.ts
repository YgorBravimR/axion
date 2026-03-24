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
import { getUserSettings, type UserSettingsData } from "./settings"
import { requireAuth } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getUserDek, decryptAccountFields } from "@/lib/user-crypto"
import { getTranslations } from "next-intl/server"

// ============================================================================
// TYPES
// ============================================================================

export interface DailyBreakdown {
	date: string
	tradeCount: number
	winCount: number
	lossCount: number
	pnl: number
	winRate: number
}

export interface WeeklyReport {
	weekStart: string
	weekEnd: string
	summary: {
		totalTrades: number
		winCount: number
		lossCount: number
		breakevenCount: number
		grossPnl: number
		netPnl: number
		totalFees: number
		winRate: number
		avgWin: number
		avgLoss: number
		profitFactor: number
		avgR: number
		bestTrade: number
		worstTrade: number
	}
	dailyBreakdown: DailyBreakdown[]
	topWins: Array<{
		id: string
		asset: string
		pnl: number
		r: number | null
		direction: string
		date: string
	}>
	topLosses: Array<{
		id: string
		asset: string
		pnl: number
		r: number | null
		direction: string
		date: string
	}>
}

export interface MonthlyReport {
	monthStart: string
	monthEnd: string
	summary: {
		totalTrades: number
		winCount: number
		lossCount: number
		breakevenCount: number
		grossPnl: number
		netPnl: number
		totalFees: number
		winRate: number
		avgWin: number
		avgLoss: number
		profitFactor: number
		avgR: number
		bestDay: { date: string; pnl: number } | null
		worstDay: { date: string; pnl: number } | null
	}
	weeklyBreakdown: Array<{
		weekStart: string
		weekEnd: string
		tradeCount: number
		pnl: number
		winRate: number
	}>
	assetBreakdown: Array<{
		asset: string
		tradeCount: number
		pnl: number
		winRate: number
	}>
}

export interface MistakeCostAnalysis {
	mistakes: Array<{
		tagId: string
		tagName: string
		color: string | null
		tradeCount: number
		totalLoss: number
		avgLoss: number
	}>
	totalMistakeCost: number
	mostCostlyMistake: string | null
}

// ============================================================================
// SHARED SUMMARY CALCULATION
// ============================================================================

interface ReportSummaryBase {
	totalTrades: number
	winCount: number
	lossCount: number
	breakevenCount: number
	grossPnl: number
	netPnl: number
	totalFees: number
	winRate: number
	avgWin: number
	avgLoss: number
	profitFactor: number
	avgR: number
}

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
	const winTrades = tradeList.filter((t) => t.outcome === "win")
	const lossTrades = tradeList.filter((t) => t.outcome === "loss")
	const breakevenCount = tradeList.filter(
		(t) => t.outcome === "breakeven"
	).length

	const netPnl = tradeList.reduce((sum, t) => sum + fromCents(t.pnl), 0)
	const totalFees = tradeList.reduce(
		(sum, t) => sum + fromCents(t.commission) + fromCents(t.fees),
		0
	)
	const grossPnl = netPnl + totalFees
	const grossProfit = winTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0)
	const grossLoss = Math.abs(
		lossTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0)
	)
	const avgWin =
		winTrades.length > 0
			? winTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0) /
				winTrades.length
			: 0
	const avgLoss =
		lossTrades.length > 0
			? lossTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0) /
				lossTrades.length
			: 0
	const tradesWithR = tradeList.filter((t) => t.realizedRMultiple)
	const avgR =
		tradesWithR.length > 0
			? tradesWithR.reduce(
					(sum, t) =>
						sum + (t.realizedRMultiple ? parseFloat(t.realizedRMultiple) : 0),
					0
				) / tradesWithR.length
			: 0

	const decidedCount = winTrades.length + lossTrades.length

	return {
		totalTrades: tradeList.length,
		winCount: winTrades.length,
		lossCount: lossTrades.length,
		breakevenCount,
		grossPnl,
		netPnl,
		totalFees,
		winRate: decidedCount > 0 ? (winTrades.length / decidedCount) * 100 : 0,
		avgWin,
		avgLoss,
		profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
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

		const pnlValues = weekTrades
			.map((t) => fromCents(t.pnl))
			.filter((p) => p !== 0)

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

		// Top wins/losses - pnl is stored in cents, convert to dollars (using toSorted for immutability)
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
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching weekly report:", error)
		return { status: "error", message: "Failed to fetch weekly report" }
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
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching monthly report:", error)
		return { status: "error", message: "Failed to fetch monthly report" }
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
			if (!assoc.trade.accountId) return false
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
		const mostCostlyMistake = mistakes.length > 0 ? mistakes[0].tagName : null

		return {
			status: "success",
			data: {
				mistakes,
				totalMistakeCost,
				mostCostlyMistake,
			},
		}
	} catch (error) {
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching mistake cost analysis:", error)
		return { status: "error", message: "Failed to fetch mistake cost analysis" }
	}
}

// ============================================================================
// PROP TRADING CALCULATIONS
// ============================================================================

export interface PropProfitCalculation {
	grossProfit: number
	propFirmShare: number
	traderShare: number
	estimatedTax: number
	netProfit: number
}

export interface MonthlyResultsWithProp {
	monthStart: string
	monthEnd: string
	report: MonthlyReport["summary"]
	prop: PropProfitCalculation
	settings: {
		isPropAccount: boolean
		propFirmName: string | null
		profitSharePercentage: number
		dayTradeTaxRate: number
	}
	weeklyBreakdown: MonthlyReport["weeklyBreakdown"]
}

export interface MonthlyProjection {
	daysTraded: number
	totalTradingDays: number
	tradingDaysRemaining: number
	currentProfit: number
	dailyAverage: number
	projectedMonthlyProfit: number
	projectedTraderShare: number
	projectedNetProfit: number
}

export interface MonthComparison {
	currentMonth: MonthlyResultsWithProp
	previousMonth: MonthlyResultsWithProp | null
	changes: {
		profitChange: number
		profitChangePercent: number
		winRateChange: number
		avgRChange: number
		tradeCountChange: number
	}
}

export interface YearlyOverview {
	year: number
	months: Array<{
		month: number
		monthName: string
		netPnl: number
		tradeCount: number
		hasTrades: boolean
	}>
}

// Calculate prop trading profit breakdown
const calculatePropProfit = (
	grossProfit: number,
	settings: UserSettingsData
): PropProfitCalculation => {
	// Only calculate shares if profitable
	if (grossProfit <= 0) {
		return {
			grossProfit,
			propFirmShare: 0,
			traderShare: grossProfit, // Trader absorbs the loss
			estimatedTax: 0, // No tax on losses
			netProfit: grossProfit,
		}
	}

	const profitSharePercent = settings.isPropAccount
		? settings.profitSharePercentage
		: 100

	const traderShare = grossProfit * (profitSharePercent / 100)
	const propFirmShare = grossProfit - traderShare
	const estimatedTax = settings.showTaxEstimates
		? traderShare * (settings.dayTradeTaxRate / 100)
		: 0
	const netProfit = traderShare - estimatedTax

	return {
		grossProfit,
		propFirmShare,
		traderShare,
		estimatedTax,
		netProfit,
	}
}

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

export const getMonthlyResultsWithProp = async (
	monthOffset = 0
): Promise<{
	status: "success" | "error"
	data?: MonthlyResultsWithProp
	message?: string
}> => {
	try {
		const authContext = await requireAuth()

		// Get current account, user settings, and monthly report in parallel
		const [account, settingsResult, reportResult] = await Promise.all([
			db.query.tradingAccounts.findFirst({
				where: eq(tradingAccounts.id, authContext.accountId),
			}),
			getUserSettings(),
			getMonthlyReport(monthOffset),
		])

		if (!account) {
			return { status: "error", message: "Trading account not found" }
		}

		if (settingsResult.status !== "success" || !settingsResult.data) {
			return { status: "error", message: "Failed to get user settings" }
		}

		if (reportResult.status !== "success" || !reportResult.data) {
			return { status: "error", message: "Failed to get monthly report" }
		}

		const userSettings = settingsResult.data
		const report = reportResult.data

		// Decrypt account fields before reading numeric values
		const dek = await getUserDek(authContext.userId)
		const decryptedAccount = dek
			? decryptAccountFields(account as unknown as Record<string, unknown>, dek) as unknown as typeof account
			: account

		// Use account-specific settings (from tradingAccounts table)
		// isPropAccount is determined by accountType, other settings come from account
		const isPropAccount = decryptedAccount.accountType === "prop"
		const profitSharePercentage = Number(decryptedAccount.profitSharePercentage)
		const dayTradeTaxRate = Number(decryptedAccount.dayTradeTaxRate)

		// Build settings object for calculation using account-specific values
		const accountSettings: UserSettingsData = {
			...userSettings,
			isPropAccount,
			propFirmName: decryptedAccount.propFirmName,
			profitSharePercentage,
			dayTradeTaxRate,
			showTaxEstimates: decryptedAccount.showTaxEstimates,
		}

		// Calculate prop profit breakdown using account-specific settings
		const prop = calculatePropProfit(report.summary.netPnl, accountSettings)

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
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching monthly results with prop:", error)
		return { status: "error", message: "Failed to fetch monthly results" }
	}
}

// ============================================================================
// MONTHLY PROJECTION
// ============================================================================

export const getMonthlyProjection = async (): Promise<{
	status: "success" | "error"
	data?: MonthlyProjection
	message?: string
}> => {
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
			return { status: "error", message: "Trading account not found" }
		}

		if (settingsResult.status !== "success" || !settingsResult.data) {
			return { status: "error", message: "Failed to get user settings" }
		}

		// Decrypt account fields (personal account info may be encrypted)
		const dek = await getUserDek(authContext.userId)
		const decryptedAccount = dek
			? decryptAccountFields(account as unknown as Record<string, unknown>, dek) as unknown as typeof account
			: account

		const userSettings = settingsResult.data
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

		// Use account-specific settings for projection
		const accountSettings: UserSettingsData = {
			...userSettings,
			isPropAccount: decryptedAccount.accountType === "prop",
			propFirmName: decryptedAccount.propFirmName,
			profitSharePercentage: Number(decryptedAccount.profitSharePercentage),
			dayTradeTaxRate: Number(decryptedAccount.dayTradeTaxRate),
			showTaxEstimates: decryptedAccount.showTaxEstimates,
		}

		// Calculate projected prop values using account-specific settings
		const projectedProp = calculatePropProfit(
			projectedMonthlyProfit,
			accountSettings
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
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching monthly projection:", error)
		return { status: "error", message: "Failed to fetch monthly projection" }
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
	try {
		// Get current and previous month results
		const [currentResult, previousResult] = await Promise.all([
			getMonthlyResultsWithProp(monthOffset),
			getMonthlyResultsWithProp(monthOffset + 1),
		])

		if (currentResult.status !== "success" || !currentResult.data) {
			return { status: "error", message: "Failed to get current month data" }
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
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching month comparison:", error)
		return { status: "error", message: "Failed to fetch month comparison" }
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
		if (!(error instanceof Error && "digest" in error)) console.error("Error fetching yearly overview:", error)
		return { status: "error", message: "Failed to fetch yearly overview" }
	}
}
