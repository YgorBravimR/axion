import type {
	HawksTripleScreenConfig,
	EntrySignal,
	DayContext,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

/**
 * Hawks triple-screen entry module (v0.2 — corrected stop geometry).
 *
 * Entry conditions (all must be true):
 *   1. Bullish/bearish Renko brick (close > open / close < open)
 *   2. 60m EMA stack aligned: price > MME27_60m > MME55_60m (long) or reversed (short)
 *   3. 15m trend aligned: price > MME27_15m (long) or price < MME27_15m (short)
 *   4. MACD > 0 (long) or MACD < 0 (short)
 *
 * Stop: signal.stopReference = 2 * candle.open - candle.close
 *   Hawks methodology: stop fires when one Renko brick closes against the entry direction.
 *   Geometrically the distance from entry (= brick close) to that reversal-close level is
 *   "2 brick bodies" (1 body retrace + 1 body reversal). That is the Hawks definition of 1R.
 *   Formula: 1 brick body below the entry brick's open = candle.open - (candle.close - candle.open) = 2·open - close.
 *   Symmetric for short (open > close, formula yields a price above entry).
 *   The engine's stop module reads this via the fixed_points { points: 0 } escape hatch in initial-stops.ts:16.
 *
 * One entry per day maximum.
 */

interface HawksState {
	doneForDay: boolean
}

const createInitialHawksState = (): HawksState => ({
	doneForDay: false,
})

/**
 * Guard: throws if any required indicator key is absent from the first candle.
 * Called on the first candle each day to surface misconfigured CSV imports early.
 */
const guardIndicatorKeys = (
	candle: CandleRow,
	config: HawksTripleScreenConfig
): void => {
	const required = [
		config.ema27_60m_key,
		config.ema55_60m_key,
		config.ema27_15m_key,
		config.macd_key,
	]
	for (const key of required) {
		if (candle.indicators[key] === undefined) {
			throw new Error(
				`HawksTripleScreen: indicator "${key}" not found in candle data. ` +
					`Check requiredIndicators config and CSV import mappings.`
			)
		}
	}
}

const processHawksCandle = (
	candle: CandleRow,
	state: HawksState,
	ctx: DayContext,
	_tickSize: number,
	config: HawksTripleScreenConfig
): { state: HawksState; signal: EntrySignal | null } => {
	if (state.doneForDay) {
		return { state, signal: null }
	}

	if (ctx.brtHHMM < config.startTime || ctx.brtHHMM >= config.endTime) {
		return { state, signal: null }
	}

	// Validate on every first in-window candle of the day (cheap; catches missing imports)
	if (ctx.candleIndexInDay === 0 || ctx.brtHHMM === config.startTime) {
		guardIndicatorKeys(candle, config)
	}

	const ind = candle.indicators
	const mme27_60m = ind[config.ema27_60m_key]!
	const mme55_60m = ind[config.ema55_60m_key]!
	const mme27_15m = ind[config.ema27_15m_key]!
	const macd = ind[config.macd_key]!

	const bullishBrick = candle.close > candle.open
	const bearishBrick = candle.close < candle.open

	if (
		bullishBrick &&
		candle.close > mme27_60m &&
		mme27_60m > mme55_60m &&
		candle.close > mme27_15m &&
		macd > 0
	) {
		return {
			state: { doneForDay: true },
			signal: {
				direction: "long",
				price: candle.close,
				// Hawks 1R = 2 brick bodies: one body below the entry brick's open
				stopReference: 2 * candle.open - candle.close,
				label: `Hawks Long triple-screen @ ${ctx.brtHHMM}`,
			},
		}
	}

	if (
		bearishBrick &&
		candle.close < mme27_60m &&
		mme27_60m < mme55_60m &&
		candle.close < mme27_15m &&
		macd < 0
	) {
		return {
			state: { doneForDay: true },
			signal: {
				direction: "short",
				price: candle.close,
				// Symmetric for short: open > close, formula yields stop above entry
				stopReference: 2 * candle.open - candle.close,
				label: `Hawks Short triple-screen @ ${ctx.brtHHMM}`,
			},
		}
	}

	return { state, signal: null }
}

export { processHawksCandle, createInitialHawksState, type HawksState }
