import type {
	BreakevenConfig,
	StopState,
	StopTriggerMode,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

const shouldTriggerBreakeven = (
	candle: CandleRow,
	state: StopState,
	config: BreakevenConfig,
	triggerMode: StopTriggerMode = "intrabar"
): boolean => {
	if (state.breakevenTriggered) {
		return false
	}

	switch (config.type) {
		case "on_partial":
			return state.partialExitOccurred

		case "on_pct_risk": {
			// If the entry signal supplied an absolute BE reference, use it
			// directly. Otherwise fall back to a multiple of initial stop distance.
			const triggerPrice =
				state.breakevenReference !== undefined
					? state.breakevenReference
					: state.direction === "long"
						? state.entryPrice +
							state.initialStopDistance * (config.triggerPct / 100)
						: state.entryPrice -
							state.initialStopDistance * (config.triggerPct / 100)

			if (triggerMode === "brick_close") {
				const favorableClose =
					state.direction === "long"
						? candle.close > candle.open
						: candle.close < candle.open
				if (!favorableClose) {
					return false
				}
				return state.direction === "long"
					? candle.close >= triggerPrice
					: candle.close <= triggerPrice
			}
			return state.direction === "long"
				? candle.high >= triggerPrice
				: candle.low <= triggerPrice
		}
	}
}

export { shouldTriggerBreakeven }
