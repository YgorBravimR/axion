import type { Direction, QualityTier } from "@/types/backtest"
import type { HtfWalkerState } from "@/lib/backtest/hawks-htf-walker"

/**
 * Per-brick raw indicator state for the cursor-reactive badge row in
 * the engine lab. These are NOT direction-relative — they describe
 * the indicator's own state at this brick. The lab UI computes
 * alignment-to-trade-direction at render time.
 *
 * The badge row exists so the user can scrub the chart and visually
 * see WHERE each signal flips: "between brick 42 and 43 MACD went
 * positive, structural pivot flipped to topo, VWAP crossed below".
 * Same scrubbing semantics as the /dev/hawks-isolation Group G
 * HH/LL badges, generalised to all engine inputs.
 */
export type MacdSign = "positive" | "negative" | "zero"
export type EmaSlope = "up" | "down" | "flat"
export type VwapSide = "above" | "below" | "at"
export type PivotBias = "topo" | "fundo" | null

/**
 * Per-brick trace row returned by the engine lab action.
 * Captures both the input state (gate, cooldown, trading window) and
 * the orchestrator's output decision for this brick.
 */
export interface EngineLabBrick {
	brickIndexInDay: number
	timestamp: string
	open: number
	high: number
	low: number
	close: number
	// Gate state from the HTF walker (before this brick's evaluation).
	gate60m: HtfWalkerState
	gate15m: HtfWalkerState
	// Was the brick inside the trading window (startTime ≤ HHMM < endTime)?
	inTradingWindow: boolean
	// Direction the 60m gate allowed at this brick, null if NO_SIGNAL.
	directionAllowed: Direction | null
	// Was the cooldown active at this brick?
	cooldownActive: boolean
	// Raw indicator state at this brick (NOT direction-relative). Drives
	// the cursor-reactive badge row in the lab so the user can see
	// where each signal flips.
	macdSign: MacdSign | null
	ema5mSlope: EmaSlope | null
	vwapSide: VwapSide | null
	// Structural pivot bias: state forward-filled from the last
	// confirmation. null = no pivot yet confirmed today.
	pivotBias: PivotBias
	// Last CONFIRMED 15m structural pivot prices forward-filled from
	// the HtfWalker. These are the anchors the fibo measured-move
	// target uses (spec §5). null when no pivot of that type has been
	// confirmed yet in the walk.
	lastTopo15m: number | null
	lastFundo15m: number | null
	// Orchestrator output:
	fired: boolean
	direction: Direction | null
	price: number | null
	stopReference: number | null
	label: string | null
	tier: QualityTier | null
	// Post-entry trade lifecycles, populated only when fired === true.
	// Every mode is simulated for every fire so the lab can toggle
	// between them without re-fetching. Spec §3 composition matrix:
	//   - `lifecycleConservative` = Mode 1 (static 3R target, no trail).
	//   - `lifecycleModerate` = Mode 2 (no target, trail activates at 3R,
	//     runs forever).
	//   - `lifecycleFibo*` = Mode 3a (T1/T2/T3 measured-move target, no
	//     trail) and Mode 3b (same + trail-after-3R composition).
	// Anchors captured at fire time so the lab can render the fib
	// overlay (T1/T2/T3 horizontal lines + dashed retracement peak)
	// without re-deriving them per render.
	lifecycleConservative: TradeLifecycle | null
	lifecycleModerate: TradeLifecycle | null
	lifecycleFiboT1: TradeLifecycle | null
	lifecycleFiboT2: TradeLifecycle | null
	lifecycleFiboT3: TradeLifecycle | null
	lifecycleFiboT1Trail: TradeLifecycle | null
	lifecycleFiboT2Trail: TradeLifecycle | null
	lifecycleFiboT3Trail: TradeLifecycle | null
	fiboAnchors: FiboAnchors | null
}

/**
 * Fibo measured-move anchors captured at fire time. Spec §5:
 *   - `retracementPeak` is the local high (SHORT) / low (LONG) of the
 *     corrective rally we're entering against, snapshotted at the fire
 *     brick.
 *   - `impulseStartPrice` / `impulseEndPrice` are the 15m structural
 *     pivots that bound the prior impulse leg.
 *   - `impulseSize = |impulseEndPrice - impulseStartPrice|`.
 *   - `t1` / `t2` / `t3` are the three projection prices at 76.4 / 100 /
 *     161.8% of impulse size, anchored at `retracementPeak`, signed by
 *     trade direction. null when no valid 15m pair was available at
 *     fire time (spec §5 "Insufficient 15m anchors" branch).
 */
export interface FiboAnchors {
	retracementPeak: number
	impulseStartPrice: number
	impulseEndPrice: number
	impulseSize: number
	t1: number
	t2: number
	t3: number
}

/**
 * Forward-simulated trade lifecycle for a single fire. Records the
 * key transition points so the lab UI can render breakeven moves,
 * trail activations, and exit markers on the chart.
 */
export type ExitMode =
	| "conservative"
	| "moderate"
	| "fibo_T1"
	| "fibo_T2"
	| "fibo_T3"
	| "fibo_T1_trail"
	| "fibo_T2_trail"
	| "fibo_T3_trail"

export interface TradeLifecycle {
	exitMode: ExitMode
	// Breakeven event (when stop moved from initial to entry).
	beTriggered: boolean
	beBrickIndexInDay: number | null
	// Trail activation event — populated when the mode has trail-after-3R
	// enabled (Moderate, Fibo+Trail) AND net favor reached 3R on a
	// favorable close. null otherwise.
	trailActivated: boolean
	trailActivationBrickIndexInDay: number | null
	// Exit event (the brick that closed the trade).
	exitBrickIndexInDay: number
	exitReason: "stop_initial" | "stop_be" | "stop_trail" | "target" | "eod"
	exitPrice: number
	// Stop / target at fire time. `target` is null for modes without a
	// take-profit (Mode 2 trail-only). For fibo modes target is the
	// selected T1/T2/T3 price.
	initialStop: number
	target: number | null
}

/**
 * Per-day 5m candle slim row used to render the Renko chart inside the
 * lab. Carries only the fields the chart needs — open/high/low/close +
 * a small selection of indicator values for overlays (HTF EMAs, 5m
 * EMAs, VWAP). Full per-brick decision context lives in `bricks` on
 * the same day payload — both arrays are aligned by index.
 */
export interface EngineLabCandle {
	timestamp: string
	open: number
	high: number
	low: number
	close: number
	indicators: Readonly<Record<string, number | null>>
}

export interface EngineLabDayPayload {
	dayKey: string
	bricks: EngineLabBrick[]
	candles: EngineLabCandle[]
}

export interface HawksEngineLabData {
	from: string
	to: string
	assetSymbol: string
	days: EngineLabDayPayload[]
	stats: {
		totalDays: number
		totalBricks: number
		totalFires: number
		bricksGateBull: number
		bricksGateBear: number
		bricksGateNoSignal: number
	}
}
