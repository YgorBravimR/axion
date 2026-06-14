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
	// Both modes are simulated for every fire so the lab can toggle
	// between them without re-fetching. Spec §3 composition matrix:
	//   - `lifecycleConservative` = Mode 1 (static 3R target, no trail).
	//   - `lifecycleModerate` = Mode 2 (no target, trail activates at 3R,
	//     runs forever).
	// Phase E will add `lifecycleFibo` for Mode 3.
	lifecycleConservative: TradeLifecycle | null
	lifecycleModerate: TradeLifecycle | null
}

/**
 * Forward-simulated trade lifecycle for a single fire. Records the
 * key transition points so the lab UI can render breakeven moves,
 * trail activations, and exit markers on the chart.
 */
export interface TradeLifecycle {
	exitMode: "conservative" | "moderate" // Mode 1 + Mode 2 (Phase B + Phase D).
	// Breakeven event (when stop moved from initial to entry).
	beTriggered: boolean
	beBrickIndexInDay: number | null
	// Trail activation event (Mode 2 only — when net favor reached 3R and
	// a brick closed favorable). null in conservative mode and in moderate
	// mode when stopped/exited before reaching 3R.
	trailActivated: boolean
	trailActivationBrickIndexInDay: number | null
	// Exit event (the brick that closed the trade).
	exitBrickIndexInDay: number
	exitReason: "stop_initial" | "stop_be" | "stop_trail" | "target" | "eod"
	exitPrice: number
	// Stop / target at fire time. `target` is null for modes without a
	// take-profit (Mode 2 trail-only).
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
