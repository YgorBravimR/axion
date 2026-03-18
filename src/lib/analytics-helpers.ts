/**
 * Pure computation helpers for analytics.
 * No DB, no auth, no server-only imports — safe to use anywhere.
 *
 * These functions take already-decrypted trade data and return computed metrics.
 * Used by both the single-account analytics actions and the multi-account comparison.
 */

import { fromCents } from "@/lib/money"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { formatDateKey } from "@/lib/dates"
import type { OverallStats, ExpectedValueData, EquityPoint } from "@/types"

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

export {
	computeOverallStats,
	computeExpectedValue,
	computeEquityCurve,
	computeMaxDrawdown,
	computeAvgRiskPerTrade,
	type TradeForStats,
	type TradeForEquity,
	type TradeForRisk,
}
