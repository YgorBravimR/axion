import { describe, it, expect } from "vitest"
import { buildVolumeEmaWalker } from "@/lib/backtest/hawks-volume-walker"
import type { CandleRow } from "@/types/candle"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

const candle = (timestamp: string, volume: number | null): CandleRow => ({
	timestamp,
	open: 100,
	high: 100,
	low: 100,
	close: 100,
	candleIndex: 1,
	indicators: volume === null ? {} : { volume_fin: volume },
})

describe("buildVolumeEmaWalker", () => {
	it("returns empty map for empty candles", () => {
		const out = buildVolumeEmaWalker([], makeHawksConfig())
		expect(out.size).toBe(0)
	})

	it("seeds EMA on first non-zero value", () => {
		const config = makeHawksConfig({
			qualityGates: { volumeEmaPeriod: 10 },
		})
		const out = buildVolumeEmaWalker([candle("t1", 100)], config)
		const s = out.get("t1")
		expect(s?.ema).toBe(100)
		expect(s?.volume).toBe(100)
		expect(s?.aboveEma).toBe(false) // exactly equal, not above
	})

	it("skips seeding on zero-volume bricks (treats as pre-open)", () => {
		const config = makeHawksConfig({
			qualityGates: { volumeEmaPeriod: 10 },
		})
		const out = buildVolumeEmaWalker(
			[candle("t1", 0), candle("t2", 200)],
			config
		)
		expect(out.get("t1")?.ema).toBeNull()
		expect(out.get("t2")?.ema).toBe(200) // seeded by t2
	})

	it("computes EMA via standard recurrence", () => {
		const config = makeHawksConfig({
			qualityGates: { volumeEmaPeriod: 3 }, // alpha = 2/4 = 0.5
		})
		const out = buildVolumeEmaWalker(
			[candle("t1", 100), candle("t2", 200), candle("t3", 300)],
			config
		)
		// t1: seed = 100
		// t2: 0.5 * 200 + 0.5 * 100 = 150
		// t3: 0.5 * 300 + 0.5 * 150 = 225
		expect(out.get("t1")?.ema).toBe(100)
		expect(out.get("t2")?.ema).toBe(150)
		expect(out.get("t3")?.ema).toBe(225)
	})

	it("sets aboveEma=true when volume > ema", () => {
		const config = makeHawksConfig({
			qualityGates: { volumeEmaPeriod: 3 },
		})
		const out = buildVolumeEmaWalker(
			[candle("t1", 100), candle("t2", 300)],
			config
		)
		// t2 EMA = 0.5*300 + 0.5*100 = 200; volume 300 > ema 200
		expect(out.get("t2")?.aboveEma).toBe(true)
	})

	it("sets aboveEma=false when volume <= ema", () => {
		const config = makeHawksConfig({
			qualityGates: { volumeEmaPeriod: 3 },
		})
		const out = buildVolumeEmaWalker(
			[candle("t1", 100), candle("t2", 50)],
			config
		)
		// t2 EMA = 0.5*50 + 0.5*100 = 75; volume 50 < ema 75
		expect(out.get("t2")?.aboveEma).toBe(false)
	})

	it("propagates null volume without breaking the running EMA", () => {
		const config = makeHawksConfig({
			qualityGates: { volumeEmaPeriod: 3 },
		})
		const out = buildVolumeEmaWalker(
			[candle("t1", 100), candle("t2", null), candle("t3", 200)],
			config
		)
		// t1: seed 100
		// t2: null → carries prior ema, volume null
		// t3: 0.5*200 + 0.5*100 = 150
		expect(out.get("t1")?.ema).toBe(100)
		expect(out.get("t2")?.volume).toBeNull()
		expect(out.get("t2")?.ema).toBe(100) // held
		expect(out.get("t3")?.ema).toBe(150) // recurred from 100
	})

	it("uses default emaPeriod=500 when config doesn't specify", () => {
		const config = makeHawksConfig()
		const out = buildVolumeEmaWalker([candle("t1", 100)], config)
		expect(out.get("t1")?.ema).toBe(100) // seeded successfully
	})
})
