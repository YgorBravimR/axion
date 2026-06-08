import { describe, it, expect } from "vitest"
import {
	processHawksCandle,
	createInitialHawksState,
} from "@/lib/backtest/modules/entry/hawks-triple-screen"
import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

const CONFIG: HawksTripleScreenConfig = {
	ema27_60m_key: "mme27_60m",
	ema55_60m_key: "mme55_60m",
	ema27_15m_key: "mme27_15m",
	ema55_15m_key: "mme55_15m",
	macd_key: "macd",
	prev_15m_open_key: "prev_15m_open",
	prev_15m_close_key: "prev_15m_close",
	prev_60m_open_key: "prev_60m_open",
	prev_60m_close_key: "prev_60m_close",
	brickSize5mPoints: 100,
	startTime: 930,
	endTime: 1730,
}

const TICK_SIZE = 5

const HTF_SHORT_PASS = {
	mme27_15m: 2000,
	mme55_15m: 2200,
	prev_15m_open: 1800,
	prev_15m_close: 1800,
	mme27_60m: 2000,
	mme55_60m: 2200,
	prev_60m_open: 1800,
	prev_60m_close: 1800,
}

const BASE_CTX = {
	dayKey: "2026-05-13",
	candleIndexInDay: 5,
	brtHour: 10,
	brtMinute: 0,
	brtHHMM: 1000,
}

const candle = (
	overrides: Partial<CandleRow> & { indicators?: Record<string, number> } = {}
): CandleRow => ({
	timestamp: "2026-05-13T13:00:00.000Z",
	open: 1350,
	high: 1400,
	low: 1300,
	close: 1350,
	candleIndex: 1,
	indicators: {},
	...overrides,
})

const runSequence = (
	candles: CandleRow[],
	ctxOverrides: Partial<typeof BASE_CTX>[] = []
) => {
	let state = createInitialHawksState()
	const signals: ReturnType<typeof processHawksCandle>["signal"][] = []
	for (let i = 0; i < candles.length; i++) {
		const ctx = {
			...BASE_CTX,
			candleIndexInDay: i,
			...(ctxOverrides[i] ?? {}),
		}
		const c = candles[i]
		if (c == null) {
			continue
		}
		const result = processHawksCandle(c, state, ctx, TICK_SIZE, CONFIG)
		state = result.state
		signals.push(result.signal)
	}
	return { signals, finalState: state }
}

describe("Hawks v0.7 — Structural pivot detection", () => {
	it("detects TOPO after 2 consecutive bearish bricks from bullish setup", () => {
		const seq = [
			// c0: bullish — initialization
			candle({
				open: 1950,
				high: 2000,
				low: 1950,
				close: 2000,
				indicators: HTF_SHORT_PASS,
			}),
			// c1: bearish — transition from bullish (priorExtremePrice = 2000)
			candle({
				open: 2000,
				high: 2000,
				low: 1900,
				close: 1900,
				indicators: HTF_SHORT_PASS,
			}),
			// c2: bearish — 2nd consecutive bearish! Structural TOPO at 2000 should fire
			candle({
				open: 1900,
				high: 1900,
				low: 1800,
				close: 1800,
				indicators: HTF_SHORT_PASS,
			}),
		]

		const { finalState } = runSequence(seq)

		// After c2 (second bearish), structural TOPO detected at 2000
		expect(finalState.topoMaiorPrice).toBe(2000)
		expect(finalState.phase).toBe("WAVE_1_DOWN")
	})

	it("detects FUNDO after 2 consecutive bullish bricks from bearish setup", () => {
		const seq = [
			// c0: bearish
			candle({
				open: 2000,
				high: 2000,
				low: 1900,
				close: 1900,
				indicators: HTF_SHORT_PASS,
			}),
			// c1: bullish — transition (priorExtremePrice = 1900)
			candle({
				open: 1800,
				high: 1950,
				low: 1800,
				close: 1950,
				indicators: HTF_SHORT_PASS,
			}),
			// c2: bullish — 2nd consecutive! Structural FUNDO at 1900
			candle({
				open: 1950,
				high: 2000,
				low: 1950,
				close: 2000,
				indicators: HTF_SHORT_PASS,
			}),
		]

		const { finalState } = runSequence(seq)

		expect(finalState.fundoMaiorPrice).toBe(1900)
		expect(finalState.phase).toBe("WAVE_1_UP")
	})

	it("does not classify a pivot if previous pivot is undefined (first pivot only)", () => {
		const seq = [
			// c0: bullish — first brick, no previous pivot
			candle({
				open: 1950,
				high: 2000,
				low: 1950,
				close: 2000,
				indicators: HTF_SHORT_PASS,
			}),
			// c1: bearish — transition
			candle({
				open: 2000,
				high: 2000,
				low: 1900,
				close: 1900,
				indicators: HTF_SHORT_PASS,
			}),
			// c2: bearish — TOPO detected at 2000
			candle({
				open: 1900,
				high: 1900,
				low: 1800,
				close: 1800,
				indicators: HTF_SHORT_PASS,
			}),
		]

		const { finalState } = runSequence(seq)

		// First structural pivot (TOPO at 2000) should set topoMaiorPrice
		expect(finalState.topoMaiorPrice).toBe(2000)
		expect(finalState.lastPivotPrice).toBe(2000)
	})
})
