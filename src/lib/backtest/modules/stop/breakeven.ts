import type { BreakevenConfig, StopState } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

/**
 * Check if breakeven should trigger based on config.
 * Returns true if the stop should move to entry price.
 */
const shouldTriggerBreakeven = (
	candle: CandleRow,
	state: StopState,
	config: BreakevenConfig
): boolean => {
	if (state.breakevenTriggered) return false

	switch (config.type) {
		case "on_partial":
			return state.partialExitOccurred

		case "on_pct_risk": {
			// Trigger when price reaches X% of risk in favorable direction
			const threshold = state.initialStopDistance * (config.triggerPct / 100)
			if (state.direction === "long") {
				return candle.high >= state.entryPrice + threshold
			}
			return candle.low <= state.entryPrice - threshold
		}
	}
}

export { shouldTriggerBreakeven }
