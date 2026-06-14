import { describe, it, expect } from "vitest"
import { retracementPlaybook } from "@/lib/backtest/modules/entry/playbooks/retracement"
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
	high?: number,
	low?: number
): CandleRow => ({
	timestamp: "2026-05-29T13:00:00Z",
	open,
	close,
	high: high ?? Math.max(open, close),
	low: low ?? Math.min(open, close),
	candleIndex: 0,
	indicators: {},
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

describe("retracementPlaybook (negative cases)", () => {
	it("does not fire when too few priors (< 4)", () => {
		const priors = [candle(100, 105), candle(105, 110), candle(110, 115)]
		const brick = candle(115, 110)
		const ctx = buildCtx(brick, priors, "short")
		expect(retracementPlaybook.evaluate(ctx)).toBeNull()
	})
})

describe("retracementPlaybook (sanity checks)", () => {
	it("returns null on empty priors", () => {
		const brick = candle(100, 105)
		const ctx = buildCtx(brick, [], "long")
		expect(retracementPlaybook.evaluate(ctx)).toBeNull()
	})

	it("returns null when no pivots ever confirmed (all flat priors)", () => {
		const priors: CandleRow[] = []
		for (let i = 0; i < 6; i++) {
			priors.push(candle(100, 100, 100, 100)) // dojis — no structure
		}
		const brick = candle(100, 105)
		const ctx = buildCtx(brick, priors, "long")
		expect(retracementPlaybook.evaluate(ctx)).toBeNull()
	})
})
