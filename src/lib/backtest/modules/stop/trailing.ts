import type { TrailingConfig, StopState } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import { createWMA, updateWMA, getWMAWithOffset, type WMAState } from "../entry/indicators"

/**
 * Trailing stop state — maintained by the stop manager across candles.
 * Holds WMA buffer for indicator-based trailing.
 */
interface TrailingModuleState {
	wma: WMAState | null
}

const createTrailingModuleState = (config: TrailingConfig | undefined): TrailingModuleState => ({
	wma: config?.type === "indicator" ? createWMA(config.wmaPeriod) : null,
})

/**
 * Update trailing stop based on configuration.
 *
 * - price_distance: trail by fixed N points behind best price
 * - indicator: trail behind WMA value (Diego TAT 10K style)
 *   Exit when close crosses WMA unfavorably. Ratchet mechanics apply.
 */
const updateTrailingStop = (
	candle: CandleRow,
	state: StopState,
	config: TrailingConfig,
	trailingState: TrailingModuleState
): { stopPrice: number; trailingState: TrailingModuleState } => {
	switch (config.type) {
		case "price_distance": {
			if (config.activationPct !== undefined) {
				const pctRecovered = state.direction === "long"
					? (candle.high - state.entryPrice) / state.initialStopDistance * 100
					: (state.entryPrice - candle.low) / state.initialStopDistance * 100
				if (pctRecovered < config.activationPct) {
					return { stopPrice: state.currentStopPrice, trailingState }
				}
			}

			const bestPrice = state.direction === "long"
				? Math.max(state.bestPrice, candle.high)
				: Math.min(state.bestPrice, candle.low)

			const trailingStop = state.direction === "long"
				? bestPrice - config.distance
				: bestPrice + config.distance

			const stopPrice = state.direction === "long"
				? Math.max(state.currentStopPrice, trailingStop)
				: Math.min(state.currentStopPrice, trailingStop)

			return { stopPrice, trailingState }
		}

		case "indicator": {
			// Update WMA with current close
			if (!trailingState.wma) {
				return { stopPrice: state.currentStopPrice, trailingState }
			}

			const wmaResult = updateWMA(trailingState.wma, candle.close)
			const updatedTrailingState = { ...trailingState, wma: wmaResult.state }

			// Get WMA with offset (e.g., offset=1 → previous bar's WMA)
			const wmaValue = config.offset > 0
				? getWMAWithOffset(wmaResult.state, config.offset)
				: wmaResult.value

			if (wmaValue === null) {
				return { stopPrice: state.currentStopPrice, trailingState: updatedTrailingState }
			}

			// Trailing stop = WMA value (ratchet: never move backward)
			const stopPrice = state.direction === "long"
				? Math.max(state.currentStopPrice, wmaValue)
				: Math.min(state.currentStopPrice, wmaValue)

			return { stopPrice, trailingState: updatedTrailingState }
		}
	}
}

export { updateTrailingStop, createTrailingModuleState, type TrailingModuleState }
