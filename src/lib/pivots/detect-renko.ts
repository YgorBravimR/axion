/**
 * Renko structural-pivot detector — generalized to confirmation N=1..6.
 *
 * Single source of truth for swing detection across the codebase. Both the
 * backfill script (`scripts/backfill-pivots.ts`) and the per-ingest writer
 * read from here, and the engine consumes the persisted output via
 * `asset_pivots`. Clean-swing semantics: emits one TOPO per peak, one FUNDO
 * per trough. The legacy N=2 detector at `src/lib/backtest/hawks-structural-pivots.ts`
 * uses different (event-stream) semantics — do NOT assume output parity.
 *
 * **Direction classifier: wick-based** (CLAUDE.md rule 0a). A brick's
 * direction relative to the prior brick is:
 *   - bullish: `brick.high > priorBrick.high`
 *   - bearish: `brick.low  < priorBrick.low`
 *   - neutral: otherwise — direction does NOT flip; the prior run continues
 *
 * **Algorithm**: state machine tracks the current run's direction and the
 * extreme of that run (highest high for a bullish run, lowest low for a
 * bearish run). When the OPPOSITE direction's wick condition holds for N
 * consecutive bricks, the prior run's extreme is emitted as a confirmed
 * pivot — TOPO if the prior run was bullish, FUNDO if bearish.
 *
 * **Count-monotonicity invariant**: `|pivots(N=k+1)| ≤ |pivots(N=k)|`.
 * More confirmation never produces strictly more pivots. The stronger
 * `pivots(N=k+1) ⊆ pivots(N=k)` does NOT hold — extending a run with more
 * confirmation can shift the recognized peak to a different brick than
 * the early-flip one at lower N.
 *
 * **Price-match invariant**: each emitted pivot's `price` equals
 * `bricks[peakBrickIdx].high` (TOPO) or `.low` (FUNDO). Asserted in tests
 * and in the backfill script at write time.
 *
 * **Alternation invariant**: output strictly alternates topo↔fundo within
 * each N.
 */

export interface PivotBrick {
	open: number
	high: number
	low: number
	close: number
}

export interface RenkoPivot {
	type: "topo" | "fundo"
	price: number
	/** Brick where the actual peak/trough sits. Strictly < `confirmationBrickIdx`. */
	peakBrickIdx: number
	/** Brick where the N-streak completed and the pivot became known. */
	confirmationBrickIdx: number
}

interface DetectorState {
	/** Current run direction. `null` until the first directional brick. */
	direction: "bullish" | "bearish" | null
	/** Extreme price of the current run (highest high if bullish, lowest low if bearish). */
	runExtreme: number | null
	/** Brick index where `runExtreme` was observed. */
	runExtremeBrickIdx: number | null
	/** Count of consecutive opposite-direction bricks observed since the last extreme update. */
	oppositeStreak: number
	/** Prior brick's high/low — needed for wick-based direction classification. */
	lastHigh: number | null
	lastLow: number | null
}

const initialState = (): DetectorState => ({
	direction: null,
	runExtreme: null,
	runExtremeBrickIdx: null,
	oppositeStreak: 0,
	lastHigh: null,
	lastLow: null,
})

/**
 * Walk a brick sequence once and return every pivot confirmed at the given
 * N. O(bricks) with a constant-size inner loop.
 */
export const detectRenkoPivots = (
	bricks: ReadonlyArray<PivotBrick>,
	confirmationN: number
): ReadonlyArray<RenkoPivot> => {
	if (confirmationN < 1 || confirmationN > 6) {
		throw new Error(`confirmationN must be 1..6, got ${confirmationN}`)
	}
	const out: RenkoPivot[] = []
	const state = initialState()

	for (let i = 0; i < bricks.length; i++) {
		const brick = bricks[i]!
		const isBullishWickRaw =
			state.lastHigh !== null && brick.high > state.lastHigh
		const isBearishWickRaw = state.lastLow !== null && brick.low < state.lastLow
		// Ambiguity guard: outside brick (high > prior AND low < prior) resolves
		// via body: close >= open → bullish, else bearish. Suppresses the opposite.
		const isBullishWick =
			isBullishWickRaw && (!isBearishWickRaw || brick.close >= brick.open)
		const isBearishWick =
			isBearishWickRaw && (!isBullishWickRaw || brick.close < brick.open)

		if (state.direction === null) {
			// Init: first directional brick sets the run. Fall back to body
			// classification on the very first sample since there's no prior
			// brick to compare wicks against.
			if (isBullishWick || isBearishWick) {
				state.direction = isBullishWick ? "bullish" : "bearish"
				state.runExtreme = isBullishWick ? brick.high : brick.low
				state.runExtremeBrickIdx = i
			} else if (state.lastHigh === null) {
				const initBullish = brick.close >= brick.open
				state.direction = initBullish ? "bullish" : "bearish"
				state.runExtreme = initBullish ? brick.high : brick.low
				state.runExtremeBrickIdx = i
			}
			state.lastHigh = brick.high
			state.lastLow = brick.low
			continue
		}

		const aligned =
			(state.direction === "bullish" && isBullishWick) ||
			(state.direction === "bearish" && isBearishWick)
		const opposite =
			(state.direction === "bullish" && isBearishWick) ||
			(state.direction === "bearish" && isBullishWick)

		if (aligned) {
			// Extend the current run. Update extreme if this brick exceeds it.
			const candidate = state.direction === "bullish" ? brick.high : brick.low
			const better =
				state.direction === "bullish"
					? candidate > (state.runExtreme as number)
					: candidate < (state.runExtreme as number)
			if (better) {
				state.runExtreme = candidate
				state.runExtremeBrickIdx = i
			}
			state.oppositeStreak = 0
		} else if (opposite) {
			state.oppositeStreak += 1
			if (state.oppositeStreak >= confirmationN) {
				if (state.runExtreme !== null && state.runExtremeBrickIdx !== null) {
					out.push({
						type: state.direction === "bullish" ? "topo" : "fundo",
						price: state.runExtreme,
						peakBrickIdx: state.runExtremeBrickIdx,
						confirmationBrickIdx: i,
					})
				}
				// Flip the run direction. The new run's extreme is THIS brick's
				// extreme on the new side (the brick that just confirmed).
				state.direction = state.direction === "bullish" ? "bearish" : "bullish"
				state.runExtreme =
					state.direction === "bullish" ? brick.high : brick.low
				state.runExtremeBrickIdx = i
				state.oppositeStreak = 0
			}
		}
		// else: neutral — keep direction, do not reset streak (a neutral brick
		// doesn't break the opposite-streak count, matching the legacy N=2
		// behavior where neutral is a passthrough).

		state.lastHigh = brick.high
		state.lastLow = brick.low
	}

	return out
}

/**
 * Convenience: detect pivots for every N in 1..6 in a single pass-equivalent
 * call (6 separate O(N) walks under the hood; the parallel-walk optimization
 * in the backlog spec is deferred — clarity > 6× constant factor).
 */
export const detectRenkoPivotsAllN = (
	bricks: ReadonlyArray<PivotBrick>
): Record<number, ReadonlyArray<RenkoPivot>> => {
	const out: Record<number, ReadonlyArray<RenkoPivot>> = {}
	for (let n = 1; n <= 6; n++) {
		out[n] = detectRenkoPivots(bricks, n)
	}
	return out
}

export const ALGORITHM_VERSION = "pivots-v1"
