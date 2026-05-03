import type {
	BacktestTrade,
	BacktestSummary,
	EquityCurvePoint,
} from "@/types/backtest"

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
			sharpeRatio: 0,
			expectancy: 0,
			totalDays,
			tradingDays: 0,
		}
	}

	// Single-pass accumulation of all metrics
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

	for (const trade of trades) {
		const pnl = trade.netPnlCents
		totalPnlCents += pnl
		rSum += trade.rMultiple
		uniqueDays.add(trade.dayKey)

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

	// Sharpe ratio — second pass needed for std dev (variance requires mean first)
	let varianceSum = 0
	for (const trade of trades) {
		varianceSum += (trade.rMultiple - avgRMultiple) ** 2
	}
	const stdR = Math.sqrt(varianceSum / trades.length)
	const sharpeRatio = stdR > 0 ? avgRMultiple / stdR : 0

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
		winRate: Math.round(winRate * 100) / 100,
		profitFactor: Math.round(profitFactor * 100) / 100,
		totalPnlCents,
		avgPnlCents,
		avgWinCents,
		avgLossCents,
		avgRMultiple: Math.round(avgRMultiple * 100) / 100,
		maxDrawdownCents,
		maxConsecutiveLosses,
		maxConsecutiveWins,
		sharpeRatio: Math.round(sharpeRatio * 100) / 100,
		expectancy: Math.round(expectancy * 100) / 100,
		totalDays,
		tradingDays: uniqueDays.size,
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
