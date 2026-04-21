import type { Direction, EntrySignal, StopConfig, StopState, StopResult, StopModule } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import { computeInitialStop, computeStopDistance } from "./initial-stops"
import { shouldTriggerBreakeven } from "./breakeven"
import { updateTrailingStop, createTrailingModuleState, type TrailingModuleState } from "./trailing"

/**
 * Stop module state machine.
 *
 * Phases: initial → breakeven → trailing
 * Each phase can be skipped if not configured.
 *
 * The trailing module state (WMA buffer for indicator trailing) is maintained
 * separately via closure — it doesn't pollute the shared StopState type.
 */
const createStopModule = () => {
	// Trailing-specific state (WMA buffer, etc.) — persists across candles per position
	let trailingModState: TrailingModuleState = { wma: null }

	const mod: StopModule = {
		init: (
			entryPrice: number,
			direction: Direction,
			signal: EntrySignal,
			config: StopConfig,
			tickSize: number
		): StopState => {
			const stopPrice = computeInitialStop(entryPrice, direction, signal, config.initial, tickSize)
			const initialStopDistance = computeStopDistance(entryPrice, stopPrice)

			// Initialize trailing module state for this position
			trailingModState = createTrailingModuleState(config.trailing)

			return {
				phase: "initial",
				currentStopPrice: stopPrice,
				entryPrice,
				direction,
				initialStopDistance,
				bestPrice: entryPrice,
				breakevenTriggered: false,
				partialExitOccurred: false,
			}
		},

		onCandle: (candle: CandleRow, state: StopState, config: StopConfig): StopResult => {
			let updatedState = { ...state }

			// Update best price for trailing calculation
			updatedState.bestPrice = state.direction === "long"
				? Math.max(state.bestPrice, candle.high)
				: Math.min(state.bestPrice, candle.low)

			// Always feed candle to trailing WMA even before BE (warmup)
			if (config.trailing?.type === "indicator" && trailingModState.wma) {
				const warmup = updateTrailingStop(candle, updatedState, config.trailing, trailingModState)
				trailingModState = warmup.trailingState
			}

			// Phase transitions: check breakeven
			if (!updatedState.breakevenTriggered && config.breakeven) {
				if (shouldTriggerBreakeven(candle, updatedState, config.breakeven)) {
					updatedState = {
						...updatedState,
						breakevenTriggered: true,
						currentStopPrice: updatedState.entryPrice,
						phase: config.trailing ? "trailing" : "breakeven",
					}
				}
			}

			// Phase: trailing (only after breakeven)
			if (config.trailing && updatedState.breakevenTriggered) {
				const trailResult = updateTrailingStop(candle, updatedState, config.trailing, trailingModState)
				trailingModState = trailResult.trailingState
				updatedState = {
					...updatedState,
					currentStopPrice: trailResult.stopPrice,
					phase: "trailing",
				}
			}

			// Check if stop is hit
			const isHit = state.direction === "long"
				? candle.low <= updatedState.currentStopPrice
				: candle.high >= updatedState.currentStopPrice

			return {
				state: updatedState,
				currentStopPrice: updatedState.currentStopPrice,
				isHit,
				hitPrice: isHit ? updatedState.currentStopPrice : null,
			}
		},

		notifyPartialExit: (state: StopState, config: StopConfig): StopState => {
			const updated = { ...state, partialExitOccurred: true }

			if (!updated.breakevenTriggered && config.breakeven?.type === "on_partial") {
				return {
					...updated,
					breakevenTriggered: true,
					currentStopPrice: updated.entryPrice,
					phase: config.trailing ? "trailing" : "breakeven",
				}
			}

			return updated
		},
	}

	return mod
}

export { createStopModule }
