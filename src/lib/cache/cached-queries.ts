"use cache"

/**
 * Cached query wrappers using Next.js 16 "use cache" directive.
 *
 * These functions wrap DB queries with automatic caching. Arguments become
 * part of the cache key automatically — no manual key construction needed.
 *
 * Invalidation: mutation-driven via revalidateTag() in invalidate.ts.
 * TTL: 5 min safety net via cacheLife("minutes").
 *
 * IMPORTANT: "use cache" and "use server" cannot coexist. Server actions
 * in actions/*.ts call these cached functions instead of querying DB directly.
 */

import { cacheTag, cacheLife } from "next/cache"
import { db } from "@/db/drizzle"
import { trades, settings } from "@/db/schema"
import { and, asc, desc, eq, gte, lte, inArray } from "drizzle-orm"
import type {
	TradeFilters,
	AnalyticsDashboardData,
	DashboardBatchData,
	DisciplineData,
	EquityPoint,
	StreakData,
	DailyPnL,
	RadarChartData,
} from "@/types"
import {
	computeOverallStats,
	computeExpectedValue,
	computeEquityCurve,
	computeRDistribution,
	computeHourlyPerformance,
	computeDayOfWeekPerformance,
	computeTimeHeatmap,
	computeSessionPerformance,
	computeSessionAssetPerformance,
	computePerformanceByVariable,
} from "@/lib/analytics-helpers"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { formatDateKey, getStartOfMonth, getEndOfMonth } from "@/lib/dates"
import { tradeTag, tradeAllTag } from "./tags"

/* ------------------------------------------------------------------ */
/*  Filter condition builder (mirrors the one in analytics.ts)         */
/* ------------------------------------------------------------------ */

interface CacheAccountContext {
	userId: string
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

const buildCacheConditions = (
	ctx: CacheAccountContext,
	filters?: TradeFilters
) => {
	const accountCondition = ctx.showAllAccounts
		? inArray(trades.accountId, ctx.allAccountIds)
		: eq(trades.accountId, ctx.accountId)

	const conditions = [accountCondition, eq(trades.isArchived, false)]

	if (filters?.dateFrom)
		conditions.push(gte(trades.entryDate, filters.dateFrom))
	if (filters?.dateTo) conditions.push(lte(trades.entryDate, filters.dateTo))
	if (filters?.assets?.length)
		conditions.push(inArray(trades.asset, filters.assets))
	if (filters?.directions?.length)
		conditions.push(inArray(trades.direction, filters.directions))
	if (filters?.outcomes?.length)
		conditions.push(inArray(trades.outcome, filters.outcomes))
	if (filters?.timeframeIds?.length)
		conditions.push(inArray(trades.timeframeId, filters.timeframeIds))

	return conditions
}

const buildAccountCondition = (ctx: CacheAccountContext) =>
	ctx.showAllAccounts
		? inArray(trades.accountId, ctx.allAccountIds)
		: eq(trades.accountId, ctx.accountId)

/* ------------------------------------------------------------------ */
/*  Cached analytics dashboard                                         */
/* ------------------------------------------------------------------ */

/**
 * Cached version of the analytics dashboard query.
 * Arguments (userId, accountId, filters) automatically form the cache key.
 * Tagged for mutation-driven invalidation via revalidateTag().
 */
const getCachedAnalyticsDashboard = async (
	ctx: CacheAccountContext,
	filters?: TradeFilters
): Promise<AnalyticsDashboardData> => {
	// Tag for invalidation — coarse-grained by user+account
	cacheTag(
		ctx.showAllAccounts
			? tradeAllTag(ctx.userId)
			: tradeTag(ctx.userId, ctx.accountId)
	)
	cacheLife("minutes") // 5 min TTL as safety net

	const conditions = buildCacheConditions(ctx, filters)

	// Cache miss — hitting DB. On cache hit this entire function is skipped.
	const dbStart = performance.now()
	const result = await db.query.trades.findMany({
		where: and(...conditions),
		with: {
			strategy: true,
			timeframe: true,
		},
		orderBy: [asc(trades.entryDate)],
	})
	const dbMs = (performance.now() - dbStart).toFixed(1)

	const computeStart = performance.now()
	const tradesForComputation = result.map((t) => ({
		...t,
		strategyName: t.strategy?.name ?? null,
		timeframeName: t.timeframe?.name ?? null,
	}))

	const groupBy = filters?.groupBy ?? "asset"

	const data = {
		performance: computePerformanceByVariable(tradesForComputation, groupBy),
		expectedValue: computeExpectedValue(tradesForComputation),
		rDistribution: computeRDistribution(tradesForComputation),
		equityCurve: computeEquityCurve(tradesForComputation),
		hourlyPerformance: computeHourlyPerformance(tradesForComputation),
		dayOfWeekPerformance: computeDayOfWeekPerformance(tradesForComputation),
		timeHeatmap: computeTimeHeatmap(tradesForComputation),
		sessionPerformance: computeSessionPerformance(tradesForComputation),
		sessionAssetPerformance:
			computeSessionAssetPerformance(tradesForComputation),
	}
	const computeMs = (performance.now() - computeStart).toFixed(1)

	return data
}

/* ------------------------------------------------------------------ */
/*  Cached dashboard batch (6 queries → 1 DB query)                    */
/* ------------------------------------------------------------------ */

/**
 * Compute discipline score from trades array (pure function).
 */
const computeDiscipline = (
	sortedDescTrades: Array<{
		followedPlan: boolean | null
		outcome: string | null
	}>
): DisciplineData => {
	const tradesWithPlanData = sortedDescTrades.filter(
		(t) => t.followedPlan !== null
	)
	const followedCount = tradesWithPlanData.filter(
		(t) => t.followedPlan === true
	).length
	const totalTrades = tradesWithPlanData.length
	const score = totalTrades > 0 ? (followedCount / totalTrades) * 100 : 0

	const recentTrades = tradesWithPlanData.slice(0, 10)
	const recentFollowed = recentTrades.filter(
		(t) => t.followedPlan === true
	).length
	const recentCompliance =
		recentTrades.length > 0 ? (recentFollowed / recentTrades.length) * 100 : 0

	let trend: "up" | "down" | "stable" = "stable"
	if (recentTrades.length >= 5 && totalTrades >= 10) {
		const olderTrades = tradesWithPlanData.slice(10, 20)
		const olderFollowed = olderTrades.filter(
			(t) => t.followedPlan === true
		).length
		const olderCompliance =
			olderTrades.length > 0 ? (olderFollowed / olderTrades.length) * 100 : 0
		if (recentCompliance > olderCompliance + 5) trend = "up"
		else if (recentCompliance < olderCompliance - 5) trend = "down"
	}

	return { score, totalTrades, followedCount, trend, recentCompliance }
}

/**
 * Compute streak data from trades sorted newest-first (pure function).
 */
const computeStreaks = (
	sortedDescTrades: Array<{
		outcome: string | null
		entryDate: Date
		pnl: number | string | null
	}>
): StreakData => {
	if (sortedDescTrades.length === 0) {
		return {
			currentStreak: 0,
			currentStreakType: "none",
			longestWinStreak: 0,
			longestLossStreak: 0,
			bestDay: null,
			worstDay: null,
		}
	}

	let currentStreak = 0
	let currentStreakType: "win" | "loss" | "none" = "none"

	if (sortedDescTrades[0].outcome) {
		currentStreakType =
			sortedDescTrades[0].outcome === "win"
				? "win"
				: sortedDescTrades[0].outcome === "loss"
					? "loss"
					: "none"
		for (const trade of sortedDescTrades) {
			if (currentStreakType === "win" && trade.outcome === "win")
				currentStreak++
			else if (currentStreakType === "loss" && trade.outcome === "loss")
				currentStreak++
			else break
		}
	}

	const sortedAsc = [...sortedDescTrades].reverse()
	let longestWinStreak = 0
	let longestLossStreak = 0
	let tempWinStreak = 0
	let tempLossStreak = 0

	for (const trade of sortedAsc) {
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

	const dailyMap = new Map<string, number>()
	for (const trade of sortedDescTrades) {
		const dateKey = formatDateKey(trade.entryDate)
		const existing = dailyMap.get(dateKey) || 0
		dailyMap.set(dateKey, existing + fromCents(trade.pnl))
	}

	let bestDay: { date: string; pnl: number } | null = null
	let worstDay: { date: string; pnl: number } | null = null
	for (const [date, pnl] of dailyMap) {
		if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl }
		if (!worstDay || pnl < worstDay.pnl) worstDay = { date, pnl }
	}

	return {
		currentStreak,
		currentStreakType,
		longestWinStreak,
		longestLossStreak,
		bestDay,
		worstDay,
	}
}

/**
 * Compute equity curve from trades sorted oldest-first (pure function).
 */
const computeEquityCurveFromTrades = (
	sortedAscTrades: Array<{ entryDate: Date; pnl: number | string | null }>,
	initialBalance: number
): EquityPoint[] => {
	if (sortedAscTrades.length === 0) return []

	const dailyPnlMap = new Map<string, number>()
	for (const trade of sortedAscTrades) {
		const dateKey = formatDateKey(trade.entryDate)
		const pnl = fromCents(trade.pnl)
		const existing = dailyPnlMap.get(dateKey) || 0
		dailyPnlMap.set(dateKey, existing + pnl)
	}

	const sortedDates = Array.from(dailyPnlMap.keys()).toSorted()
	const equityPoints: EquityPoint[] = []
	let cumulativePnL = 0
	let peak = initialBalance

	for (const date of sortedDates) {
		const dailyPnl = dailyPnlMap.get(date) || 0
		cumulativePnL += dailyPnl
		const accountEquity = initialBalance + cumulativePnL
		if (accountEquity > peak) peak = accountEquity
		const drawdown = peak > 0 ? ((peak - accountEquity) / peak) * 100 : 0
		equityPoints.push({ date, equity: cumulativePnL, accountEquity, drawdown })
	}

	return equityPoints
}

/**
 * Compute daily P&L for a specific month from the full trades list (pure function).
 */
const computeDailyPnLFromTrades = (
	sortedAscTrades: Array<{ entryDate: Date; pnl: number | string | null }>,
	year: number,
	monthIndex: number
): DailyPnL[] => {
	const refDate = new Date(year, monthIndex, 15)
	const startOfMonth = getStartOfMonth(refDate)
	const endOfMonth = getEndOfMonth(refDate)

	const dailyMap = new Map<string, { pnl: number; count: number }>()

	for (const trade of sortedAscTrades) {
		if (trade.entryDate < startOfMonth || trade.entryDate > endOfMonth) continue
		const dateKey = formatDateKey(trade.entryDate)
		const existing = dailyMap.get(dateKey) || { pnl: 0, count: 0 }
		existing.pnl += fromCents(trade.pnl)
		existing.count++
		dailyMap.set(dateKey, existing)
	}

	return Array.from(dailyMap.entries()).map(([date, data]) => ({
		date,
		pnl: data.pnl,
		tradeCount: data.count,
	}))
}

/**
 * Compute radar chart data from trades (pure function).
 */
const computeRadar = (
	allTrades: Array<{
		outcome: string | null
		pnl: number | string | null
		realizedRMultiple: string | null
		followedPlan: boolean | null
	}>
): RadarChartData[] => {
	if (allTrades.length === 0) return []

	let wins = 0
	let losses = 0
	let totalR = 0
	let rCount = 0
	let grossProfit = 0
	let grossLoss = 0
	let followedPlanCount = 0
	let planTradesCount = 0
	const pnls: number[] = []

	for (const trade of allTrades) {
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
			if (trade.followedPlan === true) followedPlanCount++
		}
	}

	const winRate = calculateWinRate(wins, wins + losses)
	const avgR = rCount > 0 ? totalR / rCount : 0
	const profitFactor = Math.min(
		calculateProfitFactor(grossProfit, grossLoss),
		5
	)
	const disciplineScore =
		planTradesCount > 0 ? (followedPlanCount / planTradesCount) * 100 : 0

	const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length
	const variance =
		pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length
	const stdDev = Math.sqrt(variance)
	const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0
	const consistency = Math.max(0, Math.min(100, 100 - cv * 50))

	return [
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
			normalized: Math.max(0, Math.min(100, ((avgR + 2) / 6) * 100)),
		},
		{
			metric: "Profit Factor",
			metricKey: "profitFactor",
			value: profitFactor,
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
}

/**
 * Batched dashboard data — fetches ALL trades once, computes 6 dashboard
 * metrics from the same result set. Replaces 6 independent DB queries.
 *
 * @param ctx - Auth context (userId, accountId, showAllAccounts, allAccountIds)
 * @param year - Year for daily P&L (e.g. 2026)
 * @param monthIndex - Month index for daily P&L (0-11)
 */
const getCachedDashboardData = async (
	ctx: CacheAccountContext,
	year: number,
	monthIndex: number
): Promise<DashboardBatchData> => {
	cacheTag(
		ctx.showAllAccounts
			? tradeAllTag(ctx.userId)
			: tradeTag(ctx.userId, ctx.accountId)
	)
	cacheLife("minutes")

	const accountCondition = buildAccountCondition(ctx)

	// 1 DB query: all non-archived trades + 1 for initial balance
	const dbStart = performance.now()
	const [allTrades, accountBalanceSetting] = await Promise.all([
		db.query.trades.findMany({
			where: and(accountCondition, eq(trades.isArchived, false)),
			orderBy: [desc(trades.entryDate)],
		}),
		db.query.settings.findFirst({
			where: eq(settings.key, "account_balance"),
		}),
	])
	const dbMs = (performance.now() - dbStart).toFixed(1)

	const initialBalance = accountBalanceSetting
		? Number(accountBalanceSetting.value) || 10000
		: 10000

	const computeStart = performance.now()

	// allTrades is sorted desc (newest first) — needed for discipline + streaks
	const sortedDesc = allTrades
	// Reverse for asc order — needed for equity curve, daily PnL, overallStats
	const sortedAsc = [...allTrades].reverse()

	const stats = computeOverallStats(sortedAsc)
	const discipline = computeDiscipline(sortedDesc)
	const equityCurve = computeEquityCurveFromTrades(sortedAsc, initialBalance)
	const streakData = computeStreaks(sortedDesc)
	const dailyPnL = computeDailyPnLFromTrades(sortedAsc, year, monthIndex)
	const radarData = computeRadar(sortedAsc)

	const computeMs = (performance.now() - computeStart).toFixed(1)

	return { stats, discipline, equityCurve, streakData, dailyPnL, radarData }
}

export {
	getCachedAnalyticsDashboard,
	getCachedDashboardData,
	type CacheAccountContext,
}
