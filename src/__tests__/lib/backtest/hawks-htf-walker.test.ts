import { describe, it, expect } from "vitest"
import {
	buildHtfWalker,
	lookupHtfGate,
	isHtfGateFavorable,
	type HtfWalkerSnapshot,
} from "@/lib/backtest/hawks-htf-walker"
import type { CandleRow } from "@/types/candle"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

const CONFIG = makeHawksConfig({
	prev_15m_open_key: "prev_15m_open",
	prev_15m_close_key: "prev_15m_close",
	ema27_15m_key: "mme27_15m",
	ema55_15m_key: "mme55_15m",
	prev_60m_open_key: "prev_60m_open",
	prev_60m_close_key: "prev_60m_close",
	ema27_60m_key: "mme27_60m",
	ema55_60m_key: "mme55_60m",
})

const candle = (
	timestamp: string,
	overrides: Record<string, number | undefined> = {}
): CandleRow => ({
	timestamp,
	open: 100,
	high: 105,
	low: 95,
	close: 100,
	candleIndex: 1,
	indicators: Object.fromEntries(
		Object.entries({
			mme27_15m: 110,
			mme55_15m: 112,
			mme27_60m: 110,
			mme55_60m: 112,
			prev_15m_open: 99,
			prev_15m_close: 99,
			prev_60m_open: 99,
			prev_60m_close: 99,
			...overrides,
		}).filter(([, v]) => v !== undefined)
	) as Record<string, number>,
})

describe("buildHtfWalker", () => {
	it("seeds NO_SIGNAL when no brick aligns all 4 inequalities", () => {
		const mixedCandle = candle("2026-03-02T13:00:00Z", {
			prev_15m_open: 111, // > mme27_15m (110) but not > mme55_15m (112)
			prev_15m_close: 111,
			prev_60m_open: 111,
			prev_60m_close: 111,
		})
		const walker = buildHtfWalker([mixedCandle], CONFIG)
		const snapshot = walker.get("2026-03-02T13:00:00Z")
		expect(snapshot).toEqual<HtfWalkerSnapshot>({
			gate15m: "NO_SIGNAL",
			gate60m: "NO_SIGNAL",
		})
	})

	it("flips to BULL when all 4 inequalities first align above both EMAs", () => {
		const bullCandle = candle("2026-03-02T13:00:00Z", {
			prev_15m_open: 120,
			prev_15m_close: 121,
			prev_60m_open: 120,
			prev_60m_close: 121,
		})
		const walker = buildHtfWalker([bullCandle], CONFIG)
		const snapshot = walker.get("2026-03-02T13:00:00Z")
		expect(snapshot?.gate15m).toBe("BULL")
		expect(snapshot?.gate60m).toBe("BULL")
	})

	it("flips to BEAR when all 4 inequalities first align below both EMAs", () => {
		const bearCandle = candle("2026-03-02T13:00:00Z", {
			prev_15m_open: 99,
			prev_15m_close: 99,
			prev_60m_open: 99,
			prev_60m_close: 99,
		})
		const walker = buildHtfWalker([bearCandle], CONFIG)
		const snapshot = walker.get("2026-03-02T13:00:00Z")
		expect(snapshot?.gate15m).toBe("BEAR")
		expect(snapshot?.gate60m).toBe("BEAR")
	})

	it("holds BEAR state through mixed-zone bricks (the sticky-walker invariant)", () => {
		const candles: CandleRow[] = [
			// Seed BEAR.
			candle("2026-03-02T13:00:00Z", {
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
			}),
			// Mixed: open below mme27 but close above. Methodology = stay BEAR.
			candle("2026-03-02T13:05:00Z", {
				prev_15m_open: 99,
				prev_15m_close: 115,
				prev_60m_open: 99,
				prev_60m_close: 115,
			}),
			// Still BEAR on the next mixed brick.
			candle("2026-03-02T13:10:00Z", {
				prev_15m_open: 115,
				prev_15m_close: 99,
				prev_60m_open: 115,
				prev_60m_close: 99,
			}),
		]
		const walker = buildHtfWalker(candles, CONFIG)
		expect(walker.get("2026-03-02T13:00:00Z")?.gate15m).toBe("BEAR")
		expect(walker.get("2026-03-02T13:05:00Z")?.gate15m).toBe("BEAR")
		expect(walker.get("2026-03-02T13:10:00Z")?.gate15m).toBe("BEAR")
	})

	it("flips BEAR → BULL only when all 4 reverse on a single brick", () => {
		const candles: CandleRow[] = [
			candle("2026-03-02T13:00:00Z", {
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
			}),
			// All 4 above both EMAs → flip.
			candle("2026-03-02T13:05:00Z", {
				prev_15m_open: 120,
				prev_15m_close: 121,
				prev_60m_open: 120,
				prev_60m_close: 121,
			}),
		]
		const walker = buildHtfWalker(candles, CONFIG)
		expect(walker.get("2026-03-02T13:00:00Z")?.gate15m).toBe("BEAR")
		expect(walker.get("2026-03-02T13:05:00Z")?.gate15m).toBe("BULL")
	})

	it("carries prior state forward when a brick has missing indicator data", () => {
		const candles: CandleRow[] = [
			candle("2026-03-02T13:00:00Z", {
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
			}),
			// Missing EMAs — null. Walker should keep BEAR.
			candle("2026-03-02T13:05:00Z", {
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
				mme27_15m: undefined,
				mme55_15m: undefined,
			}),
		]
		const walker = buildHtfWalker(candles, CONFIG)
		expect(walker.get("2026-03-02T13:00:00Z")?.gate15m).toBe("BEAR")
		expect(walker.get("2026-03-02T13:05:00Z")?.gate15m).toBe("BEAR")
	})

	it("walks 15m and 60m independently", () => {
		const candles: CandleRow[] = [
			candle("2026-03-02T13:00:00Z", {
				// 15m bearish, 60m bullish.
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 120,
				prev_60m_close: 121,
			}),
		]
		const walker = buildHtfWalker(candles, CONFIG)
		const snapshot = walker.get("2026-03-02T13:00:00Z")
		expect(snapshot?.gate15m).toBe("BEAR")
		expect(snapshot?.gate60m).toBe("BULL")
	})

	it("state persists across the array (no per-day reset)", () => {
		const candles: CandleRow[] = [
			// Day N end of session — last bullish brick.
			candle("2026-03-02T17:00:00Z", {
				prev_15m_open: 120,
				prev_15m_close: 121,
				prev_60m_open: 120,
				prev_60m_close: 121,
			}),
			// Day N+1 open — mixed brick. Should still be BULL.
			candle("2026-03-03T12:00:00Z", {
				prev_15m_open: 100,
				prev_15m_close: 115,
				prev_60m_open: 100,
				prev_60m_close: 115,
			}),
		]
		const walker = buildHtfWalker(candles, CONFIG)
		expect(walker.get("2026-03-03T12:00:00Z")?.gate15m).toBe("BULL")
		expect(walker.get("2026-03-03T12:00:00Z")?.gate60m).toBe("BULL")
	})
})

describe("lookupHtfGate", () => {
	it("returns NO_SIGNAL for both timeframes when walker is null", () => {
		const c = candle("2026-03-02T13:00:00Z")
		const snapshot = lookupHtfGate(null, c)
		expect(snapshot).toEqual<HtfWalkerSnapshot>({
			gate15m: "NO_SIGNAL",
			gate60m: "NO_SIGNAL",
		})
	})

	it("returns NO_SIGNAL when timestamp is not in the walker map", () => {
		const c = candle("2026-03-02T13:00:00Z")
		const walker = buildHtfWalker([c], CONFIG)
		const orphan = candle("2026-09-09T13:00:00Z")
		const snapshot = lookupHtfGate(walker, orphan)
		expect(snapshot.gate15m).toBe("NO_SIGNAL")
	})

	it("returns the stored snapshot for a known timestamp", () => {
		const c = candle("2026-03-02T13:00:00Z", {
			prev_15m_open: 99,
			prev_15m_close: 99,
			prev_60m_open: 99,
			prev_60m_close: 99,
		})
		const walker = buildHtfWalker([c], CONFIG)
		const snapshot = lookupHtfGate(walker, c)
		expect(snapshot.gate15m).toBe("BEAR")
		expect(snapshot.gate60m).toBe("BEAR")
	})
})

describe("isHtfGateFavorable", () => {
	it("returns true for SHORT when both timeframes are BEAR", () => {
		expect(
			isHtfGateFavorable({ gate15m: "BEAR", gate60m: "BEAR" }, "short")
		).toBe(true)
	})

	it("returns false for SHORT when only one timeframe is BEAR", () => {
		expect(
			isHtfGateFavorable({ gate15m: "BEAR", gate60m: "BULL" }, "short")
		).toBe(false)
		expect(
			isHtfGateFavorable({ gate15m: "BULL", gate60m: "BEAR" }, "short")
		).toBe(false)
	})

	it("returns true for LONG when both timeframes are BULL", () => {
		expect(
			isHtfGateFavorable({ gate15m: "BULL", gate60m: "BULL" }, "long")
		).toBe(true)
	})

	it("returns false when either timeframe is NO_SIGNAL", () => {
		expect(
			isHtfGateFavorable({ gate15m: "BEAR", gate60m: "NO_SIGNAL" }, "short")
		).toBe(false)
		expect(
			isHtfGateFavorable({ gate15m: "NO_SIGNAL", gate60m: "BULL" }, "long")
		).toBe(false)
	})
})
