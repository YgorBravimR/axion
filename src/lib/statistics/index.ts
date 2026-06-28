/**
 * Statistics utilities for trading analytics.
 *
 * Purpose: stop laundering n=1 observations into "best/worst" rankings.
 * Every claim a chart makes about "this hour is your best window" needs to
 * account for how much data backs that claim.
 *
 * Threshold rationale:
 *  - n < MIN_VISIBLE  → no rendered claim (gray cell, "insufficient data")
 *  - n in [MIN_VISIBLE, MIN_RELIABLE)  → desaturated color, "low confidence" flag
 *  - n >= MIN_RELIABLE → full-color claim
 *
 * MIN_RELIABLE = 20 is the standard floor in evidence-based technical
 * analysis (Aronson, Chan): below it, a binomial CI on win-rate exceeds
 * ±25pp and the displayed mean is dominated by noise.
 */

export const SAMPLE_THRESHOLDS = {
	/** Below this, render no claim — gray cell, "—" in tables. */
	MIN_VISIBLE: 5,
	/** Below this, claim is allowed but flagged as low-confidence. */
	MIN_RELIABLE: 20,
	/** Below this, hide "best/worst" tables entirely. */
	MIN_FOR_RANKING: 10,
} as const

export type SampleConfidence = "insufficient" | "low" | "reliable"

/** Classify a sample size into a confidence bucket. */
export const classifySample = (n: number): SampleConfidence => {
	if (n < SAMPLE_THRESHOLDS.MIN_VISIBLE) {
		return "insufficient"
	}
	if (n < SAMPLE_THRESHOLDS.MIN_RELIABLE) {
		return "low"
	}
	return "reliable"
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * More accurate than the normal-approximation CI for small n and for
 * proportions near 0 or 1 (where the normal approximation breaks down).
 * Used for win-rate confidence intervals everywhere we display win rate
 * with a sample size attached.
 *
 * @param successes Number of wins
 * @param n Total sample size (wins + losses; break-evens excluded)
 * @param z Normal critical value — 1.96 for 95%, 1.645 for 90%
 * @returns [lower, upper] bounds as proportions in [0, 1]
 */
export const wilsonInterval = (
	successes: number,
	n: number,
	z = 1.96
): [number, number] => {
	if (n === 0) {
		return [0, 0]
	}
	const phat = successes / n
	const z2 = z * z
	const denom = 1 + z2 / n
	const center = (phat + z2 / (2 * n)) / denom
	const halfWidth =
		(z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))) / denom
	return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)]
}

/**
 * Wilson lower bound for ranking — the "Reddit comment sort" trick.
 *
 * Sorting "best window" by raw win rate puts a 1/1 (100%) cell above
 * a 30/50 (60%) cell, which is the n=1 problem. Sorting by the lower
 * bound of the Wilson interval puts the 30/50 cell first because we
 * have evidence its TRUE rate is at least, say, 45%, while the 1/1
 * lower bound is around 2%.
 */
export const wilsonLowerBound = (successes: number, n: number): number => {
	if (n === 0) {
		return 0
	}
	return wilsonInterval(successes, n)[0]
}

/**
 * Normal-approximation 95% CI for the mean of R-multiples (or any
 * continuous metric). Uses sample standard deviation; for n < 30 this is
 * still approximate — fine for the UI's purpose of flagging uncertainty.
 *
 * @param values Array of R-multiples (or whatever metric is being averaged)
 * @returns { mean, lower, upper, stderr } — lower/upper are 95% CI bounds
 */
export const meanCi = (
	values: readonly number[]
): { mean: number; lower: number; upper: number; stderr: number } => {
	const n = values.length
	if (n === 0) {
		return { mean: 0, lower: 0, upper: 0, stderr: 0 }
	}
	if (n === 1) {
		// Single observation: no spread info — CI is ±∞. We return a wide
		// sentinel band so downstream code can detect & label it.
		return {
			mean: values[0] ?? 0,
			lower: Number.NEGATIVE_INFINITY,
			upper: Number.POSITIVE_INFINITY,
			stderr: Number.POSITIVE_INFINITY,
		}
	}
	const mean = values.reduce((s, v) => s + v, 0) / n
	const variance =
		values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1)
	const stderr = Math.sqrt(variance / n)
	const halfWidth = 1.96 * stderr
	return { mean, lower: mean - halfWidth, upper: mean + halfWidth, stderr }
}

/**
 * Empirical Bayes shrinkage of a group mean toward the global mean.
 *
 * Cells with low n get pulled toward the global average (no signal);
 * cells with high n keep their own mean. Weight is n / (n + k), where k
 * is a "smoothing constant" — pick k ≈ MIN_RELIABLE so a cell needs
 * MIN_RELIABLE trades for its observation to count for half the result.
 *
 * @param cellMean Observed mean for the cell
 * @param cellN Sample size of the cell
 * @param globalMean Overall mean across all cells
 * @param k Smoothing constant (defaults to MIN_RELIABLE)
 */
export const shrinkMean = (
	cellMean: number,
	cellN: number,
	globalMean: number,
	k = SAMPLE_THRESHOLDS.MIN_RELIABLE
): number => {
	if (cellN <= 0) {
		return globalMean
	}
	const weight = cellN / (cellN + k)
	return weight * cellMean + (1 - weight) * globalMean
}

/**
 * How many more samples are needed to reach reliable confidence.
 * Used by sample-size health widgets / tooltips.
 */
export const samplesNeeded = (currentN: number): number =>
	Math.max(0, SAMPLE_THRESHOLDS.MIN_RELIABLE - currentN)

/**
 * Score a cell for "best/worst" ranking — combines metric sign with sample
 * confidence so a 1/1 cell never beats a well-sampled cell.
 *
 * For win-rate: returns Wilson lower bound (good cell = high LB).
 * For mean R or P&L: returns the lower CI bound, NaN if n=1.
 *
 * @returns A score where higher = better for "best", lower = worse for "worst".
 *          Returns NaN when the cell has insufficient data to rank at all.
 */
export const rankingScore = (params: {
	metric: "winRate" | "mean"
	values?: readonly number[]
	successes?: number
	n: number
}): number => {
	if (params.n < SAMPLE_THRESHOLDS.MIN_FOR_RANKING) {
		return Number.NaN
	}
	if (params.metric === "winRate") {
		return wilsonLowerBound(params.successes ?? 0, params.n)
	}
	const ci = meanCi(params.values ?? [])
	return Number.isFinite(ci.lower) ? ci.lower : Number.NaN
}
