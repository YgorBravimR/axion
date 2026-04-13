import type { Direction, EntrySignal, InitialStopConfig } from "@/types/backtest"

/**
 * Compute initial stop price from entry context and config.
 * Returns the absolute stop price.
 */
const computeInitialStop = (
	entryPrice: number,
	direction: Direction,
	signal: EntrySignal,
	config: InitialStopConfig,
	tickSize: number
): number => {
	const mult = direction === "long" ? -1 : 1

	switch (config.type) {
		case "pct_range": {
			const distance = signal.rangeWidth * (config.pct / 100)
			return entryPrice + distance * mult
		}
		case "fixed_points": {
			return entryPrice + config.points * mult
		}
		case "full_range": {
			// Stop at opposite end of range + buffer
			const buffer = config.ticksBuffer * tickSize
			if (direction === "long") {
				return signal.rangeLow - buffer
			}
			return signal.rangeHigh + buffer
		}
	}
}

/**
 * Compute the absolute distance between entry and stop (always positive).
 */
const computeStopDistance = (entryPrice: number, stopPrice: number): number => {
	return Math.abs(entryPrice - stopPrice)
}

export { computeInitialStop, computeStopDistance }
