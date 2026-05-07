import type { Direction, Position } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

/**
 * Intra-candle price traversal heuristic.
 *
 * Determines the order in which high and low were hit within a single OHLC bar.
 * This matters when both stop and target could trigger in the same candle.
 *
 * Heuristic:
 * - Bullish (close >= open): price went open → low → high → close
 * - Bearish (close < open): price went open → high → low → close
 * - Doji (close === open): assume "stop first" (conservative — worst case for trader)
 *
 * Returns "low_first" or "high_first".
 */
const getCandleTraversalOrder = (
	candle: CandleRow
): "low_first" | "high_first" => {
	if (candle.close >= candle.open) {
		return "low_first"
	} // bullish: low came first
	return "high_first" // bearish: high came first
}

interface HitCheckResult {
	stopHit: boolean
	targetHit: boolean
	stopHitFirst: boolean
}

/**
 * Check if stop and/or target are hit within a candle, and determine priority.
 *
 * For a long position:
 * - Stop hit when candle.low <= stopPrice
 * - Target hit when candle.high >= targetPrice
 *
 * For a short position:
 * - Stop hit when candle.high >= stopPrice
 * - Target hit when candle.low <= targetPrice
 *
 * When both trigger in the same candle, the traversal order determines which fires first.
 */
const checkHits = (
	candle: CandleRow,
	stopPrice: number,
	targetPrice: number | null,
	direction: Direction
): HitCheckResult => {
	const stopHit =
		direction === "long" ? candle.low <= stopPrice : candle.high >= stopPrice

	const targetHit =
		targetPrice !== null &&
		(direction === "long"
			? candle.high >= targetPrice
			: candle.low <= targetPrice)

	if (stopHit && targetHit) {
		const traversal = getCandleTraversalOrder(candle)

		// For long: stop is on the low side, target on the high side
		// "low_first" means stop hit first for long
		const stopHitFirst =
			direction === "long"
				? traversal === "low_first"
				: traversal === "high_first"

		return { stopHit, targetHit, stopHitFirst }
	}

	return { stopHit, targetHit, stopHitFirst: stopHit }
}

/**
 * Apply slippage to a fill price.
 * Always worsens the trader's fill:
 * - Long entry / short stop exit: price increases
 * - Short entry / long stop exit: price decreases
 */
const applySlippage = (
	price: number,
	direction: Direction,
	isEntry: boolean,
	slippageTicks: number,
	tickSize: number
): number => {
	if (slippageTicks === 0) {
		return price
	}

	const slippagePoints = slippageTicks * tickSize

	// Worsening direction depends on entry vs exit and direction
	if (isEntry) {
		return direction === "long"
			? price + slippagePoints
			: price - slippagePoints
	}
	// Exit: opposite — long stop fills lower, short stop fills higher
	return direction === "long" ? price - slippagePoints : price + slippagePoints
}

/**
 * Calculate P&L in cents for a completed trade.
 */
const calculatePnlCents = (
	entryPrice: number,
	exitPrice: number,
	direction: Direction,
	contracts: number,
	valuePerPointCents: number
): number => {
	const directionMultiplier = direction === "long" ? 1 : -1
	const pnlPoints = (exitPrice - entryPrice) * directionMultiplier
	return Math.round(pnlPoints * contracts * valuePerPointCents)
}

/**
 * Get the next target price for a position (the first unhit target level).
 */
const getNextTargetPrice = (position: Position): number | null => {
	for (let i = 0; i < position.targetState.targetPrices.length; i++) {
		if (!position.targetState.levelsHit[i]) {
			return position.targetState.targetPrices[i]
		}
	}
	return null
}

export {
	getCandleTraversalOrder,
	checkHits,
	applySlippage,
	calculatePnlCents,
	getNextTargetPrice,
	type HitCheckResult,
}
