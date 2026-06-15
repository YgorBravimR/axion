import { describe, it, expect } from "vitest"
import {
	buildKeltnerWalker,
	type KeltnerTouchRejectClass,
} from "@/lib/backtest/hawks-keltner-walker"
import type { CandleRow } from "@/types/candle"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

const CONFIG = makeHawksConfig()

const candle = (
	timestamp: string,
	ohlc: { open: number; high: number; low: number; close: number },
	bands: {
		kc1_inf?: number
		kc1_sup?: number
		kc2_inf?: number
		kc2_sup?: number
	} = {}
): CandleRow => ({
	timestamp,
	open: ohlc.open,
	high: ohlc.high,
	low: ohlc.low,
	close: ohlc.close,
	candleIndex: 1,
	indicators: Object.fromEntries(
		Object.entries({
			kc1_inf: 90,
			kc1_sup: 110,
			kc2_inf: 80,
			kc2_sup: 120,
			...bands,
		}).filter(([, v]) => v !== undefined)
	) as Record<string, number>,
})

const trClasses = (
	out: Map<string, { touchReject: KeltnerTouchRejectClass }>
): KeltnerTouchRejectClass[] =>
	Array.from(out.values()).map((s) => s.touchReject)

describe("buildKeltnerWalker", () => {
	it("emits NONE when no band is touched", () => {
		const out = buildKeltnerWalker(
			[candle("t1", { open: 100, high: 105, low: 95, close: 100 })],
			CONFIG
		)
		expect(out.get("t1")?.touchReject).toBe("NONE")
	})

	it("emits NO_DATA when any band column is missing", () => {
		const out = buildKeltnerWalker(
			[
				candle(
					"t1",
					{ open: 100, high: 105, low: 95, close: 100 },
					{ kc2_sup: undefined }
				),
			],
			CONFIG
		)
		expect(out.get("t1")?.touchReject).toBe("NO_DATA")
	})

	it("classifies inner-sup touch (wick reaches kc1_sup, close stays at/above)", () => {
		const out = buildKeltnerWalker(
			[candle("t1", { open: 100, high: 110, low: 95, close: 110 }, {})],
			CONFIG
		)
		// high=110 == kc1_sup, close=110 == kc1_sup → touch only, no reject (close not strictly below).
		expect(out.get("t1")?.touchReject).toBe("TOUCH_KC1_SUP")
	})

	it("classifies inner-sup same-brick reject (wick pierces kc1_sup, close back below)", () => {
		const out = buildKeltnerWalker(
			[candle("t1", { open: 100, high: 115, low: 95, close: 108 })],
			CONFIG
		)
		expect(out.get("t1")?.touchReject).toBe("REJECT_KC1_SUP_SAME_BRICK")
	})

	it("classifies outer-sup same-brick reject (kc2 priority over kc1)", () => {
		const out = buildKeltnerWalker(
			[candle("t1", { open: 100, high: 125, low: 95, close: 105 })],
			CONFIG
		)
		// high=125 pierces kc2_sup=120 AND kc1_sup=110; close=105 < both → kc2 wins per priority.
		expect(out.get("t1")?.touchReject).toBe("REJECT_KC2_SUP_SAME_BRICK")
	})

	it("classifies next-brick reject (touch on t1, close-back without touch on t2)", () => {
		const out = buildKeltnerWalker(
			[
				// t1: touch kc1_sup, close exactly at kc1_sup (touch, not reject).
				candle("t1", { open: 100, high: 110, low: 95, close: 110 }),
				// t2: no new touch (high < 110), close-back below — NEXT_BRICK only.
				candle("t2", { open: 109, high: 109.5, low: 100, close: 105 }),
			],
			CONFIG
		)
		const cls = trClasses(out)
		expect(cls[0]).toBe("TOUCH_KC1_SUP")
		expect(cls[1]).toBe("REJECT_KC1_SUP_NEXT_BRICK")
	})

	it("classifies inner-inf reject mirror", () => {
		const out = buildKeltnerWalker(
			[candle("t1", { open: 100, high: 105, low: 85, close: 95 })],
			CONFIG
		)
		// low=85 < kc1_inf=90; close=95 > kc1_inf → reject from below.
		expect(out.get("t1")?.touchReject).toBe("REJECT_KC1_INF_SAME_BRICK")
	})

	it("attaches raw band values to the snapshot", () => {
		const out = buildKeltnerWalker(
			[candle("t1", { open: 100, high: 105, low: 95, close: 100 })],
			CONFIG
		)
		const snap = out.get("t1")
		expect(snap?.kc1Inf).toBe(90)
		expect(snap?.kc1Sup).toBe(110)
		expect(snap?.kc2Inf).toBe(80)
		expect(snap?.kc2Sup).toBe(120)
	})

	it("resets prior-touch memory across data gaps", () => {
		const out = buildKeltnerWalker(
			[
				candle("t1", { open: 100, high: 110, low: 95, close: 110 }),
				candle(
					"t2",
					{ open: 109, high: 111, low: 100, close: 105 },
					{ kc1_sup: undefined }
				),
				// t3 would otherwise inherit t1's touch flag — but t2 was NO_DATA, so memory is reset.
				candle("t3", { open: 105, high: 109, low: 100, close: 108 }),
			],
			CONFIG
		)
		const cls = trClasses(out)
		expect(cls[1]).toBe("NO_DATA")
		expect(cls[2]).toBe("NONE")
	})
})
