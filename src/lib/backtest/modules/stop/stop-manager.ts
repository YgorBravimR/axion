import type { Direction, EntrySignal, StopConfig, StopState, StopResult, StopModule } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import { computeInitialStop, computeStopDistance } from "./initial-stops"
import { shouldTriggerBreakeven } from "./breakeven"
import { updateTrailingStop } from "./trailing"

/**
 * Stop module state machine.
 *
 * Phases: initial → breakeven → trailing
 * Each phase can be skipped if not configured.
 *
 * Matches the pattern from BRAVO_E_BREAKOUT_1C.pas:
 * - Phase 1: Fixed stop (initial)
 * - Phase 2: After partial/pctRisk threshold → move stop to entry (breakeven)
 * - Phase 3: After activation → trail price by distance (trailing)
 */
const createStopModule = (): StopModule => ({
	init: (
		entryPrice: number,
		direction: Direction,
		signal: EntrySignal,
		config: StopConfig,
		tickSize: number
	): StopState => {
		const stopPrice = computeInitialStop(entryPrice, direction, signal, config.initial, tickSize)
		const initialStopDistance = computeStopDistance(entryPrice, stopPrice)

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

		// Phase: trailing (only after breakeven or if no breakeven configured)
		if (config.trailing && updatedState.breakevenTriggered) {
			const trailingStop = updateTrailingStop(candle, updatedState, config.trailing)
			updatedState = {
				...updatedState,
				currentStopPrice: trailingStop,
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

		// Check if partial exit triggers breakeven
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
})

export { createStopModule }
