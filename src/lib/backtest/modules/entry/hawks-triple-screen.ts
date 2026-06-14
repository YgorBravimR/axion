import type {
	HawksTripleScreenConfig,
	EntrySignal,
	DayContext,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import {
	createQualityContext,
	updateQualityContext,
	evaluateQuality,
	type QualityContext,
} from "./hawks-quality-rules"
import { getHawksIndicatorsAtCandle } from "../../hawks-indicators"
import {
	type HtfWalkerSnapshot,
	isHtfGateFavorable,
} from "../../hawks-htf-walker"
import {
	stepStructuralPivot,
	type StructuralPivotDetectorState,
} from "../../hawks-structural-pivots"

/**
 * Hawks triple-screen entry module (engine v0.8 — brick-wick retracement).
 *
 * Iteration log:
 *   - v0.3 waited for the TOPOS E FUNDOS indicator to mark TOPO MENOR. The
 *     indicator only paints a pivot after 2 confirming bricks form against
 *     the prior direction, so by the time it marks the lower-high the trade
 *     window is already past. That cost us T1/T3/T4 on 2026-05-13 — only T2
 *     (where the indicator had time to confirm before the bearish brick)
 *     fired.
 *   - v0.4 used the indicator only for the two anchor pivots (TOPO MAIOR,
 *     FUNDO) and detected the TOPO MENOR in real time: any bearish brick
 *     after FUNDO whose high < TOPO_MAIOR is a structural lower-high.
 *   - v0.7 replaces the indicator-painted pivot source entirely with structural
 *     detection: TOPO confirmed when 2 consecutive bearish bricks close after
 *     a bullish sequence (value = high of the last bullish brick); FUNDO
 *     confirmed when 2 consecutive bullish bricks close after a bearish
 *     sequence (value = low of the last bearish brick). This eliminates the
 *     dependency on the CSV-sourced `topos_fundos` column, which the Phase-5
 *     migration stopped writing post-2026-06-05.
 *   - v0.8 switches the retracement peak/trough tracker from brick close to
 *     brick high/low. The user's mental model counts the bounce by where the
 *     brick wick reached, not where it closed — a doji or partially-reversed
 *     brick that touched the level still contributes to the retracement. Cut
 *     `RETRACE_TOO_SHORT` misses from 58/140 (41%) to 14/94 (15%) on the
 *     20-day audit window; reproduction 34.7% → 55.9%.
 *
 * SHORT setup (mirrored for LONG):
 *   1. Engine detects TOPO_MAIOR via 2-brick structural confirmation.
 *   2. Engine detects FUNDO with (TOPO_MAIOR − FUNDO) ≥ 4 × brick.
 *   3. After FUNDO, track the max brick high (the running retracement peak).
 *   4. On every bearish brick whose `high < TOPO_MAIOR` AND
 *      `maxHighSinceFundo − FUNDO ≥ 2 × brick` AND the 15m/60m gate
 *      passes → fire SHORT at this brick's close. Stop = 1 brick against.
 *
 * Re-arm policy: after a fire, keep TOPO_MAIOR and clear FUNDO + retracement
 * peak; wait for the next FUNDO structural confirmation, then resume the
 * per-brick lower-high watch. TOPO_MAIOR only rolls forward when structural
 * confirmation paints a TOPO higher than the current anchor.
 */

type Phase =
	| "WAITING_TOPO_MAIOR" // pre-anchor: no TOPO MAIOR yet (and no FUNDO MAIOR yet either)
	| "WAVE_1_DOWN" // SHORT: have TOPO MAIOR, waiting for indicator FUNDO
	| "WAVE_2_UP" // SHORT: have TOPO MAIOR + FUNDO, watching every brick for the lower-high trigger
	| "WAVE_1_UP" // LONG: have FUNDO MAIOR, waiting for indicator TOPO
	| "WAVE_2_DOWN" // LONG: have FUNDO MAIOR + TOPO, watching every brick for the higher-low trigger

interface HawksState {
	doneForDay: boolean
	phase: Phase
	lastPivotPrice: number | null
	// SHORT anchors
	topoMaiorPrice: number | null
	fundoPrice: number | null
	maxHighSinceFundo: number | null
	// LONG anchors
	fundoMaiorPrice: number | null
	topoPrice: number | null
	minLowSinceTopo: number | null
	// Wave-1 invalidator (no 2 consecutive against-trend bricks within wave 1).
	consecutiveAgainstInWave1: number
	// Re-arm cooldown: brickIndex of the last fire. Used to require N bricks
	// between fires. null = no fire yet today.
	lastFireBrickIndex: number | null
	// Structural pivot detector state for 2-brick confirmation on 5m.
	// Track the last brick's direction and high/low to detect consecutive moves.
	lastBrickWasBullish: boolean | null // true = bullish (close > open), false = bearish
	priorExtremePrice: number | null // high of last bullish (for TOPO), low of last bearish (for FUNDO)
	// Carried across bricks for stateful quality rules (MACD slope, vol EMA).
	qualityContext: QualityContext
}

const createInitialHawksState = (): HawksState => ({
	doneForDay: false,
	phase: "WAITING_TOPO_MAIOR",
	lastPivotPrice: null,
	topoMaiorPrice: null,
	fundoPrice: null,
	maxHighSinceFundo: null,
	fundoMaiorPrice: null,
	topoPrice: null,
	minLowSinceTopo: null,
	consecutiveAgainstInWave1: 0,
	lastFireBrickIndex: null,
	lastBrickWasBullish: null,
	priorExtremePrice: null,
	qualityContext: createQualityContext(),
})

// Minimum bricks between fires. Prevents back-to-back micro-retrace re-fires
// when the engine stays armed after a fire (W2_UP / W2_DN).
const FIRE_COOLDOWN_BRICKS = 5

// Quality gates + tier scoring moved into ./hawks-quality-rules.ts. The
// evaluator returns { blocked, quality } given the current brick + state.
// Adding a new indicator means registering a rule there, not editing this
// state machine.

/**
 * Higher-TF hard gate. Two paths:
 *
 * - **Stateful walker path** (when `htfSnapshot` is provided AND
 *   `config.useStatefulHtfGate === true`): consults the precomputed
 *   methodology-correct BULL/BEAR/NO_SIGNAL state for the 15m and 60m
 *   walkers. Returns true iff BOTH walkers are on the favorable side for
 *   `direction`. Mixed/transition bricks carry prior state — the engine
 *   gets a stable signal across EMA flickers.
 *
 * - **Stateless path** (default): reads the 4 EMA inequalities on the
 *   current brick only. Returns true iff all 4 align AND both timeframes
 *   agree on `direction`. Any flicker → gate-off for this brick.
 *
 * The two paths are wire-compatible: same `(candle, config, direction) → boolean`
 * contract from the caller's perspective. The walker is opt-in so the v0.9
 * change can be A/B'd against the v0.8 baseline cleanly.
 */
const higherTfGate = (
	candle: CandleRow,
	config: HawksTripleScreenConfig,
	direction: "short" | "long",
	htfSnapshot: HtfWalkerSnapshot | null
): boolean => {
	if (config.useStatefulHtfGate === true && htfSnapshot !== null) {
		return isHtfGateFavorable(htfSnapshot, direction)
	}
	const i = candle.indicators
	const prev15Open = i[config.prev_15m_open_key]
	const prev15Close = i[config.prev_15m_close_key]
	const ema27_15 = i[config.ema27_15m_key]
	const ema55_15 = i[config.ema55_15m_key]
	const prev60Open = i[config.prev_60m_open_key]
	const prev60Close = i[config.prev_60m_close_key]
	const ema27_60 = i[config.ema27_60m_key]
	const ema55_60 = i[config.ema55_60m_key]
	if (
		typeof prev15Open !== "number" ||
		typeof prev15Close !== "number" ||
		typeof ema27_15 !== "number" ||
		typeof ema55_15 !== "number" ||
		typeof prev60Open !== "number" ||
		typeof prev60Close !== "number" ||
		typeof ema27_60 !== "number" ||
		typeof ema55_60 !== "number"
	) {
		return false
	}
	if (direction === "short") {
		const fifteen =
			prev15Open < ema27_15 &&
			prev15Open < ema55_15 &&
			prev15Close < ema27_15 &&
			prev15Close < ema55_15
		const sixty =
			prev60Open < ema27_60 &&
			prev60Open < ema55_60 &&
			prev60Close < ema27_60 &&
			prev60Close < ema55_60
		return fifteen && sixty
	} else {
		const fifteen =
			prev15Open > ema27_15 &&
			prev15Open > ema55_15 &&
			prev15Close > ema27_15 &&
			prev15Close > ema55_15
		const sixty =
			prev60Open > ema27_60 &&
			prev60Open > ema55_60 &&
			prev60Close > ema27_60 &&
			prev60Close > ema55_60
		return fifteen && sixty
	}
}

const processHawksCandle = (
	candle: CandleRow,
	state: HawksState,
	ctx: DayContext,
	tickSize: number,
	config: HawksTripleScreenConfig,
	htfSnapshot: HtfWalkerSnapshot | null = null
): { state: HawksState; signal: EntrySignal | null } => {
	// Cross-day continuity: keep the prior TOPO/FUNDO anchors and pivot
	// alternation, but clear the intraday retracement tracking so we don't
	// fire on the first brick of a new session using yesterday's mid-day
	// peak as `maxHighSinceFundo`. Also reset the structural detector.
	const dayBoundary = ctx.candleIndexInDay === 0
	const base: HawksState = dayBoundary
		? {
				...state,
				phase: "WAVE_1_DOWN",
				fundoPrice: null,
				maxHighSinceFundo: null,
				topoPrice: null,
				minLowSinceTopo: null,
				consecutiveAgainstInWave1: 0,
				lastFireBrickIndex: null,
				lastBrickWasBullish: null,
				priorExtremePrice: null,
			}
		: state

	if (ctx.brtHHMM < config.startTime || ctx.brtHHMM >= config.endTime) {
		return { state: base, signal: null }
	}

	const isBullish = candle.close > candle.open
	const isBearish = candle.close < candle.open
	// Dynamic brickSize from the brick's own body (= (R-1) × tickSize for
	// ProfitChart Renko-R notation). The preset's brickSize5mPoints is a
	// floor / fallback for doji bricks where close == open.
	const bodySize = Math.abs(candle.close - candle.open)
	const brickSize = bodySize > 0 ? bodySize : config.brickSize5mPoints

	// State-machine knobs — config overrides win, otherwise hardcoded defaults.
	const fireCooldown = config.fireCooldownBricks ?? FIRE_COOLDOWN_BRICKS
	const wave1Min = config.wave1MinBricks ?? 4
	const retracementMin = config.retracementMinBricks ?? 2

	// Update quality context (running MACD/vol EMA history) BEFORE any
	// fire check — so a fire's quality reflects pre-fire history.
	const next: HawksState = {
		...base,
		qualityContext: updateQualityContext(candle, base.qualityContext, config),
	}

	// ────────────────────────────────────────────────────────────────────
	// Fire check runs FIRST, using the state inherited from prior bricks.
	// This is critical for the user's rule: "ignore brick 16's own TOPO
	// marker; consider its HIGH." If we processed the pivot first, the
	// current brick's TOPO marker would update topoMaior to brick.high and
	// the descending-top check (brick.high < topoMaior) would never pass.
	// After the fire check, pivot processing updates anchors for the NEXT
	// brick.
	// ────────────────────────────────────────────────────────────────────

	// SHORT trigger — real-time TOPO MENOR detection.
	if (
		next.phase === "WAVE_2_UP" &&
		next.topoMaiorPrice !== null &&
		next.fundoPrice !== null
	) {
		// New-lower-low handling for stay-armed re-arm: after a previous
		// fire, the engine stays in WAVE_2_UP but won't re-fire until price
		// makes a NEW lower low extending wave 1 (a bearish close below the
		// current fundoPrice). When that happens, slide fundoPrice down to
		// the new low and reset the retracement tracker — this is "wave 1
		// extension" without needing the indicator's 2-brick lag.
		//
		// Hypothesis E (v0.8 attempt — see hawks-engine-v08 post-mortem)
		// tried removing this slide-down + requiring fresh structural FUNDO
		// before re-arming. Result: 20-day repro 55.9% → 44.9% (-11pp), extras
		// 169 → 107. The slide-down behavior matches how the user takes
		// cascading catalog trades; removing it kills real matches faster
		// than it kills extras. Kept the original behavior.
		if (
			next.lastFireBrickIndex !== null &&
			isBearish &&
			candle.close < next.fundoPrice
		) {
			next.fundoPrice = candle.close
			// Anchor the retracement peak at the brick HIGH; user reads
			// the retracement as the highest brick wick after fundo, not
			// the highest close.
			next.maxHighSinceFundo = candle.high
		}

		// Track retracement peak using brick HIGH. The user's mental model
		// counts the bounce by the brick wick high — a bullish or doji
		// brick that touched X after the fundo contributes X to the
		// retracement, regardless of where it closed.
		if (
			next.maxHighSinceFundo === null ||
			candle.high > next.maxHighSinceFundo
		) {
			next.maxHighSinceFundo = candle.high
		}

		const topoMaior = next.topoMaiorPrice
		const fundo = next.fundoPrice
		const peak = next.maxHighSinceFundo
		const wave1Pts = topoMaior - fundo
		const retracePts = peak - fundo
		const descendingHigh = candle.high < topoMaior
		const wave1Ok = wave1Pts >= wave1Min * brickSize
		const retraceOk = retracePts >= retracementMin * brickSize

		// Cooldown: enforce minimum bricks between fires.
		const cooldownOk =
			next.lastFireBrickIndex === null ||
			ctx.candleIndexInDay - next.lastFireBrickIndex >= fireCooldown

		const qShort = evaluateQuality(
			candle,
			"short",
			brickSize,
			config,
			next.qualityContext
		)

		if (
			isBearish &&
			descendingHigh &&
			wave1Ok &&
			retraceOk &&
			cooldownOk &&
			!qShort.blocked &&
			higherTfGate(candle, config, "short", htfSnapshot)
		) {
			// Fire. Stay armed (WAVE_2_UP) for the next setup. Anchor
			// fundoPrice + maxHighSinceFundo at the fire brick's close,
			// effectively starting a NEW wave 1 from here. Re-fire then
			// requires either: (a) price slides fundoPrice further down via
			// the new-lower-low handler above, then bounces 2 bricks, OR
			// (b) price simply bounces 2 bricks back up from this close.
			// Plus the cooldown guard. Keep TOPO MAIOR for wave1 continuity.
			const reset: HawksState = {
				...next,
				phase: "WAVE_2_UP",
				fundoPrice: candle.close,
				maxHighSinceFundo: candle.close,
				consecutiveAgainstInWave1: 0,
				lastFireBrickIndex: ctx.candleIndexInDay,
			}
			return {
				state: reset,
				signal: {
					direction: "short",
					price: candle.close,
					stopReference: 2 * candle.open - candle.close + tickSize,
					label: `Hawks SHORT structural @ ${ctx.brtHHMM}`,
					quality: qShort.quality,
					indicatorSnapshot: getHawksIndicatorsAtCandle(
						candle,
						"short",
						config
					),
				},
			}
		}
	}

	// ────────────────────────────────────────────────────────────────────
	// LONG trigger — mirrored: real-time FUNDO MENOR detection.
	// ────────────────────────────────────────────────────────────────────
	if (
		next.phase === "WAVE_2_DOWN" &&
		next.fundoMaiorPrice !== null &&
		next.topoPrice !== null
	) {
		// New-higher-high handling for stay-armed LONG re-arm (mirror of
		// SHORT slide-fundoPrice). After a previous fire, if a bullish close
		// exceeds topoPrice, slide topoPrice up and reset the trough tracker
		// at the brick LOW (mirror of SHORT's brick.high anchor).
		if (
			next.lastFireBrickIndex !== null &&
			isBullish &&
			candle.close > next.topoPrice
		) {
			next.topoPrice = candle.close
			next.minLowSinceTopo = candle.low
		}

		// Mirror of SHORT: track retracement trough using brick LOW.
		if (next.minLowSinceTopo === null || candle.low < next.minLowSinceTopo) {
			next.minLowSinceTopo = candle.low
		}

		const fundoMaior = next.fundoMaiorPrice
		const topo = next.topoPrice
		const trough = next.minLowSinceTopo
		const wave1Pts = topo - fundoMaior
		const retracePts = topo - trough
		const ascendingLow = candle.low > fundoMaior
		const wave1Ok = wave1Pts >= wave1Min * brickSize
		const retraceOk = retracePts >= retracementMin * brickSize

		const cooldownOk =
			next.lastFireBrickIndex === null ||
			ctx.candleIndexInDay - next.lastFireBrickIndex >= fireCooldown

		const qLong = evaluateQuality(
			candle,
			"long",
			brickSize,
			config,
			next.qualityContext
		)

		if (
			isBullish &&
			ascendingLow &&
			wave1Ok &&
			retraceOk &&
			cooldownOk &&
			!qLong.blocked &&
			higherTfGate(candle, config, "long", htfSnapshot)
		) {
			// Mirror of SHORT: anchor topoPrice + minLowSinceTopo at the
			// fire brick's close. Re-fire requires a new lower trough (via
			// slide-topoPrice when a higher high appears) plus the cooldown.
			const reset: HawksState = {
				...next,
				phase: "WAVE_2_DOWN",
				topoPrice: candle.close,
				minLowSinceTopo: candle.close,
				consecutiveAgainstInWave1: 0,
				lastFireBrickIndex: ctx.candleIndexInDay,
			}
			return {
				state: reset,
				signal: {
					direction: "long",
					price: candle.close,
					stopReference: 2 * candle.open - candle.close - tickSize,
					label: `Hawks LONG structural @ ${ctx.brtHHMM}`,
					quality: qLong.quality,
					indicatorSnapshot: getHawksIndicatorsAtCandle(candle, "long", config),
				},
			}
		}
	}

	// ────────────────────────────────────────────────────────────────────
	// Structural pivot detection — runs AFTER the fire checks.
	// Confirms TOPO when 2 consecutive bearish bricks close after bullish
	// sequence; FUNDO when 2 consecutive bullish bricks close after bearish
	// sequence. Each detection updates the corresponding anchor.
	//
	// Known imperfection (v0.8): on the FIRST two bricks of a session, when
	// both are bullish, the detector emits a "FUNDO" at brick 1's high. This
	// is structurally wrong — no bearish brick has confirmed a low — but a
	// cleaner streak-based detector was tried (commit history) and produced
	// a SMALL reproduction regression (55.9% → 55.1% on 20-day audit). The
	// spurious anchors evidently correlate with user-catalog LONG fires in
	// a way the structurally-correct detector does not, so the simpler /
	// buggier version is kept until we have data to explain why.
	// ────────────────────────────────────────────────────────────────────

	// Structural pivot detector — delegated to the shared step function in
	// `hawks-structural-pivots.ts` so the engine and the Indicator Lab review
	// tab consume bit-identical logic.
	const detectorState: StructuralPivotDetectorState = {
		lastBrickWasBullish: next.lastBrickWasBullish,
		priorExtremePrice: next.priorExtremePrice,
	}
	const detectorResult = stepStructuralPivot(candle, detectorState)
	next.lastBrickWasBullish = detectorResult.state.lastBrickWasBullish
	next.priorExtremePrice = detectorResult.state.priorExtremePrice
	const structuralPivot = detectorResult.pivot

	// Process structural pivot if detected.
	if (structuralPivot !== null) {
		const pivot = structuralPivot.price
		const prev = next.lastPivotPrice

		// Classify current pivot relative to previous (if available).
		const isTopoPivot = prev === null ? null : pivot > prev
		const isFundoPivot = prev === null ? null : pivot < prev
		next.lastPivotPrice = pivot

		if (structuralPivot.type === "topo" && isTopoPivot !== false) {
			// TOPO confirmation (and not lower than prior pivot, or first pivot).
			// SHORT anchor: always set topoMaior to the latest structural TOPO.
			// Clear fundo + retracement (fresh wave-1 starts now).
			next.topoMaiorPrice = pivot
			next.fundoPrice = null
			next.maxHighSinceFundo = null
			next.phase = "WAVE_1_DOWN"
			next.consecutiveAgainstInWave1 = 0
			// LONG side: this TOPO is the wave-1 endpoint if we have a
			// fundoMaiorPrice anchor.
			if (next.fundoMaiorPrice !== null) {
				next.topoPrice = pivot
				next.minLowSinceTopo = pivot
				next.phase = "WAVE_2_DOWN"
			}
		} else if (structuralPivot.type === "fundo" && isFundoPivot !== false) {
			// FUNDO confirmation (and not higher than prior pivot, or first pivot).
			// SHORT side: this FUNDO is the wave-1 endpoint.
			if (next.topoMaiorPrice !== null) {
				next.fundoPrice = pivot
				next.maxHighSinceFundo = pivot
				next.phase = "WAVE_2_UP"
			}
			// LONG anchor: always set fundoMaior to the latest structural FUNDO.
			// Clear topo + retracement.
			next.fundoMaiorPrice = pivot
			next.topoPrice = null
			next.minLowSinceTopo = null
			// Phase priority: if SHORT structure is armed (WAVE_2_UP), keep
			// it. Otherwise enter WAVE_1_UP for LONG.
			if (next.phase !== "WAVE_2_UP") {
				next.phase = "WAVE_1_UP"
				next.consecutiveAgainstInWave1 = 0
			}
		}
	}

	return { state: next, signal: null }
}

export { processHawksCandle, createInitialHawksState, type HawksState }
