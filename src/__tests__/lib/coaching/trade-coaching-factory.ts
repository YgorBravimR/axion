/**
 * Test fixture factory for `TradeForCoaching`.
 *
 * Produces the superset trade shape consumed by all pattern detectors.
 * PnL and fees are stored as integer cents (as they are in the database),
 * matching the contract expected by `fromCents()` inside the detectors.
 *
 * Time defaults to 10:00 BRT on Monday 2026-01-05 (a known Monday in BRT,
 * confirmed by `getBrtTimeParts` returning dayOfWeek=1, hour=10).
 */

import type { TradeForCoaching } from "@/lib/coaching/pattern-detector"
import type { OverallStats } from "@/types"

// ============================================================================
// TRADE FACTORY
// ============================================================================

interface CoachingTradeOverrides {
	entryDate?: Date
	exitDate?: Date | null
	pnl?: number | string | null
	outcome?: "win" | "loss" | "breakeven" | null
	realizedRMultiple?: string | null
	asset?: string
	direction?: "long" | "short"
	strategyName?: string | null
	setupRank?: "A" | "AA" | "AAA" | null
	rating?: "A" | "B" | "C" | "D" | "F" | null
	followedPlan?: boolean | null
	commission?: number | string | null
	fees?: number | string | null
}

/**
 * Default base trade entry date: 2026-01-05 10:00 BRT (Monday, hour=10).
 * The explicit -03:00 offset anchors the hour to BRT regardless of the
 * test runner's local timezone.
 */
const DEFAULT_ENTRY_DATE = new Date("2026-01-05T10:00:00-03:00")

/**
 * Default exit date: 30 minutes after entry (medium hold: 15-60 min bucket).
 */
const DEFAULT_EXIT_DATE = new Date("2026-01-05T10:30:00-03:00")

/**
 * Creates a single `TradeForCoaching` with sensible defaults.
 *
 * Default outcome is "win" with +1.0R realized, pnl of 10000 cents (R$100),
 * negligible fees, no strategy name, no rating, and followedPlan=null.
 * Override any field via the `overrides` argument.
 *
 * @param overrides - Fields to override on the default trade
 * @returns A fully typed `TradeForCoaching` object
 */
const createCoachingTrade = (overrides: CoachingTradeOverrides = {}): TradeForCoaching => ({
	entryDate: overrides.entryDate ?? DEFAULT_ENTRY_DATE,
	exitDate: overrides.exitDate !== undefined ? overrides.exitDate : DEFAULT_EXIT_DATE,
	pnl: overrides.pnl !== undefined ? overrides.pnl : 10000, // 10000 cents = R$100 win
	outcome: overrides.outcome !== undefined ? overrides.outcome : "win",
	realizedRMultiple: overrides.realizedRMultiple !== undefined ? overrides.realizedRMultiple : "1",
	asset: overrides.asset ?? "WINFUT",
	direction: overrides.direction ?? "long",
	strategyName: overrides.strategyName !== undefined ? overrides.strategyName : null,
	setupRank: overrides.setupRank !== undefined ? overrides.setupRank : null,
	rating: overrides.rating !== undefined ? overrides.rating : null,
	followedPlan: overrides.followedPlan !== undefined ? overrides.followedPlan : null,
	commission: overrides.commission !== undefined ? overrides.commission : 50,   // 50 cents
	fees: overrides.fees !== undefined ? overrides.fees : 10,                     // 10 cents
})

/**
 * Creates a win trade with a positive PnL.
 *
 * @param overrides - Optional field overrides
 */
const createWinTrade = (overrides: CoachingTradeOverrides = {}): TradeForCoaching =>
	createCoachingTrade({
		outcome: "win",
		pnl: 10000,
		realizedRMultiple: "1",
		...overrides,
	})

/**
 * Creates a loss trade with a negative PnL.
 *
 * @param overrides - Optional field overrides
 */
const createLossTrade = (overrides: CoachingTradeOverrides = {}): TradeForCoaching =>
	createCoachingTrade({
		outcome: "loss",
		pnl: -10000,
		realizedRMultiple: "-1",
		...overrides,
	})

/**
 * Creates a breakeven trade with zero PnL.
 *
 * @param overrides - Optional field overrides
 */
const createBreakevenTrade = (overrides: CoachingTradeOverrides = {}): TradeForCoaching =>
	createCoachingTrade({
		outcome: "breakeven",
		pnl: 0,
		realizedRMultiple: "0",
		...overrides,
	})

/**
 * Builds an array of trades by repeating win/loss in the given pattern.
 * Each trade receives an entry date offset by `minutesBetween` minutes
 * from the base date, so they all land on the same day and hour by default.
 *
 * @param pattern - Array of "win" | "loss" outcomes
 * @param baseDate - Entry date of the first trade
 * @param minutesBetween - Minutes between consecutive trades (default 1)
 */
const createTradeSequence = (
	pattern: Array<"win" | "loss" | "breakeven">,
	baseDate: Date = DEFAULT_ENTRY_DATE,
	minutesBetween = 1
): TradeForCoaching[] =>
	pattern.map((outcome, index) => {
		const entryDate = new Date(baseDate.getTime() + index * minutesBetween * 60_000)
		const exitDate = new Date(entryDate.getTime() + 30 * 60_000)
		if (outcome === "win") return createWinTrade({ entryDate, exitDate })
		if (outcome === "loss") return createLossTrade({ entryDate, exitDate })
		return createBreakevenTrade({ entryDate, exitDate })
	})

// ============================================================================
// OVERALLSTATS FACTORY
// ============================================================================

interface OverallStatsOverrides {
	grossPnl?: number
	netPnl?: number
	totalFees?: number
	winRate?: number
	profitFactor?: number
	averageR?: number
	totalTrades?: number
	winCount?: number
	lossCount?: number
	breakevenCount?: number
	avgWin?: number
	avgLoss?: number
}

/**
 * Creates a mock `OverallStats` object for prompt-builder tests.
 *
 * Defaults represent a moderately profitable trader with 55% win rate.
 *
 * @param overrides - Optional field overrides
 */
const createOverallStats = (overrides: OverallStatsOverrides = {}): OverallStats => ({
	grossPnl: overrides.grossPnl ?? 5000,
	netPnl: overrides.netPnl ?? 4500,
	totalFees: overrides.totalFees ?? 500,
	winRate: overrides.winRate ?? 55,
	profitFactor: overrides.profitFactor ?? 1.8,
	averageR: overrides.averageR ?? 0.45,
	totalTrades: overrides.totalTrades ?? 100,
	winCount: overrides.winCount ?? 55,
	lossCount: overrides.lossCount ?? 45,
	breakevenCount: overrides.breakevenCount ?? 0,
	avgWin: overrides.avgWin ?? 200,
	avgLoss: overrides.avgLoss ?? -120,
})

export {
	createCoachingTrade,
	createWinTrade,
	createLossTrade,
	createBreakevenTrade,
	createTradeSequence,
	createOverallStats,
	DEFAULT_ENTRY_DATE,
	DEFAULT_EXIT_DATE,
}
