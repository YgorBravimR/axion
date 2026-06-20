import { describe, it, expect } from "vitest"
import {
	buildVwapTouchRejectWalker,
	type VwapTouchRejectClass,
} from "@/lib/backtest/hawks-vwap-walker"
import type { CandleRow } from "@/types/candle"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

const CONFIG = makeHawksConfig()

const candle = (
	timestamp: string,
	ohlc: { open: number; high: number; low: number; close: number },
	vwaps: { vwap_d?: number; vwap_w?: number; vwap_m?: number } = {}
): CandleRow => ({
	timestamp,
	open: ohlc.open,
	high: ohlc.high,
	low: ohlc.low,
	close: ohlc.close,
	candleIndex: 1,
	indicators: Object.fromEntries(
		Object.entries({
			vwap_d: 100,
			vwap_w: 100,
			vwap_m: 100,
			...vwaps,
		}).filter(([, v]) => v !== undefined)
	) as Record<string, number>,
})

const dClasses = (
	out: Map<string, { d: { touchReject: VwapTouchRejectClass } }>
): VwapTouchRejectClass[] =>
	Array.from(out.values()).map((s) => s.d.touchReject)

describe("buildVwapTouchRejectWalker", () => {
	it("seeds NONE on the first brick (sticky=unknown, no prior side)", () => {
		const out = buildVwapTouchRejectWalker(
			[candle("t1", { open: 102, high: 105, low: 101, close: 102 })],
			CONFIG
		)
		expect(out.get("t1")?.d.touchReject).toBe("NONE")
	})

	it("emits NO_DATA when all 3 VWAPs are missing", () => {
		const out = buildVwapTouchRejectWalker(
			[
				candle(
					"t1",
					{ open: 102, high: 105, low: 101, close: 102 },
					{ vwap_d: undefined, vwap_w: undefined, vwap_m: undefined }
				),
			],
			CONFIG
		)
		expect(out.get("t1")?.d.touchReject).toBe("NO_DATA")
	})

	it("classifies same-brick reject from above", () => {
		const out = buildVwapTouchRejectWalker(
			[
				// t1: clearly above (close=110 > vwap=100). Establishes sticky=above.
				candle("t1", { open: 108, high: 112, low: 105, close: 110 }),
				// t2: wick dips below VWAP (low=95 < 100), close comes back above (105 > 100).
				candle("t2", { open: 108, high: 110, low: 95, close: 105 }),
			],
			CONFIG
		)
		const cls = dClasses(out)
		expect(cls[0]).toBe("NONE")
		expect(cls[1]).toBe("REJECT_FROM_ABOVE_SAME_BRICK")
	})

	it("classifies same-brick reject from below", () => {
		const out = buildVwapTouchRejectWalker(
			[
				candle("t1", { open: 92, high: 95, low: 88, close: 90 }),
				// t2: wick crosses up to 105 > vwap=100, close back below at 95.
				candle("t2", { open: 92, high: 105, low: 90, close: 95 }),
			],
			CONFIG
		)
		const cls = dClasses(out)
		expect(cls[1]).toBe("REJECT_FROM_BELOW_SAME_BRICK")
	})

	it("classifies CROSS then next-brick reject (asymmetric N+1)", () => {
		const out = buildVwapTouchRejectWalker(
			[
				candle("t1", { open: 108, high: 112, low: 105, close: 110 }),
				// t2: close ENDS below VWAP (95 < 100) — this is a CROSS event.
				candle("t2", { open: 108, high: 110, low: 90, close: 95 }),
				// t3: close goes back above 100 → next-brick reject from the "above" side.
				candle("t3", { open: 96, high: 108, low: 94, close: 105 }),
			],
			CONFIG
		)
		const cls = dClasses(out)
		expect(cls[1]).toBe("CROSS")
		expect(cls[2]).toBe("REJECT_FROM_ABOVE_NEXT_BRICK")
	})

	it("emits CROSS when close switches sides without a touch+reject pattern", () => {
		const out = buildVwapTouchRejectWalker(
			[
				candle("t1", { open: 105, high: 110, low: 102, close: 108 }),
				// t2: continuous downtrend; high doesn't reach back to 100, close < 100.
				candle("t2", { open: 105, high: 106, low: 90, close: 92 }),
			],
			CONFIG
		)
		expect(dClasses(out)[1]).toBe("CROSS")
	})

	it("runs the three VWAP sources independently", () => {
		// Set vwap_d=100, vwap_w=105, vwap_m=110.
		const t1 = candle(
			"t1",
			{ open: 102, high: 108, low: 101, close: 103 },
			{ vwap_d: 100, vwap_w: 105, vwap_m: 110 }
		)
		// On t1, close=103: above vwap_d (100), below vwap_w (105), below vwap_m (110). Sticky seeds vary.
		// On t2, exercise different conditions per source.
		const t2 = candle(
			"t2",
			{ open: 103, high: 112, low: 96, close: 108 },
			{ vwap_d: 100, vwap_w: 105, vwap_m: 110 }
		)
		const out = buildVwapTouchRejectWalker([t1, t2], CONFIG)
		const s2 = out.get("t2")
		// d: sticky=above (t1 close > 100), wick to 96 < 100, close 108 > 100 → SAME_BRICK reject from above.
		expect(s2?.d.touchReject).toBe("REJECT_FROM_ABOVE_SAME_BRICK")
		// w: sticky=below (t1 close 103 < 105), wick to 112 > 105, close 108 > 105 → CROSS (sticky=below, close switched).
		// (high=112 reaches 105 but close 108 is on the OTHER side: not a "reject back to below".)
		expect(s2?.w.touchReject).toBe("CROSS")
		// m: sticky=below (t1 close 103 < 110), wick to 112 > 110, close 108 < 110 → SAME_BRICK reject from below.
		expect(s2?.m.touchReject).toBe("REJECT_FROM_BELOW_SAME_BRICK")
	})

	it("resets sticky/prior memory on full NO_DATA bricks", () => {
		const out = buildVwapTouchRejectWalker(
			[
				candle("t1", { open: 108, high: 112, low: 105, close: 110 }),
				candle(
					"t2",
					{ open: 110, high: 112, low: 100, close: 105 },
					{ vwap_d: undefined, vwap_w: undefined, vwap_m: undefined }
				),
				candle("t3", { open: 105, high: 108, low: 95, close: 105 }),
			],
			CONFIG
		)
		const cls = dClasses(out)
		expect(cls[1]).toBe("NO_DATA")
		// t3 starts fresh: sticky=unknown, so wick<100 + close=105 produces NONE
		// (no sticky="above" to seed a reject classification).
		expect(cls[2]).toBe("NONE")
	})
})
