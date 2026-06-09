import type {
	BacktestTrade,
	BacktestSummary,
	EquityCurvePoint,
} from "@/types/backtest"
import {
	TRADING_DAYS_PER_YEAR,
	annualizedSharpe,
	annualizedVolatility,
	cagr,
	bucketTradesToDailyReturns,
	sampleStdDev,
} from "@/lib/finance/annualize"

/**
 * Compute summary metrics from a list of completed trades.
 */
const computeMetrics = (
	trades: BacktestTrade[],
	totalDays: number
): BacktestSummary => {
	if (trades.length === 0) {
		return {
			totalTrades: 0,
			wins: 0,
			losses: 0,
			breakevens: 0,
			winRate: 0,
			profitFactor: 0,
			totalPnlCents: 0,
			avgPnlCents: 0,
			avgWinCents: 0,
			avgLossCents: 0,
			avgRMultiple: 0,
			maxDrawdownCents: 0,
			maxConsecutiveLosses: 0,
			maxConsecutiveWins: 0,
			rSharpe: 0,
			sharpeRatio: 0,
			expectancy: 0,
			totalDays,
			tradingDays: 0,
			cagr: null,
			annualizedVolatility: 0,
		}
	}

	// Single-pass accumulation of all metrics + Welford's online variance
	let winsCount = 0
	let lossesCount = 0
	let breakevenCount = 0
	let totalPnlCents = 0
	let grossWins = 0
	let grossLosses = 0
	let rSum = 0
	let winRSum = 0
	let lossRSum = 0
	let peakEquity = 0
	let maxDrawdownCents = 0
	let runningEquity = 0
	let maxConsecutiveWins = 0
	let maxConsecutiveLosses = 0
	let currentWinStreak = 0
	let currentLossStreak = 0
	const uniqueDays = new Set<string>()
	// Welford's algorithm: track mean + M2 (sum of squared diffs from mean)
	let rMean = 0
	let rM2 = 0
	let rCount = 0

	for (const trade of trades) {
		const pnl = trade.netPnlCents
		totalPnlCents += pnl
		rSum += trade.rMultiple
		uniqueDays.add(trade.dayKey)

		// Welford update for Sharpe (R-multiple variance)
		rCount++
		const oldMean = rMean
		rMean += (trade.rMultiple - oldMean) / rCount
		rM2 += (trade.rMultiple - oldMean) * (trade.rMultiple - rMean)

		if (pnl > 0) {
			winsCount++
			grossWins += pnl
			winRSum += trade.rMultiple
			currentWinStreak++
			currentLossStreak = 0
			maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak)
		} else if (pnl < 0) {
			lossesCount++
			grossLosses += -pnl
			lossRSum += trade.rMultiple
			currentLossStreak++
			currentWinStreak = 0
			maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak)
		} else {
			breakevenCount++
			currentWinStreak = 0
			currentLossStreak = 0
		}

		runningEquity += pnl
		peakEquity = Math.max(peakEquity, runningEquity)
		maxDrawdownCents = Math.max(maxDrawdownCents, peakEquity - runningEquity)
	}

	const decisiveCount = winsCount + lossesCount
	const winRate = decisiveCount > 0 ? (winsCount / decisiveCount) * 100 : 0
	const profitFactor =
		grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0
	const avgPnlCents = Math.round(totalPnlCents / trades.length)
	const avgWinCents = winsCount > 0 ? Math.round(grossWins / winsCount) : 0
	const avgLossCents =
		lossesCount > 0 ? Math.round(-grossLosses / lossesCount) : 0
	const avgRMultiple = rSum / trades.length

	// Sharpe ratio — variance computed via Welford's algorithm in single pass above
	// Note: Welford's algorithm produces sample variance (n-1 divisor)
	const variance = rM2 / Math.max(rCount - 1, 1)
	const stdR = Math.sqrt(variance)
	const rSharpe = stdR > 0 ? rMean / stdR : 0 // Per-trade R-Sharpe (diagnostic)

	// Compute daily-bucketed, annualized Sharpe ratio
	// Convert PnL to daily returns and annualize
	let sharpeRatio = 0
	let annualizedVol = 0
	let cagrValue: number | null = null

	if (trades.length > 0) {
		// Bucket trades by date and compute daily returns
		const dailyBuckets = bucketTradesToDailyReturns(
			trades.map((t) => ({
				closedAt: t.dayKey,
				pnlCents: t.netPnlCents,
			})),
			1 // Use 1 cent as baseline to compute returns as percentages
		)

		if (dailyBuckets.length >= 2) {
			const dailyReturns = dailyBuckets.map((b) => b.returnPct / 100) // Convert % to decimal
			const dailyMean =
				dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
			const dailyStd = sampleStdDev(dailyReturns)

			// Annualize the Sharpe ratio
			sharpeRatio = annualizedSharpe(dailyMean, dailyStd)
			annualizedVol = annualizedVolatility(dailyStd)
		}

		// Compute CAGR if the backtest spans at least 1 month (roughly 21 trading days)
		if (uniqueDays.size >= 21) {
			const yearsSpan = uniqueDays.size / TRADING_DAYS_PER_YEAR
			const endEquity = totalPnlCents
			// For CAGR, we need a positive starting equity; use a nominal starting balance
			// Since we don't have initial balance, we'll only compute CAGR if profit is significant
			cagrValue =
				endEquity > 0 ? cagr(1000000, 1000000 + endEquity, yearsSpan) : null
		}
	}

	// True R-expectancy = winRate * avgWinR - lossRate * |avgLossR|
	// avgLossRMultiple is already negative, so summation gives correct result
	const rWinRate = decisiveCount > 0 ? winsCount / decisiveCount : 0
	const avgWinRMultiple = winsCount > 0 ? winRSum / winsCount : 0
	const avgLossRMultiple = lossesCount > 0 ? lossRSum / lossesCount : 0
	const expectancy =
		rWinRate * avgWinRMultiple + (1 - rWinRate) * avgLossRMultiple

	return {
		totalTrades: trades.length,
		wins: winsCount,
		losses: lossesCount,
		breakevens: breakevenCount,
		winRate,
		profitFactor,
		totalPnlCents,
		avgPnlCents,
		avgWinCents,
		avgLossCents,
		avgRMultiple,
		maxDrawdownCents,
		maxConsecutiveLosses,
		maxConsecutiveWins,
		rSharpe,
		sharpeRatio,
		expectancy,
		totalDays,
		tradingDays: uniqueDays.size,
		cagr: cagrValue,
		annualizedVolatility: annualizedVol,
	}
}

/**
 * Build equity curve from trade list.
 * Each point tracks cumulative P&L and current drawdown from peak.
 */
const buildEquityCurve = (trades: BacktestTrade[]): EquityCurvePoint[] => {
	let cumulativePnl = 0
	let peakEquity = 0

	return trades.map((trade, index) => {
		cumulativePnl += trade.netPnlCents
		peakEquity = Math.max(peakEquity, cumulativePnl)
		const drawdown = peakEquity - cumulativePnl

		return {
			tradeIndex: index,
			cumulativePnlCents: cumulativePnl,
			drawdownCents: drawdown,
			dayKey: trade.dayKey,
		}
	})
}

export { computeMetrics, buildEquityCurve }
