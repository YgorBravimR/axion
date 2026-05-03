import type {
	TradeForShield,
	EquityShieldParams,
	EquityShieldPoint,
	EquityShieldResult,
	MethodStats,
	TradingMode,
} from "@/types/equity-shield"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"

// ==========================================
// ORIGINAL EQUITY CURVE
// ==========================================

/**
 * Build the raw, unfiltered equity curve from trades.
 * Also computes the observed Max Drawdown (MDD).
 */
const buildOriginalCurve = (
	trades: TradeForShield[],
	initialBalance: number
): {
	points: EquityShieldPoint[]
	observedMDD: number
	observedMDDPercent: number
} => {
	const points: EquityShieldPoint[] = []
	let cumulativePnl = 0
	let peak = initialBalance
	let observedMDD = 0
	let observedMDDPercent = 0

	for (let i = 0; i < trades.length; i++) {
		const trade = trades[i]
		const pnl = fromCents(trade.pnlCents)
		cumulativePnl += pnl
		const accountEquity = initialBalance + cumulativePnl

		if (accountEquity > peak) {
			peak = accountEquity
		}

		const drawdownFromPeak = peak - accountEquity
		const drawdownPercent = peak > 0 ? (drawdownFromPeak / peak) * 100 : 0

		if (drawdownFromPeak > observedMDD) {
			observedMDD = drawdownFromPeak
		}
		if (drawdownPercent > observedMDDPercent) {
			observedMDDPercent = drawdownPercent
		}

		points.push({
			tradeNumber: i + 1,
			liveTradeNumber: i + 1,
			date: formatDateKey(trade.exitDate ?? trade.entryDate),
			pnl,
			originalEquity: cumulativePnl,
			accountEquity,
			peakEquity: peak,
			drawdownFromPeak,
			mode: "live",
			smaValue: null,
		})
	}

	return { points, observedMDD, observedMDDPercent }
}

// ==========================================
// METHOD 1: MAX DRAWDOWN EXERCISE
// ==========================================

/**
 * Applies Method 1 (MDD Exercise) to the trade sequence:
 * - Uses a rolling "completed MDD" from the original curve (drawdowns that
 *   fully recovered by making a new high). This way the threshold adapts as
 *   trading history grows, and can actually trigger on the same dataset.
 * - Go to SIM when the managed curve drops by (completedMDD * multiplier) from its peak
 * - Return to LIVE when the original curve retraces (recoveryPercent) of the
 *   peak-to-valley range, measured from the valley back toward the peak.
 *
 * The "managed curve" only moves during live trades.
 * The "original curve" keeps tracking to determine when conditions recover.
 */
const applyMethod1 = (
	trades: TradeForShield[],
	initialBalance: number,
	mddMultiplier: number,
	recoveryPercent: number,
	drawdownLimit: number,
	cutAtDdLimit: boolean
): EquityShieldPoint[] => {
	const points: EquityShieldPoint[] = []

	let mode: TradingMode = "live"
	let managedEquity = initialBalance
	let managedPeak = initialBalance
	let allTimeHigh = initialBalance
	let originalCumulativePnl = 0
	let liveCount = 0

	// Rolling MDD: tracks completed drawdowns on the original curve.
	// A drawdown "completes" when the original equity makes a new high.
	let originalPeak = initialBalance
	let originalValley = initialBalance
	let completedMDD = 0

	// Recovery tracking — uses the original curve's peak (high-water mark)
	// before the drawdown, not the equity at sim entry
	let originalPeakAtSimEntry = 0
	let originalValleyInSim = 0

	for (let i = 0; i < trades.length; i++) {
		const trade = trades[i]
		const pnl = fromCents(trade.pnlCents)
		originalCumulativePnl += pnl
		const originalAccountEquity = initialBalance + originalCumulativePnl

		// Track original curve: update peak/valley and completed drawdowns
		if (originalAccountEquity > originalPeak) {
			// New high → previous drawdown is "completed"
			const completedDD = originalPeak - originalValley
			if (completedDD > completedMDD) {
				completedMDD = completedDD
			}
			originalPeak = originalAccountEquity
			originalValley = originalAccountEquity
		} else if (originalAccountEquity < originalValley) {
			originalValley = originalAccountEquity
		}

		if (mode === "live") {
			managedEquity += pnl

			// Cap loss at DD limit floor using all-time high (prop firm trailing DD)
			if (cutAtDdLimit && drawdownLimit > 0) {
				const floor = allTimeHigh - drawdownLimit
				if (managedEquity < floor) {
					managedEquity = floor
				}
			}

			if (managedEquity > managedPeak) {
				managedPeak = managedEquity
			}
			if (managedEquity > allTimeHigh) {
				allTimeHigh = managedEquity
			}

			const managedDrawdown = managedPeak - managedEquity
			const simThreshold = completedMDD * mddMultiplier

			// Switch to sim when threshold is established and exceeded
			if (completedMDD > 0 && managedDrawdown >= simThreshold) {
				mode = "sim"
				originalPeakAtSimEntry = originalPeak
				originalValleyInSim = originalAccountEquity
			}

			liveCount++
			points.push({
				tradeNumber: i + 1,
				liveTradeNumber: liveCount,
				date: formatDateKey(trade.exitDate ?? trade.entryDate),
				pnl,
				originalEquity: originalCumulativePnl,
				accountEquity: managedEquity,
				peakEquity: allTimeHigh,
				drawdownFromPeak: allTimeHigh - managedEquity,
				mode: "live",
				smaValue: null,
			})
		} else {
			// SIM mode: managed equity doesn't change
			if (originalAccountEquity < originalValleyInSim) {
				originalValleyInSim = originalAccountEquity
			}

			// Recovery: 30% from valley toward the original peak (high-water mark)
			const peakToValley = originalPeakAtSimEntry - originalValleyInSim
			if (peakToValley > 0) {
				const retracement = originalAccountEquity - originalValleyInSim
				const retracementPercent = retracement / peakToValley

				if (retracementPercent >= recoveryPercent) {
					mode = "live"
					// Reset managed peak so drawdown is measured fresh from
					// the recovery point — prevents immediate re-triggering
					managedPeak = managedEquity
				}
			}

			points.push({
				tradeNumber: i + 1,
				liveTradeNumber: null,
				date: formatDateKey(trade.exitDate ?? trade.entryDate),
				pnl,
				originalEquity: originalCumulativePnl,
				accountEquity: managedEquity,
				peakEquity: allTimeHigh,
				drawdownFromPeak: allTimeHigh - managedEquity,
				mode: "sim",
				smaValue: null,
			})
		}
	}

	return points
}

// ==========================================
// METHOD 2: EQUITY CURVE MOVING AVERAGE
// ==========================================

/**
 * Compute a Simple Moving Average over equity values.
 * Returns null for points where insufficient data exists.
 */
const computeSMA = (values: number[], period: number): (number | null)[] => {
	const sma: (number | null)[] = []

	for (let i = 0; i < values.length; i++) {
		if (i < period - 1) {
			sma.push(null)
			continue
		}

		let sum = 0
		for (let j = i - period + 1; j <= i; j++) {
			sum += values[j]
		}
		sma.push(sum / period)
	}

	return sma
}

/**
 * Applies Method 2 (Equity Curve SMA Crossover):
 * - Above SMA = LIVE (trades affect managed equity)
 * - Below SMA = SIM (managed equity flatlines)
 *
 * The SMA is computed on the ORIGINAL (unfiltered) equity curve,
 * matching real-world usage where you'd compute SMA on your full backtest.
 */
const applyMethod2 = (
	trades: TradeForShield[],
	initialBalance: number,
	smaPeriod: number,
	drawdownLimit: number,
	cutAtDdLimit: boolean
): EquityShieldPoint[] => {
	// First, build the raw account equity series for SMA computation
	const rawEquityValues: number[] = []
	let cumulativePnl = 0
	for (const trade of trades) {
		cumulativePnl += fromCents(trade.pnlCents)
		rawEquityValues.push(initialBalance + cumulativePnl)
	}

	const smaValues = computeSMA(rawEquityValues, smaPeriod)

	// Now build the managed curve
	const points: EquityShieldPoint[] = []
	let managedEquity = initialBalance
	let managedPeak = initialBalance
	let allTimeHigh = initialBalance
	let originalCumulativePnl = 0
	let liveCount = 0

	for (let i = 0; i < trades.length; i++) {
		const trade = trades[i]
		const pnl = fromCents(trade.pnlCents)
		originalCumulativePnl += pnl
		const originalAccountEquity = initialBalance + originalCumulativePnl
		const sma = smaValues[i]

		// Mode decision: based on state BEFORE this trade (pre-entry).
		// You decide live/sim before entering, not after seeing the result.
		const preTradeEquity = i > 0 ? rawEquityValues[i - 1] : initialBalance
		const preTradeSma = i > 0 ? smaValues[i - 1] : null
		const isAboveSMA = preTradeSma === null || preTradeEquity > preTradeSma
		const mode: TradingMode = isAboveSMA ? "live" : "sim"

		if (mode === "live") {
			managedEquity += pnl

			// Cap loss at DD limit floor using all-time high (prop firm trailing DD)
			if (cutAtDdLimit && drawdownLimit > 0) {
				const floor = allTimeHigh - drawdownLimit
				if (managedEquity < floor) {
					managedEquity = floor
				}
			}

			if (managedEquity > managedPeak) {
				managedPeak = managedEquity
			}
			if (managedEquity > allTimeHigh) {
				allTimeHigh = managedEquity
			}
		}
		// sim: managedEquity stays flat
		if (mode === "live") liveCount++
		points.push({
			tradeNumber: i + 1,
			liveTradeNumber: mode === "live" ? liveCount : null,
			date: formatDateKey(trade.exitDate ?? trade.entryDate),
			pnl,
			originalEquity: originalCumulativePnl,
			accountEquity: managedEquity,
			peakEquity: allTimeHigh,
			drawdownFromPeak: allTimeHigh - managedEquity,
			mode,
			smaValue: sma,
		})
	}

	return points
}

// ==========================================
// LIVE-ONLY CURVE BUILDER
// ==========================================

/**
 * Takes a method's point array and rebuilds the curve using only live trades,
 * as if the sim trades never existed. This is what the prop firm would see.
 */
const buildLiveOnlyCurve = (
	points: EquityShieldPoint[],
	initialBalance: number
): EquityShieldPoint[] => {
	const livePoints = points.filter((p) => p.mode === "live")
	const result: EquityShieldPoint[] = []
	let cumulativePnl = 0
	let peak = initialBalance

	for (let i = 0; i < livePoints.length; i++) {
		const point = livePoints[i]
		cumulativePnl += point.pnl
		const accountEquity = initialBalance + cumulativePnl

		if (accountEquity > peak) {
			peak = accountEquity
		}

		result.push({
			...point,
			liveTradeNumber: i + 1,
			originalEquity: point.originalEquity,
			accountEquity,
			peakEquity: peak,
			drawdownFromPeak: peak - accountEquity,
		})
	}

	return result
}

// ==========================================
// STATS COMPUTATION
// ==========================================

const computeMethodStats = (
	points: EquityShieldPoint[],
	liveOnlyPoints: EquityShieldPoint[],
	drawdownLimitDollars: number
): MethodStats => {
	const liveTrades = points.filter((p) => p.mode === "live").length
	const simTrades = points.filter((p) => p.mode === "sim").length

	// Max drawdown in the managed curve
	let maxDrawdown = 0
	let maxDrawdownPercent = 0
	let peak = points[0]?.accountEquity ?? 0

	for (const point of points) {
		if (point.accountEquity > peak) {
			peak = point.accountEquity
		}
		const dd = peak - point.accountEquity
		if (dd > maxDrawdown) {
			maxDrawdown = dd
		}
		const ddPercent = peak > 0 ? (dd / peak) * 100 : 0
		if (ddPercent > maxDrawdownPercent) {
			maxDrawdownPercent = ddPercent
		}
	}

	const finalEquity = points[points.length - 1]?.accountEquity ?? 0
	const livePnl = liveOnlyPoints.reduce((sum, p) => sum + p.pnl, 0)

	// Would pass: managed curve never exceeded drawdown limit
	const wouldPass = maxDrawdown < drawdownLimitDollars

	// Count mode transitions (sim→live or live→sim)
	let modeTransitions = 0
	for (let i = 1; i < points.length; i++) {
		if (points[i].mode !== points[i - 1].mode) {
			modeTransitions++
		}
	}

	return {
		liveTrades,
		simTrades,
		maxDrawdown,
		maxDrawdownPercent,
		finalEquity,
		livePnl,
		wouldPass,
		modeTransitions,
	}
}

// ==========================================
// MAIN ENTRY POINT
// ==========================================

/**
 * Run the full Equity Shield analysis on a set of trades.
 *
 * @param trades - Sorted by exitDate (ascending)
 * @param params - User-configurable parameters
 */
const runEquityShield = (
	trades: TradeForShield[],
	params: EquityShieldParams
): EquityShieldResult => {
	const initialBalance = fromCents(params.initialBalanceCents)
	const drawdownLimit = fromCents(params.drawdownLimitCents)

	// 1. Build original curve to get observed MDD
	const {
		points: original,
		observedMDD,
		observedMDDPercent,
	} = buildOriginalCurve(trades, initialBalance)

	// 2. Apply Method 1 (uses rolling completed MDD internally)
	const method1 = applyMethod1(
		trades,
		initialBalance,
		params.mddMultiplier,
		params.recoveryPercent,
		drawdownLimit,
		params.cutAtDdLimit
	)

	// 3. Apply Method 2
	const method2 = applyMethod2(
		trades,
		initialBalance,
		params.smaPeriod,
		drawdownLimit,
		params.cutAtDdLimit
	)

	// 4. Build live-only curves (liveTradeNumber assigned during method passes)
	const method1LiveOnly = buildLiveOnlyCurve(method1, initialBalance)
	const method2LiveOnly = buildLiveOnlyCurve(method2, initialBalance)

	// 5. Compute stats
	const method1Stats = computeMethodStats(
		method1,
		method1LiveOnly,
		drawdownLimit
	)
	const method2Stats = computeMethodStats(
		method2,
		method2LiveOnly,
		drawdownLimit
	)

	const originalFinalEquity =
		original[original.length - 1]?.accountEquity ?? initialBalance
	let originalMaxDD = 0
	for (const p of original) {
		if (p.drawdownFromPeak > originalMaxDD) {
			originalMaxDD = p.drawdownFromPeak
		}
	}
	const originalWouldPass = originalMaxDD < drawdownLimit

	return {
		original,
		method1,
		method2,
		method1LiveOnly,
		method2LiveOnly,
		stats: {
			totalTrades: trades.length,
			observedMDD,
			observedMDDPercent,
			method1Threshold: observedMDD * params.mddMultiplier,
			originalFinalEquity,
			originalWouldPass,
			method1: method1Stats,
			method2: method2Stats,
		},
	}
}

export { runEquityShield, buildOriginalCurve, computeSMA }
