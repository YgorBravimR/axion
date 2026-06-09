import { describe, it, expect } from "vitest"
import { groupCandlesByDay } from "@/lib/backtest/day-grouper"
import type { CandleRow } from "@/types/candle"

const candle = (
	timestamp: string,
	candleIndex = 0,
	overrides: Partial<CandleRow> = {}
): CandleRow => ({
	timestamp,
	open: 1000,
	high: 1100,
	low: 900,
	close: 1050,
	candleIndex,
	indicators: {},
	...overrides,
})

describe("day-grouper — group by BRT calendar day", () => {
	it("should group candles by BRT calendar day (00:00-23:59)", () => {
		const candles = [
			// 2026-06-08 BRT candles (in UTC: 2026-06-08T03:00:00Z to 2026-06-08T21:00:00Z)
			candle("2026-06-08T03:00:00Z", 0), // 00:00 BRT
			candle("2026-06-08T12:00:00Z", 1), // 09:00 BRT (opening)
			candle("2026-06-08T21:00:00Z", 2), // 18:00 BRT (session end, still in day bucket)
			// 2026-06-09 BRT candles
			candle("2026-06-09T03:00:00Z", 3), // 00:00 BRT (next day)
		]

		const days = groupCandlesByDay(candles)

		expect(days.size).toBe(2)
		expect(days.get("2026-06-08")?.length).toBe(3)
		expect(days.get("2026-06-09")?.length).toBe(1)
	})

	it("should include after-hours candles in the day bucket (not filtered out)", () => {
		const candles = [
			// 2026-06-08 regular session (09:00-18:00 BRT)
			candle("2026-06-08T12:00:00Z", 0), // 09:00 BRT
			candle("2026-06-08T21:00:00Z", 1), // 18:00 BRT
			// After-hours on 2026-06-08 (18:00-23:59 BRT)
			candle("2026-06-08T21:15:00Z", 2), // 18:15 BRT (after session end)
			candle("2026-06-08T23:50:00Z", 3), // 20:50 BRT (late evening)
		]

		const days = groupCandlesByDay(candles)

		// All 4 candles should be in 2026-06-08 bucket (not filtered by session hours)
		expect(days.size).toBe(1)
		expect(days.get("2026-06-08")?.length).toBe(4)
	})

	it("should include pre-market candles in the day bucket", () => {
		const candles = [
			// Pre-market (00:00-09:00 BRT)
			candle("2026-06-08T03:00:00Z", 0), // 00:00 BRT
			candle("2026-06-08T07:00:00Z", 1), // 04:00 BRT (early morning)
			// Regular session
			candle("2026-06-08T12:00:00Z", 2), // 09:00 BRT
		]

		const days = groupCandlesByDay(candles)

		// All candles on 2026-06-08 in one bucket (pre-market not filtered)
		expect(days.size).toBe(1)
		expect(days.get("2026-06-08")?.length).toBe(3)
	})

	it("should preserve timestamp order within each day", () => {
		const candles = [
			candle("2026-06-08T12:00:00Z", 2), // Out of order
			candle("2026-06-08T03:00:00Z", 0), // First
			candle("2026-06-08T21:00:00Z", 1), // Last
		]

		const days = groupCandlesByDay(candles)
		const dayCandlesByKey = days.get("2026-06-08")!

		// Should be sorted by timestamp
		expect(dayCandlesByKey[0]?.timestamp).toBe("2026-06-08T03:00:00Z")
		expect(dayCandlesByKey[1]?.timestamp).toBe("2026-06-08T12:00:00Z")
		expect(dayCandlesByKey[2]?.timestamp).toBe("2026-06-08T21:00:00Z")
	})

	it("should use candleIndex as tiebreaker for same-timestamp candles", () => {
		const candles = [
			candle("2026-06-08T12:00:00Z", 2), // Same timestamp, high index
			candle("2026-06-08T12:00:00Z", 0), // Same timestamp, low index
			candle("2026-06-08T12:00:00Z", 1), // Same timestamp, mid index
		]

		const days = groupCandlesByDay(candles)
		const dayCandlesByKey = days.get("2026-06-08")!

		// Should be sorted by candleIndex when timestamp is the same
		expect(dayCandlesByKey[0]?.candleIndex).toBe(0)
		expect(dayCandlesByKey[1]?.candleIndex).toBe(1)
		expect(dayCandlesByKey[2]?.candleIndex).toBe(2)
	})

	it("should handle empty candle list", () => {
		const days = groupCandlesByDay([])
		expect(days.size).toBe(0)
	})
})
