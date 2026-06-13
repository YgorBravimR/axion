import { describe, it, expect } from "vitest"
import {
	getHawksIndicatorsAtCandle,
	getHawksIndicatorsAt,
} from "@/lib/backtest/hawks-indicators"
import type { CandleRow } from "@/types/candle"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

// Override `macd_key` so test fixtures (which set `macd: -5`) keep matching.
// Parquet-realistic key is "macd1_histo" but legacy fixtures use bare "macd".
const CONFIG = makeHawksConfig({ macd_key: "macd" })

/**
 * Factory function to create a default CandleRow for testing.
 * Default values are set up to match TEST #1 (all-favorable for SHORT).
 */
const candle = (
	overrides: Partial<CandleRow> & { indicators?: Record<string, number> } = {}
): CandleRow => ({
	timestamp: "2026-03-02T13:00:00Z",
	open: 100,
	high: 105,
	low: 95,
	close: 100,
	candleIndex: 1,
	indicators: {
		mme27_60m: 110,
		mme55_60m: 112,
		mme27_15m: 110,
		mme55_15m: 112,
		macd: -5,
		prev_15m_open: 99,
		prev_15m_close: 99,
		prev_60m_open: 99,
		prev_60m_close: 99,
		vwap_d: 110,
		vwap_m: 110,
		vwap_w: 110,
		ajuste: 110,
	},
	...overrides,
	...(overrides.indicators && {
		indicators: {
			mme27_60m: 110,
			mme55_60m: 112,
			mme27_15m: 110,
			mme55_15m: 112,
			macd: -5,
			prev_15m_open: 99,
			prev_15m_close: 99,
			prev_60m_open: 99,
			prev_60m_close: 99,
			vwap_d: 110,
			vwap_m: 110,
			vwap_w: 110,
			ajuste: 110,
			...overrides.indicators,
		},
	}),
})

describe("getHawksIndicatorsAtCandle", () => {
	it("should return all favorable indicators for SHORT when price and gates are below all levels", () => {
		const testCandle = candle({
			close: 95,
			indicators: {
				mme27_60m: 110,
				mme55_60m: 112,
				mme27_15m: 110,
				mme55_15m: 112,
				macd: -5,
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
				vwap_d: 110,
				vwap_m: 110,
				vwap_w: 110,
				ajuste: 110,
			},
		})

		const snapshot = getHawksIndicatorsAtCandle(testCandle, "short", CONFIG)

		expect(snapshot.candleTimestamp).toBe("2026-03-02T13:00:00Z")
		expect(snapshot.direction).toBe("short")
		expect(snapshot.gate15m.state).toBe("below_both")
		expect(snapshot.gate15m.favorable).toBe(true)
		expect(snapshot.gate60m.state).toBe("below_both")
		expect(snapshot.gate60m.favorable).toBe(true)
		expect(snapshot.macd.sign).toBe("negative")
		expect(snapshot.macd.favorable).toBe(true)
		expect(snapshot.vwapD.side).toBe("below")
		expect(snapshot.vwapD.favorable).toBe(true)
		expect(snapshot.vwapM.side).toBe("below")
		expect(snapshot.vwapM.favorable).toBe(true)
		expect(snapshot.vwapW.side).toBe("below")
		expect(snapshot.vwapW.favorable).toBe(true)
		expect(snapshot.ajuste.position).toBe("below")
		expect(snapshot.ajuste.favorable).toBe(true)
		expect(snapshot.favorableCount).toBe(7)
	})

	it("should return all favorable indicators for LONG when price and gates are above all levels", () => {
		const testCandle = candle({
			close: 125,
			indicators: {
				mme27_60m: 110,
				mme55_60m: 112,
				mme27_15m: 110,
				mme55_15m: 112,
				macd: 5,
				prev_15m_open: 115,
				prev_15m_close: 115,
				prev_60m_open: 115,
				prev_60m_close: 115,
				vwap_d: 110,
				vwap_m: 110,
				vwap_w: 110,
				ajuste: 110,
			},
		})

		const snapshot = getHawksIndicatorsAtCandle(testCandle, "long", CONFIG)

		expect(snapshot.candleTimestamp).toBe("2026-03-02T13:00:00Z")
		expect(snapshot.direction).toBe("long")
		expect(snapshot.gate15m.state).toBe("above_both")
		expect(snapshot.gate15m.favorable).toBe(true)
		expect(snapshot.gate60m.state).toBe("above_both")
		expect(snapshot.gate60m.favorable).toBe(true)
		expect(snapshot.macd.sign).toBe("positive")
		expect(snapshot.macd.favorable).toBe(true)
		expect(snapshot.vwapD.side).toBe("above")
		expect(snapshot.vwapD.favorable).toBe(true)
		expect(snapshot.vwapM.side).toBe("above")
		expect(snapshot.vwapM.favorable).toBe(true)
		expect(snapshot.vwapW.side).toBe("above")
		expect(snapshot.vwapW.favorable).toBe(true)
		expect(snapshot.ajuste.position).toBe("above")
		expect(snapshot.ajuste.favorable).toBe(true)
		expect(snapshot.favorableCount).toBe(7)
	})

	it("should mark gate as mixed and unfavorable when open is below but close is above EMA in SHORT direction", () => {
		const testCandle = candle({
			indicators: {
				mme27_60m: 110,
				mme55_60m: 112,
				mme27_15m: 110,
				mme55_15m: 112,
				macd: -5,
				prev_15m_open: 100,
				prev_15m_close: 115,
				prev_60m_open: 99,
				prev_60m_close: 99,
				vwap_d: 110,
				vwap_m: 110,
				vwap_w: 110,
				ajuste: 110,
			},
		})

		const snapshot = getHawksIndicatorsAtCandle(testCandle, "short", CONFIG)

		expect(snapshot.gate15m.state).toBe("mixed")
		expect(snapshot.gate15m.favorable).toBe(false)
		expect(snapshot.gate60m.state).toBe("below_both")
		expect(snapshot.gate60m.favorable).toBe(true)
	})

	it("should return unknown state and unfavorable when indicator key is missing", () => {
		const testCandle: CandleRow = {
			timestamp: "2026-03-02T13:00:00Z",
			open: 100,
			high: 105,
			low: 95,
			close: 100,
			candleIndex: 1,
			indicators: {
				mme55_60m: 112,
				mme27_15m: 110,
				mme55_15m: 112,
				macd: -5,
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
				vwap_d: 110,
				vwap_m: 110,
				vwap_w: 110,
				ajuste: 110,
			},
		}

		const snapshot = getHawksIndicatorsAtCandle(testCandle, "short", CONFIG)

		expect(snapshot.gate60m.state).toBe("unknown")
		expect(snapshot.gate60m.favorable).toBe(false)
	})

	it("should mark MACD as zero sign and unfavorable when MACD value equals 0", () => {
		const testCandle = candle({
			indicators: {
				mme27_60m: 110,
				mme55_60m: 112,
				mme27_15m: 110,
				mme55_15m: 112,
				macd: 0,
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
				vwap_d: 110,
				vwap_m: 110,
				vwap_w: 110,
				ajuste: 110,
			},
		})

		const snapshotShort = getHawksIndicatorsAtCandle(
			testCandle,
			"short",
			CONFIG
		)
		expect(snapshotShort.macd.sign).toBe("zero")
		expect(snapshotShort.macd.favorable).toBe(false)

		const snapshotLong = getHawksIndicatorsAtCandle(testCandle, "long", CONFIG)
		expect(snapshotLong.macd.sign).toBe("zero")
		expect(snapshotLong.macd.favorable).toBe(false)
	})

	it("should mark VWAP side as at and unfavorable when candle close equals VWAP value", () => {
		const testCandle = candle({
			close: 110,
			indicators: {
				mme27_60m: 110,
				mme55_60m: 112,
				mme27_15m: 110,
				mme55_15m: 112,
				macd: -5,
				prev_15m_open: 99,
				prev_15m_close: 99,
				prev_60m_open: 99,
				prev_60m_close: 99,
				vwap_d: 110,
				vwap_m: 110,
				vwap_w: 110,
				ajuste: 110,
			},
		})

		const snapshot = getHawksIndicatorsAtCandle(testCandle, "short", CONFIG)

		expect(snapshot.vwapD.side).toBe("at")
		expect(snapshot.vwapD.favorable).toBe(false)
		expect(snapshot.vwapM.side).toBe("at")
		expect(snapshot.vwapM.favorable).toBe(false)
		expect(snapshot.vwapW.side).toBe("at")
		expect(snapshot.vwapW.favorable).toBe(false)
	})
})

describe("getHawksIndicatorsAt", () => {
	it("should return null when timestamp precedes all candles in the array", () => {
		const candles = [
			candle({ timestamp: "2026-03-02T13:00:00Z" }),
			candle({ timestamp: "2026-03-02T13:05:00Z" }),
			candle({ timestamp: "2026-03-02T13:10:00Z" }),
		]

		const result = getHawksIndicatorsAt(
			candles,
			"2026-03-02T12:00:00Z",
			"short",
			CONFIG
		)

		expect(result).toBeNull()
	})

	it("should find the floor candle when timestamp falls between two candles", () => {
		const candles = [
			candle({
				timestamp: "2026-03-02T13:00:00Z",
				candleIndex: 1,
				close: 95,
			}),
			candle({
				timestamp: "2026-03-02T13:05:00Z",
				candleIndex: 2,
				close: 100,
			}),
			candle({
				timestamp: "2026-03-02T13:10:00Z",
				candleIndex: 3,
				close: 105,
			}),
		]

		const result = getHawksIndicatorsAt(
			candles,
			"2026-03-02T13:07:00Z",
			"short",
			CONFIG
		)

		expect(result).not.toBeNull()
		expect(result!.candleTimestamp).toBe("2026-03-02T13:05:00Z")
	})
})
