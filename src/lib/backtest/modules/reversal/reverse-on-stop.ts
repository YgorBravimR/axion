import type { ReverseOnStopConfig, ReversalState, ReversalResult } from "@/types/backtest"

/**
 * Reversal logic matching BRAVO_E_BREAKOUT_1C.pas behavior.
 *
 * Rules:
 * - Only reverse up to maxReversals per day
 * - If virarNoBE is false, block reversal when the exit was at breakeven
 * - "breakeven_stop" and "reverse_stop" exits are considered BE exits
 */
const checkReverseOnStop = (
	exitReason: string,
	state: ReversalState,
	config: ReverseOnStopConfig
): ReversalResult => {
	const isStopExit = exitReason === "stop" || exitReason === "reverse_stop"
	const isBreakevenExit = exitReason === "breakeven_stop"

	if (!isStopExit && !isBreakevenExit) {
		return { shouldReverse: false, state }
	}

	if (state.reversalsToday >= config.maxReversals) {
		return { shouldReverse: false, state }
	}

	if (isBreakevenExit && !config.virarNoBE) {
		return {
			shouldReverse: false,
			state: { ...state, lastExitWasBreakeven: true },
		}
	}

	return {
		shouldReverse: true,
		state: {
			reversalsToday: state.reversalsToday + 1,
			lastExitWasBreakeven: isBreakevenExit,
		},
	}
}

export { checkReverseOnStop }
