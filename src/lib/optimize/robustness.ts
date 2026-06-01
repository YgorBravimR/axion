import type { CandleRow } from "@/types/candle"
import type { BacktestSummary } from "@/types/backtest"

/**
 * Robustness threshold: OOS PF must be at least 70% of IS PF to be considered robust.
 * This prevents overfitting by requiring out-of-sample performance to maintain
 * most of the in-sample profitability.
 */
export const OOS_ROBUSTNESS_THRESHOLD = 0.7

/**
 * Determine if a combo is robust based on in-sample vs out-of-sample profit factor.
 *
 * Rules:
 * - If IS PF is Infinity (unlimited profitability): OOS is robust only if it's also
 *   Infinity or > 2 (ensuring meaningful OOS performance).
 * - If IS PF ≤ 1 (losing or break-even): never robust (losing combos can't be robust).
 * - Otherwise: OOS PF >= threshold (70%) × IS PF.
 */
export function isOosRobust(
	summaryIS: BacktestSummary,
	summaryOOS: BacktestSummary
): boolean {
	const isPF = summaryIS.profitFactor
	const oosPF = summaryOOS.profitFactor

	// IS is infinitely profitable — OOS must also be infinite or very strong (> 2)
	if (isPF === Infinity) {
		return oosPF === Infinity || oosPF > 2
	}

	// IS is losing or break-even — never robust
	if (isPF <= 1) {
		return false
	}

	// Normal case: OOS >= threshold × IS
	return oosPF >= OOS_ROBUSTNESS_THRESHOLD * isPF
}

/**
 * Split candles into in-sample and out-of-sample by count (not date).
 *
 * This split strategy is robust to gaps in the data and does not require
 * date assumptions or bucketing logic. The in-sample slice contains the
 * first `inSamplePct % candles.length` candles; OOS contains the rest.
 *
 * @param candles - All available candles (must be in order).
 * @param inSamplePct - Percentage to use for in-sample (0.5–0.9), as a decimal (0.5 = 50%).
 * @returns Object with `isCandles` (in-sample), `oosCandles` (out-of-sample), and date ranges.
 */
export function splitCandles(
	candles: CandleRow[],
	inSamplePct: number
): {
	isCandles: CandleRow[]
	oosCandles: CandleRow[]
	isDateRange: { from: string; to: string }
	oosDateRange: { from: string; to: string }
} {
	if (inSamplePct < 0.5 || inSamplePct > 0.9) {
		throw new Error(
			`inSamplePct must be between 0.5 and 0.9, got ${inSamplePct}`
		)
	}

	const splitIndex = Math.floor(candles.length * inSamplePct)
	const isCandles = candles.slice(0, splitIndex)
	const oosCandles = candles.slice(splitIndex)

	return {
		isCandles,
		oosCandles,
		isDateRange: {
			from: isCandles[0]!.timestamp.split("T")[0]!,
			to: isCandles[isCandles.length - 1]!.timestamp.split("T")[0]!,
		},
		oosDateRange: {
			from: oosCandles[0]!.timestamp.split("T")[0]!,
			to: oosCandles[oosCandles.length - 1]!.timestamp.split("T")[0]!,
		},
	}
}
