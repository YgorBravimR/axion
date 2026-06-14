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
}

export interface StructuralPivot {
	type: "topo" | "fundo"
	price: number
}

export const createStructuralPivotState = (): StructuralPivotDetectorState => ({
	lastBrickWasBullish: null,
	priorExtremePrice: null,
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
 * `hawks-triple-screen.ts:464-493` exactly — bit-identical to v0.8.
 */
export const stepStructuralPivot = (
	brick: PivotBrick,
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
		if (next.priorExtremePrice !== null) {
			pivot = { type: "topo", price: next.priorExtremePrice }
		}
		next.priorExtremePrice = brick.low
	} else if (next.lastBrickWasBullish === false && isBullish) {
		next.lastBrickWasBullish = true
	} else if (next.lastBrickWasBullish === true && isBullish) {
		if (next.priorExtremePrice !== null) {
			pivot = { type: "fundo", price: next.priorExtremePrice }
		}
		next.priorExtremePrice = brick.high
	} else {
		// Init / doji passthrough.
		next.lastBrickWasBullish = isBullish
		next.priorExtremePrice = isBullish ? brick.high : brick.low
	}

	return { state: next, pivot }
}

export interface StructuralPivotMarker {
	brickIdx: number
	type: "topo" | "fundo"
	price: number
}

/**
 * Walk a full brick sequence once and return every pivot confirmation in
 * order, paired with the brick index at which the confirmation fired.
 *
 * For Indicator Lab review use — engine consumes `stepStructuralPivot` so it
 * can interleave with phase / anchor management. Both call paths share the
 * step function so the page is verifying the same logic that fires in
 * backtest.
 */
export const walkStructuralPivots = (
	bricks: ReadonlyArray<PivotBrick>
): ReadonlyArray<StructuralPivotMarker> => {
	const out: StructuralPivotMarker[] = []
	let state = createStructuralPivotState()
	for (let i = 0; i < bricks.length; i++) {
		const r = stepStructuralPivot(bricks[i]!, state)
		state = r.state
		if (r.pivot) {
			out.push({ brickIdx: i, type: r.pivot.type, price: r.pivot.price })
		}
	}
	return out
}
