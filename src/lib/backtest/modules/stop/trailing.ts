import type { TrailingConfig, StopState } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

/**
 * Update trailing stop based on price movement.
 * Only moves the stop in favorable direction (ratchet — never moves backward).
 *
 * Future extension point: "indicator" type reads candle.indicators[key]
 * See docs/BACKTEST_ROADMAP.md v2 for indicator-based trailing.
 */
const updateTrailingStop = (
	candle: CandleRow,
	state: StopState,
	config: TrailingConfig
): number => {
	switch (config.type) {
		case "price_distance": {
			// Check activation threshold if configured
			if (config.activationPct !== undefined) {
				const pctRecovered = state.direction === "long"
					? (candle.high - state.entryPrice) / state.initialStopDistance * 100
					: (state.entryPrice - candle.low) / state.initialStopDistance * 100
				if (pctRecovered < config.activationPct) {
					return state.currentStopPrice
				}
			}

			// Update best price seen
			const bestPrice = state.direction === "long"
				? Math.max(state.bestPrice, candle.high)
				: Math.min(state.bestPrice, candle.low)

			// Trail: stop follows best price by fixed distance
			const trailingStop = state.direction === "long"
				? bestPrice - config.distance
				: bestPrice + config.distance

			// Ratchet: never move stop backward
			if (state.direction === "long") {
				return Math.max(state.currentStopPrice, trailingStop)
			}
			return Math.min(state.currentStopPrice, trailingStop)
		}
	}
}

export { updateTrailingStop }
