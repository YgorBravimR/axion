/**
 * Hawks structural pivot detector — extracted from `hawks-triple-screen.ts`.
 *
 * The methodology paints a TOPO when 2 consecutive bearish bricks confirm
 * after a bullish sequence (value = high of the last bullish brick), and a
 * FUNDO when 2 consecutive bullish bricks confirm after a bearish sequence
 * (value = low of the last bearish brick).
 *
 * **WICK-BASED direction** (2026-06-15 user directive): brick direction is
 * classified by WICK EXTREMES relative to the prior brick, NOT by
 * `close > open`. This is the "movements use highs and lows" rule the user
 * locked in during the engine v0.10 lab scrub:
 *   - bullish brick = `brick.high > priorBrick.high`
 *   - bearish brick = `brick.low  < priorBrick.low`
 *   - otherwise = NEUTRAL (treated as a passthrough — direction doesn't flip)
 *
 * This makes the visible swing on the chart (which the user reads off wicks,
 * not bodies) the same one the engine sees. A doji body with a strong wick
 * still registers as the direction the wick implies.
 *
 * Pivots are still stored at `brick.high` (TOPO) and `brick.low` (FUNDO) —
 * those have always been wick extremes; only the direction classifier
 * changed.
 *
 * Both the entry engine and the Indicator Lab pivot review tab consume this
 * — single source of truth, no parallel implementations.
 */

export interface StructuralPivotDetectorState {
	// True = last brick was bullish (high > prior high), false = bearish
	// (low < prior low), null = init / neutral.
	lastBrickWasBullish: boolean | null
	// Extreme of the last brick of that direction: high for bullish, low for
	// bearish. Used as the pivot value when 2 consecutive opposite-direction
	// bricks confirm.
	priorExtremePrice: number | null
	// Brick index where the prior extreme was observed — i.e. the actual
	// peak/trough brick. Used by `walkStructuralPivots` to emit
	// `peakBrickIdx` for chart rendering (engine itself doesn't read this,
	// it operates on price + the confirmation brick from the outer loop).
	priorExtremeBrickIdx: number | null
	// Last brick's high / low — needed for wick-based direction
	// classification on the NEXT brick. Init = null.
	lastHigh: number | null
	lastLow: number | null
}

export interface StructuralPivot {
	type: "topo" | "fundo"
	price: number
	// Brick index where the actual peak/trough lives (the brick whose high
	// is the TOPO price, or whose low is the FUNDO price). Always strictly
	// less than the confirmation brick index by construction.
	peakBrickIdx: number
}

export const createStructuralPivotState = (): StructuralPivotDetectorState => ({
	lastBrickWasBullish: null,
	priorExtremePrice: null,
	priorExtremeBrickIdx: null,
	lastHigh: null,
	lastLow: null,
})

export interface PivotBrick {
	open: number
	high: number
	low: number
	close: number
}

/**
 * Step the detector by one brick. Returns the updated state and an optional
 * pivot if this brick confirmed one. Behavior matches the inlined logic in
 * `hawks-triple-screen.ts:464-493` for price + state transitions; additionally
 * tracks `peakBrickIdx` (the brick where the actual peak/trough lives, not
 * the confirmation brick) so renderers can position vertices on the visual
 * swing point. Engine consumers can ignore `peakBrickIdx`.
 */
export const stepStructuralPivot = (
	brick: PivotBrick,
	brickIdx: number,
	state: StructuralPivotDetectorState
): {
	state: StructuralPivotDetectorState
	pivot: StructuralPivot | null
} => {
	// WICK-based direction classifier (see header). On the first brick of
	// the walk both `lastHigh` and `lastLow` are null — we treat that as
	// init (no direction yet) and just record the brick's extremes.
	const lastH = state.lastHigh
	const lastL = state.lastLow
	const isBullish = lastH !== null && brick.high > lastH
	const isBearish = lastL !== null && brick.low < lastL
	let pivot: StructuralPivot | null = null
	const next: StructuralPivotDetectorState = { ...state }
	next.lastHigh = brick.high
	next.lastLow = brick.low

	if (next.lastBrickWasBullish === true && isBearish) {
		next.lastBrickWasBullish = false
	} else if (next.lastBrickWasBullish === false && isBearish) {
		if (next.priorExtremePrice !== null && next.priorExtremeBrickIdx !== null) {
			pivot = {
				type: "topo",
				price: next.priorExtremePrice,
				peakBrickIdx: next.priorExtremeBrickIdx,
			}
		}
		next.priorExtremePrice = brick.low
		next.priorExtremeBrickIdx = brickIdx
	} else if (next.lastBrickWasBullish === false && isBullish) {
		next.lastBrickWasBullish = true
	} else if (next.lastBrickWasBullish === true && isBullish) {
		if (next.priorExtremePrice !== null && next.priorExtremeBrickIdx !== null) {
			pivot = {
				type: "fundo",
				price: next.priorExtremePrice,
				peakBrickIdx: next.priorExtremeBrickIdx,
			}
		}
		next.priorExtremePrice = brick.high
		next.priorExtremeBrickIdx = brickIdx
	} else if (next.lastBrickWasBullish === null) {
		// Init: record the first brick's direction relative to itself —
		// fall back to body since there's no prior brick to compare wicks
		// against on the very first sample.
		const initBullish = brick.close >= brick.open
		next.lastBrickWasBullish = initBullish
		next.priorExtremePrice = initBullish ? brick.high : brick.low
		next.priorExtremeBrickIdx = brickIdx
	}
	// Else (neutral / inside brick): direction doesn't flip, priorExtreme
	// stays — the swing tracker carries the prior bullish/bearish run.

	return { state: next, pivot }
}

export interface StructuralPivotMarker {
	// Confirmation brick — where the 2-brick pattern completed and the pivot
	// became known. Engine reads this for re-arm gating.
	brickIdx: number
	// Brick where the actual peak/trough sits. Always strictly before
	// `brickIdx`. Use this for visual rendering on a chart.
	peakBrickIdx: number
	type: "topo" | "fundo"
	price: number
}

/**
 * Walk a full brick sequence once and return every pivot confirmation in
 * order. Both indices reported: `brickIdx` (confirmation, engine-facing) and
 * `peakBrickIdx` (actual peak/trough, render-facing).
 */
export const walkStructuralPivots = (
	bricks: ReadonlyArray<PivotBrick>
): ReadonlyArray<StructuralPivotMarker> => {
	const out: StructuralPivotMarker[] = []
	let state = createStructuralPivotState()
	for (let i = 0; i < bricks.length; i++) {
		const r = stepStructuralPivot(bricks[i]!, i, state)
		state = r.state
		if (r.pivot) {
			out.push({
				brickIdx: i,
				peakBrickIdx: r.pivot.peakBrickIdx,
				type: r.pivot.type,
				price: r.pivot.price,
			})
		}
	}
	return out
}
