/**
 * Annualization layer for financial metrics.
 *
 * Canonical reference: Sharpe (1994) "The Sharpe Ratio" — annualized metrics
 * multiply per-period (daily, weekly) values by √N where N is the number of
 * periods per year. For trading, we use 252 as the canonical number of trading
 * days per year in Brazil (B3) and US markets.
 */

export const TRADING_DAYS_PER_YEAR = 252

/**
 * Annualized Sharpe ratio from daily return statistics.
 *
 * Sharpe = (mean_daily_return / std_daily_return) × √252
 *
 * @param meanDailyReturn - mean daily return (as decimal, e.g., 0.001 for 0.1%)
 * @param stdDailyReturn - standard deviation of daily returns
 * @returns annualized Sharpe ratio, or 0 if std dev is 0 or inputs are NaN
 */
export const annualizedSharpe = (
	meanDailyReturn: number,
	stdDailyReturn: number
): number => {
	if (!Number.isFinite(meanDailyReturn) || !Number.isFinite(stdDailyReturn)) {
		return 0
	}
	if (stdDailyReturn === 0) {
		return 0
	}
	return (meanDailyReturn / stdDailyReturn) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

/**
 * Annualized Sortino ratio from daily return statistics.
 *
 * Sortino = (mean_daily_return / downside_daily_deviation) × √252
 *
 * Sortino differs from Sharpe by using only downside deviation (negative returns).
 *
 * @param meanDailyReturn - mean daily return (as decimal)
 * @param downsideDailyDev - downside deviation (volatility of negative returns only)
 * @returns annualized Sortino ratio, or 0 if downside dev is 0 or inputs are NaN
 */
export const annualizedSortino = (
	meanDailyReturn: number,
	downsideDailyDev: number
): number => {
	if (!Number.isFinite(meanDailyReturn) || !Number.isFinite(downsideDailyDev)) {
		return 0
	}
	if (downsideDailyDev === 0) {
		return 0
	}
	return (meanDailyReturn / downsideDailyDev) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

/**
 * Annualized volatility from daily standard deviation.
 *
 * Annual volatility = daily_std × √252
 *
 * @param stdDailyReturn - standard deviation of daily returns
 * @returns annualized volatility, or 0 if input is NaN
 */
export const annualizedVolatility = (stdDailyReturn: number): number => {
	if (!Number.isFinite(stdDailyReturn)) {
		return 0
	}
	return stdDailyReturn * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

/**
 * Compound Annual Growth Rate (CAGR).
 *
 * CAGR = (endEquity / startEquity) ^ (1 / years) - 1
 *
 * Measures the geometric annual return over a multi-year period.
 *
 * @param startEquity - opening capital (in cents or any consistent unit)
 * @param endEquity - closing capital (must be > 0 for valid CAGR)
 * @param years - number of years (must be > 0)
 * @returns CAGR as a decimal (e.g., 0.1497 for ~15%), or 0 if inputs are invalid,
 *          or -1 if endEquity < 0 (lost more than initial capital — undefined compounding)
 */
export const cagr = (
	startEquity: number,
	endEquity: number,
	years: number
): number => {
	if (
		!Number.isFinite(startEquity) ||
		!Number.isFinite(endEquity) ||
		!Number.isFinite(years)
	) {
		return 0
	}
	if (startEquity <= 0 || years <= 0) {
		return 0
	}
	if (endEquity < 0) {
		return -1 // Lost more than initial; undefined compounding
	}
	if (endEquity === 0) {
		return -1 // Complete loss
	}
	return Math.pow(endEquity / startEquity, 1 / years) - 1
}

/**
 * Bucket trades to daily returns.
 *
 * Groups trades by their closed-at date (BRT), sums P&L per day, and computes
 * daily return as dayPnl / (equity_at_start_of_day).
 *
 * @param trades - array of trades with closedAt (Date or ISO string) and pnlCents
 * @param initialBalanceCents - starting capital in cents
 * @returns array of { date: string, pnlCents: number, returnPct: number },
 *          sorted chronologically
 */
export const bucketTradesToDailyReturns = (
	trades: Array<{ closedAt: Date | string; pnlCents: number }>,
	initialBalanceCents: number
): Array<{ date: string; pnlCents: number; returnPct: number }> => {
	if (!Number.isFinite(initialBalanceCents) || initialBalanceCents <= 0) {
		return []
	}

	// Group trades by date
	const byDate = new Map<string, number>()
	for (const trade of trades) {
		let dateStr: string
		if (trade.closedAt instanceof Date) {
			dateStr = trade.closedAt.toISOString().split("T")[0]
		} else {
			dateStr = String(trade.closedAt).split("T")[0]
		}

		if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
			continue // Skip malformed dates
		}

		const current = byDate.get(dateStr) ?? 0
		byDate.set(dateStr, current + (trade.pnlCents ?? 0))
	}

	// Convert to array and sort chronologically
	const result = Array.from(byDate.entries())
		.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
		.map(([date, pnlCents]) => {
			let runningEquity = initialBalanceCents
			// Reconstruct equity at start of day by iterating through earlier trades
			for (const [d, pnl] of byDate.entries()) {
				if (d < date) {
					runningEquity += pnl
				} else {
					break
				}
			}
			const returnPct = (pnlCents / runningEquity) * 100
			return { date, pnlCents, returnPct }
		})

	return result
}

/**
 * Sample standard deviation (with Bessel's correction, n-1 divisor).
 *
 * Industry standard for Sharpe ratio and other risk metrics.
 *
 * @param values - array of numeric values
 * @returns sample standard deviation, or 0 if n < 2
 */
export const sampleStdDev = (values: readonly number[]): number => {
	if (values.length < 2) {
		return 0
	}

	const avg = values.reduce((sum, v) => sum + v, 0) / values.length
	const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
	const sumSquaredDiffs = squaredDiffs.reduce((sum, v) => sum + v, 0)

	// Bessel's correction: divide by (n - 1) instead of n
	return Math.sqrt(sumSquaredDiffs / (values.length - 1))
}
