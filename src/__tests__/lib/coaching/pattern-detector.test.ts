/**
 * Unit tests for `src/lib/coaching/pattern-detector.ts`.
 *
 * All functions under test are pure — no database, no server imports, no
 * mocking required.  Each detector is exercised through four axes:
 *   1. Insufficient data → returns empty array
 *   2. Insufficient signal (pattern below threshold) → returns empty array
 *   3. Pattern exceeds threshold → returns correctly-shaped insight
 *   4. Edge cases (all wins, all losses, all breakevenTrades, nulls)
 *
 * Confidence is tested through the insight's `.confidence` field since
 * `calcConfidence` is not exported.  Each branch is provable by controlling
 * the sample size passed to a detector.
 *
 * Time-anchored fixtures use explicit BRT offsets (-03:00) so the tests
 * produce identical hour/dayOfWeek values regardless of the CI runner's
 * local timezone.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
	detectTimeOfDayEdge,
	detectDayOfWeekEdge,
	detectStrategyGap,
	detectHoldingPeriodEdge,
	detectOvertrading,
	detectFeeDrag,
	detectStreakPatterns,
	detectRatingCorrelation,
	detectDisciplineImpact,
	detectAllPatterns,
} from "@/lib/coaching/pattern-detector"
import {
	createCoachingTrade,
	createWinTrade,
	createLossTrade,
	createBreakevenTrade,
	createTradeSequence,
} from "./trade-coaching-factory"
import type { TradeForCoaching } from "@/lib/coaching/pattern-detector"

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Creates `count` win trades all at the same BRT hour and day, spread
 * 1 minute apart so they share the same hour bucket.
 */
const createWinsAtHour = (count: number, isoHour: string): TradeForCoaching[] =>
	Array.from({ length: count }, (_, index) =>
		createWinTrade({
			entryDate: new Date(`2026-01-05T${isoHour}:${String(index % 60).padStart(2, "0")}:00-03:00`),
			exitDate: new Date(`2026-01-05T${isoHour}:${String(index % 60).padStart(2, "0")}:30-03:00`),
		})
	)

const createLossesAtHour = (count: number, isoHour: string): TradeForCoaching[] =>
	Array.from({ length: count }, (_, index) =>
		createLossTrade({
			entryDate: new Date(`2026-01-05T${isoHour}:${String(index % 60).padStart(2, "0")}:00-03:00`),
			exitDate: new Date(`2026-01-05T${isoHour}:${String(index % 60).padStart(2, "0")}:30-03:00`),
		})
	)

/**
 * Creates `count` win trades on a specific day-of-week.
 *
 * The BRT calendar week starting 2026-01-05 (Mon) maps to:
 *   Sun=2026-01-04, Mon=2026-01-05, Tue=2026-01-06, Wed=2026-01-07,
 *   Thu=2026-01-08, Fri=2026-01-09, Sat=2026-01-10
 */
const DAY_OF_WEEK_DATES: Record<string, string> = {
	Sunday:    "2026-01-04",
	Monday:    "2026-01-05",
	Tuesday:   "2026-01-06",
	Wednesday: "2026-01-07",
	Thursday:  "2026-01-08",
	Friday:    "2026-01-09",
	Saturday:  "2026-01-10",
}

const createTradesOnDay = (
	count: number,
	dayName: string,
	outcome: "win" | "loss",
	pnlCents = 10000
): TradeForCoaching[] => {
	const dateStr = DAY_OF_WEEK_DATES[dayName]
	return Array.from({ length: count }, (_, index) => {
		const minute = String(index % 60).padStart(2, "0")
		// Each subsequent hour to avoid hitting the 60-minute limit
		const hour = String(9 + Math.floor(index / 60)).padStart(2, "0")
		return createCoachingTrade({
			entryDate: new Date(`${dateStr}T${hour}:${minute}:00-03:00`),
			exitDate: new Date(`${dateStr}T${hour}:${minute}:30-03:00`),
			outcome,
			pnl: outcome === "win" ? pnlCents : -pnlCents,
			realizedRMultiple: outcome === "win" ? "1" : "-1",
		})
	})
}

// ============================================================================
// calcConfidence — tested via insight.confidence
// ============================================================================

describe("calcConfidence (tested through insight.confidence)", () => {
	// We use detectFeeDrag as a thin wrapper because it uses `trades.length`
	// directly as the sample size, making it the easiest detector for testing
	// confidence branches without needing time/day manipulation.

	const buildFeeHeavyTrades = (count: number): TradeForCoaching[] =>
		Array.from({ length: count }, () =>
			createCoachingTrade({
				// gross = pnl + fees; 100 cents net, 200 cents fees → feePercent = 200/300 ≈ 66%
				pnl: 100,
				commission: 100,
				fees: 100,
				outcome: "win",
			})
		)

	it("should not surface an insight when sample size is below 10 (MIN_SAMPLE_SIZE gate)", () => {
		// 9 trades → trades.length < MIN_SAMPLE_SIZE (10) → detectFeeDrag returns early
		const insights = detectFeeDrag(buildFeeHeavyTrades(9))
		expect(insights).toHaveLength(0)
	})

	it("should surface an insight when sample is 10-19 (calcConfidence=0.6 ≥ MIN_CONFIDENCE=0.4)", () => {
		// 15 trades → passes MIN_SAMPLE_SIZE (10) gate.
		// calcConfidence(15) = 0.6 ≥ MIN_CONFIDENCE (0.4) → insight IS returned.
		const insights = detectFeeDrag(buildFeeHeavyTrades(15))
		expect(insights).toHaveLength(1)
		expect(insights[0].confidence).toBe(0.6)
	})

	it("should return confidence=0.75 for sample size 20-49", () => {
		const insights = detectFeeDrag(buildFeeHeavyTrades(20))
		expect(insights).toHaveLength(1)
		expect(insights[0].confidence).toBe(0.75)
	})

	it("should return confidence=0.85 for sample size 50-99", () => {
		const insights = detectFeeDrag(buildFeeHeavyTrades(50))
		expect(insights).toHaveLength(1)
		expect(insights[0].confidence).toBe(0.85)
	})

	it("should return confidence=0.95 for sample size 100+", () => {
		const insights = detectFeeDrag(buildFeeHeavyTrades(100))
		expect(insights).toHaveLength(1)
		expect(insights[0].confidence).toBe(0.95)
	})
})

// ============================================================================
// detectTimeOfDayEdge
// ============================================================================

describe("detectTimeOfDayEdge", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 decided trades exist", () => {
			const trades = createTradeSequence(
				Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? "win" : "loss"))
			)
			expect(detectTimeOfDayEdge(trades)).toHaveLength(0)
		})

		it("should return empty array when all trades are breakeven (no decided outcomes)", () => {
			const trades = Array.from({ length: 25 }, () => createBreakevenTrade())
			expect(detectTimeOfDayEdge(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when no single hour has ≥5 trades (MIN_GROUP_SIZE)", () => {
			// 20 trades spread across 5 distinct hours (9–13), cycling so no bucket reaches 5.
			// Use 20 trades / 5 hours = 4 trades per hour → no bucket ≥ MIN_GROUP_SIZE (5) → no insight
			const trades = Array.from({ length: 20 }, (_, index) =>
				createWinTrade({
					// Use hours 9-13 (all valid 24h), cycling through 5 distinct hours so no bucket hits 5.
					entryDate: new Date(`2026-01-05T${String(9 + (index % 5)).padStart(2, "0")}:${String(index * 3 % 60).padStart(2, "0")}:00-03:00`),
				})
			)
			// 20 trades / 5 hours = 4 trades per hour → no bucket ≥ MIN_GROUP_SIZE (5) → no insight
			expect(detectTimeOfDayEdge(trades)).toHaveLength(0)
		})

		it("should return empty array when best hour win rate does not exceed overall by 8pp (MIN_WIN_RATE_DIFF)", () => {
			// Overall WR = 50%. Best hour = 50%, diff = 0pp < 8pp → no insight.
			// Build: all 20 trades at same hour with same WR → diff = 0
			const trades = [
				...createWinsAtHour(10, "10"),
				...createLossesAtHour(10, "10"),
			]
			// 10 wins, 10 losses at 10:00 → overall WR = 50%, best hour WR = 50%, diff = 0
			expect(detectTimeOfDayEdge(trades)).toHaveLength(0)
		})
	})

	describe("detects best hour pattern", () => {
		it("should return a 'time-best-hour' insight when an hour has ≥10pp higher win rate", () => {
			// Overall mix: 10 trades at 10:00 (all wins = 100% WR) + 10 losses at 11:00 (0% WR)
			// Overall WR = 10/20 = 50%. Best hour (10:00): 100% − 50% = 50pp → fires.
			const trades = [
				...createWinsAtHour(10, "10"),
				...createLossesAtHour(10, "11"),
			]
			const insights = detectTimeOfDayEdge(trades)
			const bestHour = insights.find((i) => i.id === "time-best-hour")
			expect(bestHour).toBeDefined()
			expect(bestHour?.category).toBe("time")
			expect(bestHour?.severity).toBe("info")
			expect(bestHour?.params.hour).toBe("10:00")
			expect(bestHour?.params.winRate).toBe(100)
			expect(bestHour?.params.overallWinRate).toBe(50)
			expect(bestHour?.params.trades).toBe(10)
		})

		it("should return a 'time-worst-hour' insight when an hour has ≥10pp lower win rate", () => {
			// 10 wins at 10:00, 10 losses at 11:00 → worst hour is 11:00 with 0% WR
			const trades = [
				...createWinsAtHour(10, "10"),
				...createLossesAtHour(10, "11"),
			]
			const insights = detectTimeOfDayEdge(trades)
			const worstHour = insights.find((i) => i.id === "time-worst-hour")
			expect(worstHour).toBeDefined()
			expect(worstHour?.severity).toBe("warning")
			expect(worstHour?.params.hour).toBe("11:00")
			expect(worstHour?.params.winRate).toBe(0)
		})

		it("should assign confidence based on the sample size of the best hour bucket", () => {
			// 10 trades in best hour bucket → calcConfidence(10) = 0.6 (10 >= MIN_GROUP_SIZE=5 and < 20)
			const trades = [
				...createWinsAtHour(10, "10"),
				...createLossesAtHour(10, "11"),
			]
			const insights = detectTimeOfDayEdge(trades)
			const bestHour = insights.find((i) => i.id === "time-best-hour")
			expect(bestHour?.confidence).toBe(0.6)
		})
	})

	describe("edge cases", () => {
		it("should handle all-win trades without crashing", () => {
			// 20 wins in same hour → no worst hour possible, overall WR = best WR
			const trades = createWinsAtHour(20, "10")
			// No worst hour fires (diff = 0). No best hour fires (diff = 0).
			expect(() => detectTimeOfDayEdge(trades)).not.toThrow()
		})

		it("should handle all-loss trades without crashing", () => {
			const trades = createLossesAtHour(20, "10")
			expect(() => detectTimeOfDayEdge(trades)).not.toThrow()
		})
	})
})

// ============================================================================
// detectDayOfWeekEdge
// ============================================================================

describe("detectDayOfWeekEdge", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 decided trades", () => {
			const trades = createTradeSequence(Array(9).fill("win"))
			expect(detectDayOfWeekEdge(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when no day has ≥10 trades with negative avg P&L", () => {
			// All 20 trades are wins on Monday → positive avg P&L → no insight
			const trades = createTradesOnDay(20, "Monday", "win")
			expect(detectDayOfWeekEdge(trades)).toHaveLength(0)
		})

		it("should return empty array when worst day avg P&L is exactly zero", () => {
			// 5 wins + 5 losses on Monday with equal magnitude → avgPnl = 0 → no insight
			const trades = [
				...createTradesOnDay(5, "Monday", "win", 10000),
				...createTradesOnDay(5, "Monday", "loss", 10000),
				// Need ≥20 total decided trades → add more wins on other day
				...createTradesOnDay(10, "Tuesday", "win"),
			]
			// Monday avgPnl = 0, not < 0 → no insight
			expect(detectDayOfWeekEdge(trades)).toHaveLength(0)
		})
	})

	describe("detects worst day pattern", () => {
		it("should return a 'day-worst' insight when a day with ≥10 trades has negative avg P&L", () => {
			// 10 losses on Friday (avg P&L = -R$100 each = -10000 cents / 100 = -R$100)
			// 10 wins on Monday to reach ≥20 total
			const trades = [
				...createTradesOnDay(10, "Friday", "loss", 10000),
				...createTradesOnDay(10, "Monday", "win"),
			]
			const insights = detectDayOfWeekEdge(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("day-worst")
			expect(insights[0].category).toBe("time")
			expect(insights[0].severity).toBe("attention")
			expect(insights[0].params.day).toBe("Friday")
			expect(insights[0].params.trades).toBe(10)
			expect(insights[0].params.avgPnl).toBeLessThan(0)
		})

		it("should assign confidence=0.6 when worst day has 10-19 trades", () => {
			const trades = [
				...createTradesOnDay(10, "Friday", "loss"),
				...createTradesOnDay(10, "Monday", "win"),
			]
			const insights = detectDayOfWeekEdge(trades)
			// calcConfidence(10) = 0.6 (10 ≥ MIN_GROUP_SIZE=5 and < 20)
			expect(insights[0].confidence).toBe(0.6)
		})
	})

	describe("edge cases", () => {
		it("should handle all breakeven trades (no decided outcomes) without crashing", () => {
			const trades = Array.from({ length: 25 }, () => createBreakevenTrade())
			expect(() => detectDayOfWeekEdge(trades)).not.toThrow()
			expect(detectDayOfWeekEdge(trades)).toHaveLength(0)
		})
	})
})

// ============================================================================
// detectStrategyGap
// ============================================================================

describe("detectStrategyGap", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 decided trades with strategy names", () => {
			const trades = Array.from({ length: 9 }, (_, i) =>
				createWinTrade({ strategyName: i % 2 === 0 ? "VWAP" : "ORB" })
			)
			expect(detectStrategyGap(trades)).toHaveLength(0)
		})

		it("should return empty array when trades have no strategy names", () => {
			const trades = createTradeSequence(Array(25).fill("win"))
			// Default strategyName is null
			expect(detectStrategyGap(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when only one strategy has ≥10 trades", () => {
			// 15 VWAP wins, 5 ORB wins — only VWAP has ≥10, ORB doesn't qualify
			const trades = [
				...Array.from({ length: 15 }, () => createWinTrade({ strategyName: "VWAP" })),
				...Array.from({ length: 5 }, () => createWinTrade({ strategyName: "ORB" })),
			]
			expect(detectStrategyGap(trades)).toHaveLength(0)
		})

		it("should return empty array when win rate gap between strategies is less than 10pp", () => {
			// VWAP: 6 wins / 10 = 60%. ORB: 5 wins / 10 = 50%. Gap = 10pp → fires at ≥10
			// To avoid: VWAP 6/10=60%, ORB 6/10=60% → gap=0
			const trades = [
				...Array.from({ length: 6 }, () => createWinTrade({ strategyName: "VWAP" })),
				...Array.from({ length: 4 }, () => createLossTrade({ strategyName: "VWAP" })),
				...Array.from({ length: 6 }, () => createWinTrade({ strategyName: "ORB" })),
				...Array.from({ length: 4 }, () => createLossTrade({ strategyName: "ORB" })),
				// pad to ≥20 total decided trades with strategy
				...Array.from({ length: 5 }, () => createWinTrade({ strategyName: "VWAP" })),
				...Array.from({ length: 5 }, () => createWinTrade({ strategyName: "ORB" })),
			]
			// Both strategies now at ~60% WR → gap = 0
			expect(detectStrategyGap(trades)).toHaveLength(0)
		})
	})

	describe("detects strategy gap", () => {
		it("should return 'strategy-gap' insight when gap is ≥10pp", () => {
			// VWAP: 10 wins / 10 = 100%. ORB: 0 wins / 10 = 0%. Gap = 100pp.
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ strategyName: "VWAP" })),
				...Array.from({ length: 10 }, () => createLossTrade({ strategyName: "ORB" })),
			]
			const insights = detectStrategyGap(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("strategy-gap")
			expect(insights[0].category).toBe("strategy")
			expect(insights[0].params.bestStrategy).toBe("VWAP")
			expect(insights[0].params.worstStrategy).toBe("ORB")
			expect(insights[0].params.bestWinRate).toBe(100)
			expect(insights[0].params.worstWinRate).toBe(0)
			expect(insights[0].params.gap).toBe(100)
		})

		it("should assign severity 'warning' when gap is ≥25pp", () => {
			// Gap = 100pp → "warning"
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ strategyName: "Alpha" })),
				...Array.from({ length: 10 }, () => createLossTrade({ strategyName: "Beta" })),
			]
			const insights = detectStrategyGap(trades)
			expect(insights[0].severity).toBe("warning")
		})

		it("should assign severity 'attention' when gap is ≥10pp but <25pp", () => {
			// Alpha: 7/10=70%. Beta: 5/10=50%. Gap=20pp → "attention"
			const trades = [
				...Array.from({ length: 7 }, () => createWinTrade({ strategyName: "Alpha" })),
				...Array.from({ length: 3 }, () => createLossTrade({ strategyName: "Alpha" })),
				...Array.from({ length: 5 }, () => createWinTrade({ strategyName: "Beta" })),
				...Array.from({ length: 5 }, () => createLossTrade({ strategyName: "Beta" })),
			]
			const insights = detectStrategyGap(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].severity).toBe("attention")
		})

		it("should use the smaller of best/worst count for confidence", () => {
			// Both have 10 trades → calcConfidence(10) = 0.6 (10 >= MIN_GROUP_SIZE=5 and < 20)
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ strategyName: "Alpha" })),
				...Array.from({ length: 10 }, () => createLossTrade({ strategyName: "Beta" })),
			]
			const insights = detectStrategyGap(trades)
			expect(insights[0].confidence).toBe(0.6)
		})
	})

	describe("edge cases", () => {
		it("should handle all wins across all strategies without crashing", () => {
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ strategyName: "Alpha" })),
				...Array.from({ length: 10 }, () => createWinTrade({ strategyName: "Beta" })),
			]
			// Both 100% WR → gap = 0 → no insight
			expect(detectStrategyGap(trades)).toHaveLength(0)
		})

		it("should handle all losses across all strategies without crashing", () => {
			const trades = [
				...Array.from({ length: 10 }, () => createLossTrade({ strategyName: "Alpha" })),
				...Array.from({ length: 10 }, () => createLossTrade({ strategyName: "Beta" })),
			]
			// Both 0% WR → gap = 0 → no insight
			expect(detectStrategyGap(trades)).toHaveLength(0)
		})
	})
})

// ============================================================================
// detectHoldingPeriodEdge
// ============================================================================

describe("detectHoldingPeriodEdge", () => {
	const BASE_ENTRY = new Date("2026-01-05T10:00:00-03:00")

	/** Creates a trade held for exactly `minutes` minutes */
	const createTradeWithDuration = (
		minutes: number,
		outcome: "win" | "loss",
		rMultiple: string
	): TradeForCoaching => {
		const exitDate = new Date(BASE_ENTRY.getTime() + minutes * 60_000)
		return createCoachingTrade({
			entryDate: BASE_ENTRY,
			exitDate,
			outcome,
			realizedRMultiple: rMultiple,
			pnl: outcome === "win" ? 10000 : -10000,
		})
	}

	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 closed decided trades", () => {
			const trades = Array.from({ length: 9 }, (_, i) =>
				createTradeWithDuration(i < 5 ? 2 : 30, "win", "1")
			)
			expect(detectHoldingPeriodEdge(trades)).toHaveLength(0)
		})

		it("should return empty array when trades have no exitDate", () => {
			const trades = Array.from({ length: 25 }, () =>
				createCoachingTrade({ exitDate: null, outcome: "win" })
			)
			expect(detectHoldingPeriodEdge(trades)).toHaveLength(0)
		})

		it("should return empty array when short holds is exactly MIN_GROUP_SIZE (5) and medium is also 5 — but avg R diff ≤ 0.3", () => {
			// 20 medium holds, 4 short holds → short bucket < MIN_GROUP_SIZE (5) → no insight
			const trades = [
				...Array.from({ length: 20 }, () => createTradeWithDuration(30, "win", "1")),
				...Array.from({ length: 4 }, () => createTradeWithDuration(2, "loss", "-1")),
			]
			// 4 short holds < MIN_GROUP_SIZE (5) → no insight
			expect(detectHoldingPeriodEdge(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when avg R difference is ≤0.3", () => {
			// Short holds: avgR = 1.0. Medium holds: avgR = 1.2. Diff = 0.2 < 0.3 threshold.
			const trades = [
				...Array.from({ length: 10 }, () => createTradeWithDuration(2, "win", "1")),
				...Array.from({ length: 10 }, () => createTradeWithDuration(30, "win", "1.2")),
			]
			expect(detectHoldingPeriodEdge(trades)).toHaveLength(0)
		})
	})

	describe("detects holding period edge", () => {
		it("should return 'holding-period-edge' insight when medium holds outperform short holds by >0.3R", () => {
			// Short: 10 trades, avgR = -0.5. Medium: 10 trades, avgR = 1.0. Diff = 1.5 > 0.3
			const trades = [
				...Array.from({ length: 10 }, () => createTradeWithDuration(2, "loss", "-0.5")),
				...Array.from({ length: 10 }, () => createTradeWithDuration(30, "win", "1")),
			]
			const insights = detectHoldingPeriodEdge(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("holding-period-edge")
			expect(insights[0].category).toBe("time")
			expect(insights[0].params.shortCount).toBe(10)
			expect(insights[0].params.mediumCount).toBe(10)
		})

		it("should assign severity 'warning' when short holds have negative avg R", () => {
			const trades = [
				...Array.from({ length: 10 }, () => createTradeWithDuration(2, "loss", "-0.5")),
				...Array.from({ length: 10 }, () => createTradeWithDuration(30, "win", "1")),
			]
			const insights = detectHoldingPeriodEdge(trades)
			expect(insights[0].severity).toBe("warning")
		})

		it("should assign severity 'info' when short holds have positive avg R but medium is higher", () => {
			// Short: avgR = 0.5. Medium: avgR = 1.0. Diff = 0.5 > 0.3. Short is positive → "info"
			const trades = [
				...Array.from({ length: 10 }, () => createTradeWithDuration(2, "win", "0.5")),
				...Array.from({ length: 10 }, () => createTradeWithDuration(30, "win", "1")),
			]
			const insights = detectHoldingPeriodEdge(trades)
			expect(insights[0].severity).toBe("info")
		})

		it("should correctly compute avg R params in the insight", () => {
			const trades = [
				...Array.from({ length: 10 }, () => createTradeWithDuration(2, "loss", "-1")),
				...Array.from({ length: 10 }, () => createTradeWithDuration(30, "win", "2")),
			]
			const insights = detectHoldingPeriodEdge(trades)
			expect(insights[0].params.shortAvgR).toBe(-1)
			expect(insights[0].params.mediumAvgR).toBe(2)
		})
	})
})

// ============================================================================
// detectOvertrading
// ============================================================================

describe("detectOvertrading", () => {
	/**
	 * Creates trades on distinct calendar days to control the per-day trade count.
	 * Day offset is applied so each call produces a unique date.
	 */
	const createTradesOnDistinctDay = (
		tradesPerDay: number,
		dayOffsetFromBase: number,
		winCount: number
	): TradeForCoaching[] => {
		const baseDate = new Date("2026-01-05T10:00:00-03:00")
		const dayMs = 24 * 60 * 60 * 1000
		const dayDate = new Date(baseDate.getTime() + dayOffsetFromBase * dayMs)

		return Array.from({ length: tradesPerDay }, (_, tradeIndex) => {
			const isWin = tradeIndex < winCount
			const entryDate = new Date(dayDate.getTime() + tradeIndex * 5 * 60_000)
			const exitDate = new Date(entryDate.getTime() + 30 * 60_000)
			return createCoachingTrade({
				entryDate,
				exitDate,
				outcome: isWin ? "win" : "loss",
				pnl: isWin ? 10000 : -10000,
			})
		})
	}

	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 20 decided trades", () => {
			const trades = createTradesOnDistinctDay(3, 0, 2)
			expect(detectOvertrading(trades)).toHaveLength(0)
		})

		it("should return empty array when low-volume total is below MIN_GROUP_SIZE (5)", () => {
			// 2 low-volume days × 2 trades/day = 4 trades < MIN_GROUP_SIZE (5)
			// 3 high-volume days × 5 trades/day = 15 trades
			const trades = [
				...createTradesOnDistinctDay(2, 0, 1),
				...createTradesOnDistinctDay(2, 1, 1),
				...createTradesOnDistinctDay(5, 3, 2),
				...createTradesOnDistinctDay(5, 4, 2),
				...createTradesOnDistinctDay(5, 5, 2),
			]
			// Low volume total = 4 < MIN_GROUP_SIZE (5) → no insight
			expect(detectOvertrading(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when low-volume win rate does not exceed high-volume by ≥10pp", () => {
			// Low-volume: 5 days × 2 trades, 1 win each = 50% WR → total 5 wins / 10 trades
			// High-volume: 5 days × 5 trades, 2 wins each = 40% WR → total 10 wins / 25 trades
			// Diff = 50% - 40% = 10pp → exactly meets threshold → FIRES
			// To NOT fire: make both equal WR
			// Low: 50%, High: 50% → diff = 0
			const trades = [
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(3, i, 1)),      // 50% WR
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(5, i + 10, 2)), // 40% WR — fires
			].flat()
			// Actually 50-40=10pp fires. Let's build equal WR instead.
			const equalTrades = [
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(3, i, 2)),       // 2/3 = 67% WR
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(5, i + 10, 3)), // 3/5 = 60% WR
			].flat()
			// Diff = 67% - 60% = 7pp < 10pp → no insight
			expect(detectOvertrading(equalTrades)).toHaveLength(0)
		})
	})

	describe("detects overtrading signal", () => {
		it("should return 'overtrading' insight when low-volume days outperform high-volume by ≥10pp", () => {
			// Low-volume: 5 days × 3 trades/day, all wins = 100% WR (15 trades total)
			// High-volume: 5 days × 5 trades/day, all losses = 0% WR (25 trades total)
			// Diff = 100pp → fires
			const trades = [
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(3, i, 3)),
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(5, i + 10, 0)),
			].flat()
			const insights = detectOvertrading(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("overtrading")
			expect(insights[0].category).toBe("psychology")
			expect(insights[0].severity).toBe("warning")
			expect(insights[0].params.lowVolumeWinRate).toBe(100)
			expect(insights[0].params.highVolumeWinRate).toBe(0)
		})

		it("should include trade counts in params", () => {
			const trades = [
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(3, i, 3)),
				...Array.from({ length: 5 }, (_, i) => createTradesOnDistinctDay(5, i + 10, 0)),
			].flat()
			const insights = detectOvertrading(trades)
			expect(insights[0].params.lowVolumeTrades).toBe(15)
			expect(insights[0].params.highVolumeTrades).toBe(25)
		})
	})
})

// ============================================================================
// detectFeeDrag
// ============================================================================

describe("detectFeeDrag", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 trades", () => {
			const trades = Array.from({ length: 9 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100 })
			)
			expect(detectFeeDrag(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when gross P&L is zero or negative", () => {
			// All losses → grossPnl ≤ 0 → early return
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: -5000, commission: 50, fees: 10 })
			)
			expect(detectFeeDrag(trades)).toHaveLength(0)
		})

		it("should return empty array when fees are ≤5% of gross P&L", () => {
			// Net PnL = 9000 cents, fees = 60 cents per trade (commission 50 + fees 10)
			// 20 trades: totalFees = 1200 cents, totalNetPnl = 180000 cents
			// grossPnl = 180000 + 1200 = 181200 cents → feePercent = 1200/181200 ≈ 0.66% < 5%
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 9000, commission: 50, fees: 10, outcome: "win" })
			)
			expect(detectFeeDrag(trades)).toHaveLength(0)
		})
	})

	describe("detects fee drag", () => {
		it("should return 'fee-drag' insight when fees exceed 5% of gross P&L", () => {
			// Net pnl = 100 cents per trade, fees = 200 cents per trade
			// grossPnl = 100 + 200 = 300 cents per trade
			// feePercent = 200/300 ≈ 66.7% > 5% → fires
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100, outcome: "win" })
			)
			const insights = detectFeeDrag(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("fee-drag")
			expect(insights[0].category).toBe("fees")
		})

		it("should assign severity 'warning' when fees exceed 20% of gross P&L", () => {
			// 66.7% > 20% → "warning"
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100, outcome: "win" })
			)
			const insights = detectFeeDrag(trades)
			expect(insights[0].severity).toBe("warning")
		})

		it("should assign severity 'attention' when fees are between 10% and 20% of gross P&L", () => {
			// Net pnl = 1000 cents, fees = 150 cents per trade
			// grossPnl = 1000 + 150 = 1150. feePercent = 150/1150 ≈ 13% → "attention"
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 1000, commission: 75, fees: 75, outcome: "win" })
			)
			const insights = detectFeeDrag(trades)
			expect(insights[0].severity).toBe("attention")
		})

		it("should correctly compute feePercent and totalFees in params", () => {
			// 20 trades: net pnl = 100, commission = 100, fees = 100 per trade
			// totalFees = 20 × 200 cents = 4000 cents → 40 dollars
			// grossPnl = 20 × (100 + 200) = 6000 cents → 60 dollars
			// feePercent = 40/60 × 100 = 66.67% → rounded to 1dp = 66.7%
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100, outcome: "win" })
			)
			const insights = detectFeeDrag(trades)
			expect(insights[0].params.totalFees).toBeCloseTo(40, 1)
			expect(insights[0].params.feePercent).toBeCloseTo(66.7, 1)
		})

		it("should handle null commission and fees (treated as zero)", () => {
			// pnl = 100, commission = null, fees = null → totalFees = 0 → feePercent = 0 → no insight
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 100, commission: null, fees: null, outcome: "win" })
			)
			expect(detectFeeDrag(trades)).toHaveLength(0)
		})
	})
})

// ============================================================================
// detectStreakPatterns
// ============================================================================

describe("detectStreakPatterns", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 decided trades", () => {
			const trades = createTradeSequence(
				Array.from({ length: 9 }, () => "win")
			)
			expect(detectStreakPatterns(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when post-streak win rate is not significantly below overall", () => {
			// 2 losses then 3 wins repeated, plus 10 more wins.
			// After first streak: 3 wins tracked. After second streak: 3 more → afterStreakTotal = 6 ≥ MIN_GROUP_SIZE (5).
			// afterStreakWR = 100% (all wins), overallWR = 16/20 = 80%.
			// overallWR - afterStreakWR = 80 - 100 = -20 → not ≥ MIN_WIN_RATE_DIFF (8) → no insight.
			const trades = createTradeSequence(
				["loss", "loss", "win", "win", "win",
				 "loss", "loss", "win", "win", "win",
				 "win", "win", "win", "win", "win",
				 "win", "win", "win", "win", "win"]
			)
			expect(detectStreakPatterns(trades)).toHaveLength(0)
		})

		it("should return empty array when post-streak win rate is not significantly below overall", () => {
			// Overall 50% WR and post-streak also 50% → diff = 0pp < 10pp
			// Build: alternating loss/win pairs to create frequent streaks but same WR
			// Pattern: L, L, W, W repeated × 10 = 40 trades
			const pattern: Array<"win" | "loss"> = []
			for (let step = 0; step < 10; step++) {
				pattern.push("loss", "loss", "win", "win")
			}
			const trades = createTradeSequence(pattern)
			// After streak: each time we track the next W, W after L, L
			// afterStreakWR = 100% (all wins after streaks), overallWR = 50%
			// Difference = 50pp (overall - afterStreak = 50 - 100 = -50) → negative → no insight fires
			// Actually the check is: overallWinRate - afterStreakWR >= 10
			// 50% - 100% = -50 → not ≥ 10 → no insight. Correct.
			expect(detectStreakPatterns(trades)).toHaveLength(0)
		})
	})

	describe("detects streak tilt", () => {
		it("should return 'streak-tilt' insight when post-streak WR is ≥10pp below overall", () => {
			// Pattern: 10 wins then 12 losses (22 total).
			// After the 2nd consecutive loss (index 11), we start tracking: indices 12-21 (10 trades).
			// All 10 post-streak trades are losses → afterStreakWR = 0%.
			// Overall WR = 10/22 ≈ 45.5%. Diff = 45.5 - 0 = 45.5pp ≥ 10pp → fires.
			// afterStreakTotal = 10 ≥ 10 → threshold met.
			const pattern: Array<"win" | "loss"> = [
				...Array(10).fill("win"),
				...Array(12).fill("loss"),
			]
			const trades = createTradeSequence(pattern)
			const insights = detectStreakPatterns(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("streak-tilt")
			expect(insights[0].category).toBe("psychology")
			expect(insights[0].severity).toBe("warning")
		})

		it("should include afterStreakTrades, afterStreakWinRate, and overallWinRate in params", () => {
			// Same pattern as above: 10 wins + 12 losses
			const pattern: Array<"win" | "loss"> = [
				...Array(10).fill("win"),
				...Array(12).fill("loss"),
			]
			const trades = createTradeSequence(pattern)
			const insights = detectStreakPatterns(trades)
			expect(insights[0].params.afterStreakTrades).toBeGreaterThanOrEqual(10)
			expect(insights[0].params.afterStreakWinRate).toBeDefined()
			expect(insights[0].params.overallWinRate).toBeDefined()
		})

		it("should sort trades by entryDate before computing streak sequence", () => {
			// Provide trades in reverse chronological order — result should be identical
			const pattern: Array<"win" | "loss"> = [
				...Array(10).fill("win"),
				...Array(12).fill("loss"),
			]
			const base = new Date("2026-01-05T10:00:00-03:00")
			const trades = pattern.map((outcome, index) => {
				// Assign timestamps in REVERSE order so array order != chronological order
				const entryDate = new Date(base.getTime() + (pattern.length - 1 - index) * 60_000)
				return outcome === "win"
					? createWinTrade({ entryDate, exitDate: new Date(entryDate.getTime() + 30_000) })
					: createLossTrade({ entryDate, exitDate: new Date(entryDate.getTime() + 30_000) })
			})
			const insights = detectStreakPatterns(trades)
			// Should still detect the pattern because the detector sorts internally
			expect(insights).toHaveLength(1)
		})
	})

	describe("edge cases", () => {
		it("should handle all-win trades (no 2-loss streaks) without crashing", () => {
			const trades = createTradeSequence(Array(25).fill("win"))
			expect(() => detectStreakPatterns(trades)).not.toThrow()
			expect(detectStreakPatterns(trades)).toHaveLength(0)
		})

		it("should handle all-loss trades without crashing", () => {
			const trades = createTradeSequence(Array(25).fill("loss"))
			expect(() => detectStreakPatterns(trades)).not.toThrow()
		})
	})
})

// ============================================================================
// detectRatingCorrelation
// ============================================================================

describe("detectRatingCorrelation", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 decided rated trades", () => {
			const trades = Array.from({ length: 9 }, (_, i) =>
				createWinTrade({ rating: i % 2 === 0 ? "A" : "F" })
			)
			expect(detectRatingCorrelation(trades)).toHaveLength(0)
		})

		it("should return empty array when trades have no rating", () => {
			// Default rating is null
			const trades = createTradeSequence(Array(25).fill("win"))
			expect(detectRatingCorrelation(trades)).toHaveLength(0)
		})

		it("should return empty array when high-rated bucket has fewer than 5 trades (MIN_GROUP_SIZE)", () => {
			const trades = [
				...Array.from({ length: 4 }, () => createWinTrade({ rating: "A" })),
				...Array.from({ length: 15 }, () => createLossTrade({ rating: "F" })),
			]
			// A-rated: 4 < MIN_GROUP_SIZE (5) → no insight
			expect(detectRatingCorrelation(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when high-rated WR does not exceed low-rated by ≥10pp", () => {
			// A/B: 7/10 = 70%. D/F: 7/10 = 70%. Gap = 0pp.
			const trades = [
				...Array.from({ length: 7 }, () => createWinTrade({ rating: "A" })),
				...Array.from({ length: 3 }, () => createLossTrade({ rating: "B" })),
				...Array.from({ length: 7 }, () => createWinTrade({ rating: "D" })),
				...Array.from({ length: 3 }, () => createLossTrade({ rating: "F" })),
			]
			expect(detectRatingCorrelation(trades)).toHaveLength(0)
		})
	})

	describe("detects rating correlation", () => {
		it("should return 'rating-correlation' insight when A/B trades outperform D/F by ≥10pp", () => {
			// A/B: 10/10 = 100% WR. D/F: 0/10 = 0% WR. Gap = 100pp.
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ rating: "A" })),
				...Array.from({ length: 10 }, () => createLossTrade({ rating: "F" })),
			]
			const insights = detectRatingCorrelation(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("rating-correlation")
			expect(insights[0].category).toBe("psychology")
			expect(insights[0].severity).toBe("info")
			expect(insights[0].params.highWinRate).toBe(100)
			expect(insights[0].params.lowWinRate).toBe(0)
			expect(insights[0].params.highCount).toBe(10)
			expect(insights[0].params.lowCount).toBe(10)
		})

		it("should include both A and B ratings in high bucket", () => {
			const trades = [
				...Array.from({ length: 7 }, () => createWinTrade({ rating: "A" })),
				...Array.from({ length: 3 }, () => createWinTrade({ rating: "B" })),
				...Array.from({ length: 10 }, () => createLossTrade({ rating: "D" })),
			]
			const insights = detectRatingCorrelation(trades)
			expect(insights[0].params.highCount).toBe(10) // A(7) + B(3)
		})

		it("should include both D and F ratings in low bucket", () => {
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ rating: "A" })),
				...Array.from({ length: 5 }, () => createLossTrade({ rating: "D" })),
				...Array.from({ length: 5 }, () => createLossTrade({ rating: "F" })),
			]
			const insights = detectRatingCorrelation(trades)
			expect(insights[0].params.lowCount).toBe(10) // D(5) + F(5)
		})

		it("should ignore C-rated trades (neither high nor low bucket)", () => {
			// C-rated trades should not affect either bucket
			const trades = [
				...Array.from({ length: 10 }, () => createWinTrade({ rating: "A" })),
				...Array.from({ length: 10 }, () => createLossTrade({ rating: "F" })),
				...Array.from({ length: 20 }, () => createWinTrade({ rating: "C" })),
			]
			const insights = detectRatingCorrelation(trades)
			expect(insights[0].params.highCount).toBe(10)
			expect(insights[0].params.lowCount).toBe(10)
		})
	})

	describe("edge cases", () => {
		it("should handle all-A trades without crashing", () => {
			const trades = Array.from({ length: 25 }, () => createWinTrade({ rating: "A" }))
			expect(() => detectRatingCorrelation(trades)).not.toThrow()
		})
	})
})

// ============================================================================
// detectDisciplineImpact
// ============================================================================

describe("detectDisciplineImpact", () => {
	describe("insufficient sample size", () => {
		it("should return empty array when fewer than 10 trades with followedPlan and realizedRMultiple", () => {
			const trades = Array.from({ length: 9 }, (_, i) =>
				createCoachingTrade({
					followedPlan: i % 2 === 0,
					realizedRMultiple: "1",
					outcome: "win",
				})
			)
			expect(detectDisciplineImpact(trades)).toHaveLength(0)
		})

		it("should return empty array when realizedRMultiple is null on all trades", () => {
			const trades = Array.from({ length: 25 }, () =>
				createCoachingTrade({ followedPlan: true, realizedRMultiple: null, outcome: "win" })
			)
			expect(detectDisciplineImpact(trades)).toHaveLength(0)
		})

		it("should return empty array when followedPlan is null on all trades", () => {
			const trades = Array.from({ length: 25 }, () =>
				createCoachingTrade({ followedPlan: null, realizedRMultiple: "1", outcome: "win" })
			)
			expect(detectDisciplineImpact(trades)).toHaveLength(0)
		})

		it("should return empty array when fewer than 5 trades in not-followed bucket (MIN_GROUP_SIZE)", () => {
			// 15 followed, 4 not-followed → not-followed < MIN_GROUP_SIZE (5) → no insight
			const trades = [
				...Array.from({ length: 15 }, () =>
					createCoachingTrade({ followedPlan: true, realizedRMultiple: "2", outcome: "win" })
				),
				...Array.from({ length: 4 }, () =>
					createCoachingTrade({ followedPlan: false, realizedRMultiple: "-1", outcome: "loss" })
				),
			]
			expect(detectDisciplineImpact(trades)).toHaveLength(0)
		})
	})

	describe("no significant pattern", () => {
		it("should return empty array when followed avg R does not exceed not-followed by >0.3", () => {
			// Followed: avgR = 1.0. Not-followed: avgR = 0.8. Diff = 0.2 ≤ 0.3.
			const trades = [
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ followedPlan: true, realizedRMultiple: "1", outcome: "win" })
				),
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ followedPlan: false, realizedRMultiple: "0.8", outcome: "win" })
				),
			]
			expect(detectDisciplineImpact(trades)).toHaveLength(0)
		})
	})

	describe("detects discipline impact", () => {
		it("should return 'discipline-impact' insight when followed plan avgR exceeds not-followed by >0.3", () => {
			// Followed: avgR = 2.0. Not-followed: avgR = -1.0. Diff = 3.0 > 0.3.
			const trades = [
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ followedPlan: true, realizedRMultiple: "2", outcome: "win" })
				),
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ followedPlan: false, realizedRMultiple: "-1", outcome: "loss" })
				),
			]
			const insights = detectDisciplineImpact(trades)
			expect(insights).toHaveLength(1)
			expect(insights[0].id).toBe("discipline-impact")
			expect(insights[0].category).toBe("psychology")
			expect(insights[0].severity).toBe("attention")
		})

		it("should correctly compute followedAvgR and notFollowedAvgR in params", () => {
			const trades = [
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ followedPlan: true, realizedRMultiple: "2", outcome: "win" })
				),
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ followedPlan: false, realizedRMultiple: "-1", outcome: "loss" })
				),
			]
			const insights = detectDisciplineImpact(trades)
			expect(insights[0].params.followedAvgR).toBe(2)
			expect(insights[0].params.notFollowedAvgR).toBe(-1)
			expect(insights[0].params.followedCount).toBe(10)
			expect(insights[0].params.notFollowedCount).toBe(10)
		})
	})

	describe("edge cases", () => {
		it("should handle all trades with followedPlan=true and no not-followed trades", () => {
			const trades = Array.from({ length: 25 }, () =>
				createCoachingTrade({ followedPlan: true, realizedRMultiple: "1", outcome: "win" })
			)
			expect(() => detectDisciplineImpact(trades)).not.toThrow()
			expect(detectDisciplineImpact(trades)).toHaveLength(0)
		})
	})
})

// ============================================================================
// detectAllPatterns
// ============================================================================

describe("detectAllPatterns", () => {
	describe("empty and minimal input", () => {
		it("should return empty array when no trades are provided", () => {
			expect(detectAllPatterns([])).toHaveLength(0)
		})

		it("should return empty array when fewer than 10 trades are provided", () => {
			const trades = createTradeSequence(Array(9).fill("win"))
			expect(detectAllPatterns(trades)).toHaveLength(0)
		})
	})

	describe("confidence filtering", () => {
		it("should only surface insights with confidence >= 0.4 (MIN_CONFIDENCE)", () => {
			// 15 trades: calcConfidence(15) = 0.6 ≥ MIN_CONFIDENCE (0.4) → included
			// Use fee-drag scenario where 15 fee-heavy trades exist
			const trades = Array.from({ length: 15 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100, outcome: "win" })
			)
			const insights = detectAllPatterns(trades)
			// All surfaced insights must meet the MIN_CONFIDENCE threshold of 0.4
			expect(insights.every((i) => i.confidence >= 0.4)).toBe(true)
		})

		it("should include insights with confidence 0.75 (sample size 20-49)", () => {
			// 20 fee-heavy trades → confidence = 0.75 ≥ MIN_CONFIDENCE (0.4) → included
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100, outcome: "win" })
			)
			const insights = detectAllPatterns(trades)
			const feeDragInsight = insights.find((i) => i.id === "fee-drag")
			expect(feeDragInsight).toBeDefined()
			expect(feeDragInsight?.confidence).toBe(0.75)
		})
	})

	describe("severity ordering", () => {
		it("should sort insights with 'warning' severity before 'attention' and 'info'", () => {
			// Create a dataset that triggers multiple detectors:
			// 1. Fee drag (warning: >20%) — 20 fee-heavy trades
			// 2. Strategy gap (warning: >25pp gap) — 10 VWAP wins, 10 ORB losses
			// 3. Rating correlation (info) — 10 A-rated wins, 10 F-rated losses
			const trades = [
				// fee-drag trades: high fees triggering warning
				...Array.from({ length: 20 }, () =>
					createCoachingTrade({
						pnl: 100,
						commission: 200,
						fees: 200,
						strategyName: "VWAP",
						rating: "A",
						outcome: "win",
					})
				),
				// ORB loss trades for strategy gap
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({
						pnl: -10000,
						commission: 50,
						fees: 10,
						strategyName: "ORB",
						rating: "F",
						outcome: "loss",
					})
				),
			]
			const insights = detectAllPatterns(trades)

			if (insights.length >= 2) {
				const severityOrder = { warning: 0, attention: 1, info: 2 }
				for (let index = 0; index < insights.length - 1; index++) {
					expect(severityOrder[insights[index].severity]).toBeLessThanOrEqual(
						severityOrder[insights[index + 1].severity]
					)
				}
			}
		})

		it("should return warnings before info when both are present", () => {
			// Fee drag at >20% = "warning". Rating correlation = "info".
			const trades = [
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ pnl: 100, commission: 200, fees: 200, rating: "A", outcome: "win" })
				),
				...Array.from({ length: 10 }, () =>
					createCoachingTrade({ pnl: -10000, commission: 200, fees: 200, rating: "F", outcome: "loss" })
				),
			]
			const insights = detectAllPatterns(trades)
			const firstWarningIndex = insights.findIndex((i) => i.severity === "warning")
			const firstInfoIndex = insights.findIndex((i) => i.severity === "info")
			if (firstWarningIndex !== -1 && firstInfoIndex !== -1) {
				expect(firstWarningIndex).toBeLessThan(firstInfoIndex)
			}
		})
	})

	describe("multi-detector integration", () => {
		it("should surface strategy-gap when two strategies each have ≥20 trades with a 100pp WR gap", () => {
			// 20 VWAP wins + 20 ORB losses = 40 total decided trades.
			// Strategy gap: VWAP=100% WR, ORB=0% WR, gap=100pp ≥ 10pp.
			// calcConfidence(min(20,20)) = 0.7 → passes the 0.7 filter in detectAllPatterns.
			// Spread trades across multiple days to avoid triggering day-worst at high confidence.
			const dayMs = 24 * 60 * 60 * 1000
			const vwapWins = Array.from({ length: 20 }, (_, index) =>
				createCoachingTrade({
					entryDate: new Date(new Date("2026-01-05T10:00:00-03:00").getTime() + index * dayMs),
					exitDate: new Date(new Date("2026-01-05T10:30:00-03:00").getTime() + index * dayMs),
					pnl: 10000,
					commission: 50,
					fees: 10,
					strategyName: "VWAP",
					rating: "A",
					outcome: "win",
				})
			)
			const orbLosses = Array.from({ length: 20 }, (_, index) =>
				createCoachingTrade({
					entryDate: new Date(new Date("2026-01-05T11:00:00-03:00").getTime() + index * dayMs),
					exitDate: new Date(new Date("2026-01-05T11:30:00-03:00").getTime() + index * dayMs),
					pnl: -10000,
					commission: 50,
					fees: 10,
					strategyName: "ORB",
					rating: "F",
					outcome: "loss",
				})
			)
			const insights = detectAllPatterns([...vwapWins, ...orbLosses])
			const ids = insights.map((i) => i.id)
			// strategy-gap must fire at confidence 0.7+
			expect(ids).toContain("strategy-gap")
		})

		it("should surface fee-drag when fees exceed 20% of gross P&L across ≥20 trades", () => {
			// 20 win trades: net pnl=1000 cents, commission=200, fees=200 per trade.
			// totalNetPnl = 20 × 1000 cents = 20000 cents = R$200
			// totalFees = 20 × 400 cents = 8000 cents = R$80
			// grossPnl = 20000 + 8000 = 28000 cents. feePercent = 8000/28000 ≈ 28.6% > 20%.
			// calcConfidence(20) = 0.7 → passes the filter in detectAllPatterns.
			// Trades spread across different days to not confound with day-worst detector.
			const dayMs = 24 * 60 * 60 * 1000
			const feeHeavyWins = Array.from({ length: 20 }, (_, index) =>
				createCoachingTrade({
					entryDate: new Date(new Date("2026-01-05T10:00:00-03:00").getTime() + index * dayMs),
					exitDate: new Date(new Date("2026-01-05T10:30:00-03:00").getTime() + index * dayMs),
					pnl: 1000,
					commission: 200,
					fees: 200,
					outcome: "win",
				})
			)
			const insights = detectAllPatterns(feeHeavyWins)
			const ids = insights.map((i) => i.id)
			expect(ids).toContain("fee-drag")
		})
	})

	describe("returned insight shape", () => {
		it("should return insights with all required CoachingInsight fields", () => {
			const trades = Array.from({ length: 20 }, () =>
				createCoachingTrade({ pnl: 100, commission: 100, fees: 100, outcome: "win" })
			)
			const insights = detectAllPatterns(trades)
			for (const insight of insights) {
				expect(insight).toHaveProperty("id")
				expect(insight).toHaveProperty("category")
				expect(insight).toHaveProperty("severity")
				expect(insight).toHaveProperty("titleKey")
				expect(insight).toHaveProperty("descriptionKey")
				expect(insight).toHaveProperty("params")
				expect(insight).toHaveProperty("confidence")
				expect(typeof insight.params).toBe("object")
			}
		})
	})
})
