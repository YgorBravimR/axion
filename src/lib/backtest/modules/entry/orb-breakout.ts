import type { OrbEntryConfig, EntrySignal, DayContext } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

/**
 * Opening Range Breakout entry module.
 *
 * Faithfully replicates BRAVO_E_BREAKOUT_1C.pas logic:
 *
 * 1. Collect range (high/low) from candles within startTime → endTime window
 * 2. ignorarGaps: use body (open/close) instead of high/low for range collection
 * 3. After endTime: watch for close breaking above range high (long) or below range low (short)
 * 4. Only 1 entry per day (done_for_day phase after signal)
 *
 * Phases: waiting → forming_range → watching_breakout → done_for_day
 */

type OrbPhase = "waiting" | "forming_range" | "watching_breakout" | "done_for_day"

interface OrbState {
	phase: OrbPhase
	rangeHigh: number
	rangeLow: number
	rangeCandleCount: number
}

const HoraEntradaFim = 1630

const createInitialOrbState = (): OrbState => ({
	phase: "waiting",
	rangeHigh: -Infinity,
	rangeLow: Infinity,
	rangeCandleCount: 0,
})

/**
 * Process a single candle through the ORB state machine.
 * Called by the engine with the config passed directly (not via closure).
 */
const processOrbCandle = (
	candle: CandleRow,
	state: OrbState,
	ctx: DayContext,
	tickSize: number,
	config: OrbEntryConfig
): { state: OrbState; signal: EntrySignal | null } => {
	if (state.phase === "done_for_day") {
		return { state, signal: null }
	}

	// Phase: waiting → forming_range
	if (state.phase === "waiting" && ctx.brtHHMM >= config.startTime && ctx.brtHHMM < config.endTime) {
		return collectRange(candle, { ...state, phase: "forming_range" }, config)
	}

	// Phase: forming_range — continue collecting
	if (state.phase === "forming_range" && ctx.brtHHMM < config.endTime) {
		return collectRange(candle, state, config)
	}

	// Phase: forming_range → watching_breakout (first candle at/after endTime)
	if (state.phase === "forming_range" && ctx.brtHHMM >= config.endTime) {
		if (state.rangeCandleCount === 0 || state.rangeHigh === state.rangeLow) {
			return { state: { ...state, phase: "done_for_day" }, signal: null }
		}
		const watchingState: OrbState = { ...state, phase: "watching_breakout" }
		return checkBreakout(candle, watchingState, tickSize, config)
	}

	// Phase: watching_breakout
	if (state.phase === "watching_breakout") {
		if (ctx.brtHHMM >= HoraEntradaFim) {
			return { state: { ...state, phase: "done_for_day" }, signal: null }
		}
		return checkBreakout(candle, state, tickSize, config)
	}

	return { state, signal: null }
}

/** Collect range: accumulate highest high and lowest low within the time window. */
const collectRange = (
	candle: CandleRow,
	state: OrbState,
	config: OrbEntryConfig
): { state: OrbState; signal: null } => {
	let top: number
	let bottom: number

	if (config.ignorarGaps) {
		top = Math.max(candle.open, candle.close)
		bottom = Math.min(candle.open, candle.close)
	} else {
		top = candle.high
		bottom = candle.low
	}

	return {
		state: {
			...state,
			rangeHigh: Math.max(state.rangeHigh, top),
			rangeLow: Math.min(state.rangeLow, bottom),
			rangeCandleCount: state.rangeCandleCount + 1,
		},
		signal: null,
	}
}

/** Check if the current candle breaks above/below the range. */
const checkBreakout = (
	candle: CandleRow,
	state: OrbState,
	tickSize: number,
	config: OrbEntryConfig
): { state: OrbState; signal: EntrySignal | null } => {
	const buffer = config.ticksBuffer * tickSize
	const rangeWidth = state.rangeHigh - state.rangeLow

	if (candle.close > state.rangeHigh + buffer) {
		return {
			state: { ...state, phase: "done_for_day" },
			signal: {
				direction: "long",
				price: candle.close,
				rangeHigh: state.rangeHigh,
				rangeLow: state.rangeLow,
				rangeWidth,
				label: `ORB Long breakout (range ${state.rangeLow}-${state.rangeHigh})`,
			},
		}
	}

	if (candle.close < state.rangeLow - buffer) {
		return {
			state: { ...state, phase: "done_for_day" },
			signal: {
				direction: "short",
				price: candle.close,
				rangeHigh: state.rangeHigh,
				rangeLow: state.rangeLow,
				rangeWidth,
				label: `ORB Short breakout (range ${state.rangeLow}-${state.rangeHigh})`,
			},
		}
	}

	return { state, signal: null }
}

export { processOrbCandle, createInitialOrbState, type OrbState }
