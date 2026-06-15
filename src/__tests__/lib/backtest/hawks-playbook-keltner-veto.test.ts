import { describe, it, expect } from "vitest"
import {
	processHawksPlaybookCandle,
	createInitialHawksPlaybookState,
	type HawksPlaybookState,
} from "@/lib/backtest/modules/entry/hawks-playbook"
import type { HtfWalkerSnapshot } from "@/lib/backtest/hawks-htf-walker"
import type { KeltnerWalkerSnapshot } from "@/lib/backtest/hawks-keltner-walker"
import type { CandleRow } from "@/types/candle"
import type { DayContext } from "@/types/backtest"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

/**
 * Engine wiring test for the `keltnerOuterBlock` quality gate.
 *
 * The veto is methodology-direction-aware:
 *   SHORT vetoed by REJECT_KC2_INF_*  (bearish exhaustion against the trend)
 *   LONG  vetoed by REJECT_KC2_SUP_*  (bullish exhaustion against the trend)
 *
 * Touch-only classes and KC1 inner rejects do NOT veto.
 */

const SHORT_GATE: HtfWalkerSnapshot = {
	gate15m: "BEAR",
	gate60m: "BEAR",
	lastTopo15m: null,
	lastFundo15m: null,
	lastTopo15mAtTimestamp: null,
	lastFundo15mAtTimestamp: null,
	lastAdoptedType15m: null,
}

const LONG_GATE: HtfWalkerSnapshot = {
	gate15m: "BULL",
	gate60m: "BULL",
	lastTopo15m: null,
	lastFundo15m: null,
	lastTopo15mAtTimestamp: null,
	lastFundo15mAtTimestamp: null,
	lastAdoptedType15m: null,
}

const ctx = (idx: number): DayContext => ({
	dayKey: "2026-05-29",
	candleIndexInDay: idx,
	brtHour: 13,
	brtMinute: 0,
	brtHHMM: 1300,
})

/**
 * Build a candle that triggers the `vwap_rejection` playbook on the SHORT side:
 * priors include a brick that closed ABOVE vwap_d; current bearish brick
 * opens at/above and closes below vwap_d.
 */
const buildShortVwapRejectionDay = (
	vwap: number,
	kc: {
		kc1_inf: number
		kc1_sup: number
		kc2_inf: number
		kc2_sup: number
	}
): {
	priors: CandleRow[]
	fireBrick: CandleRow
} => {
	const indicators = (vwap_d: number) =>
		({ vwap_d, ...kc }) as Record<string, number>
	const priors: CandleRow[] = [
		{
			timestamp: "2026-05-29T12:55:00Z",
			open: vwap - 5,
			high: vwap + 6,
			low: vwap - 6,
			close: vwap + 5, // closed ABOVE vwap → the dip-from-above for SHORT
			candleIndex: 0,
			indicators: indicators(vwap),
		},
		{
			timestamp: "2026-05-29T12:58:00Z",
			open: vwap + 5,
			high: vwap + 6,
			low: vwap + 2,
			close: vwap + 4,
			candleIndex: 1,
			indicators: indicators(vwap),
		},
	]
	const fireBrick: CandleRow = {
		timestamp: "2026-05-29T13:00:00Z",
		open: vwap + 4, // opens above vwap
		high: vwap + 5,
		low: vwap - 6,
		close: vwap - 4, // bearish + closes below vwap
		candleIndex: 2,
		indicators: indicators(vwap),
	}
	return { priors, fireBrick }
}

const stateWith = (priors: CandleRow[]): HawksPlaybookState => ({
	...createInitialHawksPlaybookState(),
	priorBricksToday: priors,
})

const baseConfig = makeHawksConfig({ startTime: 900, endTime: 1730 })

describe("processHawksPlaybookCandle — keltnerOuterBlock veto", () => {
	it("fires the SHORT vwap_rejection when the gate is off (baseline)", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100, {
			kc1_inf: 80,
			kc1_sup: 120,
			kc2_inf: 70,
			kc2_sup: 130,
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			baseConfig,
			SHORT_GATE,
			null
		)
		expect(result.signal).not.toBeNull()
		expect(result.signal?.direction).toBe("short")
	})

	it("vetoes a SHORT fire when the current brick is REJECT_KC2_INF_SAME_BRICK and the gate is on", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100, {
			kc1_inf: 80,
			kc1_sup: 120,
			kc2_inf: 70,
			kc2_sup: 130,
		})
		const keltnerSnapshot: KeltnerWalkerSnapshot = {
			touchReject: "REJECT_KC2_INF_SAME_BRICK",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			keltnerSnapshot
		)
		expect(result.signal).toBeNull()
	})

	it("does NOT veto a SHORT fire when the current brick is REJECT_KC2_SUP_* (wrong direction)", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100, {
			kc1_inf: 80,
			kc1_sup: 120,
			kc2_inf: 70,
			kc2_sup: 130,
		})
		const keltnerSnapshot: KeltnerWalkerSnapshot = {
			touchReject: "REJECT_KC2_SUP_SAME_BRICK",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			keltnerSnapshot
		)
		// SHORT trade + KC2_SUP reject = bullish exhaustion = FAVORS short. Don't veto.
		expect(result.signal).not.toBeNull()
	})

	it("does NOT veto on inner-band rejects (only outer KC2 vetoes per spec)", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100, {
			kc1_inf: 80,
			kc1_sup: 120,
			kc2_inf: 70,
			kc2_sup: 130,
		})
		const keltnerSnapshot: KeltnerWalkerSnapshot = {
			touchReject: "REJECT_KC1_INF_SAME_BRICK",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			keltnerSnapshot
		)
		expect(result.signal).not.toBeNull()
	})

	it("does NOT veto on plain touch (only confirmed rejects veto)", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100, {
			kc1_inf: 80,
			kc1_sup: 120,
			kc2_inf: 70,
			kc2_sup: 130,
		})
		const keltnerSnapshot: KeltnerWalkerSnapshot = {
			touchReject: "TOUCH_KC2_INF",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			keltnerSnapshot
		)
		expect(result.signal).not.toBeNull()
	})

	it("vetoes a LONG fire when the current brick is REJECT_KC2_SUP_NEXT_BRICK (mirror)", () => {
		// Mirror setup for LONG: prior closed BELOW vwap; current bullish brick opens
		// at/below and closes above.
		const VWAP = 100
		const priors: CandleRow[] = [
			{
				timestamp: "2026-05-29T12:55:00Z",
				open: VWAP + 5,
				high: VWAP + 6,
				low: VWAP - 6,
				close: VWAP - 5, // closed BELOW vwap → the dip-from-below for LONG
				candleIndex: 0,
				indicators: {
					vwap_d: VWAP,
					kc1_inf: 80,
					kc1_sup: 120,
					kc2_inf: 70,
					kc2_sup: 130,
				} as Record<string, number>,
			},
			{
				timestamp: "2026-05-29T12:58:00Z",
				open: VWAP - 5,
				high: VWAP - 2,
				low: VWAP - 6,
				close: VWAP - 4,
				candleIndex: 1,
				indicators: {
					vwap_d: VWAP,
					kc1_inf: 80,
					kc1_sup: 120,
					kc2_inf: 70,
					kc2_sup: 130,
				} as Record<string, number>,
			},
		]
		const fireBrick: CandleRow = {
			timestamp: "2026-05-29T13:00:00Z",
			open: VWAP - 4,
			high: VWAP + 6,
			low: VWAP - 5,
			close: VWAP + 4,
			candleIndex: 2,
			indicators: {
				vwap_d: VWAP,
				kc1_inf: 80,
				kc1_sup: 120,
				kc2_inf: 70,
				kc2_sup: 130,
			} as Record<string, number>,
		}
		const keltnerSnapshot: KeltnerWalkerSnapshot = {
			touchReject: "REJECT_KC2_SUP_NEXT_BRICK",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			LONG_GATE,
			keltnerSnapshot
		)
		expect(result.signal).toBeNull()
	})

	it("does NOT consume cooldown on a vetoed fire", () => {
		// If the veto consumed cooldown, the next valid setup 1 brick later would
		// be blocked. Verify the vetoed fire leaves lastFireBrickIndex untouched.
		const { priors, fireBrick } = buildShortVwapRejectionDay(100, {
			kc1_inf: 80,
			kc1_sup: 120,
			kc2_inf: 70,
			kc2_sup: 130,
		})
		const keltnerSnapshot: KeltnerWalkerSnapshot = {
			touchReject: "REJECT_KC2_INF_SAME_BRICK",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			keltnerSnapshot
		)
		expect(result.signal).toBeNull()
		expect(result.state.lastFireBrickIndex).toBeNull()
	})
})
