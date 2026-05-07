import type {
	Direction,
	EntrySignal,
	FixedLevelsTargetConfig,
	TargetState,
	TargetResult,
	DayContext,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

/**
 * Compute absolute target price from entry context and target level config.
 *
 * Strategy-agnostic modes:
 * - r_multiple: entry ± (stopDistance × value)
 * - pct_range: rangeBreakoutLevel ± (rangeWidth × value/100)
 * - pct_stop: entry ± (stopDistance × value/100)
 * - fixed_points: entry ± value
 */
const computeTargetPrice = (
	level: { value: number; mode: string },
	entryPrice: number,
	direction: Direction,
	signal: EntrySignal,
	stopDistance: number
): number => {
	const mult = direction === "long" ? 1 : -1

	switch (level.mode) {
		case "r_multiple":
			return entryPrice + stopDistance * level.value * mult
		case "pct_range": {
			const rangeBase =
				direction === "long"
					? (signal.rangeHigh ?? entryPrice)
					: (signal.rangeLow ?? entryPrice)
			return rangeBase + (signal.rangeWidth ?? 0) * (level.value / 100) * mult
		}
		case "pct_stop":
			return entryPrice + stopDistance * (level.value / 100) * mult
		case "fixed_points":
			return entryPrice + level.value * mult
		default:
			return entryPrice + stopDistance * level.value * mult
	}
}

/**
 * Initialize target state with computed absolute prices.
 */
const initFixedLevels = (
	entryPrice: number,
	direction: Direction,
	signal: EntrySignal,
	config: FixedLevelsTargetConfig,
	stopDistance: number
): TargetState => {
	const targetPrices = config.levels.map((level) =>
		computeTargetPrice(level, entryPrice, direction, signal, stopDistance)
	)

	return {
		levelsHit: config.levels.map(() => false),
		targetPrices,
	}
}

/**
 * Check if any target levels are hit on this candle.
 * Each level exits exitPct% of total position.
 * Also handles EOD forced exit.
 */
const onCandleFixedLevels = (
	candle: CandleRow,
	state: TargetState,
	config: FixedLevelsTargetConfig,
	direction: Direction,
	ctx: DayContext
): TargetResult => {
	const exits: TargetResult["exits"] = []
	const updatedLevelsHit = [...state.levelsHit]

	// Check EOD exit
	if (ctx.brtHHMM >= config.eodTime) {
		return {
			state: { ...state, levelsHit: updatedLevelsHit },
			exits: [{ price: candle.close, fraction: 1.0, reason: "eod" }],
		}
	}

	// Check each target level in order
	for (let i = 0; i < config.levels.length; i++) {
		if (updatedLevelsHit[i]) {
			continue
		}

		const targetPrice = state.targetPrices[i]
		const isHit =
			direction === "long"
				? candle.high >= targetPrice
				: candle.low <= targetPrice

		if (isHit) {
			updatedLevelsHit[i] = true
			exits.push({
				price: targetPrice,
				fraction: config.levels[i].exitPct / 100,
				reason: config.levels[i].label,
			})
		}
	}

	return {
		state: { ...state, levelsHit: updatedLevelsHit },
		exits,
	}
}

export { initFixedLevels, onCandleFixedLevels }
