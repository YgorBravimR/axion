/**
 * Hawks Renko box-size calibration helper.
 *
 * Pedro's protocol: weekly recalibration of Renko box size from a True Range
 * proxy. Simple Wilder ATR(14) on closing 5-min ranges is enough — the goal
 * is "right order of magnitude", not exact match. The user typically picks
 * the closest box size from the standard ladder (5R, 11R, 13R, 23R, 45R, 88R,
 * 123R) rather than an arbitrary number.
 *
 * @see docs/hawks-mode-research.md § 5
 */

/**
 * The standard ladder of Renko box sizes Pedro uses on B3 mini-índice.
 * Other sizes are allowed but discouraged.
 */
const HAWKS_RENKO_LADDER = [5, 11, 13, 23, 45, 88, 123] as const

interface AtrCandle {
	high: number
	low: number
	close: number
}

const calculateTrueRange = (
	current: AtrCandle,
	previous: AtrCandle | null
): number => {
	const highLow = current.high - current.low
	if (!previous) return highLow
	const highClose = Math.abs(current.high - previous.close)
	const lowClose = Math.abs(current.low - previous.close)
	return Math.max(highLow, highClose, lowClose)
}

/**
 * Wilder ATR(period). Returns null if there are fewer candles than required.
 */
const calculateAtr = (candles: AtrCandle[], period = 14): number | null => {
	if (candles.length < period + 1) return null
	let prevAtr = 0
	for (let i = 1; i <= period; i += 1) {
		prevAtr += calculateTrueRange(candles[i], candles[i - 1])
	}
	prevAtr /= period
	for (let i = period + 1; i < candles.length; i += 1) {
		const tr = calculateTrueRange(candles[i], candles[i - 1])
		prevAtr = (prevAtr * (period - 1) + tr) / period
	}
	return prevAtr
}

/**
 * Snap an ATR-derived suggestion to the nearest Hawks ladder rung. The
 * suggestion is conservative: divide ATR by ~3 because a Renko brick should
 * be smaller than a typical session swing so trends still produce multiple
 * bricks. Adjust by feel.
 */
const suggestLadderRung = (atr: number): (typeof HAWKS_RENKO_LADDER)[number] => {
	const target = atr / 3
	let best: (typeof HAWKS_RENKO_LADDER)[number] = HAWKS_RENKO_LADDER[0]
	let bestDiff = Math.abs(best - target)
	for (const rung of HAWKS_RENKO_LADDER) {
		const diff = Math.abs(rung - target)
		if (diff < bestDiff) {
			best = rung
			bestDiff = diff
		}
	}
	return best
}

/** Find the start of the ISO week (Monday 00:00 local) for a given date. */
const startOfIsoWeek = (date: Date): Date => {
	const out = new Date(date)
	const day = out.getDay()
	const diff = (day === 0 ? -6 : 1) - day
	out.setDate(out.getDate() + diff)
	out.setHours(0, 0, 0, 0)
	return out
}

export {
	HAWKS_RENKO_LADDER,
	calculateTrueRange,
	calculateAtr,
	suggestLadderRung,
	startOfIsoWeek,
}
export type { AtrCandle }
