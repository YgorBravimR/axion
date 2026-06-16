import { describe, it, expect } from "vitest"
import { vwapRejectionPlaybook } from "@/lib/backtest/modules/entry/playbooks/vwap-rejection"
import type {
	PlaybookContext,
	PlaybookIndicatorKeys,
} from "@/lib/backtest/modules/entry/playbooks/types"
import type { CandleRow } from "@/types/candle"

const KEYS: PlaybookIndicatorKeys = {
	ema_fast_5m_key: "ema9",
	ema_slow_5m_key: "mme55_15m",
	vwap_d_key: "vwap_d",
}

const candle = (
	open: number,
	close: number,
	vwap_d: number,
	high?: number,
	low?: number
): CandleRow => ({
	timestamp: "2026-05-29T13:00:00Z",
	open,
	close,
	high: high ?? Math.max(open, close),
	low: low ?? Math.min(open, close),
	candleIndex: 0,
	indicators: { vwap_d } as Record<string, number>,
})

const buildCtx = (
	brick: CandleRow,
	priorBricks: ReadonlyArray<CandleRow>,
	direction: "long" | "short"
): PlaybookContext => ({
	brick,
	priorBricks,
	brickIndexInDay: priorBricks.length,
	direction,
	brickSize: 10,
	indicatorKeys: KEYS,
})

describe("vwapRejectionPlaybook (LONG — BULL gate, dip-and-reject)", () => {
	it("fires when a recent prior closed below vwap, current bullish brick opens at/below vwap and closes above", () => {
		const VWAP = 100
		const priors: CandleRow[] = [
			candle(105, 95, VWAP, 105, 94), // dip — closed below 100
			candle(95, 98, VWAP, 99, 94),
		]
		const brick = candle(98, 105, VWAP, 106, 98)
		const ctx = buildCtx(brick, priors, "long")
		const fire = vwapRejectionPlaybook.evaluate(ctx)
		expect(fire).not.toBeNull()
		expect(fire?.id).toBe("vwap_dip_recover")
		expect(fire?.exitConfig.targetRule).toBe("static3R")
		expect(fire?.exitConfig.trailAfter3R).toBe(true)
		// Stop = min(dip low) - brickBody. dip low = 94, brickBody = 7.
		expect(fire?.stopReference).toBe(94 - 7)
	})

	it("does not fire when no prior dipped below vwap", () => {
		const VWAP = 100
		const priors = [
			candle(101, 103, VWAP, 104, 101),
			candle(103, 105, VWAP, 106, 103),
		]
		const brick = candle(98, 106, VWAP, 107, 98)
		const ctx = buildCtx(brick, priors, "long")
		expect(vwapRejectionPlaybook.evaluate(ctx)).toBeNull()
	})

	it("does not fire when current brick opens ABOVE vwap (no pierce)", () => {
		const VWAP = 100
		const priors = [candle(105, 95, VWAP, 105, 94)]
		const brick = candle(101, 105, VWAP, 106, 101) // open above vwap
		const ctx = buildCtx(brick, priors, "long")
		expect(vwapRejectionPlaybook.evaluate(ctx)).toBeNull()
	})

	it("does not fire when current brick is bearish", () => {
		const VWAP = 100
		const priors = [candle(105, 95, VWAP, 105, 94)]
		const brick = candle(98, 96, VWAP, 99, 95)
		const ctx = buildCtx(brick, priors, "long")
		expect(vwapRejectionPlaybook.evaluate(ctx)).toBeNull()
	})
})

describe("vwapRejectionPlaybook (SHORT — BEAR gate)", () => {
	it("fires when a recent prior closed above vwap, current bearish brick opens at/above vwap and closes below", () => {
		const VWAP = 100
		const priors = [
			candle(95, 105, VWAP, 106, 95), // closed above 100
			candle(105, 102, VWAP, 106, 101),
		]
		const brick = candle(102, 95, VWAP, 103, 94)
		const ctx = buildCtx(brick, priors, "short")
		const fire = vwapRejectionPlaybook.evaluate(ctx)
		expect(fire).not.toBeNull()
		// Stop = max(dip high) + brickBody. dip high = 106, body = 7.
		expect(fire?.stopReference).toBe(106 + 7)
	})
})

describe("vwapRejectionPlaybook (negative cases)", () => {
	it("does not fire when vwap key is missing on current brick", () => {
		const brick: CandleRow = {
			timestamp: "2026-05-29T13:30:00Z",
			open: 98,
			close: 105,
			high: 106,
			low: 98,
			candleIndex: 0,
			indicators: {},
		}
		const ctx = buildCtx(brick, [candle(105, 95, 100)], "long")
		expect(vwapRejectionPlaybook.evaluate(ctx)).toBeNull()
	})
})
