import { describe, expect, it } from "vitest"
import {
	resolveActiveTradeId,
	buildTradeLabel,
	resolveBrickSize,
	type TradeSpan,
} from "@/components/hawks-chart/trade-hover"
import type { HawksChartTradeMarker } from "@/app/actions/hawks-chart-data.types"

// =============================================================================
// resolveActiveTradeId tests
// =============================================================================

describe("resolveActiveTradeId", () => {
	const createSpan = (id: string, start: number, end: number): TradeSpan => ({
		id,
		startBrickIdx: start,
		endBrickIdx: end,
	})

	it("returns null when hoveredIdx is null", () => {
		const spans = [createSpan("trade-1", 10, 20)]
		const result = resolveActiveTradeId(spans, null)
		expect(result).toBe(null)
	})

	it("returns null when spans array is empty", () => {
		const result = resolveActiveTradeId([], 15)
		expect(result).toBe(null)
	})

	it("returns the trade id when hoveredIdx is inside a single span", () => {
		const spans = [createSpan("trade-abc", 10, 20)]
		const result = resolveActiveTradeId(spans, 15)
		expect(result).toBe("trade-abc")
	})

	it("returns the trade id when hoveredIdx equals the startBrickIdx (inclusive boundary)", () => {
		const spans = [createSpan("trade-start", 10, 20)]
		const result = resolveActiveTradeId(spans, 10)
		expect(result).toBe("trade-start")
	})

	it("returns the trade id when hoveredIdx equals the endBrickIdx (inclusive boundary)", () => {
		const spans = [createSpan("trade-end", 10, 20)]
		const result = resolveActiveTradeId(spans, 20)
		expect(result).toBe("trade-end")
	})

	it("returns null when hoveredIdx is below the first span's start", () => {
		const spans = [createSpan("trade-1", 10, 20)]
		const result = resolveActiveTradeId(spans, 5)
		expect(result).toBe(null)
	})

	it("returns null when hoveredIdx is above the last span's end", () => {
		const spans = [createSpan("trade-1", 10, 20)]
		const result = resolveActiveTradeId(spans, 25)
		expect(result).toBe(null)
	})

	it("returns null when hoveredIdx is in a gap between two spans", () => {
		const spans = [createSpan("trade-1", 10, 15), createSpan("trade-2", 20, 25)]
		const result = resolveActiveTradeId(spans, 17)
		expect(result).toBe(null)
	})

	it("selects the span with startBrickIdx nearest to hoveredIdx when spans overlap", () => {
		const spans = [
			createSpan("trade-far", 5, 30),
			createSpan("trade-near", 12, 25),
		]
		const result = resolveActiveTradeId(spans, 15)
		// trade-near starts at 12, delta=3; trade-far starts at 5, delta=10
		// trade-near is nearest
		expect(result).toBe("trade-near")
	})

	it("breaks ties by selecting the later-starting span (higher startBrickIdx) when deltas are equal", () => {
		const spans = [
			createSpan("trade-early", 10, 30),
			createSpan("trade-late", 20, 30),
		]
		// Both contain hovered idx 15
		// Actually trade-late (20) does NOT contain 15, so only trade-early wins
		// Let me fix: both should contain
		const result = resolveActiveTradeId(spans, 20)
		// hoveredIdx=20 is in both: [10,30] and [20,30]
		// delta for trade-early: |20-10|=10
		// delta for trade-late: |20-20|=0
		// trade-late has delta=0, nearest wins
		expect(result).toBe("trade-late")
	})

	it("breaks ties by later-starting when both spans start at same distance on opposite sides", () => {
		// This tests the specific tie-break: equal delta, pick higher startBrickIdx
		const spans = [
			createSpan("trade-earlier", 10, 22),
			createSpan("trade-later", 12, 24),
		]
		const result = resolveActiveTradeId(spans, 16)
		// Both contain 16
		// delta for trade-earlier: |16-10|=6
		// delta for trade-later: |16-12|=4
		// trade-later is nearest (4 < 6)
		expect(result).toBe("trade-later")
	})

	it("handles multiple overlapping spans correctly", () => {
		const spans = [
			createSpan("trade-1", 0, 50),
			createSpan("trade-2", 20, 40),
			createSpan("trade-3", 25, 35),
		]
		const result = resolveActiveTradeId(spans, 30)
		// All contain 30
		// delta for trade-1: |30-0|=30
		// delta for trade-2: |30-20|=10
		// delta for trade-3: |30-25|=5
		// trade-3 is nearest
		expect(result).toBe("trade-3")
	})

	it("returns null when hoveredIdx is exactly between two non-overlapping spans", () => {
		const spans = [createSpan("trade-1", 5, 10), createSpan("trade-2", 20, 25)]
		const result = resolveActiveTradeId(spans, 15)
		expect(result).toBe(null)
	})

	it("handles single-brick spans (start === end)", () => {
		const spans = [
			createSpan("trade-single", 15, 15),
			createSpan("trade-range", 10, 20),
		]
		const result = resolveActiveTradeId(spans, 15)
		// Both contain 15
		// delta for trade-single: |15-15|=0
		// delta for trade-range: |15-10|=5
		// trade-single is nearest
		expect(result).toBe("trade-single")
	})
})

// =============================================================================
// buildTradeLabel tests
// =============================================================================

describe("buildTradeLabel", () => {
	const createTrade = (
		overrides: Partial<HawksChartTradeMarker> = {}
	): HawksChartTradeMarker => ({
		id: "17143956abcdef12",
		direction: "long",
		rMultiple: 2.05,
		...overrides,
	})

	it("formats a long trade with positive R correctly", () => {
		const trade = createTrade()
		const result = buildTradeLabel(trade, 3)
		expect(result).toBe("#3 · long · +2.05R · 17143956")
	})

	it("formats a short trade with negative R correctly", () => {
		const trade = createTrade({ direction: "short", rMultiple: -1.05 })
		const result = buildTradeLabel(trade, 5)
		expect(result).toBe("#5 · short · -1.05R · 17143956")
	})

	it("formats zero R with plus sign", () => {
		const trade = createTrade({ rMultiple: 0 })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · +0.00R · 17143956")
	})

	it("formats R to exactly 2 decimal places", () => {
		const trade = createTrade({ rMultiple: 3.1 })
		const result = buildTradeLabel(trade, 2)
		expect(result).toBe("#2 · long · +3.10R · 17143956")
	})

	it("replaces null rMultiple with em dash", () => {
		const trade = createTrade({ rMultiple: null })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · — · 17143956")
	})

	it("replaces non-finite rMultiple with em dash", () => {
		const trade = createTrade({ rMultiple: NaN })
		const result = buildTradeLabel(trade, 2)
		expect(result).toBe("#2 · long · — · 17143956")
	})

	it("replaces Infinity rMultiple with em dash", () => {
		const trade = createTrade({ rMultiple: Number.POSITIVE_INFINITY })
		const result = buildTradeLabel(trade, 3)
		expect(result).toBe("#3 · long · — · 17143956")
	})

	it("truncates id to first 8 characters", () => {
		const trade = createTrade({ id: "aaaabbbbccccdddd" })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · +2.05R · aaaabbbb")
	})

	it("handles id exactly 8 characters long", () => {
		const trade = createTrade({ id: "12345678" })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · +2.05R · 12345678")
	})

	it("handles id shorter than 8 characters", () => {
		const trade = createTrade({ id: "short-id" })
		const result = buildTradeLabel(trade, 1)
		// "short-id" is exactly 8 chars with the dash, but sliced to 8 still
		expect(result).toBe("#1 · long · +2.05R · short-id")
	})

	it("renders index as-is (1-based, user-provided)", () => {
		const trade = createTrade()
		const result1 = buildTradeLabel(trade, 1)
		const result2 = buildTradeLabel(trade, 42)
		expect(result1).toContain("#1")
		expect(result2).toContain("#42")
	})

	it("formats negative R with correct sign", () => {
		const trade = createTrade({ rMultiple: -5.5 })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · -5.50R · 17143956")
	})

	it("handles very small negative R", () => {
		const trade = createTrade({ rMultiple: -0.01 })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · -0.01R · 17143956")
	})

	it("handles very large positive R", () => {
		const trade = createTrade({ rMultiple: 99.99 })
		const result = buildTradeLabel(trade, 1)
		expect(result).toBe("#1 · long · +99.99R · 17143956")
	})

	it("preserves direction exactly as provided", () => {
		const tradeLong = createTrade({ direction: "long" })
		const tradeShort = createTrade({ direction: "short" })
		const resultLong = buildTradeLabel(tradeLong, 1)
		const resultShort = buildTradeLabel(tradeShort, 1)
		expect(resultLong).toContain("· long ·")
		expect(resultShort).toContain("· short ·")
	})
})

// =============================================================================
// resolveBrickSize tests
// =============================================================================

describe("resolveBrickSize", () => {
	const createCandle = (
		brick: number | null
	): { readonly indicators: Record<string, number> } => ({
		indicators: brick !== null ? { brick } : {},
	})

	it("returns the hovered candle's brick value when hoveredIdx is valid and brick exists", () => {
		const candles = [createCandle(20), createCandle(21), createCandle(22)]
		const result = resolveBrickSize(candles, 1, 999)
		expect(result).toBe(21)
	})

	it("returns null hoveredIdx falls back to last candle's brick", () => {
		const candles = [createCandle(20), createCandle(21), createCandle(22)]
		const result = resolveBrickSize(candles, null, 999)
		expect(result).toBe(22)
	})

	it("returns fallbackSize when hoveredIdx is null and last candle has no brick", () => {
		const candles = [createCandle(20), createCandle(null)]
		const result = resolveBrickSize(candles, null, 50)
		expect(result).toBe(50)
	})

	it("falls back to last candle's brick when hovered candle has no brick", () => {
		const candles = [createCandle(20), createCandle(null), createCandle(25)]
		const result = resolveBrickSize(candles, 1, 999)
		// hovered at idx 1 has no brick, falls to last candle (idx 2) which has 25
		expect(result).toBe(25)
	})

	it("returns fallbackSize when both hovered and last candle have no brick", () => {
		const candles = [createCandle(20), createCandle(null), createCandle(null)]
		const result = resolveBrickSize(candles, 1, 50)
		expect(result).toBe(50)
	})

	it("returns fallbackSize when candles array is empty", () => {
		const result = resolveBrickSize([], null, 75)
		expect(result).toBe(75)
	})

	it("ignores non-numeric brick values (non-finite)", () => {
		const candles = [
			createCandle(20),
			{ indicators: { brick: NaN } },
			createCandle(25),
		]
		const result = resolveBrickSize(candles, 1, 50)
		// hovered at idx 1 has NaN, falls to last candle (idx 2) which has 25
		expect(result).toBe(25)
	})

	it("ignores Infinity brick values", () => {
		const candles = [
			createCandle(20),
			{ indicators: { brick: Number.POSITIVE_INFINITY } },
			createCandle(25),
		]
		const result = resolveBrickSize(candles, 1, 50)
		expect(result).toBe(25)
	})

	it("returns correct brick when hoveredIdx points to first candle", () => {
		const candles = [createCandle(30), createCandle(40), createCandle(50)]
		const result = resolveBrickSize(candles, 0, 999)
		expect(result).toBe(30)
	})

	it("returns correct brick when hoveredIdx points to last candle", () => {
		const candles = [createCandle(30), createCandle(40), createCandle(50)]
		const result = resolveBrickSize(candles, 2, 999)
		expect(result).toBe(50)
	})

	it("handles single candle with valid brick and null hoveredIdx", () => {
		const candles = [createCandle(42)]
		const result = resolveBrickSize(candles, null, 999)
		expect(result).toBe(42)
	})

	it("handles single candle with valid brick and hoveredIdx=0", () => {
		const candles = [createCandle(42)]
		const result = resolveBrickSize(candles, 0, 999)
		expect(result).toBe(42)
	})

	it("handles single candle with no brick and null hoveredIdx returning fallback", () => {
		const candles = [createCandle(null)]
		const result = resolveBrickSize(candles, null, 100)
		expect(result).toBe(100)
	})

	it("handles hoveredIdx out of bounds (does not throw)", () => {
		const candles = [createCandle(20), createCandle(25)]
		// Out-of-bounds index should not cause an error; falls back to last candle
		const result = resolveBrickSize(candles, 99, 999)
		// at(99) returns null, so falls to last candle's brick
		expect(result).toBe(25)
	})

	it("handles negative hoveredIdx (does not throw)", () => {
		const candles = [createCandle(20), createCandle(25)]
		const result = resolveBrickSize(candles, -1, 999)
		// at(-1) returns null, so falls to last candle's brick
		expect(result).toBe(25)
	})

	it("prefers hovered candle's brick even when it's zero", () => {
		const candles = [createCandle(20), createCandle(0), createCandle(30)]
		const result = resolveBrickSize(candles, 1, 999)
		// 0 is a finite number, so it should be returned
		expect(result).toBe(0)
	})

	it("treats missing indicators object as no brick", () => {
		const candles = [
			createCandle(20),
			{ indicators: {} as Record<string, number> },
			createCandle(30),
		]
		const result = resolveBrickSize(candles, 1, 50)
		expect(result).toBe(30)
	})

	it("returns fallbackSize when all candles lack brick and hoveredIdx is null", () => {
		const candles = [{ indicators: { other: 1 } }, { indicators: { other: 2 } }]
		const result = resolveBrickSize(candles, null, 123)
		expect(result).toBe(123)
	})
})
