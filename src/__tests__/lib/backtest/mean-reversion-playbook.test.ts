import { describe, it, expect } from "vitest"
import { meanReversionPlaybook } from "@/lib/backtest/modules/entry/playbooks/mean-reversion"
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
	close: number,
	open: number,
	ema9: number,
	overrides: Partial<Pick<CandleRow, "high" | "low">> = {}
): CandleRow => ({
	timestamp: "2026-05-29T13:00:00Z",
	open,
	close,
	high: overrides.high ?? Math.max(open, close),
	low: overrides.low ?? Math.min(open, close),
	candleIndex: 0,
	indicators: { ema9 } as Record<string, number>,
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
	brickSize: 100,
	indicatorKeys: KEYS,
})

describe("meanReversionPlaybook (LONG snapback up to mean)", () => {
	it("fires when priors are below mean with rising distance and current bullish brick reduces distance", () => {
		// All priors below ema9=100. Distances: 5, 8, 12 (rising).
		// Current brick is bullish AND reduces distance.
		const priors = [
			candle(95, 96, 100), // distance 5
			candle(92, 95, 100), // distance 8
			candle(88, 92, 100), // distance 12 (max extension)
		]
		const brick = candle(94, 88, 100, { high: 95, low: 88 }) // bullish, distance 6 (< 12)
		const ctx = buildCtx(brick, priors, "long")
		const fire = meanReversionPlaybook.evaluate(ctx)
		expect(fire).not.toBeNull()
		expect(fire?.id).toBe("mean_reversion")
		expect(fire?.price).toBe(94)
		expect(fire?.exitConfig.targetRule).toBe("static3R")
		expect(fire?.exitConfig.trailAfter3R).toBe(false)
		// Stop = (min low among priors) - 1 brickBody. min low = 88, body = 6.
		expect(fire?.stopReference).toBe(82)
	})

	it("does not fire when distance is flattening (not rising)", () => {
		const priors = [
			candle(95, 96, 100), // distance 5
			candle(90, 95, 100), // distance 10
			candle(90, 90, 100), // distance 10 (flat — not rising)
		]
		const brick = candle(95, 90, 100)
		const ctx = buildCtx(brick, priors, "long")
		expect(meanReversionPlaybook.evaluate(ctx)).toBeNull()
	})

	it("does not fire when current brick is bearish (wrong gate direction)", () => {
		const priors = [
			candle(95, 96, 100),
			candle(92, 95, 100),
			candle(88, 92, 100),
		]
		const brick = candle(85, 88, 100) // bearish — not a snapback up
		const ctx = buildCtx(brick, priors, "long")
		expect(meanReversionPlaybook.evaluate(ctx)).toBeNull()
	})

	it("does not fire when one prior crossed the mean (extension not held)", () => {
		const priors = [
			candle(101, 99, 100), // ABOVE mean — invalidates extension below
			candle(92, 95, 100),
			candle(88, 92, 100),
		]
		const brick = candle(94, 88, 100)
		const ctx = buildCtx(brick, priors, "long")
		expect(meanReversionPlaybook.evaluate(ctx)).toBeNull()
	})

	it("does not fire when ema9 indicator key is missing on current brick", () => {
		const priors = [
			candle(95, 96, 100),
			candle(92, 95, 100),
			candle(88, 92, 100),
		]
		const brick: CandleRow = {
			timestamp: "2026-05-29T13:30:00Z",
			open: 88,
			close: 94,
			high: 95,
			low: 88,
			candleIndex: 0,
			indicators: {},
		}
		const ctx = buildCtx(brick, priors, "long")
		expect(meanReversionPlaybook.evaluate(ctx)).toBeNull()
	})
})

describe("meanReversionPlaybook (SHORT snapback down to mean)", () => {
	it("fires when priors are above mean with rising distance and current bearish brick reduces distance", () => {
		const priors = [
			candle(105, 104, 100), // distance 5
			candle(108, 105, 100), // distance 8
			candle(112, 108, 100, { high: 112, low: 108 }), // distance 12
		]
		const brick = candle(106, 112, 100, { high: 112, low: 105 })
		const ctx = buildCtx(brick, priors, "short")
		const fire = meanReversionPlaybook.evaluate(ctx)
		expect(fire).not.toBeNull()
		expect(fire?.price).toBe(106)
		// Stop = max high among priors + brickBody. max high = 112, body = 6.
		expect(fire?.stopReference).toBe(118)
	})
})

describe("meanReversionPlaybook (gate filter via PlaybookContext.direction)", () => {
	it("does not fire when fewer than 3 priors exist", () => {
		const priors = [candle(95, 96, 100), candle(90, 95, 100)]
		const brick = candle(94, 90, 100)
		const ctx = buildCtx(brick, priors, "long")
		expect(meanReversionPlaybook.evaluate(ctx)).toBeNull()
	})

	it("does not fire when ema_fast_5m_key is empty string (config opt-out)", () => {
		const priors = [
			candle(95, 96, 100),
			candle(92, 95, 100),
			candle(88, 92, 100),
		]
		const brick = candle(94, 88, 100)
		const ctx: PlaybookContext = {
			...buildCtx(brick, priors, "long"),
			indicatorKeys: { ...KEYS, ema_fast_5m_key: "" },
		}
		expect(meanReversionPlaybook.evaluate(ctx)).toBeNull()
	})
})
