/**
 * @archived 2026-05 — DEZK strategy archived.
 *
 * AGENTS: do not extend or refactor this module. The MACD+WMA alignment
 * entry engine is no longer wired into the UI (backtest + optimize
 * selectors do not expose it). Engine code is preserved so existing
 * persisted recipes still execute, but the strategy is not a target for
 * sweep-leaf migration or further tuning. To revive, restore UI selectors
 * and JSX render branches per dezk-presets.ts header.
 */
import type { MACDWMAConfig, EntrySignal, DayContext } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import {
	createMACD,
	updateMACD,
	classifyMACDColor,
	type MACDState,
	createWMA,
	updateWMA,
	computeWMAFromSlice,
	type WMAState,
	createHighLowTracker,
	updateHighLowTracker,
	getHighest,
	getLowest,
	type HighLowTracker,
} from "./indicators"

/**
 * 10K (dezK) entry module — MACD + WMA alignment strategy.
 *
 * Faithfully replicates BRAVO_E_10k_v4.pas (Diego TAT mentorship):
 *
 * v4 sequence:
 *   1. MACD "turns" — 3 consecutive strong-color bars (no zero-cross required)
 *   2. WMA 9/21 align in same direction
 *   3. Entry on 2nd Renko candle after alignment
 *   4. Stop behind pivot point (lowest low / highest high of turn region) + buffer
 *
 * v3 differences (controlled by config):
 *   - requireZeroCross: true → MACD must cross zero before counting
 *   - candlesAfterAlignment: 0 → enter on same bar as setup
 *   - stopBufferPoints: 10 → tighter stop (1 Renko + buffer)
 *
 * Phases: idle → macd_turning → aligned → counting → done_for_day
 */

type DezkPhase =
	| "idle"
	| "macd_turning"
	| "aligned"
	| "counting"
	| "done_for_day"

interface DezkState {
	phase: DezkPhase
	// Indicator state (computed on-the-fly)
	macd: MACDState
	wmaFast: WMAState
	wmaSlow: WMAState
	highLow: HighLowTracker
	// MACD color tracking
	colorHistory: number[] // last 3 color classifications
	prevHistogram: number
	// Zero-cross tracking (v3: MACD must cross zero before a valid turn)
	zeroCrossed: boolean
	lastHistogramSign: number // sign of histogram on previous candle (1, -1, or 0)
	// Alignment tracking
	turnDirection: "long" | "short" | null
	candlesAfterAlignment: number
	// Candle direction (Renko: close === high = bullish, close === low = bearish)
	isBullish: boolean
	isBearish: boolean
}

const createInitialDezkState = (config: MACDWMAConfig): DezkState => ({
	phase: "idle",
	macd: createMACD(config.macdFast, config.macdSlow, config.macdSignal),
	wmaFast: createWMA(config.wmaFast),
	wmaSlow: createWMA(config.wmaSlow),
	highLow: createHighLowTracker(4), // 3 strong bars + 1 before
	colorHistory: [],
	prevHistogram: 0,
	zeroCrossed: false,
	lastHistogramSign: 0,
	turnDirection: null,
	candlesAfterAlignment: 0,
	isBullish: false,
	isBearish: false,
})

/**
 * Process a single candle through the 10K state machine.
 */
const processDezkCandle = (
	candle: CandleRow,
	state: DezkState,
	ctx: DayContext,
	_tickSize: number,
	config: MACDWMAConfig
): { state: DezkState; signal: EntrySignal | null } => {
	if (state.phase === "done_for_day") {
		// Still update indicators for warmup even when done
		return { state: updateIndicators(state, candle, config), signal: null }
	}

	// Update all indicators
	let updated = updateIndicators(state, candle, config)

	// Time gate
	if (ctx.brtHHMM < config.startTime || ctx.brtHHMM >= config.endTime) {
		return { state: updated, signal: null }
	}

	// Renko candle direction
	updated = {
		...updated,
		isBullish: candle.close === candle.high,
		isBearish: candle.close === candle.low,
	}

	// Classify current MACD color
	const currentColor = classifyMACDColor(
		updated.macd.histogram,
		updated.prevHistogram
	)
	const colorHistory = [...updated.colorHistory, currentColor].slice(-3)
	updated = { ...updated, colorHistory }

	// Get WMA values (already updated by updateIndicators above)
	const wmaFastVal =
		updated.wmaFast.buffer.length >= updated.wmaFast.period
			? computeWMAFromSlice(updated.wmaFast.buffer)
			: candle.close
	const wmaSlowVal =
		updated.wmaSlow.buffer.length >= updated.wmaSlow.period
			? computeWMAFromSlice(updated.wmaSlow.buffer)
			: candle.close

	// ── Zero-cross tracking (v3: histogram must cross zero before a valid turn) ──

	const currentSign = Math.sign(updated.macd.histogram)
	let zeroCrossed = updated.zeroCrossed

	if (config.requireZeroCross) {
		// Detect zero crossing: sign changed from previous candle (non-zero → different non-zero, or through zero)
		if (
			updated.lastHistogramSign !== 0 &&
			currentSign !== 0 &&
			currentSign !== updated.lastHistogramSign
		) {
			zeroCrossed = true
		}
		// Also count transition through zero (sign was non-zero, now is zero, or was zero and now non-zero)
		if (updated.lastHistogramSign !== 0 && currentSign === 0) {
			zeroCrossed = true
		}
	}

	updated = {
		...updated,
		zeroCrossed,
		lastHistogramSign:
			currentSign !== 0 ? currentSign : updated.lastHistogramSign,
	}

	// ── Step 1+2: Detect MACD "turn" — 3 consecutive strong bars ──

	const hasBuyTurn =
		colorHistory.length >= 3 &&
		colorHistory[0] === 1 &&
		colorHistory[1] === 1 &&
		colorHistory[2] === 1

	const hasSellTurn =
		colorHistory.length >= 3 &&
		colorHistory[0] === -1 &&
		colorHistory[1] === -1 &&
		colorHistory[2] === -1

	// v3 mode: skip turn if zero-cross hasn't happened yet
	if (config.requireZeroCross && !updated.zeroCrossed) {
		return { state: updated, signal: null }
	}

	// ── Step 3: WMA 9/21 alignment ──

	const wmaAlignedBuy = wmaFastVal > wmaSlowVal
	const wmaAlignedSell = wmaFastVal < wmaSlowVal

	// ── Combined alignment check ──

	const buyAligned = hasBuyTurn && wmaAlignedBuy && updated.isBullish
	const sellAligned = hasSellTurn && wmaAlignedSell && updated.isBearish

	if (buyAligned || sellAligned) {
		const direction = buyAligned ? ("long" as const) : ("short" as const)

		if (updated.phase !== "aligned" && updated.phase !== "counting") {
			// First candle of alignment
			if (config.candlesAfterAlignment === 0) {
				// v3 mode: enter immediately
				return emitSignal(updated, candle, direction, config)
			}
			updated = {
				...updated,
				phase: "aligned",
				turnDirection: direction,
				candlesAfterAlignment: 1,
			}
			return { state: updated, signal: null }
		}

		if (updated.phase === "aligned" || updated.phase === "counting") {
			const newCount = updated.candlesAfterAlignment + 1
			if (newCount >= config.candlesAfterAlignment) {
				// Entry fires on Nth candle after alignment
				return emitSignal(updated, candle, direction, config)
			}
			updated = {
				...updated,
				phase: "counting",
				candlesAfterAlignment: newCount,
			}
			return { state: updated, signal: null }
		}
	} else {
		// Alignment broken — reset if we were counting
		if (updated.phase === "aligned" || updated.phase === "counting") {
			updated = {
				...updated,
				phase: "idle",
				turnDirection: null,
				candlesAfterAlignment: 0,
			}
		}
	}

	return { state: updated, signal: null }
}

/** Update all running indicator states with the new candle. */
const updateIndicators = (
	state: DezkState,
	candle: CandleRow,
	config: MACDWMAConfig
): DezkState => {
	const prevHistogram = state.macd.histogram
	const macd = updateMACD(
		state.macd,
		candle.close,
		config.macdFast,
		config.macdSlow,
		config.macdSignal
	)
	const wmaFastResult = updateWMA(state.wmaFast, candle.close)
	const wmaSlowResult = updateWMA(state.wmaSlow, candle.close)
	const highLow = updateHighLowTracker(state.highLow, candle.high, candle.low)

	return {
		...state,
		macd,
		wmaFast: wmaFastResult.state,
		wmaSlow: wmaSlowResult.state,
		highLow,
		prevHistogram,
	}
}

/** Emit an entry signal with pre-computed stop reference. */
const emitSignal = (
	state: DezkState,
	candle: CandleRow,
	direction: "long" | "short",
	config: MACDWMAConfig
): { state: DezkState; signal: EntrySignal } => {
	// Stop: behind pivot point of the turn region + buffer
	// Buy: lowest low of last 4 bars - buffer
	// Sell: highest high of last 4 bars + buffer
	const stopReference =
		direction === "long"
			? getLowest(state.highLow) - config.stopBufferPoints
			: getHighest(state.highLow) + config.stopBufferPoints

	return {
		state: { ...state, phase: "done_for_day" },
		signal: {
			direction,
			price: candle.close,
			stopReference,
			label: `10K ${direction} (MACD+WMA alignment)`,
		},
	}
}

/**
 * Reset strategy state machine for a new day while preserving indicator warmup.
 *
 * MACD (12/26/15) and WMA (9/21) need 26+ candles to stabilize.
 * Unlike ORB (which only looks at the current day's range), indicator-based
 * strategies must accumulate state across days. Only the entry logic resets.
 */
const resetDezkForNewDay = (state: DezkState): DezkState => ({
	...state,
	phase: "idle",
	colorHistory: [],
	zeroCrossed: false,
	// Preserve lastHistogramSign so zero-cross detection works across day boundaries
	turnDirection: null,
	candlesAfterAlignment: 0,
	isBullish: false,
	isBearish: false,
	// Indicator state (macd, wmaFast, wmaSlow, highLow, prevHistogram) is preserved
})

export {
	processDezkCandle,
	createInitialDezkState,
	resetDezkForNewDay,
	type DezkState,
}
