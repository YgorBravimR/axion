import { describe, it, expect } from "vitest"
import {
	processHawksCandle,
	createInitialHawksState,
} from "@/lib/backtest/modules/entry/hawks-triple-screen"
import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: HawksTripleScreenConfig = {
	ema27_60m_key: "mme27_60m",
	ema55_60m_key: "mme55_60m",
	ema27_15m_key: "mme27_15m",
	macd_key: "macd",
	startTime: 930,
	endTime: 1730,
}

const BASE_CTX = {
	dayKey: "2026-05-12",
	candleIndexInDay: 5,
	brtHour: 10,
	brtMinute: 0,
	brtHHMM: 1000,
}

const makeCandle = (overrides: Partial<CandleRow> = {}): CandleRow => ({
	timestamp: "2026-05-12T13:00:00.000Z",
	open: 130000,
	high: 130050,
	low: 129950,
	close: 130050, // bullish brick: close > open
	candleIndex: 5,
	indicators: {
		mme27_60m: 129500, // close > mme27_60m ✓
		mme55_60m: 129000, // mme27_60m > mme55_60m ✓
		mme27_15m: 129800, // close > mme27_15m ✓
		macd: 1.5, // > 0 ✓
	},
	...overrides,
})

// ─── Triple-screen alignment — long ──────────────────────────────────────────

describe("Hawks triple-screen — long entry", () => {
	it("fires long signal when all 4 conditions are met", () => {
		const candle = makeCandle()
		const { state, signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)

		expect(signal).not.toBeNull()
		expect(signal!.direction).toBe("long")
		expect(state.doneForDay).toBe(true)
	})

	it("sets stopReference 2 bricks back — Hawks 1R = 2 Renko (2·open − close)", () => {
		const candle = makeCandle({ open: 130000, close: 130050 })
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)

		// 2 * 130000 - 130050 = 129950 (one brick body below the entry brick's open)
		expect(signal!.stopReference).toBe(129950)
	})

	it("entry price is candle.close", () => {
		const candle = makeCandle({ close: 130050 })
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)

		expect(signal!.price).toBe(130050)
	})
})

// ─── Triple-screen alignment — short ─────────────────────────────────────────

describe("Hawks triple-screen — short entry", () => {
	it("fires short signal when all bearish conditions are met", () => {
		const candle = makeCandle({
			open: 130050,
			close: 130000, // bearish brick: close < open
			indicators: {
				mme27_60m: 130500, // close < mme27_60m ✓
				mme55_60m: 131000, // mme27_60m < mme55_60m ✓
				mme27_15m: 130200, // close < mme27_15m ✓
				macd: -1.5, // < 0 ✓
			},
		})
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)

		expect(signal!.direction).toBe("short")
		// 2 * 130050 - 130000 = 130100 (one brick body above the entry brick's open)
		expect(signal!.stopReference).toBe(130100)
	})
})

// ─── Individual condition checks ──────────────────────────────────────────────

describe("Hawks — each condition independently blocks entry", () => {
	it("no signal if brick is doji (close == open)", () => {
		const candle = makeCandle({ open: 130000, close: 130000 })
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)
		expect(signal).toBeNull()
	})

	it("no signal if close is below mme27_60m (60m trend not aligned)", () => {
		const candle = makeCandle({
			close: 129000, // below mme27_60m=129500
			high: 129050,
			indicators: {
				mme27_60m: 129500,
				mme55_60m: 129000,
				mme27_15m: 128800,
				macd: 1.5,
			},
		})
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)
		expect(signal).toBeNull()
	})

	it("no signal if 60m EMA stack is inverted (mme27 < mme55)", () => {
		const candle = makeCandle({
			indicators: {
				mme27_60m: 129000, // mme27 < mme55 — bearish stack
				mme55_60m: 129500,
				mme27_15m: 128800,
				macd: 1.5,
			},
		})
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)
		expect(signal).toBeNull()
	})

	it("no signal if MACD is negative (against long direction)", () => {
		const candle = makeCandle({
			indicators: {
				mme27_60m: 129500,
				mme55_60m: 129000,
				mme27_15m: 129800,
				macd: -0.1, // negative — no long
			},
		})
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)
		expect(signal).toBeNull()
	})
})

// ─── doneForDay — one entry per day max ──────────────────────────────────────

describe("Hawks — doneForDay prevents second entry", () => {
	it("returns null signal on second aligned candle after entry", () => {
		const candle = makeCandle()
		const { state: afterEntry } = processHawksCandle(
			candle,
			createInitialHawksState(),
			BASE_CTX,
			5,
			DEFAULT_CONFIG
		)

		expect(afterEntry.doneForDay).toBe(true)

		const { signal: secondSignal } = processHawksCandle(
			candle,
			afterEntry,
			{ ...BASE_CTX, brtHHMM: 1030, candleIndexInDay: 6 },
			5,
			DEFAULT_CONFIG
		)

		expect(secondSignal).toBeNull()
	})
})

// ─── Time window ──────────────────────────────────────────────────────────────

describe("Hawks — time window filtering", () => {
	it("no signal before startTime", () => {
		const candle = makeCandle()
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			{ ...BASE_CTX, brtHHMM: 929 },
			5,
			DEFAULT_CONFIG
		)
		expect(signal).toBeNull()
	})

	it("no signal at or after endTime", () => {
		const candle = makeCandle()
		const { signal } = processHawksCandle(
			candle,
			createInitialHawksState(),
			{ ...BASE_CTX, brtHHMM: 1730 },
			5,
			DEFAULT_CONFIG
		)
		expect(signal).toBeNull()
	})
})

// ─── Guard: missing indicator key ─────────────────────────────────────────────

describe("Hawks — missing indicator key guard", () => {
	it("throws descriptive error when a required indicator is absent", () => {
		const candle = makeCandle({
			indicators: {
				// mme27_60m is missing
				mme55_60m: 129000,
				mme27_15m: 129800,
				macd: 1.5,
			},
		})

		// Guard fires on candleIndexInDay=0 (first candle of day)
		expect(() =>
			processHawksCandle(
				candle,
				createInitialHawksState(),
				{ ...BASE_CTX, candleIndexInDay: 0, brtHHMM: 930 },
				5,
				DEFAULT_CONFIG
			)
		).toThrow(/mme27_60m/)
	})
})
