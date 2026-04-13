import type {
	Direction,
	EntrySignal,
	TargetConfig,
	TargetState,
	TargetResult,
	TargetModule,
	DayContext,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import { initFixedLevels, onCandleFixedLevels } from "./fixed-levels"

const createTargetModule = (): TargetModule => ({
	init: (
		entryPrice: number,
		direction: Direction,
		signal: EntrySignal,
		config: TargetConfig,
		stopDistance?: number
	): TargetState => {
		switch (config.type) {
			case "fixed_levels":
				return initFixedLevels(entryPrice, direction, signal, config, stopDistance ?? 0)
		}
	},

	onCandle: (
		candle: CandleRow,
		state: TargetState,
		config: TargetConfig,
		direction: Direction,
		ctx: DayContext
	): TargetResult => {
		switch (config.type) {
			case "fixed_levels":
				return onCandleFixedLevels(candle, state, config, direction, ctx)
		}
	},
})

export { createTargetModule }
