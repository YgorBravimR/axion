"use server"

import { db } from "@/db/drizzle"
import { trades, settings, tradingAccounts } from "@/db/schema"
import { eq, and, gte, lte, desc, asc, sql, inArray } from "drizzle-orm"
import type {
	ActionResponse,
	OverallStats,
	DisciplineData,
	EquityPoint,
	DailyPnL,
	StreakData,
	PerformanceByGroup,
	ExpectedValueData,
	RDistributionBucket,
	TradeFilters,
	HourlyPerformance,
	DayOfWeekPerformance,
	TimeHeatmapCell,
	DaySummary,
	DayTrade,
	DayEquityPoint,
	RadarChartData,
	TradingSession,
	SessionPerformance,
	SessionAssetPerformance,
} from "@/types"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import {
	getStartOfMonth,
	getEndOfMonth,
	getStartOfDay,
	getEndOfDay,
	formatDateKey,
	APP_TIMEZONE,
	getBrtTimeParts,
} from "@/lib/dates"
import { fromCents } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { getTranslations } from "next-intl/server"

interface AccountFilter {
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

/**
 * Build filter conditions from TradeFilters
 */
const buildFilterConditions = (
	authContext: AccountFilter,
	filters?: TradeFilters
) => {
	// Filter by current account or all accounts based on setting
	const accountCondition = authContext.showAllAccounts
		? inArray(trades.accountId, authContext.allAccountIds)
		: eq(trades.accountId, authContext.accountId)

	const conditions = [accountCondition, eq(trades.isArchived, false)]

	if (filters?.dateFrom) {
		conditions.push(gte(trades.entryDate, filters.dateFrom))
	}
	if (filters?.dateTo) {
		conditions.push(lte(trades.entryDate, filters.dateTo))
	}
	if (filters?.assets && filters.assets.length > 0) {
		conditions.push(inArray(trades.asset, filters.assets))
	}
	if (filters?.directions && filters.directions.length > 0) {
		conditions.push(inArray(trades.direction, filters.directions))
	}
	if (filters?.outcomes && filters.outcomes.length > 0) {
		conditions.push(inArray(trades.outcome, filters.outcomes))
	}
	if (filters?.timeframeIds && filters.timeframeIds.length > 0) {
		conditions.push(inArray(trades.timeframeId, filters.timeframeIds))
	}

	return conditions
}

/**
 * Get overall trading statistics
 */
export const getOverallStats = async (
	dateFrom?: Date,
	dateTo?: Date
): Promise<ActionResponse<OverallStats>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, { dateFrom, dateTo })

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: {
					grossPnl: 0,
					netPnl: 0,
					totalFees: 0,
					winRate: 0,
					profitFactor: 0,
					averageR: 0,
					totalTrades: 0,
					winCount: 0,
					lossCount: 0,
					breakevenCount: 0,
					avgWin: 0,
					avgLoss: 0,
				},
			}
		}

		// Calculate stats from trades
		let totalNetPnl = 0
		let totalFees = 0
		let totalR = 0
		let rCount = 0
		let winCount = 0
		let lossCount = 0
		let breakevenCount = 0
		let grossProfit = 0
		let grossLoss = 0
		const wins: number[] = []
		const losses: number[] = []

		for (const trade of result) {
			const pnl = fromCents(trade.pnl) // This is net P&L (after fees)
			const commission = fromCents(trade.commission ?? 0)
			const fees = fromCents(trade.fees ?? 0)
			const tradeFees = commission + fees

			totalNetPnl += pnl
			totalFees += tradeFees

			if (trade.realizedRMultiple) {
				totalR += Number(trade.realizedRMultiple)
				rCount++
			}

			if (trade.outcome === "win") {
				winCount++
				grossProfit += pnl
				wins.push(pnl)
			} else if (trade.outcome === "loss") {
				lossCount++
				grossLoss += Math.abs(pnl)
				losses.push(Math.abs(pnl))
			} else if (trade.outcome === "breakeven") {
				breakevenCount++
			}
		}

		// Gross P&L = Net P&L + Total Fees (fees were subtracted to get net)
		const totalGrossPnl = totalNetPnl + totalFees

		const totalTrades = result.length
		const winRate = calculateWinRate(winCount, winCount + lossCount)
		const profitFactor = calculateProfitFactor(grossProfit, grossLoss)
		const averageR = rCount > 0 ? totalR / rCount : 0
		const avgWin =
			wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
		const avgLoss =
			losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

		return {
			status: "success",
			message: "Stats retrieved",
			data: {
				grossPnl: totalGrossPnl,
				netPnl: totalNetPnl,
				totalFees,
				winRate,
				profitFactor,
				averageR,
				totalTrades,
				winCount,
				lossCount,
				breakevenCount,
				avgWin,
				avgLoss,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve stats",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getOverallStats"),
				},
			],
		}
	}
}

/**
 * Get discipline/compliance score
 */
export const getDisciplineScore = async (
	dateFrom?: Date,
	dateTo?: Date
): Promise<ActionResponse<DisciplineData>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, { dateFrom, dateTo })

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
			orderBy: [desc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		const tradesWithPlanData = result.filter((t) => t.followedPlan !== null)
		const followedCount = tradesWithPlanData.filter(
			(t) => t.followedPlan === true
		).length
		const totalTrades = tradesWithPlanData.length
		const score = totalTrades > 0 ? (followedCount / totalTrades) * 100 : 0

		// Calculate recent compliance (last 10 trades)
		const recentTrades = tradesWithPlanData.slice(0, 10)
		const recentFollowed = recentTrades.filter(
			(t) => t.followedPlan === true
		).length
		const recentCompliance =
			recentTrades.length > 0 ? (recentFollowed / recentTrades.length) * 100 : 0

		// Determine trend
		let trend: "up" | "down" | "stable" = "stable"
		if (recentTrades.length >= 5 && totalTrades >= 10) {
			const olderTrades = tradesWithPlanData.slice(10, 20)
			const olderFollowed = olderTrades.filter(
				(t) => t.followedPlan === true
			).length
			const olderCompliance =
				olderTrades.length > 0 ? (olderFollowed / olderTrades.length) * 100 : 0

			if (recentCompliance > olderCompliance + 5) {
				trend = "up"
			} else if (recentCompliance < olderCompliance - 5) {
				trend = "down"
			}
		}

		return {
			status: "success",
			message: "Discipline score retrieved",
			data: {
				score,
				totalTrades,
				followedCount,
				trend,
				recentCompliance,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve discipline score",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDisciplineScore"),
				},
			],
		}
	}
}

export type EquityCurveMode = "daily" | "trade"

/**
 * Get equity curve data
 * Returns both cumulative P&L (equity) and actual account value (accountEquity)
 * mode: "daily" - aggregated by day (default), "trade" - per trade
 */
export const getEquityCurve = async (
	dateFrom?: Date,
	dateTo?: Date,
	mode: EquityCurveMode = "daily"
): Promise<ActionResponse<EquityPoint[]>> => {
	try {
		const authContext = await requireAuth()

		// Get account balance from trading account
		const account = await db.query.tradingAccounts.findFirst({
			where: eq(tradingAccounts.id, authContext.accountId),
		})
		// Fallback to global settings if account doesn't have balance
		const accountBalanceSetting = await db.query.settings.findFirst({
			where: eq(settings.key, "account_balance"),
		})
		const initialBalance = accountBalanceSetting
			? Number(accountBalanceSetting.value) || 10000
			: 10000

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const conditions = [accountCondition, eq(trades.isArchived, false)]

		if (dateFrom) {
			conditions.push(gte(trades.entryDate, dateFrom))
		}
		if (dateTo) {
			conditions.push(lte(trades.entryDate, dateTo))
		}

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		const equityPoints: EquityPoint[] = []

		if (mode === "trade") {
			// Per-trade equity curve
			let cumulativePnL = 0
			let peak = initialBalance

			for (let i = 0; i < result.length; i++) {
				const trade = result[i]
				const pnl = fromCents(trade.pnl)
				cumulativePnL += pnl
				const accountEquity = initialBalance + cumulativePnL

				if (accountEquity > peak) {
					peak = accountEquity
				}

				const drawdown = peak > 0 ? ((peak - accountEquity) / peak) * 100 : 0

				equityPoints.push({
					date: formatDateKey(trade.entryDate),
					equity: cumulativePnL,
					accountEquity,
					drawdown,
					tradeNumber: i + 1,
				})
			}
		} else {
			// Daily aggregated equity curve
			const dailyPnlMap = new Map<string, number>()
			for (const trade of result) {
				const dateKey = formatDateKey(trade.entryDate)
				const pnl = fromCents(trade.pnl)
				const existing = dailyPnlMap.get(dateKey) || 0
				dailyPnlMap.set(dateKey, existing + pnl)
			}

			const sortedDates = Array.from(dailyPnlMap.keys()).toSorted()

			let cumulativePnL = 0
			let peak = initialBalance

			for (const date of sortedDates) {
				const dailyPnl = dailyPnlMap.get(date) || 0
				cumulativePnL += dailyPnl
				const accountEquity = initialBalance + cumulativePnL

				if (accountEquity > peak) {
					peak = accountEquity
				}

				const drawdown = peak > 0 ? ((peak - accountEquity) / peak) * 100 : 0

				equityPoints.push({
					date,
					equity: cumulativePnL,
					accountEquity,
					drawdown,
				})
			}
		}

		return {
			status: "success",
			message: "Equity curve retrieved",
			data: equityPoints,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve equity curve",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getEquityCurve"),
				},
			],
		}
	}
}

/**
 * Get daily P&L for calendar
 */
export const getDailyPnL = async (
	year: number,
	monthIndex: number
): Promise<ActionResponse<DailyPnL[]>> => {
	try {
		const authContext = await requireAuth()

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		// Use timezone-aware boundaries (BRT) to correctly match trade dates
		const refDate = new Date(year, monthIndex, 15) // day 15 avoids timezone edge at month boundaries
		const startOfMonth = getStartOfMonth(refDate)
		const endOfMonth = getEndOfMonth(refDate)

		const rawResult = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, startOfMonth),
				lte(trades.entryDate, endOfMonth)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		// Group by date using local timezone
		const dailyMap = new Map<string, { pnl: number; count: number }>()

		for (const trade of result) {
			const dateKey = formatDateKey(trade.entryDate)
			const existing = dailyMap.get(dateKey) || { pnl: 0, count: 0 }
			existing.pnl += fromCents(trade.pnl)
			existing.count++
			dailyMap.set(dateKey, existing)
		}

		const dailyPnL: DailyPnL[] = Array.from(dailyMap.entries()).map(
			([date, data]) => ({
				date,
				pnl: data.pnl,
				tradeCount: data.count,
			})
		)

		return {
			status: "success",
			message: "Daily P&L retrieved",
			data: dailyPnL,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve daily P&L",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDailyPnL"),
				},
			],
		}
	}
}

/**
 * Get streak data
 */
export const getStreakData = async (
	dateFrom?: Date,
	dateTo?: Date
): Promise<ActionResponse<StreakData>> => {
	try {
		const authContext = await requireAuth()

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const conditions = [accountCondition, eq(trades.isArchived, false)]

		if (dateFrom) {
			conditions.push(gte(trades.entryDate, dateFrom))
		}
		if (dateTo) {
			conditions.push(lte(trades.entryDate, dateTo))
		}

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
			orderBy: [desc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: {
					currentStreak: 0,
					currentStreakType: "none",
					longestWinStreak: 0,
					longestLossStreak: 0,
					bestDay: null,
					worstDay: null,
				},
			}
		}

		// Calculate current streak
		let currentStreak = 0
		let currentStreakType: "win" | "loss" | "none" = "none"

		if (result.length > 0 && result[0].outcome) {
			currentStreakType =
				result[0].outcome === "win"
					? "win"
					: result[0].outcome === "loss"
						? "loss"
						: "none"
			for (const trade of result) {
				if (currentStreakType === "win" && trade.outcome === "win") {
					currentStreak++
				} else if (currentStreakType === "loss" && trade.outcome === "loss") {
					currentStreak++
				} else {
					break
				}
			}
		}

		// Calculate longest streaks (oldest to newest)
		const sortedTrades = [...result].reverse()
		let longestWinStreak = 0
		let longestLossStreak = 0
		let tempWinStreak = 0
		let tempLossStreak = 0

		for (const trade of sortedTrades) {
			if (trade.outcome === "win") {
				tempWinStreak++
				tempLossStreak = 0
				longestWinStreak = Math.max(longestWinStreak, tempWinStreak)
			} else if (trade.outcome === "loss") {
				tempLossStreak++
				tempWinStreak = 0
				longestLossStreak = Math.max(longestLossStreak, tempLossStreak)
			} else {
				tempWinStreak = 0
				tempLossStreak = 0
			}
		}

		// Calculate best and worst days using local timezone
		const dailyMap = new Map<string, number>()
		for (const trade of result) {
			const dateKey = formatDateKey(trade.entryDate)
			const existing = dailyMap.get(dateKey) || 0
			dailyMap.set(dateKey, existing + fromCents(trade.pnl))
		}

		let bestDay: { date: string; pnl: number } | null = null
		let worstDay: { date: string; pnl: number } | null = null

		for (const [date, pnl] of dailyMap) {
			if (!bestDay || pnl > bestDay.pnl) {
				bestDay = { date, pnl }
			}
			if (!worstDay || pnl < worstDay.pnl) {
				worstDay = { date, pnl }
			}
		}

		return {
			status: "success",
			message: "Streak data retrieved",
			data: {
				currentStreak,
				currentStreakType,
				longestWinStreak,
				longestLossStreak,
				bestDay,
				worstDay,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve streak data",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStreakData"),
				},
			],
		}
	}
}

/**
 * Get performance grouped by variable
 */
export const getPerformanceByVariable = async (
	groupBy: "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy",
	filters?: TradeFilters
): Promise<ActionResponse<PerformanceByGroup[]>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
			with: {
				strategy: true,
				timeframe: true,
			},
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// Pre-load day translations for dayOfWeek grouping
		const tDaysTranslation = await getTranslations("days")

		// Group trades by the specified variable
		const groups = new Map<
			string,
			{
				trades: typeof result
				pnl: number
				winCount: number
				lossCount: number
				totalR: number
				rCount: number
				grossProfit: number
				grossLoss: number
			}
		>()

		for (const trade of result) {
			let groupKey: string

			switch (groupBy) {
				case "asset":
					groupKey = trade.asset
					break
				case "timeframe":
					groupKey = trade.timeframe?.name || "Unknown"
					break
				case "hour": {
					const { hour } = getBrtTimeParts(trade.entryDate)
					groupKey = `${hour.toString().padStart(2, "0")}:00`
					break
				}
				case "dayOfWeek": {
					const dayKeys = [
						"sunday",
						"monday",
						"tuesday",
						"wednesday",
						"thursday",
						"friday",
						"saturday",
					] as const
					const { dayOfWeek } = getBrtTimeParts(trade.entryDate)
					groupKey = tDaysTranslation(dayKeys[dayOfWeek])
					break
				}
				case "strategy":
					groupKey = trade.strategy?.name || "No Strategy"
					break
				default:
					groupKey = "Unknown"
			}

			const existing = groups.get(groupKey) || {
				trades: [],
				pnl: 0,
				winCount: 0,
				lossCount: 0,
				totalR: 0,
				rCount: 0,
				grossProfit: 0,
				grossLoss: 0,
			}

			const pnl = fromCents(trade.pnl)
			existing.trades.push(trade)
			existing.pnl += pnl

			if (trade.outcome === "win") {
				existing.winCount++
				existing.grossProfit += pnl
			} else if (trade.outcome === "loss") {
				existing.lossCount++
				existing.grossLoss += Math.abs(pnl)
			}

			if (trade.realizedRMultiple) {
				existing.totalR += Number(trade.realizedRMultiple)
				existing.rCount++
			}

			groups.set(groupKey, existing)
		}

		// Convert to array and calculate final stats
		const performanceData: PerformanceByGroup[] = Array.from(groups.entries())
			.map(([group, data]) => ({
				group,
				tradeCount: data.trades.length,
				pnl: data.pnl,
				winRate: calculateWinRate(
					data.winCount,
					data.winCount + data.lossCount
				),
				avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
				profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
			}))
			.toSorted((a, b) => b.pnl - a.pnl)

		return {
			status: "success",
			message: "Performance data retrieved",
			data: performanceData,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve performance data",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getPerformanceByVariable"),
				},
			],
		}
	}
}

/**
 * Get expected value calculation
 */
export const getExpectedValue = async (
	filters?: TradeFilters
): Promise<ActionResponse<ExpectedValueData>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		const tradesWithOutcome = result.filter(
			(t) => t.outcome === "win" || t.outcome === "loss"
		)

		if (tradesWithOutcome.length === 0) {
			return {
				status: "success",
				message: "No completed trades found",
				data: {
					winRate: 0,
					avgWin: 0,
					avgLoss: 0,
					expectedValue: 0,
					projectedPnl100: 0,
					sampleSize: 0,
					avgWinR: 0,
					avgLossR: 0,
					expectedR: 0,
					projectedR100: 0,
					rSampleSize: 0,
				},
			}
		}

		// Capital Expectancy ($)
		const wins: number[] = []
		const losses: number[] = []

		for (const trade of tradesWithOutcome) {
			const pnl = fromCents(trade.pnl)
			if (trade.outcome === "win") {
				wins.push(pnl)
			} else if (trade.outcome === "loss") {
				losses.push(Math.abs(pnl))
			}
		}

		const winRate = wins.length / tradesWithOutcome.length
		const avgWin =
			wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
		const avgLoss =
			losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

		// EV($) = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)
		const expectedValue = winRate * avgWin - (1 - winRate) * avgLoss
		const projectedPnl100 = expectedValue * 100

		// Edge Expectancy (R-based)
		// Uses realizedRMultiple which is trade-relative (1R = that trade's initial risk)
		const tradesWithR = tradesWithOutcome.filter(
			(t) => t.realizedRMultiple !== null
		)

		const rWins: number[] = []
		const rLosses: number[] = []

		for (const trade of tradesWithR) {
			const rMultiple = Number(trade.realizedRMultiple)
			if (rMultiple > 0) {
				rWins.push(rMultiple)
			} else if (rMultiple < 0) {
				rLosses.push(Math.abs(rMultiple))
			}
		}

		const rSampleSize = tradesWithR.length
		const rDecisiveCount = rWins.length + rLosses.length
		const rWinRate = rDecisiveCount > 0 ? rWins.length / rDecisiveCount : 0
		const avgWinR =
			rWins.length > 0 ? rWins.reduce((a, b) => a + b, 0) / rWins.length : 0
		const avgLossR =
			rLosses.length > 0
				? rLosses.reduce((a, b) => a + b, 0) / rLosses.length
				: 0
		// EV(R) = (Win Rate × Avg Win R) - (Loss Rate × Avg Loss R)
		const expectedR =
			rDecisiveCount > 0 ? rWinRate * avgWinR - (1 - rWinRate) * avgLossR : 0
		const projectedR100 = expectedR * 100

		return {
			status: "success",
			message: "Expected value calculated",
			data: {
				winRate: winRate * 100,
				avgWin,
				avgLoss,
				expectedValue,
				projectedPnl100,
				sampleSize: tradesWithOutcome.length,
				avgWinR,
				avgLossR,
				expectedR,
				projectedR100,
				rSampleSize,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to calculate expected value",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getExpectedValue"),
				},
			],
		}
	}
}

/**
 * Get R-multiple distribution for histogram
 */
export const getRDistribution = async (
	filters?: TradeFilters
): Promise<ActionResponse<RDistributionBucket[]>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		// Filter trades with R-multiple data
		const tradesWithR = result.filter((t) => t.realizedRMultiple !== null)

		if (tradesWithR.length === 0) {
			return {
				status: "success",
				message: "No trades with R-multiple data",
				data: [],
			}
		}

		// Define buckets: -3R to +4R in 0.5R increments
		const buckets: RDistributionBucket[] = [
			{ range: "< -2R", rangeMin: -Infinity, rangeMax: -2, count: 0, pnl: 0 },
			{ range: "-2R to -1.5R", rangeMin: -2, rangeMax: -1.5, count: 0, pnl: 0 },
			{ range: "-1.5R to -1R", rangeMin: -1.5, rangeMax: -1, count: 0, pnl: 0 },
			{ range: "-1R to -0.5R", rangeMin: -1, rangeMax: -0.5, count: 0, pnl: 0 },
			{ range: "-0.5R to 0R", rangeMin: -0.5, rangeMax: 0, count: 0, pnl: 0 },
			{ range: "0R to 0.5R", rangeMin: 0, rangeMax: 0.5, count: 0, pnl: 0 },
			{ range: "0.5R to 1R", rangeMin: 0.5, rangeMax: 1, count: 0, pnl: 0 },
			{ range: "1R to 1.5R", rangeMin: 1, rangeMax: 1.5, count: 0, pnl: 0 },
			{ range: "1.5R to 2R", rangeMin: 1.5, rangeMax: 2, count: 0, pnl: 0 },
			{ range: "2R to 3R", rangeMin: 2, rangeMax: 3, count: 0, pnl: 0 },
			{ range: "> 3R", rangeMin: 3, rangeMax: Infinity, count: 0, pnl: 0 },
		]

		for (const trade of tradesWithR) {
			const r = Number(trade.realizedRMultiple)
			const pnl = fromCents(trade.pnl)

			for (const bucket of buckets) {
				if (r >= bucket.rangeMin && r < bucket.rangeMax) {
					bucket.count++
					bucket.pnl += pnl
					break
				}
			}
		}

		// Filter out empty buckets at the extremes
		const nonEmptyBuckets = buckets.filter((b) => b.count > 0)

		return {
			status: "success",
			message: "R-distribution calculated",
			data:
				nonEmptyBuckets.length > 0
					? nonEmptyBuckets
					: buckets.filter((b) => b.rangeMin >= -2 && b.rangeMax <= 3),
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to calculate R-distribution",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getRDistribution"),
				},
			],
		}
	}
}

/**
 * Get hourly performance analysis
 */
export const getHourlyPerformance = async (
	filters?: TradeFilters
): Promise<ActionResponse<HourlyPerformance[]>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// Group by hour
		const hourlyMap = new Map<
			number,
			{
				trades: typeof result
				wins: number
				losses: number
				breakevens: number
				totalPnl: number
				totalR: number
				rCount: number
				grossProfit: number
				grossLoss: number
			}
		>()

		for (const trade of result) {
			const { hour } = getBrtTimeParts(trade.entryDate)
			const existing = hourlyMap.get(hour) || {
				trades: [],
				wins: 0,
				losses: 0,
				breakevens: 0,
				totalPnl: 0,
				totalR: 0,
				rCount: 0,
				grossProfit: 0,
				grossLoss: 0,
			}

			const pnl = fromCents(trade.pnl)
			existing.trades.push(trade)
			existing.totalPnl += pnl

			if (trade.outcome === "win") {
				existing.wins++
				existing.grossProfit += pnl
			} else if (trade.outcome === "loss") {
				existing.losses++
				existing.grossLoss += Math.abs(pnl)
			} else {
				existing.breakevens++
			}

			if (trade.realizedRMultiple) {
				existing.totalR += Number(trade.realizedRMultiple)
				existing.rCount++
			}

			hourlyMap.set(hour, existing)
		}

		const hourlyData: HourlyPerformance[] = Array.from(hourlyMap.entries())
			.map(([hour, data]) => ({
				hour,
				hourLabel: `${hour.toString().padStart(2, "0")}:00`,
				totalTrades: data.trades.length,
				wins: data.wins,
				losses: data.losses,
				breakevens: data.breakevens,
				winRate: calculateWinRate(data.wins, data.wins + data.losses),
				totalPnl: data.totalPnl,
				avgPnl: data.trades.length > 0 ? data.totalPnl / data.trades.length : 0,
				avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
				profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
			}))
			.toSorted((a, b) => a.hour - b.hour)

		return {
			status: "success",
			message: "Hourly performance retrieved",
			data: hourlyData,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve hourly performance",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getHourlyPerformance"),
				},
			],
		}
	}
}

/**
 * Get day of week performance analysis
 */
export const getDayOfWeekPerformance = async (
	filters?: TradeFilters
): Promise<ActionResponse<DayOfWeekPerformance[]>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// English day names used as i18n keys on the client
		const dayNameKeys = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		] as const

		// Group by day of week
		const dayMap = new Map<
			number,
			{
				trades: typeof result
				wins: number
				losses: number
				breakevens: number
				totalPnl: number
				totalR: number
				rCount: number
				grossProfit: number
				grossLoss: number
				hourlyPnl: Map<number, number>
			}
		>()

		for (const trade of result) {
			const { dayOfWeek, hour } = getBrtTimeParts(trade.entryDate)
			const existing = dayMap.get(dayOfWeek) || {
				trades: [],
				wins: 0,
				losses: 0,
				breakevens: 0,
				totalPnl: 0,
				totalR: 0,
				rCount: 0,
				grossProfit: 0,
				grossLoss: 0,
				hourlyPnl: new Map<number, number>(),
			}

			const pnl = fromCents(trade.pnl)
			existing.trades.push(trade)
			existing.totalPnl += pnl
			existing.hourlyPnl.set(hour, (existing.hourlyPnl.get(hour) || 0) + pnl)

			if (trade.outcome === "win") {
				existing.wins++
				existing.grossProfit += pnl
			} else if (trade.outcome === "loss") {
				existing.losses++
				existing.grossLoss += Math.abs(pnl)
			} else {
				existing.breakevens++
			}

			if (trade.realizedRMultiple) {
				existing.totalR += Number(trade.realizedRMultiple)
				existing.rCount++
			}

			dayMap.set(dayOfWeek, existing)
		}

		const dayData: DayOfWeekPerformance[] = Array.from(dayMap.entries())
			.map(([dayOfWeek, data]) => {
				// Find best and worst hour for this day
				let bestHour: number | undefined
				let worstHour: number | undefined
				let bestPnl = -Infinity
				let worstPnl = Infinity

				for (const [hour, pnl] of data.hourlyPnl) {
					if (pnl > bestPnl) {
						bestPnl = pnl
						bestHour = hour
					}
					if (pnl < worstPnl) {
						worstPnl = pnl
						worstHour = hour
					}
				}

				return {
					dayOfWeek,
					dayName: dayNameKeys[dayOfWeek],
					totalTrades: data.trades.length,
					wins: data.wins,
					losses: data.losses,
					breakevens: data.breakevens,
					winRate: calculateWinRate(data.wins, data.wins + data.losses),
					totalPnl: data.totalPnl,
					avgPnl:
						data.trades.length > 0 ? data.totalPnl / data.trades.length : 0,
					avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
					profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
					bestHour: bestPnl > 0 ? bestHour : undefined,
					worstHour: worstPnl < 0 ? worstHour : undefined,
				}
			})
			.toSorted((a, b) => a.dayOfWeek - b.dayOfWeek)

		return {
			status: "success",
			message: "Day of week performance retrieved",
			data: dayData,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve day of week performance",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDayOfWeekPerformance"),
				},
			],
		}
	}
}

/**
 * Get time heatmap (hour × day matrix)
 */
export const getTimeHeatmap = async (
	filters?: TradeFilters
): Promise<ActionResponse<TimeHeatmapCell[]>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// English day names used as i18n keys on the client
		const dayNameKeys = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		] as const

		// Group by day × hour
		const cellMap = new Map<
			string,
			{
				totalTrades: number
				wins: number
				losses: number
				totalPnl: number
				totalR: number
				rCount: number
			}
		>()

		for (const trade of result) {
			const { dayOfWeek, hour } = getBrtTimeParts(trade.entryDate)
			const key = `${dayOfWeek}-${hour}`
			const existing = cellMap.get(key) || {
				totalTrades: 0,
				wins: 0,
				losses: 0,
				totalPnl: 0,
				totalR: 0,
				rCount: 0,
			}

			const pnl = fromCents(trade.pnl)
			existing.totalTrades++
			existing.totalPnl += pnl

			if (trade.outcome === "win") {
				existing.wins++
			} else if (trade.outcome === "loss") {
				existing.losses++
			}

			if (trade.realizedRMultiple) {
				existing.totalR += Number(trade.realizedRMultiple)
				existing.rCount++
			}

			cellMap.set(key, existing)
		}

		const heatmapData: TimeHeatmapCell[] = Array.from(cellMap.entries()).map(
			([key, data]) => {
				const [dayOfWeek, hour] = key.split("-").map(Number)
				return {
					dayOfWeek,
					dayName: dayNameKeys[dayOfWeek],
					hour,
					hourLabel: `${hour.toString().padStart(2, "0")}:00`,
					totalTrades: data.totalTrades,
					wins: data.wins,
					losses: data.losses,
					totalPnl: data.totalPnl,
					winRate: calculateWinRate(data.wins, data.wins + data.losses),
					avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
				}
			}
		)

		return {
			status: "success",
			message: "Time heatmap retrieved",
			data: heatmapData,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve time heatmap",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getTimeHeatmap"),
				},
			],
		}
	}
}

/**
 * Get summary stats for a specific day
 */
export const getDaySummary = async (
	date: Date
): Promise<ActionResponse<DaySummary>> => {
	try {
		const authContext = await requireAuth()

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		// Get start and end of the day
		const startOfDay = new Date(date)
		startOfDay.setHours(0, 0, 0, 0)
		const endOfDay = new Date(date)
		endOfDay.setHours(23, 59, 59, 999)

		const rawResult = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, startOfDay),
				lte(trades.entryDate, endOfDay)
			),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		const dateKey = formatDateKey(date)

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found for this day",
				data: {
					date: dateKey,
					netPnl: 0,
					grossPnl: 0,
					totalFees: 0,
					winRate: 0,
					wins: 0,
					losses: 0,
					breakevens: 0,
					totalTrades: 0,
					avgR: 0,
					profitFactor: 0,
				},
			}
		}

		let netPnl = 0
		let totalFees = 0
		let wins = 0
		let losses = 0
		let breakevens = 0
		let totalR = 0
		let rCount = 0
		let grossProfit = 0
		let grossLoss = 0

		for (const trade of result) {
			const pnl = fromCents(trade.pnl)
			const commission = fromCents(trade.commission ?? 0)
			const fees = fromCents(trade.fees ?? 0)

			netPnl += pnl
			totalFees += commission + fees

			if (trade.outcome === "win") {
				wins++
				grossProfit += pnl
			} else if (trade.outcome === "loss") {
				losses++
				grossLoss += Math.abs(pnl)
			} else {
				breakevens++
			}

			if (trade.realizedRMultiple) {
				totalR += Number(trade.realizedRMultiple)
				rCount++
			}
		}

		const grossPnl = netPnl + totalFees

		return {
			status: "success",
			message: "Day summary retrieved",
			data: {
				date: dateKey,
				netPnl,
				grossPnl,
				totalFees,
				winRate: calculateWinRate(wins, wins + losses),
				wins,
				losses,
				breakevens,
				totalTrades: result.length,
				avgR: rCount > 0 ? totalR / rCount : 0,
				profitFactor: calculateProfitFactor(grossProfit, grossLoss),
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve day summary",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDaySummary"),
				},
			],
		}
	}
}

/**
 * Get trades for a specific day
 */
export const getDayTrades = async (
	date: Date
): Promise<ActionResponse<DayTrade[]>> => {
	try {
		const authContext = await requireAuth()

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		// Get start and end of the day in BRT
		const startOfDayBrt = getStartOfDay(date)
		const endOfDayBrt = getEndOfDay(date)

		const rawResult = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, startOfDayBrt),
				lte(trades.entryDate, endOfDayBrt)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		const dayTrades: DayTrade[] = result.map((trade) => ({
			id: trade.id,
			time: new Intl.DateTimeFormat("en-GB", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: APP_TIMEZONE,
			}).format(trade.entryDate),
			asset: trade.asset,
			direction: trade.direction as "long" | "short",
			entryPrice: fromCents(trade.entryPrice),
			exitPrice: trade.exitPrice ? fromCents(trade.exitPrice) : null,
			pnl: fromCents(trade.pnl),
			rMultiple: trade.realizedRMultiple
				? Number(trade.realizedRMultiple)
				: null,
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
		}))

		return {
			status: "success",
			message: "Day trades retrieved",
			data: dayTrades,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve day trades",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDayTrades"),
				},
			],
		}
	}
}

/**
 * Get intraday equity curve for a specific day
 */
export const getDayEquityCurve = async (
	date: Date
): Promise<ActionResponse<DayEquityPoint[]>> => {
	try {
		const authContext = await requireAuth()

		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		// Get start and end of the day in BRT
		const startOfDayBrt = getStartOfDay(date)
		const endOfDayBrt = getEndOfDay(date)

		const rawResult = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, startOfDayBrt),
				lte(trades.entryDate, endOfDayBrt)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found for this day",
				data: [],
			}
		}

		let cumulativePnl = 0
		const equityPoints: DayEquityPoint[] = result.map((trade) => {
			cumulativePnl += fromCents(trade.pnl)
			return {
				time: new Intl.DateTimeFormat("en-GB", {
					hour: "2-digit",
					minute: "2-digit",
					hour12: false,
					timeZone: APP_TIMEZONE,
				}).format(trade.entryDate),
				cumulativePnl,
				tradeId: trade.id,
			}
		})

		return {
			status: "success",
			message: "Day equity curve retrieved",
			data: equityPoints,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve day equity curve",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDayEquityCurve"),
				},
			],
		}
	}
}

/**
 * Get radar chart data for performance overview
 */
export const getRadarChartData = async (
	filters?: TradeFilters
): Promise<ActionResponse<RadarChartData[]>> => {
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// Calculate metrics
		let wins = 0
		let losses = 0
		let totalR = 0
		let rCount = 0
		let grossProfit = 0
		let grossLoss = 0
		let followedPlanCount = 0
		let planTradesCount = 0
		const pnls: number[] = []

		for (const trade of result) {
			const pnl = fromCents(trade.pnl)
			pnls.push(pnl)

			if (trade.outcome === "win") {
				wins++
				grossProfit += pnl
			} else if (trade.outcome === "loss") {
				losses++
				grossLoss += Math.abs(pnl)
			}

			if (trade.realizedRMultiple) {
				totalR += Number(trade.realizedRMultiple)
				rCount++
			}

			if (trade.followedPlan !== null) {
				planTradesCount++
				if (trade.followedPlan === true) {
					followedPlanCount++
				}
			}
		}

		// Calculate win rate (0-100)
		const winRate = calculateWinRate(wins, wins + losses)

		// Calculate average R
		const avgR = rCount > 0 ? totalR / rCount : 0

		// Calculate profit factor (cap at 5 for visualization)
		const profitFactor = Math.min(
			calculateProfitFactor(grossProfit, grossLoss),
			5
		)

		// Calculate discipline score (0-100)
		const disciplineScore =
			planTradesCount > 0 ? (followedPlanCount / planTradesCount) * 100 : 0

		// Calculate consistency (inverse of coefficient of variation, normalized)
		const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length
		const variance =
			pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length
		const stdDev = Math.sqrt(variance)
		const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0
		// Higher consistency = lower CV, normalize to 0-100
		const consistency = Math.max(0, Math.min(100, 100 - cv * 50))

		const radarData: RadarChartData[] = [
			{
				metric: "Win Rate",
				metricKey: "winRate",
				value: winRate,
				normalized: winRate,
			},
			{
				metric: "Avg R",
				metricKey: "avgR",
				value: avgR,
				// Normalize avgR: -2 to +4 range mapped to 0-100
				normalized: Math.max(0, Math.min(100, ((avgR + 2) / 6) * 100)),
			},
			{
				metric: "Profit Factor",
				metricKey: "profitFactor",
				value: profitFactor,
				// Normalize profit factor: 0-5 mapped to 0-100
				normalized: (profitFactor / 5) * 100,
			},
			{
				metric: "Discipline",
				metricKey: "discipline",
				value: disciplineScore,
				normalized: disciplineScore,
			},
			{
				metric: "Consistency",
				metricKey: "consistency",
				value: consistency,
				normalized: consistency,
			},
		]

		return {
			status: "success",
			message: "Radar chart data retrieved",
			data: radarData,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve radar chart data",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getRadarChartData"),
				},
			],
		}
	}
}

/**
 * B3 Brazilian Exchange trading session definitions
 * Sessions are defined by start/end hours (decimal format: 9.5 = 09:30)
 */
const B3_SESSIONS: Record<
	TradingSession,
	{ startHour: number; endHour: number; labelKey: TradingSession }
> = {
	preOpen: { startHour: 9, endHour: 9.5, labelKey: "preOpen" },
	morning: { startHour: 9.5, endHour: 12, labelKey: "morning" },
	afternoon: { startHour: 12, endHour: 15, labelKey: "afternoon" },
	close: { startHour: 15, endHour: 17.92, labelKey: "close" }, // 17:55
}

/**
 * Determine which trading session a time belongs to
 */
const getSessionForTime = (date: Date): TradingSession | null => {
	const { hour, minute } = getBrtTimeParts(date)
	const decimalHour = hour + minute / 60

	for (const [session, def] of Object.entries(B3_SESSIONS) as [
		TradingSession,
		(typeof B3_SESSIONS)[TradingSession],
	][]) {
		if (decimalHour >= def.startHour && decimalHour < def.endHour) {
			return session
		}
	}
	return null // Outside trading hours
}

/**
 * Get performance by B3 trading session
 */
export const getSessionPerformance = async (
	filters?: TradeFilters
): Promise<ActionResponse<SessionPerformance[]>> => {
	const tSessions = await getTranslations("sessions")
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// Group by session
		const sessionMap = new Map<
			TradingSession,
			{
				trades: typeof result
				wins: number
				losses: number
				breakevens: number
				totalPnl: number
				totalR: number
				rCount: number
				grossProfit: number
				grossLoss: number
			}
		>()

		// Initialize all sessions
		for (const session of Object.keys(B3_SESSIONS) as TradingSession[]) {
			sessionMap.set(session, {
				trades: [],
				wins: 0,
				losses: 0,
				breakevens: 0,
				totalPnl: 0,
				totalR: 0,
				rCount: 0,
				grossProfit: 0,
				grossLoss: 0,
			})
		}

		for (const trade of result) {
			const session = getSessionForTime(trade.entryDate)
			if (!session) continue // Skip trades outside trading hours

			const data = sessionMap.get(session)!
			const pnl = fromCents(trade.pnl)

			data.trades.push(trade)
			data.totalPnl += pnl

			if (trade.outcome === "win") {
				data.wins++
				data.grossProfit += pnl
			} else if (trade.outcome === "loss") {
				data.losses++
				data.grossLoss += Math.abs(pnl)
			} else {
				data.breakevens++
			}

			if (trade.realizedRMultiple) {
				data.totalR += Number(trade.realizedRMultiple)
				data.rCount++
			}
		}

		const sessionData: SessionPerformance[] = (
			Object.keys(B3_SESSIONS) as TradingSession[]
		).map((session) => {
			const data = sessionMap.get(session)!
			const def = B3_SESSIONS[session]
			const totalTrades = data.trades.length

			return {
				session,
				sessionLabel: tSessions(def.labelKey),
				startHour: def.startHour,
				endHour: def.endHour,
				totalTrades,
				wins: data.wins,
				losses: data.losses,
				breakevens: data.breakevens,
				winRate: calculateWinRate(data.wins, data.wins + data.losses),
				totalPnl: data.totalPnl,
				avgPnl: totalTrades > 0 ? data.totalPnl / totalTrades : 0,
				avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
				profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
			}
		})

		return {
			status: "success",
			message: "Session performance retrieved",
			data: sessionData,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve session performance",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getSessionPerformance"),
				},
			],
		}
	}
}

/**
 * Get performance by session and asset combination
 */
export const getSessionAssetPerformance = async (
	filters?: TradeFilters
): Promise<ActionResponse<SessionAssetPerformance[]>> => {
	const tSessions = await getTranslations("sessions")
	try {
		const authContext = await requireAuth()
		const conditions = buildFilterConditions(authContext, filters)

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt trade fields
		const dek = await getUserDek(authContext.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// Group by asset → session
		const assetSessionMap = new Map<
			string,
			Map<
				TradingSession,
				{
					wins: number
					losses: number
					totalPnl: number
					totalR: number
					rCount: number
					tradeCount: number
				}
			>
		>()

		for (const trade of result) {
			const session = getSessionForTime(trade.entryDate)
			if (!session) continue

			if (!assetSessionMap.has(trade.asset)) {
				const sessionData = new Map<
					TradingSession,
					{
						wins: number
						losses: number
						totalPnl: number
						totalR: number
						rCount: number
						tradeCount: number
					}
				>()
				// Initialize all sessions for this asset
				for (const s of Object.keys(B3_SESSIONS) as TradingSession[]) {
					sessionData.set(s, {
						wins: 0,
						losses: 0,
						totalPnl: 0,
						totalR: 0,
						rCount: 0,
						tradeCount: 0,
					})
				}
				assetSessionMap.set(trade.asset, sessionData)
			}

			const assetData = assetSessionMap.get(trade.asset)!
			const sessionData = assetData.get(session)!
			const pnl = fromCents(trade.pnl)

			sessionData.tradeCount++
			sessionData.totalPnl += pnl

			if (trade.outcome === "win") {
				sessionData.wins++
			} else if (trade.outcome === "loss") {
				sessionData.losses++
			}

			if (trade.realizedRMultiple) {
				sessionData.totalR += Number(trade.realizedRMultiple)
				sessionData.rCount++
			}
		}

		// Convert to SessionAssetPerformance array
		const assetPerformance: SessionAssetPerformance[] = Array.from(
			assetSessionMap.entries()
		)
			.map(([asset, sessionData]) => {
				let totalPnl = 0
				let bestSession: TradingSession | null = null
				let bestPnl = -Infinity

				const sessions = (Object.keys(B3_SESSIONS) as TradingSession[]).map(
					(session) => {
						const data = sessionData.get(session)!
						const def = B3_SESSIONS[session]
						totalPnl += data.totalPnl

						if (data.tradeCount > 0 && data.totalPnl > bestPnl) {
							bestPnl = data.totalPnl
							bestSession = session
						}

						return {
							session,
							sessionLabel: tSessions(def.labelKey),
							pnl: data.totalPnl,
							winRate: calculateWinRate(data.wins, data.wins + data.losses),
							trades: data.tradeCount,
							avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
						}
					}
				)

				return {
					asset,
					sessions,
					bestSession,
					totalPnl,
				}
			})
			.toSorted((a, b) => b.totalPnl - a.totalPnl) // Sort by total P&L descending

		return {
			status: "success",
			message: "Session asset performance retrieved",
			data: assetPerformance,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve session asset performance",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getSessionAssetPerformance"),
				},
			],
		}
	}
}
