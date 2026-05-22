/**
 * Pure indicator computer.
 *
 * Two functions, both deterministic and side-effect free:
 *
 *  - `computeEma(values, period)` — EMA with SMA seed. Returns an array
 *    aligned to the input (1:1 length); the first `period - 1` entries
 *    are `null` (warmup), the entry at index `period - 1` is the SMA of
 *    the first `period` values, and subsequent entries are
 *    `alpha * value + (1 - alpha) * prev`, with `alpha = 2 / (period + 1)`.
 *
 *  - `computeMacd(values, { fast, slow, signal })` — classic MACD. Returns
 *    `{ line, signal, histogram }`, each aligned 1:1 to input. `line` is
 *    `ema(fast) − ema(slow)` and is `null` until both component EMAs are
 *    seeded (i.e. until index `slow - 1`). `signal` is the EMA of `line`,
 *    seeded from the first `signal` non-null line values; until that seed
 *    is filled, `signal[i] === null`. `histogram[i] = line[i] − signal[i]`
 *    where both are non-null, else `null`.
 *
 * No I/O. Inputs may include `NaN` neither expected nor handled — caller
 * is responsible for cleaning the series.
 */

interface MacdOptions {
	readonly fast: number
	readonly slow: number
	readonly signal: number
}

interface MacdSeries {
	readonly line: (number | null)[]
	readonly signal: (number | null)[]
	readonly histogram: (number | null)[]
}

const computeEma = (
	values: readonly number[],
	period: number
): (number | null)[] => {
	if (!Number.isInteger(period) || period <= 0) {
		throw new Error(`EMA period must be a positive integer; got ${period}`)
	}

	const out: (number | null)[] = new Array<number | null>(values.length).fill(
		null
	)

	if (values.length < period) {
		return out
	}

	const alpha = 2 / (period + 1)

	let sum = 0
	for (let i = 0; i < period; i++) {
		sum += values[i]!
	}
	let prev = sum / period
	out[period - 1] = prev

	for (let i = period; i < values.length; i++) {
		const v = values[i]!
		prev = alpha * v + (1 - alpha) * prev
		out[i] = prev
	}

	return out
}

const computeMacd = (
	values: readonly number[],
	options: MacdOptions
): MacdSeries => {
	const { fast, slow, signal } = options

	if (!Number.isInteger(fast) || fast <= 0) {
		throw new Error(`MACD fast must be a positive integer; got ${fast}`)
	}
	if (!Number.isInteger(slow) || slow <= 0) {
		throw new Error(`MACD slow must be a positive integer; got ${slow}`)
	}
	if (!Number.isInteger(signal) || signal <= 0) {
		throw new Error(`MACD signal must be a positive integer; got ${signal}`)
	}
	if (fast >= slow) {
		throw new Error(
			`MACD fast (${fast}) must be strictly less than slow (${slow})`
		)
	}

	const fastEma = computeEma(values, fast)
	const slowEma = computeEma(values, slow)

	const line: (number | null)[] = new Array<number | null>(values.length).fill(
		null
	)
	for (let i = 0; i < values.length; i++) {
		const f = fastEma[i] ?? null
		const s = slowEma[i] ?? null
		if (f !== null && s !== null) {
			line[i] = f - s
		}
	}

	// Signal = EMA(signal) of the line, seeded from the first `signal`
	// non-null line values. We can't reuse computeEma directly because
	// the line is sparse (leading nulls).
	const sigOut: (number | null)[] = new Array<number | null>(
		values.length
	).fill(null)

	// Find first index where the line is non-null.
	let firstLineIdx = -1
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== null) {
			firstLineIdx = i
			break
		}
	}

	if (firstLineIdx >= 0) {
		const seedEndIdx = firstLineIdx + signal - 1
		if (seedEndIdx < line.length) {
			let sum = 0
			for (let i = firstLineIdx; i <= seedEndIdx; i++) {
				sum += line[i]!
			}
			let prev = sum / signal
			sigOut[seedEndIdx] = prev

			const alpha = 2 / (signal + 1)
			for (let i = seedEndIdx + 1; i < line.length; i++) {
				const v = line[i]!
				prev = alpha * v + (1 - alpha) * prev
				sigOut[i] = prev
			}
		}
	}

	const histogram: (number | null)[] = new Array<number | null>(
		values.length
	).fill(null)
	for (let i = 0; i < values.length; i++) {
		const l = line[i] ?? null
		const s = sigOut[i] ?? null
		if (l !== null && s !== null) {
			histogram[i] = l - s
		}
	}

	return { line, signal: sigOut, histogram }
}

export type { MacdOptions, MacdSeries }
export { computeEma, computeMacd }
