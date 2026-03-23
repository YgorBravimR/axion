/**
 * Pure computation helpers for analytics.
 * No DB, no auth, no server-only imports — safe to use anywhere.
 *
 * These functions take already-decrypted trade data and return computed metrics.
 * Used by both the single-account analytics actions and the multi-account comparison.
 */

import { fromCents } from "@/lib/money"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { formatDateKey, getBrtTimeParts } from "@/lib/dates"
import type {
	OverallStats,
	ExpectedValueData,
	EquityPoint,
	RDistributionBucket,
	HourlyPerformance,
	DayOfWeekPerformance,
	TimeHeatmapCell,
	PerformanceByGroup,
	TradingSession,
	SessionPerformance,
	SessionAssetPerformance,
} from "@/types"

/**
 * Minimal trade shape for computation.
 * Drizzle returns pnl/commission/fees as string|null (encrypted text columns).
 * After decryption they're numbers at runtime, but TS still sees the schema type.
 * Using `number | string | null` so both raw Drizzle rows and manually-typed data work.
 */
interface TradeForStats {
	pnl: number | string | null
	commission: number | string | null
	fees: number | string | null
	outcome: "win" | "loss" | "breakeven" | null
	realizedRMultiple: string | null
}

interface TradeForEquity {
	pnl: number | string | null
	entryDate: Date
}

interface TradeForRisk {
	plannedRiskAmount: number | string | null
}

/**
 * Compute OverallStats from an array of decrypted trades.
 * Mirrors the logic in getOverallStats (analytics.ts lines 128-196).
 */
const computeOverallStats = (trades: TradeForStats[]): OverallStats => {
	if (trades.length === 0) {
		return {
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
		}
	}

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

	for (const trade of trades) {
		const pnl = fromCents(trade.pnl)
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

	const totalGrossPnl = totalNetPnl + totalFees
	const totalTrades = trades.length
	const winRate = calculateWinRate(winCount, winCount + lossCount)
	const profitFactor = calculateProfitFactor(grossProfit, grossLoss)
	const averageR = rCount > 0 ? totalR / rCount : 0
	const avgWin =
		wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
	const avgLoss =
		losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

	return {
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
	}
}

/**
 * Compute ExpectedValueData from an array of decrypted trades.
 * Mirrors the logic in getExpectedValue (analytics.ts lines 798-923).
 */
const computeExpectedValue = (trades: TradeForStats[]): ExpectedValueData => {
	const emptyResult: ExpectedValueData = {
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
	}

	const tradesWithOutcome = trades.filter(
		(t) => t.outcome === "win" || t.outcome === "loss"
	)

	if (tradesWithOutcome.length === 0) {
		return emptyResult
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

	const expectedValue = winRate * avgWin - (1 - winRate) * avgLoss
	const projectedPnl100 = expectedValue * 100

	// Edge Expectancy (R-based)
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
	const expectedR =
		rDecisiveCount > 0 ? rWinRate * avgWinR - (1 - rWinRate) * avgLossR : 0
	const projectedR100 = expectedR * 100

	return {
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
	}
}

/**
 * Compute daily equity curve from decrypted trades.
 * Mirrors the daily mode in getEquityCurve (analytics.ts lines 377-409).
 */
const computeEquityCurve = (trades: TradeForEquity[]): EquityPoint[] => {
	if (trades.length === 0) {
		return []
	}

	const dailyPnlMap = new Map<string, number>()
	for (const trade of trades) {
		const dateKey = formatDateKey(trade.entryDate)
		const pnl = fromCents(trade.pnl)
		const existing = dailyPnlMap.get(dateKey) || 0
		dailyPnlMap.set(dateKey, existing + pnl)
	}

	const sortedDates = Array.from(dailyPnlMap.keys()).toSorted()

	const equityPoints: EquityPoint[] = []
	let cumulativePnL = 0
	let peak = 0

	for (const date of sortedDates) {
		const dailyPnl = dailyPnlMap.get(date) || 0
		cumulativePnL += dailyPnl

		if (cumulativePnL > peak) {
			peak = cumulativePnL
		}

		const drawdown = peak > 0 ? ((peak - cumulativePnL) / peak) * 100 : 0

		equityPoints.push({
			date,
			equity: cumulativePnL,
			accountEquity: cumulativePnL, // no initial balance context for comparison
			drawdown,
		})
	}

	return equityPoints
}

/**
 * Compute max drawdown from an equity curve.
 * Returns both absolute value and percentage from peak.
 */
const computeMaxDrawdown = (
	equityCurve: EquityPoint[]
): { maxDrawdown: number; maxDrawdownPercent: number } => {
	if (equityCurve.length === 0) {
		return { maxDrawdown: 0, maxDrawdownPercent: 0 }
	}

	let peak = 0
	let maxDrawdownAbs = 0
	let maxDrawdownPct = 0

	for (const point of equityCurve) {
		if (point.equity > peak) {
			peak = point.equity
		}
		const dd = peak - point.equity
		if (dd > maxDrawdownAbs) {
			maxDrawdownAbs = dd
		}
		if (point.drawdown > maxDrawdownPct) {
			maxDrawdownPct = point.drawdown
		}
	}

	return { maxDrawdown: maxDrawdownAbs, maxDrawdownPercent: maxDrawdownPct }
}

/**
 * Compute the average planned risk per trade (in dollars).
 * Only considers trades that have a non-null plannedRiskAmount.
 * Returns 0 if no trades have risk data.
 */
const computeAvgRiskPerTrade = (trades: TradeForRisk[]): number => {
	const risks: number[] = []
	for (const trade of trades) {
		const risk = fromCents(trade.plannedRiskAmount)
		if (risk > 0) {
			risks.push(risk)
		}
	}
	if (risks.length === 0) return 0
	return risks.reduce((a, b) => a + b, 0) / risks.length
}

// --- New interfaces for pure computation functions ---

interface TradeForRDistribution {
	realizedRMultiple: string | null
	pnl: number | string | null
}

interface TradeForHourly {
	entryDate: Date
	pnl: number | string | null
	outcome: "win" | "loss" | "breakeven" | null
	realizedRMultiple: string | null
}

interface TradeForSessionAsset {
	entryDate: Date
	asset: string
	pnl: number | string | null
	outcome: "win" | "loss" | "breakeven" | null
	realizedRMultiple: string | null
}

interface TradeForVariable {
	entryDate: Date
	pnl: number | string | null
	outcome: "win" | "loss" | "breakeven" | null
	realizedRMultiple: string | null
	asset: string
	strategyName: string | null
	timeframeName: string | null
}

// --- B3 Trading Session helpers (non-exported) ---

const B3_SESSIONS: Record<
	TradingSession,
	{ startHour: number; endHour: number; labelKey: TradingSession }
> = {
	preOpen: { startHour: 9, endHour: 9.5, labelKey: "preOpen" },
	morning: { startHour: 9.5, endHour: 12, labelKey: "morning" },
	afternoon: { startHour: 12, endHour: 15, labelKey: "afternoon" },
	close: { startHour: 15, endHour: 17.92, labelKey: "close" }, // 17:55
}

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

// --- New pure computation functions ---

/**
 * Compute R-multiple distribution buckets from decrypted trades.
 */
const computeRDistribution = (
	trades: TradeForRDistribution[]
): RDistributionBucket[] => {
	const tradesWithR = trades.filter((t) => t.realizedRMultiple !== null)

	if (tradesWithR.length === 0) {
		return []
	}

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

	const nonEmptyBuckets = buckets.filter((b) => b.count > 0)

	return nonEmptyBuckets.length > 0
		? nonEmptyBuckets
		: buckets.filter((b) => b.rangeMin >= -2 && b.rangeMax <= 3)
}

/**
 * Compute hourly performance from decrypted trades.
 * Groups by BRT hour and computes win rate, pnl, avgR per hour.
 */
const computeHourlyPerformance = (
	trades: TradeForHourly[]
): HourlyPerformance[] => {
	if (trades.length === 0) {
		return []
	}

	const hourlyMap = new Map<
		number,
		{
			tradeCount: number
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

	for (const trade of trades) {
		const { hour } = getBrtTimeParts(trade.entryDate)
		const existing = hourlyMap.get(hour) || {
			tradeCount: 0,
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
		existing.tradeCount++
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

	return Array.from(hourlyMap.entries())
		.map(([hour, data]) => ({
			hour,
			hourLabel: `${hour.toString().padStart(2, "0")}:00`,
			totalTrades: data.tradeCount,
			wins: data.wins,
			losses: data.losses,
			breakevens: data.breakevens,
			winRate: calculateWinRate(data.wins, data.wins + data.losses),
			totalPnl: data.totalPnl,
			avgPnl: data.tradeCount > 0 ? data.totalPnl / data.tradeCount : 0,
			avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
			profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
		}))
		.toSorted((a, b) => a.hour - b.hour)
}

/**
 * Compute day-of-week performance from decrypted trades.
 * Uses English day name keys (client handles translation).
 */
const computeDayOfWeekPerformance = (
	trades: TradeForHourly[]
): DayOfWeekPerformance[] => {
	if (trades.length === 0) {
		return []
	}

	const dayNameKeys = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	] as const

	const dayMap = new Map<
		number,
		{
			tradeCount: number
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

	for (const trade of trades) {
		const { dayOfWeek, hour } = getBrtTimeParts(trade.entryDate)
		const existing = dayMap.get(dayOfWeek) || {
			tradeCount: 0,
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
		existing.tradeCount++
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

	return Array.from(dayMap.entries())
		.map(([dayOfWeek, data]) => {
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
				totalTrades: data.tradeCount,
				wins: data.wins,
				losses: data.losses,
				breakevens: data.breakevens,
				winRate: calculateWinRate(data.wins, data.wins + data.losses),
				totalPnl: data.totalPnl,
				avgPnl: data.tradeCount > 0 ? data.totalPnl / data.tradeCount : 0,
				avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
				profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
				bestHour: bestPnl > 0 ? bestHour : undefined,
				worstHour: worstPnl < 0 ? worstHour : undefined,
			}
		})
		.toSorted((a, b) => a.dayOfWeek - b.dayOfWeek)
}

/**
 * Compute time heatmap (hour x day matrix) from decrypted trades.
 * Uses English day name keys.
 */
const computeTimeHeatmap = (trades: TradeForHourly[]): TimeHeatmapCell[] => {
	if (trades.length === 0) {
		return []
	}

	const dayNameKeys = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	] as const

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

	for (const trade of trades) {
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

	return Array.from(cellMap.entries()).map(([key, data]) => {
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
	})
}

/**
 * Compute B3 trading session performance from decrypted trades.
 * Uses session key as sessionLabel (client translates).
 */
const computeSessionPerformance = (
	trades: TradeForHourly[]
): SessionPerformance[] => {
	if (trades.length === 0) {
		return []
	}

	const sessionMap = new Map<
		TradingSession,
		{
			tradeCount: number
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
			tradeCount: 0,
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

	for (const trade of trades) {
		const session = getSessionForTime(trade.entryDate)
		if (!session) continue

		const data = sessionMap.get(session)!
		const pnl = fromCents(trade.pnl)

		data.tradeCount++
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

	return (Object.keys(B3_SESSIONS) as TradingSession[]).map((session) => {
		const data = sessionMap.get(session)!
		const def = B3_SESSIONS[session]

		return {
			session,
			sessionLabel: def.labelKey,
			startHour: def.startHour,
			endHour: def.endHour,
			totalTrades: data.tradeCount,
			wins: data.wins,
			losses: data.losses,
			breakevens: data.breakevens,
			winRate: calculateWinRate(data.wins, data.wins + data.losses),
			totalPnl: data.totalPnl,
			avgPnl: data.tradeCount > 0 ? data.totalPnl / data.tradeCount : 0,
			avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
			profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
		}
	})
}

/**
 * Compute session x asset cross-tabulation from decrypted trades.
 * Uses session key as sessionLabel (client translates).
 */
const computeSessionAssetPerformance = (
	trades: TradeForSessionAsset[]
): SessionAssetPerformance[] => {
	if (trades.length === 0) {
		return []
	}

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

	for (const trade of trades) {
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

	return Array.from(assetSessionMap.entries())
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
						sessionLabel: def.labelKey,
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
		.toSorted((a, b) => b.totalPnl - a.totalPnl)
}

/**
 * Compute performance grouped by a variable (asset, timeframe, hour, dayOfWeek, strategy).
 * Uses English day name keys for dayOfWeek (client translates).
 */
const computePerformanceByVariable = (
	trades: TradeForVariable[],
	groupBy: string
): PerformanceByGroup[] => {
	if (trades.length === 0) {
		return []
	}

	const groups = new Map<
		string,
		{
			tradeCount: number
			pnl: number
			winCount: number
			lossCount: number
			totalR: number
			rCount: number
			grossProfit: number
			grossLoss: number
		}
	>()

	const dayNameKeys = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	] as const

	for (const trade of trades) {
		let groupKey: string

		switch (groupBy) {
			case "asset":
				groupKey = trade.asset
				break
			case "timeframe":
				groupKey = trade.timeframeName || "Unknown"
				break
			case "hour": {
				const { hour } = getBrtTimeParts(trade.entryDate)
				groupKey = `${hour.toString().padStart(2, "0")}:00`
				break
			}
			case "dayOfWeek": {
				const { dayOfWeek } = getBrtTimeParts(trade.entryDate)
				groupKey = dayNameKeys[dayOfWeek]
				break
			}
			case "strategy":
				groupKey = trade.strategyName || "No Strategy"
				break
			default:
				groupKey = "Unknown"
		}

		const existing = groups.get(groupKey) || {
			tradeCount: 0,
			pnl: 0,
			winCount: 0,
			lossCount: 0,
			totalR: 0,
			rCount: 0,
			grossProfit: 0,
			grossLoss: 0,
		}

		const pnl = fromCents(trade.pnl)
		existing.tradeCount++
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

	return Array.from(groups.entries())
		.map(([group, data]) => ({
			group,
			tradeCount: data.tradeCount,
			pnl: data.pnl,
			winRate: calculateWinRate(data.winCount, data.winCount + data.lossCount),
			avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
			profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
		}))
		.toSorted((a, b) => b.pnl - a.pnl)
}

export {
	computeOverallStats,
	computeExpectedValue,
	computeEquityCurve,
	computeMaxDrawdown,
	computeAvgRiskPerTrade,
	computeRDistribution,
	computeHourlyPerformance,
	computeDayOfWeekPerformance,
	computeTimeHeatmap,
	computeSessionPerformance,
	computeSessionAssetPerformance,
	computePerformanceByVariable,
	type TradeForStats,
	type TradeForEquity,
	type TradeForRisk,
	type TradeForRDistribution,
	type TradeForHourly,
	type TradeForSessionAsset,
	type TradeForVariable,
}
