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
	// If the entry module pre-computed a stop reference and config is fixed_points with 0,
	// use the reference directly (e.g., 10K strategy computes stop behind pivot)
	if (signal.stopReference !== undefined && config.type === "fixed_points" && config.points === 0) {
		return signal.stopReference
	}

	const mult = direction === "long" ? -1 : 1

	switch (config.type) {
		case "pct_range": {
			const distance = (signal.rangeWidth ?? 0) * (config.pct / 100)
			return entryPrice + distance * mult
		}
		case "fixed_points": {
			return entryPrice + config.points * mult
		}
		case "full_range": {
			const buffer = config.ticksBuffer * tickSize
			if (direction === "long") {
				return (signal.rangeLow ?? entryPrice) - buffer
			}
			return (signal.rangeHigh ?? entryPrice) + buffer
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
