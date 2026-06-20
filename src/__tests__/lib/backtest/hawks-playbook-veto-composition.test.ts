import { describe, it, expect } from "vitest"
import {
	processHawksPlaybookCandle,
	createInitialHawksPlaybookState,
	type HawksPlaybookState,
} from "@/lib/backtest/modules/entry/hawks-playbook"
import type { HtfWalkerSnapshot } from "@/lib/backtest/hawks-htf-walker"
import type { KeltnerWalkerSnapshot } from "@/lib/backtest/hawks-keltner-walker"
import type { SrWalkerSnapshot } from "@/lib/backtest/hawks-sr-walker"
import type { VwapTouchRejectSnapshot } from "@/lib/backtest/hawks-vwap-walker"
import type { VolumeEmaSnapshot } from "@/lib/backtest/hawks-volume-walker"
import type { CandleRow } from "@/types/candle"
import type { DayContext, HawksTripleScreenConfig } from "@/types/backtest"
import { makeHawksConfig } from "@/__tests__/helpers/hawks-config"

/**
 * Engine wiring tests for the composable veto evaluator.
 *
 * Each test triggers the SHORT `vwap_rejection` playbook (the cheapest fire
 * to set up) and verifies whether the new veto consumers correctly
 * suppress it.
 *
 * Vetoes under test:
 *   1. srLevelBlock (Group E)
 *   2. vwapWickRejectBlock (Group D)
 *   3. aggression.blockMode (Group F)
 *   4. volume.mode = "block" (Group G)
 *   5. Composition — two vetoes both apply, signal still null
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

const ctx = (idx: number): DayContext => ({
	dayKey: "2026-05-29",
	candleIndexInDay: idx,
	brtHour: 13,
	brtMinute: 0,
	brtHHMM: 1300,
})

const buildShortVwapRejectionDay = (
	vwap: number
): { priors: CandleRow[]; fireBrick: CandleRow } => {
	const indicators = { vwap_d: vwap } as Record<string, number>
	const priors: CandleRow[] = [
		{
			timestamp: "2026-05-29T12:55:00Z",
			open: vwap - 5,
			high: vwap + 6,
			low: vwap - 6,
			close: vwap + 5,
			candleIndex: 0,
			indicators,
		},
		{
			timestamp: "2026-05-29T12:58:00Z",
			open: vwap + 5,
			high: vwap + 6,
			low: vwap + 2,
			close: vwap + 4,
			candleIndex: 1,
			indicators,
		},
	]
	const fireBrick: CandleRow = {
		timestamp: "2026-05-29T13:00:00Z",
		open: vwap + 4,
		high: vwap + 5,
		low: vwap - 6,
		close: vwap - 4,
		candleIndex: 2,
		indicators,
	}
	return { priors, fireBrick }
}

const stateWith = (priors: CandleRow[]): HawksPlaybookState => ({
	...createInitialHawksPlaybookState(),
	priorBricksToday: priors,
})

const baseConfig = makeHawksConfig({ startTime: 900, endTime: 1730 })

const blankSrSnapshot = (
	blocked: boolean,
	direction: "short" | "long"
): SrWalkerSnapshot => ({
	short: {
		blocked: direction === "short" ? blocked : false,
		levelsAhead:
			direction === "short" && blocked
				? [{ level: "vwap_d", distanceBricks: 0.5 }]
				: [],
		favorCount: 0,
		favorLevels: [],
	},
	long: {
		blocked: direction === "long" ? blocked : false,
		levelsAhead:
			direction === "long" && blocked
				? [{ level: "vwap_d", distanceBricks: 0.5 }]
				: [],
		favorCount: 0,
		favorLevels: [],
	},
	levels: {
		mme27_60m: null,
		mme55_60m: null,
		mme27_15m: null,
		mme55_15m: null,
		vwap_d: null,
		ajuste: null,
	},
})

describe("processHawksPlaybookCandle — veto composition (Groups C+D+E+F+G)", () => {
	it("baseline: SHORT vwap_rejection fires when ALL vetoes are off", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			baseConfig,
			SHORT_GATE,
			null,
			null,
			null,
			null
		)
		expect(result.signal).not.toBeNull()
		expect(result.signal?.direction).toBe("short")
	})

	it("srLevelBlock=true vetoes the fire when an S/R level is ahead", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const srSnapshot = blankSrSnapshot(true, "short")
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { srLevelBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			srSnapshot,
			null,
			null
		)
		expect(result.signal).toBeNull()
	})

	it("srLevelBlock=true does NOT veto when no level is ahead", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const srSnapshot = blankSrSnapshot(false, "short")
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { srLevelBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			srSnapshot,
			null,
			null
		)
		expect(result.signal).not.toBeNull()
	})

	it("vwapWickRejectBlock=true vetoes a SHORT on REJECT_FROM_BELOW_*", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const vwapSnapshot: VwapTouchRejectSnapshot = {
			d: { touchReject: "REJECT_FROM_BELOW_SAME_BRICK", value: 100 },
			w: { touchReject: "NONE", value: 100 },
			m: { touchReject: "NONE", value: 100 },
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { vwapWickRejectBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			vwapSnapshot,
			null
		)
		expect(result.signal).toBeNull()
	})

	it("vwapWickRejectBlock=true does NOT veto on wrong-direction reject", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const vwapSnapshot: VwapTouchRejectSnapshot = {
			// SHORT trade; REJECT_FROM_ABOVE = bearish rejection FAVORS short, no veto
			d: { touchReject: "REJECT_FROM_ABOVE_SAME_BRICK", value: 100 },
			w: { touchReject: "NONE", value: 100 },
			m: { touchReject: "NONE", value: 100 },
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { vwapWickRejectBlock: true },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			vwapSnapshot,
			null
		)
		expect(result.signal).not.toBeNull()
	})

	it("aggression.blockMode='blockOnAnti' vetoes SHORT when agr_saldo >= +threshold", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		// Inject agr_saldo into the fire brick's indicators
		fireBrick.indicators.agr_saldo = 20000 // buyers active, SHORT is anti
		const config: HawksTripleScreenConfig = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: {
				aggression: { blockMode: "blockOnAnti", threshold: 15000 },
			},
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			null,
			null
		)
		expect(result.signal).toBeNull()
	})

	it("aggression.blockMode='blockOnAnti' does NOT veto when |agr_saldo| < threshold", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		fireBrick.indicators.agr_saldo = 5000 // below threshold
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: {
				aggression: { blockMode: "blockOnAnti", threshold: 15000 },
			},
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			null,
			null
		)
		expect(result.signal).not.toBeNull()
	})

	it("aggression.blockMode='blockOnAligned' vetoes SHORT when agr_saldo <= -threshold", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		fireBrick.indicators.agr_saldo = -20000 // sellers active, SHORT is aligned
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: {
				aggression: { blockMode: "blockOnAligned", threshold: 15000 },
			},
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			null,
			null
		)
		expect(result.signal).toBeNull()
	})

	it("volume.mode='block' vetoes when volume <= EMA", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const volumeSnapshot: VolumeEmaSnapshot = {
			volume: 1_000_000_000,
			ema: 2_000_000_000,
			aboveEma: false,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { volume: { mode: "block" } },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			null,
			volumeSnapshot
		)
		expect(result.signal).toBeNull()
	})

	it("volume.mode='block' does NOT veto when volume > EMA", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const volumeSnapshot: VolumeEmaSnapshot = {
			volume: 3_000_000_000,
			ema: 2_000_000_000,
			aboveEma: true,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { volume: { mode: "block" } },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			null,
			volumeSnapshot
		)
		expect(result.signal).not.toBeNull()
	})

	it("volume.mode='score' does NOT veto (score-mode doesn't block)", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		const volumeSnapshot: VolumeEmaSnapshot = {
			volume: 1_000_000_000,
			ema: 2_000_000_000,
			aboveEma: false,
		}
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { volume: { mode: "score" } },
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			null,
			null,
			volumeSnapshot
		)
		expect(result.signal).not.toBeNull()
	})

	it("COMPOSITION: two vetoes both active, signal suppressed (first-match wins)", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		// SR block active AND aggression-anti active. Either alone vetoes; both
		// together must also veto.
		const srSnapshot = blankSrSnapshot(true, "short")
		fireBrick.indicators.agr_saldo = 20000
		const config = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: {
				srLevelBlock: true,
				aggression: { blockMode: "blockOnAnti", threshold: 15000 },
			},
		})
		const result = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			config,
			SHORT_GATE,
			null,
			srSnapshot,
			null,
			null
		)
		expect(result.signal).toBeNull()
	})

	it("COMPOSITION: ALL FIVE vetoes off → fire succeeds; one of them on → fire suppressed", () => {
		const { priors, fireBrick } = buildShortVwapRejectionDay(100)
		// First: all off, should fire
		const allOff = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: {
				srLevelBlock: false,
				keltnerOuterBlock: false,
				vwapWickRejectBlock: false,
				aggression: { blockMode: "off" },
				volume: { mode: "off" },
			},
		})
		const baseline = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			allOff,
			SHORT_GATE,
			null,
			null,
			null,
			null
		)
		expect(baseline.signal).not.toBeNull()

		// Then: KC on with rejecting snapshot, should NOT fire
		const kcOn = makeHawksConfig({
			startTime: 900,
			endTime: 1730,
			qualityGates: { keltnerOuterBlock: true },
		})
		const kcSnap: KeltnerWalkerSnapshot = {
			touchReject: "REJECT_KC2_INF_SAME_BRICK",
			kc1Inf: 80,
			kc1Sup: 120,
			kc2Inf: 70,
			kc2Sup: 130,
		}
		const blocked = processHawksPlaybookCandle(
			fireBrick,
			stateWith(priors),
			ctx(2),
			0.01,
			kcOn,
			SHORT_GATE,
			kcSnap,
			null,
			null,
			null
		)
		expect(blocked.signal).toBeNull()
	})
})
