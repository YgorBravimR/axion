/**
 * Unit tests for `computeHoldingPeriodAnalysis()` in src/lib/analytics-helpers.ts
 * and for the `formatDuration` helper in src/components/analytics/holding-period-chart.tsx.
 *
 * Key behaviors under test:
 *
 *   computeHoldingPeriodAnalysis():
 *   - Filters out open trades (exitDate === null) — only closed trades are included
 *   - Computes duration in minutes: (exitDate - entryDate) / 60_000, floored at 0
 *   - Groups closed trades into 8 buckets by ascending duration:
 *       "< 1min"  [0, 1)
 *       "1-5min"  [1, 5)
 *       "5-15min" [5, 15)
 *       "15-30min"[15, 30)
 *       "30-60min"[30, 60)
 *       "1-2h"    [60, 120)
 *       "2-4h"    [120, 240)
 *       "> 4h"    [240, ∞)
 *   - Per-bucket metrics: tradeCount, wins, losses, breakevens,
 *     winRate (via calculateWinRate), totalPnl, avgPnl, avgR, avgDurationMinutes,
 *     profitFactor (via calculateProfitFactor)
 *   - fromCents() converts integer-cents strings/numbers to dollars
 *   - Sorts output ascending by bucketOrder (0→7)
 *   - Excludes empty buckets (0 trades)
 *   - Handles zero-duration trades, negative-duration clamp, and null R-multiples
 *
 *   formatDuration() (component helper, re-implemented here for testability):
 *   - minutes < 1   → "< 1min"
 *   - minutes < 60  → "{round}min"
 *   - minutes >= 60 → "{hours.toFixed(1)}h"
 *
 * Uses real implementations of fromCents, calculateWinRate, calculateProfitFactor
 * since they are pure functions — no mocks needed.
 */

import { describe, it, expect } from "vitest"
import { computeHoldingPeriodAnalysis } from "@/lib/analytics-helpers"
import type { TradeForHoldingPeriod } from "@/lib/analytics-helpers"
import type { HoldingPeriodBucket } from "@/types"

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Bucket labels in definition order for assertions */
const BUCKET_ORDER = [
	"< 1min",
	"1-5min",
	"5-15min",
	"15-30min",
	"30-60min",
	"1-2h",
	"2-4h",
	"> 4h",
] as const

type BucketLabel = (typeof BUCKET_ORDER)[number]

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

interface HoldingTradeOptions {
	/** Entry timestamp (default: 2026-01-06T09:00:00Z) */
	entryDate?: Date
	/** Exit timestamp; pass null to make this an open trade */
	exitDate?: Date | null
	/** Integer-cents string or raw number (default: "10000" = R$100.00 win) */
	pnl?: number | string | null
	outcome?: "win" | "loss" | "breakeven" | null
	/** R-multiple as string (default: null) */
	realizedRMultiple?: string | null
}

const BASE_ENTRY = new Date("2026-01-06T09:00:00.000Z")

/**
 * Creates a minimal `TradeForHoldingPeriod` fixture.
 * Duration is controlled via `exitDate` relative to `entryDate`.
 */
const makeTrade = (
	options: HoldingTradeOptions = {}
): TradeForHoldingPeriod => {
	const entryDate = options.entryDate ?? BASE_ENTRY

	// exitDate can be explicitly null (open trade) or a Date (closed trade)
	const exitDate =
		"exitDate" in options
			? (options.exitDate ?? null)
			: new Date(entryDate.getTime() + 10 * 60_000) // default: 10-minute hold

	return {
		entryDate,
		exitDate,
		// `in` operator narrows the key to be present, but TS still infers `| undefined`
		// for optional properties. The explicit casts below restore the correct union type.
		pnl: ("pnl" in options ? options.pnl : "10000") as number | string | null,
		outcome: options.outcome ?? "win",
		realizedRMultiple: ("realizedRMultiple" in options
			? options.realizedRMultiple
			: null) as string | null,
	}
}

/**
 * Creates a closed trade with an exact holding duration in minutes.
 */
const makeTradeWithDuration = (
	durationMinutes: number,
	options: Omit<HoldingTradeOptions, "entryDate" | "exitDate"> = {}
): TradeForHoldingPeriod => {
	const entryDate = BASE_ENTRY
	const exitDate = new Date(entryDate.getTime() + durationMinutes * 60_000)
	return makeTrade({ ...options, entryDate, exitDate })
}

/**
 * Returns the bucket result for the given label from a result array.
 * Throws if the bucket is not present (test should catch this separately).
 */
const getBucket = (
	results: ReturnType<typeof computeHoldingPeriodAnalysis>,
	label: BucketLabel
) => results.find((b) => b.bucket === label)

// ---------------------------------------------------------------------------
// formatDuration logic — re-implemented to test in isolation
// (mirrors src/components/analytics/holding-period-chart.tsx formatDuration)
// ---------------------------------------------------------------------------

const formatDuration = (minutes: number): string => {
	if (minutes < 1) {
		return "< 1min"
	}
	if (minutes < 60) {
		return `${Math.round(minutes)}min`
	}
	const hours = minutes / 60
	return `${hours.toFixed(1)}h`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeHoldingPeriodAnalysis()", () => {
	// ========================================================================
	// Empty / all-open state
	// ========================================================================

	describe("when the trades array is empty", () => {
		it("should return an empty array", () => {
			const result = computeHoldingPeriodAnalysis([])
			expect(result).toEqual([])
		})
	})

	describe("when all trades have null exitDate (open trades)", () => {
		it("should return an empty array because no closed trades exist", () => {
			const openTrades: TradeForHoldingPeriod[] = [
				makeTrade({ exitDate: null }),
				makeTrade({ exitDate: null }),
				makeTrade({ exitDate: null }),
			]

			const result = computeHoldingPeriodAnalysis(openTrades)
			expect(result).toEqual([])
		})
	})

	describe("when a mix of open and closed trades is provided", () => {
		it("should include only closed trades in the output", () => {
			const trades: TradeForHoldingPeriod[] = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }), // closed → 5-15min bucket
				makeTrade({ exitDate: null, outcome: "win", pnl: "9999" }), // open → excluded
				makeTrade({ exitDate: null, outcome: "loss", pnl: "-3000" }), // open → excluded
			]

			const result = computeHoldingPeriodAnalysis(trades)
			expect(result).toHaveLength(1)
			expect(result[0].bucket).toBe("5-15min")
			expect(result[0].totalTrades).toBe(1)
		})
	})

	// ========================================================================
	// Bucket assignment — all 7 buckets
	// ========================================================================

	describe("bucket assignment", () => {
		it('should assign a 0-minute trade to "< 1min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(0)])
			expect(result).toHaveLength(1)
			expect(result[0].bucket).toBe("< 1min")
		})

		it('should assign a 0.5-minute trade to "< 1min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(0.5)])
			expect(result[0].bucket).toBe("< 1min")
		})

		it('should assign a 1-minute trade to "1-5min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(1)])
			expect(result[0].bucket).toBe("1-5min")
		})

		it('should assign a 4.9-minute trade to "1-5min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(4.9)])
			expect(result[0].bucket).toBe("1-5min")
		})

		it('should assign a 5-minute trade to "5-15min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(5)])
			expect(result[0].bucket).toBe("5-15min")
		})

		it('should assign a 14-minute trade to "5-15min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(14)])
			expect(result[0].bucket).toBe("5-15min")
		})

		it('should assign a 15-minute trade to "15-30min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(15)])
			expect(result[0].bucket).toBe("15-30min")
		})

		it('should assign a 29-minute trade to "15-30min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(29)])
			expect(result[0].bucket).toBe("15-30min")
		})

		it('should assign a 30-minute trade to "30-60min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(30)])
			expect(result[0].bucket).toBe("30-60min")
		})

		it('should assign a 59-minute trade to "30-60min"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(59)])
			expect(result[0].bucket).toBe("30-60min")
		})

		it('should assign a 60-minute trade to "1-2h"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(60)])
			expect(result[0].bucket).toBe("1-2h")
		})

		it('should assign a 239-minute trade to "2-4h"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(239)])
			expect(result[0].bucket).toBe("2-4h")
		})

		it('should assign a 240-minute trade to "> 4h"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(240)])
			expect(result[0].bucket).toBe("> 4h")
		})

		it('should assign a 1440-minute (24h) trade to "> 4h"', () => {
			const result = computeHoldingPeriodAnalysis([makeTradeWithDuration(1440)])
			expect(result[0].bucket).toBe("> 4h")
		})
	})

	// ========================================================================
	// Zero-duration edge case
	// ========================================================================

	describe("zero-duration trades (entryDate === exitDate)", () => {
		it('should place entry==exit trades in the "< 1min" bucket', () => {
			const entryDate = BASE_ENTRY
			const trade = makeTrade({ entryDate, exitDate: entryDate }) // same instant

			const result = computeHoldingPeriodAnalysis([trade])
			expect(result).toHaveLength(1)
			expect(result[0].bucket).toBe("< 1min")
			expect(result[0].avgDurationMinutes).toBe(0)
		})
	})

	// ========================================================================
	// Negative-duration clamp
	// ========================================================================

	describe("negative-duration trades (exitDate before entryDate)", () => {
		it('should clamp to 0 and place the trade in "< 1min"', () => {
			const entryDate = BASE_ENTRY
			const exitDate = new Date(entryDate.getTime() - 5 * 60_000) // 5 min before entry

			const trade = makeTrade({ entryDate, exitDate })
			const result = computeHoldingPeriodAnalysis([trade])

			expect(result).toHaveLength(1)
			expect(result[0].bucket).toBe("< 1min")
			// avgDurationMinutes should reflect the clamped value of 0
			expect(result[0].avgDurationMinutes).toBe(0)
		})
	})

	// ========================================================================
	// Metric computations
	// ========================================================================

	describe("winRate computation", () => {
		it("should compute 100% winRate when all trades in a bucket are wins", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
				makeTradeWithDuration(12, { outcome: "win", pnl: "3000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.winRate).toBe(100)
		})

		it("should compute 0% winRate when all trades in a bucket are losses", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "loss", pnl: "-5000" }),
				makeTradeWithDuration(12, { outcome: "loss", pnl: "-3000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.winRate).toBe(0)
		})

		it("should compute 50% winRate for one win and one loss", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
				makeTradeWithDuration(11, { outcome: "loss", pnl: "-5000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.winRate).toBe(50)
		})

		it("should exclude breakeven trades from the winRate denominator", () => {
			// winRate = wins / (wins + losses), breakevens are not counted
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
				makeTradeWithDuration(11, { outcome: "breakeven", pnl: "0" }),
				makeTradeWithDuration(12, { outcome: "breakeven", pnl: "0" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// 1 win, 0 losses → winRate = 1/1 = 100%
			expect(bucket!.winRate).toBe(100)
			// But totalTrades should include all three
			expect(bucket!.totalTrades).toBe(3)
		})
	})

	describe("totalPnl and avgPnl computation", () => {
		it("should sum pnl from integer-cents string values (fromCents conversion)", () => {
			// "5000" cents = R$50.00, "3000" cents = R$30.00 → total R$80.00
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
				makeTradeWithDuration(12, { outcome: "win", pnl: "3000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.totalPnl).toBeCloseTo(80, 5)
			expect(bucket!.avgPnl).toBeCloseTo(40, 5)
		})

		it("should handle numeric pnl values (not just strings)", () => {
			// fromCents accepts number | string | null
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: 10000 }), // number
				makeTradeWithDuration(12, { outcome: "loss", pnl: -5000 }), // number
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// 10000 cents = R$100, -5000 cents = -R$50 → net R$50
			expect(bucket!.totalPnl).toBeCloseTo(50, 5)
			expect(bucket!.avgPnl).toBeCloseTo(25, 5)
		})

		it("should handle null pnl values (treated as 0 by fromCents)", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "breakeven", pnl: null }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.totalPnl).toBe(0)
			expect(bucket!.avgPnl).toBe(0)
		})

		it("should compute negative totalPnl when all trades are losing", () => {
			const trades = [
				makeTradeWithDuration(5, { outcome: "loss", pnl: "-8000" }), // -R$80
				makeTradeWithDuration(6, { outcome: "loss", pnl: "-4000" }), // -R$40
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.totalPnl).toBeCloseTo(-120, 5)
			expect(bucket!.avgPnl).toBeCloseTo(-60, 5)
		})
	})

	describe("avgR computation", () => {
		it("should compute avgR as the mean of all non-null R-multiples in the bucket", () => {
			const trades = [
				makeTradeWithDuration(10, {
					outcome: "win",
					pnl: "5000",
					realizedRMultiple: "2.0",
				}),
				makeTradeWithDuration(11, {
					outcome: "win",
					pnl: "3000",
					realizedRMultiple: "1.0",
				}),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// (2.0 + 1.0) / 2 = 1.5
			expect(bucket!.avgR).toBeCloseTo(1.5, 5)
		})

		it("should return 0 for avgR when no trades in the bucket have R-multiples", () => {
			const trades = [
				makeTradeWithDuration(10, {
					outcome: "win",
					pnl: "5000",
					realizedRMultiple: null,
				}),
				makeTradeWithDuration(12, {
					outcome: "loss",
					pnl: "-3000",
					realizedRMultiple: null,
				}),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.avgR).toBe(0)
		})

		it("should average only the trades that have non-null R-multiples", () => {
			// 2 trades have R, 1 trade does not — avgR computed from the 2 with R only
			const trades = [
				makeTradeWithDuration(10, {
					outcome: "win",
					pnl: "5000",
					realizedRMultiple: "3.0",
				}),
				makeTradeWithDuration(11, {
					outcome: "win",
					pnl: "3000",
					realizedRMultiple: "1.0",
				}),
				makeTradeWithDuration(12, {
					outcome: "loss",
					pnl: "-2000",
					realizedRMultiple: null,
				}),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// (3.0 + 1.0) / 2 = 2.0 (not counting the null)
			expect(bucket!.avgR).toBeCloseTo(2.0, 5)
		})

		it("should handle negative R-multiples (loss trades)", () => {
			const trades = [
				makeTradeWithDuration(10, {
					outcome: "win",
					pnl: "5000",
					realizedRMultiple: "2.0",
				}),
				makeTradeWithDuration(11, {
					outcome: "loss",
					pnl: "-5000",
					realizedRMultiple: "-1.0",
				}),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// (2.0 + -1.0) / 2 = 0.5
			expect(bucket!.avgR).toBeCloseTo(0.5, 5)
		})
	})

	describe("profitFactor computation", () => {
		it("should return Infinity when gross loss is 0 and gross profit is positive", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "10000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.profitFactor).toBe(Infinity)
		})

		it("should return 0 when gross profit is 0 and gross loss is positive", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "loss", pnl: "-10000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.profitFactor).toBe(0)
		})

		it("should compute gross_profit / gross_loss for a mixed bucket", () => {
			// Wins: R$200 total gross profit (20000 cents)
			// Losses: R$100 total gross loss (10000 cents)
			// PF = 200 / 100 = 2.0
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "20000" }),
				makeTradeWithDuration(11, { outcome: "loss", pnl: "-10000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			expect(bucket!.profitFactor).toBeCloseTo(2.0, 5)
		})

		it("should return 0 when both gross profit and gross loss are 0", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "breakeven", pnl: "0" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// calculateProfitFactor(0, 0) → 0
			expect(bucket!.profitFactor).toBe(0)
		})
	})

	describe("avgDurationMinutes computation", () => {
		it("should compute the mean of all trade durations within a bucket", () => {
			// Two trades in the same bucket with different durations
			const entryA = BASE_ENTRY
			const exitA = new Date(entryA.getTime() + 10 * 60_000) // 10min

			const entryB = new Date(BASE_ENTRY.getTime() + 60_000) // start 1 min later
			const exitB = new Date(entryB.getTime() + 14 * 60_000) // 14min

			const trades: TradeForHoldingPeriod[] = [
				{
					entryDate: entryA,
					exitDate: exitA,
					pnl: "5000",
					outcome: "win",
					realizedRMultiple: null,
				},
				{
					entryDate: entryB,
					exitDate: exitB,
					pnl: "3000",
					outcome: "win",
					realizedRMultiple: null,
				},
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")

			expect(bucket).toBeDefined()
			// (10 + 14) / 2 = 12 minutes
			expect(bucket!.avgDurationMinutes).toBeCloseTo(12, 5)
		})

		it("should be 0 for a single zero-duration trade", () => {
			const trade = makeTrade({ exitDate: BASE_ENTRY }) // entry === exit
			const result = computeHoldingPeriodAnalysis([trade])

			expect(result[0].avgDurationMinutes).toBe(0)
		})
	})

	// ========================================================================
	// Sort order
	// ========================================================================

	describe("sort order", () => {
		it("should return buckets sorted ascending by bucketOrder (0→7)", () => {
			const trades = [
				makeTradeWithDuration(300, { outcome: "win", pnl: "5000" }), // > 4h   (order 7)
				makeTradeWithDuration(0.5, { outcome: "win", pnl: "5000" }), // < 1min (order 0)
				makeTradeWithDuration(90, { outcome: "win", pnl: "5000" }), // 1-2h   (order 5)
				makeTradeWithDuration(3, { outcome: "win", pnl: "5000" }), // 1-5min (order 1)
				makeTradeWithDuration(45, { outcome: "win", pnl: "5000" }), // 30-60min (order 4)
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }), // 5-15min (order 2)
				makeTradeWithDuration(20, { outcome: "win", pnl: "5000" }), // 15-30min (order 3)
			]

			const result = computeHoldingPeriodAnalysis(trades)

			// 7 distinct buckets populated (order 6 "2-4h" has no trade)
			expect(result).toHaveLength(7)
			const actualOrders = result.map((b) => b.bucketOrder)
			expect(actualOrders).toEqual([0, 1, 2, 3, 4, 5, 7])
		})

		it("should preserve ascending order for a subset of buckets", () => {
			// Only 2 buckets populated — sort must still be ascending among those
			const trades = [
				makeTradeWithDuration(90, { outcome: "win", pnl: "5000" }), // 1-2h   (order 5)
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }), // 5-15min (order 2)
			]

			const result = computeHoldingPeriodAnalysis(trades)
			expect(result).toHaveLength(2)
			expect(result[0].bucketOrder).toBeLessThan(result[1].bucketOrder)
		})
	})

	// ========================================================================
	// Empty buckets excluded
	// ========================================================================

	describe("empty buckets exclusion", () => {
		it("should not include buckets that have no trades", () => {
			// Only trades in one bucket → only that bucket should appear
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
			]
			const result = computeHoldingPeriodAnalysis(trades)

			expect(result).toHaveLength(1)
			expect(result[0].bucket).toBe("5-15min")
		})

		it("should return exactly the number of distinct buckets that have trades", () => {
			const trades = [
				makeTradeWithDuration(0.5, { outcome: "win", pnl: "5000" }), // < 1min
				makeTradeWithDuration(2, { outcome: "win", pnl: "5000" }), // 1-5min
				makeTradeWithDuration(2, { outcome: "loss", pnl: "-3000" }), // 1-5min (same bucket)
			]

			const result = computeHoldingPeriodAnalysis(trades)
			// Only 2 distinct buckets are populated
			expect(result).toHaveLength(2)
		})
	})

	// ========================================================================
	// Single trade
	// ========================================================================

	describe("single trade", () => {
		it("should return one bucket with all metrics correctly set for a single win trade", () => {
			const trade = makeTradeWithDuration(30, {
				outcome: "win",
				pnl: "15000", // R$150
				realizedRMultiple: "3.0",
			})

			const result = computeHoldingPeriodAnalysis([trade])

			expect(result).toHaveLength(1)
			const bucket = result[0]

			expect(bucket.bucket).toBe("30-60min")
			expect(bucket.bucketOrder).toBe(4)
			expect(bucket.totalTrades).toBe(1)
			expect(bucket.wins).toBe(1)
			expect(bucket.losses).toBe(0)
			expect(bucket.breakevens).toBe(0)
			expect(bucket.winRate).toBe(100)
			expect(bucket.totalPnl).toBeCloseTo(150, 5)
			expect(bucket.avgPnl).toBeCloseTo(150, 5)
			expect(bucket.avgR).toBeCloseTo(3.0, 5)
			expect(bucket.avgDurationMinutes).toBeCloseTo(30, 5)
			expect(bucket.profitFactor).toBe(Infinity)
		})

		it("should return one bucket with all metrics correctly set for a single loss trade", () => {
			const trade = makeTradeWithDuration(20, {
				outcome: "loss",
				pnl: "-8000", // -R$80
				realizedRMultiple: "-1.5",
			})

			const result = computeHoldingPeriodAnalysis([trade])

			expect(result).toHaveLength(1)
			const bucket = result[0]

			expect(bucket.bucket).toBe("15-30min")
			expect(bucket.totalTrades).toBe(1)
			expect(bucket.wins).toBe(0)
			expect(bucket.losses).toBe(1)
			expect(bucket.breakevens).toBe(0)
			expect(bucket.winRate).toBe(0)
			expect(bucket.totalPnl).toBeCloseTo(-80, 5)
			expect(bucket.avgPnl).toBeCloseTo(-80, 5)
			expect(bucket.avgR).toBeCloseTo(-1.5, 5)
			expect(bucket.profitFactor).toBe(0)
		})
	})

	// ========================================================================
	// Multi-bucket accuracy
	// ========================================================================

	describe("multi-bucket accuracy", () => {
		it("should correctly separate trades into distinct buckets and compute independent metrics", () => {
			const trades = [
				// "< 1min" bucket: 1 win
				makeTradeWithDuration(0, { outcome: "win", pnl: "1000" }),

				// "5-15min" bucket: 1 win + 1 loss
				makeTradeWithDuration(10, { outcome: "win", pnl: "10000" }),
				makeTradeWithDuration(12, { outcome: "loss", pnl: "-5000" }),

				// "2-4h" bucket: 1 loss (120 min falls in [120, 240))
				makeTradeWithDuration(120, { outcome: "loss", pnl: "-20000" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			expect(result).toHaveLength(3)

			const sub1min = getBucket(result, "< 1min")!
			expect(sub1min.totalTrades).toBe(1)
			expect(sub1min.wins).toBe(1)
			expect(sub1min.totalPnl).toBeCloseTo(10, 5) // 1000 cents = R$10

			const min5to15 = getBucket(result, "5-15min")!
			expect(min5to15.totalTrades).toBe(2)
			expect(min5to15.wins).toBe(1)
			expect(min5to15.losses).toBe(1)
			expect(min5to15.winRate).toBe(50)
			// totalPnl = R$100 + (-R$50) = R$50
			expect(min5to15.totalPnl).toBeCloseTo(50, 5)

			const h2to4 = getBucket(result, "2-4h")!
			expect(h2to4.totalTrades).toBe(1)
			expect(h2to4.losses).toBe(1)
			expect(h2to4.totalPnl).toBeCloseTo(-200, 5) // 20000 cents = R$200
			expect(h2to4.profitFactor).toBe(0)
		})
	})

	// ========================================================================
	// Return type shape
	// ========================================================================

	describe("output shape", () => {
		it("should include all required HoldingPeriodBucket fields in every result entry", () => {
			const result = computeHoldingPeriodAnalysis([
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
			])

			expect(result).toHaveLength(1)
			const bucket = result[0]

			expect(bucket).toHaveProperty("bucket")
			expect(bucket).toHaveProperty("bucketOrder")
			expect(bucket).toHaveProperty("totalTrades")
			expect(bucket).toHaveProperty("wins")
			expect(bucket).toHaveProperty("losses")
			expect(bucket).toHaveProperty("breakevens")
			expect(bucket).toHaveProperty("winRate")
			expect(bucket).toHaveProperty("totalPnl")
			expect(bucket).toHaveProperty("avgPnl")
			expect(bucket).toHaveProperty("avgR")
			expect(bucket).toHaveProperty("avgDurationMinutes")
			expect(bucket).toHaveProperty("profitFactor")
		})

		it("should return numbers (not strings) for all numeric fields", () => {
			const result = computeHoldingPeriodAnalysis([
				makeTradeWithDuration(10, {
					outcome: "win",
					pnl: "5000",
					realizedRMultiple: "2.0",
				}),
			])

			const bucket = result[0]
			expect(typeof bucket.bucketOrder).toBe("number")
			expect(typeof bucket.totalTrades).toBe("number")
			expect(typeof bucket.wins).toBe("number")
			expect(typeof bucket.losses).toBe("number")
			expect(typeof bucket.breakevens).toBe("number")
			expect(typeof bucket.winRate).toBe("number")
			expect(typeof bucket.totalPnl).toBe("number")
			expect(typeof bucket.avgPnl).toBe("number")
			expect(typeof bucket.avgR).toBe("number")
			expect(typeof bucket.avgDurationMinutes).toBe("number")
			expect(typeof bucket.profitFactor).toBe("number")
		})
	})

	// ========================================================================
	// breakevens tracking
	// ========================================================================

	describe("breakeven trade tracking", () => {
		it("should increment the breakevens counter and not affect wins or losses", () => {
			const trades = [
				makeTradeWithDuration(10, { outcome: "win", pnl: "5000" }),
				makeTradeWithDuration(11, { outcome: "breakeven", pnl: "0" }),
				makeTradeWithDuration(12, { outcome: "breakeven", pnl: "0" }),
			]

			const result = computeHoldingPeriodAnalysis(trades)
			const bucket = getBucket(result, "5-15min")!

			expect(bucket.wins).toBe(1)
			expect(bucket.losses).toBe(0)
			expect(bucket.breakevens).toBe(2)
			expect(bucket.totalTrades).toBe(3)
		})
	})
})

// ---------------------------------------------------------------------------
// formatDuration helper
// ---------------------------------------------------------------------------

describe("formatDuration()", () => {
	describe("sub-minute durations", () => {
		it('should return "< 1min" for 0 minutes', () => {
			expect(formatDuration(0)).toBe("< 1min")
		})

		it('should return "< 1min" for 0.5 minutes', () => {
			expect(formatDuration(0.5)).toBe("< 1min")
		})

		it('should return "< 1min" for 0.99 minutes', () => {
			expect(formatDuration(0.99)).toBe("< 1min")
		})
	})

	describe("minute-range durations (1–59)", () => {
		it('should return "1min" for exactly 1 minute', () => {
			expect(formatDuration(1)).toBe("1min")
		})

		it('should return "5min" for 5 minutes', () => {
			expect(formatDuration(5)).toBe("5min")
		})

		it("should round to the nearest minute", () => {
			// 4.6 rounds to 5
			expect(formatDuration(4.6)).toBe("5min")
			// 4.4 rounds to 4
			expect(formatDuration(4.4)).toBe("4min")
		})

		it('should return "59min" for 59 minutes', () => {
			expect(formatDuration(59)).toBe("59min")
		})
	})

	describe("hour-range durations (60+)", () => {
		it('should return "1.0h" for exactly 60 minutes', () => {
			expect(formatDuration(60)).toBe("1.0h")
		})

		it('should return "1.5h" for 90 minutes', () => {
			expect(formatDuration(90)).toBe("1.5h")
		})

		it('should return "4.0h" for 240 minutes', () => {
			expect(formatDuration(240)).toBe("4.0h")
		})

		it("should format fractional hours to one decimal place", () => {
			// 70 / 60 = 1.1666... → "1.2h"
			expect(formatDuration(70)).toBe("1.2h")
		})
	})
})

// ---------------------------------------------------------------------------
// Component logic: metric key selection based on expectancyMode
// ---------------------------------------------------------------------------

describe("expectancyMode metric key selection", () => {
	/**
	 * Mirrors the logic in HoldingPeriodChart:
	 *   const isRMode = expectancyMode === "edge"
	 *   const metricKey = isRMode ? "avgR" : "totalPnl"
	 */
	const getMetricKey = (
		expectancyMode: "capital" | "edge"
	): "avgR" | "totalPnl" => {
		return expectancyMode === "edge" ? "avgR" : "totalPnl"
	}

	it('should use "totalPnl" as the metric key when mode is "capital"', () => {
		expect(getMetricKey("capital")).toBe("totalPnl")
	})

	it('should use "avgR" as the metric key when mode is "edge"', () => {
		expect(getMetricKey("edge")).toBe("avgR")
	})
})

// ---------------------------------------------------------------------------
// Component logic: best/worst bucket selection
// ---------------------------------------------------------------------------

describe("best and worst bucket selection", () => {
	const createBucket = (
		bucket: string,
		bucketOrder: number,
		totalPnl: number,
		avgR: number
	): HoldingPeriodBucket => ({
		bucket,
		bucketOrder,
		totalTrades: 2,
		wins: 1,
		losses: 1,
		breakevens: 0,
		winRate: 50,
		totalPnl,
		avgPnl: totalPnl / 2,
		avgR,
		avgDurationMinutes: 10,
		profitFactor: 1,
	})

	/**
	 * Mirrors the component sort logic for totalPnl mode:
	 *   sorted = activeBuckets.toSorted((a, b) => b[metricKey] - a[metricKey])
	 *   bestBucket  = sorted[0]
	 *   worstBucket = sorted[sorted.length - 1]
	 */
	const selectBestWorst = (
		buckets: HoldingPeriodBucket[],
		metricKey: "totalPnl" | "avgR"
	) => {
		const sorted = [...buckets].sort((a, b) => b[metricKey] - a[metricKey])
		return { best: sorted[0], worst: sorted[sorted.length - 1] }
	}

	it("should identify the bucket with the highest totalPnl as best in capital mode", () => {
		const buckets = [
			createBucket("5-15min", 2, 200, 1.0),
			createBucket("1-2h", 5, -50, -0.5),
			createBucket("< 1min", 0, 500, 2.0),
		]

		const { best, worst } = selectBestWorst(buckets, "totalPnl")
		expect(best.bucket).toBe("< 1min")
		expect(worst.bucket).toBe("1-2h")
	})

	it("should identify the bucket with the highest avgR as best in edge mode", () => {
		const buckets = [
			createBucket("5-15min", 2, 200, 1.0),
			createBucket("1-2h", 5, -50, -0.5),
			createBucket("< 1min", 0, 500, 2.0),
		]

		const { best, worst } = selectBestWorst(buckets, "avgR")
		expect(best.bucket).toBe("< 1min")
		expect(worst.bucket).toBe("1-2h")
	})

	it("should handle a single bucket (best === worst)", () => {
		const buckets = [createBucket("5-15min", 2, 100, 1.5)]
		const { best, worst } = selectBestWorst(buckets, "totalPnl")
		expect(best.bucket).toBe(worst.bucket)
	})
})

// ---------------------------------------------------------------------------
// Component logic: empty state guard
// ---------------------------------------------------------------------------

describe("activeBuckets empty state guard", () => {
	/**
	 * Mirrors: const activeBuckets = data.filter((d) => d.totalTrades > 0)
	 * The component renders the empty state when activeBuckets.length === 0.
	 */
	const getActiveBuckets = (data: Array<{ totalTrades: number }>) =>
		data.filter((d) => d.totalTrades > 0)

	it("should result in an empty activeBuckets array when data is an empty array", () => {
		expect(getActiveBuckets([])).toHaveLength(0)
	})

	it("should result in an empty activeBuckets array when all buckets have 0 trades", () => {
		const allEmpty = [{ totalTrades: 0 }, { totalTrades: 0 }]
		expect(getActiveBuckets(allEmpty)).toHaveLength(0)
	})

	it("should include only buckets that have at least 1 trade", () => {
		const mixed = [
			{ totalTrades: 0 },
			{ totalTrades: 3 },
			{ totalTrades: 0 },
			{ totalTrades: 1 },
		]
		const active = getActiveBuckets(mixed)
		expect(active).toHaveLength(2)
		expect(active.every((b) => b.totalTrades > 0)).toBe(true)
	})
})
