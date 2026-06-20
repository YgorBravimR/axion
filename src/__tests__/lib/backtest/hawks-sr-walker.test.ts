import { describe, it, expect } from "vitest"
import { buildSrWalker } from "@/lib/backtest/hawks-sr-walker"
import type { CandleRow } from "@/types/candle"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

const CONFIG = makeHawksConfig() // brickSize5mPoints = 100; default gates = block 2 / favor 3

const candle = (
	timestamp: string,
	close: number,
	indicators: Partial<{
		mme27_60m: number
		mme55_60m: number
		mme27_15m: number
		mme55_15m: number
		vwap_d: number
		ajuste: number
	}> = {}
): CandleRow => ({
	timestamp,
	open: close,
	high: close,
	low: close,
	close,
	candleIndex: 1,
	indicators: Object.fromEntries(
		Object.entries(indicators).filter(([, v]) => v !== undefined)
	) as Record<string, number>,
})

describe("buildSrWalker", () => {
	it("returns an empty map for empty input", () => {
		const out = buildSrWalker([], CONFIG)
		expect(out.size).toBe(0)
	})

	it("emits empty levelsAhead when no level is within buffer", () => {
		// close=1000, levels all at 2000+/0 — far from buffer (200 pts).
		const out = buildSrWalker(
			[candle("t1", 1000, { vwap_d: 2000, mme27_60m: 0 })],
			CONFIG
		)
		const s = out.get("t1")!
		expect(s.short.blocked).toBe(false)
		expect(s.long.blocked).toBe(false)
		expect(s.short.levelsAhead).toEqual([])
		expect(s.long.levelsAhead).toEqual([])
	})

	it("blocks SHORT when a level is BELOW close within buffer", () => {
		// close=1000, vwap_d=950 → SHORT-ahead 50 pts = 0.5 bricks. Within 2-brick buffer.
		const out = buildSrWalker([candle("t1", 1000, { vwap_d: 950 })], CONFIG)
		const s = out.get("t1")!
		expect(s.short.blocked).toBe(true)
		expect(s.short.levelsAhead).toEqual([
			{ level: "vwap_d", distanceBricks: 0.5 },
		])
		expect(s.long.blocked).toBe(false)
	})

	it("blocks LONG when a level is ABOVE close within buffer", () => {
		// close=1000, vwap_d=1150 → LONG-ahead 150 pts = 1.5 bricks. Within buffer.
		const out = buildSrWalker([candle("t1", 1000, { vwap_d: 1150 })], CONFIG)
		const s = out.get("t1")!
		expect(s.long.blocked).toBe(true)
		expect(s.long.levelsAhead).toEqual([
			{ level: "vwap_d", distanceBricks: 1.5 },
		])
		expect(s.short.blocked).toBe(false)
	})

	it("treats distance 0 (close === level) as a block on both sides", () => {
		const out = buildSrWalker([candle("t1", 1000, { vwap_d: 1000 })], CONFIG)
		const s = out.get("t1")!
		expect(s.short.blocked).toBe(true)
		expect(s.long.blocked).toBe(true)
		expect(s.short.levelsAhead[0]?.distanceBricks).toBe(0)
		expect(s.long.levelsAhead[0]?.distanceBricks).toBe(0)
	})

	it("excludes a level just outside buffer", () => {
		// buffer = 200 pts. SHORT-ahead with level 999 - 1000 = -1, then 1000 - 799 = 201 → out.
		const out = buildSrWalker([candle("t1", 1000, { vwap_d: 799 })], CONFIG)
		expect(out.get("t1")!.short.blocked).toBe(false)
	})

	it("sorts levelsAhead nearest-first", () => {
		// close = 1000. SHORT-ahead candidates:
		//   mme27_15m at 900 → 1.0 brick
		//   vwap_d   at 950 → 0.5 brick
		//   mme55_60m at 850 → 1.5 brick
		const out = buildSrWalker(
			[
				candle("t1", 1000, {
					mme27_15m: 900,
					vwap_d: 950,
					mme55_60m: 850,
				}),
			],
			CONFIG
		)
		const s = out.get("t1")!
		expect(s.short.levelsAhead.map((h) => h.level)).toEqual([
			"vwap_d",
			"mme27_15m",
			"mme55_60m",
		])
	})

	it("counts SHORT favors as levels ABOVE close within favor range", () => {
		// close=1000, favor range = 3 bricks = 300 pts.
		// Above: vwap_d=1100 (100 pts), mme27_15m=1250 (250 pts) → both in range.
		// Above-out: mme55_60m=1400 (400 pts) → out.
		const out = buildSrWalker(
			[
				candle("t1", 1000, {
					vwap_d: 1100,
					mme27_15m: 1250,
					mme55_60m: 1400,
				}),
			],
			CONFIG
		)
		const s = out.get("t1")!
		expect(s.short.favorCount).toBe(2)
		expect(new Set(s.short.favorLevels)).toEqual(
			new Set(["vwap_d", "mme27_15m"])
		)
	})

	it("counts LONG favors as levels BELOW close within favor range", () => {
		// close=1000. Below: vwap_d=900, mme27_60m=750, mme55_60m=600.
		// favor range 300 pts → vwap_d (100) + mme27_60m (250) in; mme55_60m (400) out.
		const out = buildSrWalker(
			[
				candle("t1", 1000, {
					vwap_d: 900,
					mme27_60m: 750,
					mme55_60m: 600,
				}),
			],
			CONFIG
		)
		const s = out.get("t1")!
		expect(s.long.favorCount).toBe(2)
		expect(new Set(s.long.favorLevels)).toEqual(
			new Set(["vwap_d", "mme27_60m"])
		)
	})

	it("excludes missing levels from block and favor decisions", () => {
		// Only vwap_d present, blocks SHORT. mme/ajuste null → not in block set.
		const out = buildSrWalker([candle("t1", 1000, { vwap_d: 950 })], CONFIG)
		const s = out.get("t1")!
		expect(s.short.levelsAhead.length).toBe(1)
		expect(s.levels.ajuste).toBeNull()
		expect(s.levels.mme27_60m).toBeNull()
		// Favor count uses only present levels — should not crash on null.
		expect(s.short.favorCount).toBe(0)
	})

	it("respects custom srBlockBufferBricks and srFavorRangeBricks", () => {
		const cfg = makeHawksConfig({
			qualityGates: {
				srBlockBufferBricks: 1, // 100 pts buffer
				srFavorRangeBricks: 1, // 100 pts favor
			},
		})
		// SHORT-ahead 150 pts = 1.5 bricks → out (was in at default 2).
		const out = buildSrWalker(
			[candle("t1", 1000, { vwap_d: 850, mme27_60m: 1050 })],
			cfg
		)
		const s = out.get("t1")!
		expect(s.short.blocked).toBe(false) // vwap_d at 850, 1.5 bricks away — outside 1
		expect(s.long.blocked).toBe(true) // mme27_60m at 1050, 0.5 bricks
		expect(s.long.levelsAhead).toEqual([
			{ level: "mme27_60m", distanceBricks: 0.5 },
		])
	})

	it("processes a sequence and keys snapshots by timestamp", () => {
		const out = buildSrWalker(
			[
				candle("t1", 1000, { vwap_d: 950 }),
				candle("t2", 1000, { vwap_d: 1500 }),
				candle("t3", 1000, { vwap_d: 1050 }),
			],
			CONFIG
		)
		expect(out.size).toBe(3)
		expect(out.get("t1")!.short.blocked).toBe(true)
		expect(out.get("t2")!.short.blocked).toBe(false)
		expect(out.get("t2")!.long.blocked).toBe(false)
		expect(out.get("t3")!.long.blocked).toBe(true)
	})

	it("captures all 6 levels in the levels payload", () => {
		const out = buildSrWalker(
			[
				candle("t1", 1000, {
					mme27_60m: 900,
					mme55_60m: 800,
					mme27_15m: 1100,
					mme55_15m: 1200,
					vwap_d: 950,
					ajuste: 1050,
				}),
			],
			CONFIG
		)
		const s = out.get("t1")!
		expect(s.levels).toEqual({
			mme27_60m: 900,
			mme55_60m: 800,
			mme27_15m: 1100,
			mme55_15m: 1200,
			vwap_d: 950,
			ajuste: 1050,
		})
	})
})
