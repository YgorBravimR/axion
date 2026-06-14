/**
 * Hawks structural pivot detector — extracted from `hawks-triple-screen.ts`.
 *
 * The methodology paints a TOPO when 2 consecutive bearish bricks close after
 * a bullish sequence (value = high of the last bullish brick), and a FUNDO
 * when 2 consecutive bullish bricks close after a bearish sequence (value =
 * low of the last bearish brick). This is the v0.7 structural replacement of
 * the CSV-sourced `topos_fundos` column (which stopped being populated after
 * the 2026-06-05 Phase-5 migration).
 *
 * **Known imperfection** kept on purpose (per `hawks-triple-screen.ts`
 * comment): on the FIRST two bricks of a session when both are bullish, the
 * detector emits a "FUNDO" at brick 1's high — structurally wrong (no
 * bearish brick has confirmed a low yet) but a cleaner streak-based detector
 * regressed 20-day reproduction 55.9% → 55.1%. The spurious anchor evidently
 * correlates with user-catalog LONG fires in a way the structurally-correct
 * detector does not.
 *
 * Both the entry engine and the Indicator Lab pivot review tab consume this
 * — single source of truth, no parallel implementations.
 */

export interface StructuralPivotDetectorState {
	// True = last brick was bullish (close > open), false = bearish, null = init.
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
	const isBullish = brick.close > brick.open
	const isBearish = brick.close < brick.open
	let pivot: StructuralPivot | null = null
	const next: StructuralPivotDetectorState = { ...state }

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
	} else {
		// Init / doji passthrough.
		next.lastBrickWasBullish = isBullish
		next.priorExtremePrice = isBullish ? brick.high : brick.low
		next.priorExtremeBrickIdx = brickIdx
	}

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
