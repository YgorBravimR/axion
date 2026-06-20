/**
 * Hawks VWAP touch+reject walker — stateful (engine v0.10).
 *
 * Per the indicator-isolation audit Group D
 * (`docs/hawks-strategy/indicator-isolation/group-d-vwap.md`), Axion's
 * `vwap_dip_recover` playbook uses a close-based dip-and-recover trigger that
 * shares zero fires (across the full 2026-03-02..2026-06-13 catalog of 8,280
 * 5m bricks) with the methodology's wick-based touch+reject signal. They are
 * disjoint signals.
 *
 * This walker is the methodology-correct touch+reject reader the audit
 * prescribed. It runs against ALL THREE VWAP sources (D / W / M)
 * independently and emits a per-brick class for each. Sticky-side memory
 * carries the prior unambiguous side across `at` ambiguities; prior-cross
 * memory enables the asymmetric N+1 reject window.
 *
 * Class semantics (mirror for "from below"):
 *   REJECT_FROM_ABOVE_SAME_BRICK — sticky=above at t-1, wick crossed down,
 *     close came back above. Clean same-brick reject.
 *   REJECT_FROM_ABOVE_NEXT_BRICK — at t-1 a CROSS event happened (close
 *     ended below VWAP with prior sticky=above), at t close came back above.
 *   TOUCH_FROM_ABOVE — degenerate but real on rounded prices: wick crossed
 *     AND close lands exactly on VWAP.
 *   CROSS — close changed sides this brick; the next brick may turn this
 *     into a NEXT_BRICK reject.
 *
 * Build once at engine init via `buildVwapTouchRejectWalker(candles, config)`,
 * lookup per brick via `walker.get(timestamp)`. O(N) build + O(1) lookup.
 *
 * AJUSTE NOT WALKED: the column doesn't exist on the parquet (injected from
 * asset_session_anchors at fetch time). See the Group D audit for the data
 * gap; until ajuste is materialised into per-brick indicators, the walker
 * has nothing to read.
 */

import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

export type VwapTouchRejectClass =
	| "NONE"
	| "TOUCH_FROM_ABOVE"
	| "TOUCH_FROM_BELOW"
	| "REJECT_FROM_ABOVE_SAME_BRICK"
	| "REJECT_FROM_BELOW_SAME_BRICK"
	| "REJECT_FROM_ABOVE_NEXT_BRICK"
	| "REJECT_FROM_BELOW_NEXT_BRICK"
	| "CROSS"
	| "NO_DATA"

type StickySide = "above" | "below" | "unknown"

export interface VwapSourceState {
	touchReject: VwapTouchRejectClass
	value: number | null
}

export interface VwapTouchRejectSnapshot {
	d: VwapSourceState
	w: VwapSourceState
	m: VwapSourceState
}

const NO_DATA_SOURCE: VwapSourceState = { touchReject: "NO_DATA", value: null }

const NO_DATA_SNAPSHOT: VwapTouchRejectSnapshot = {
	d: NO_DATA_SOURCE,
	w: NO_DATA_SOURCE,
	m: NO_DATA_SOURCE,
}

interface SourceWalkerState {
	sticky: StickySide
	priorCrossSide: StickySide
}

const initSourceState = (): SourceWalkerState => ({
	sticky: "unknown",
	priorCrossSide: "unknown",
})

const numericFromCandle = (candle: CandleRow, key: string): number | null => {
	if (key === "") {
		return null
	}
	const v = candle.indicators[key]
	return typeof v === "number" ? v : null
}

const stepSource = (
	candle: CandleRow,
	vwap: number | null,
	state: SourceWalkerState
): VwapSourceState => {
	if (vwap === null) {
		state.sticky = "unknown"
		state.priorCrossSide = "unknown"
		return NO_DATA_SOURCE
	}

	const wickedDown = candle.low <= vwap
	const wickedUp = candle.high >= vwap

	let cls: VwapTouchRejectClass = "NONE"

	if (state.priorCrossSide === "above" && candle.close > vwap) {
		cls = "REJECT_FROM_ABOVE_NEXT_BRICK"
	} else if (state.priorCrossSide === "below" && candle.close < vwap) {
		cls = "REJECT_FROM_BELOW_NEXT_BRICK"
	}

	if (
		cls === "NONE" &&
		state.sticky === "above" &&
		wickedDown &&
		candle.close > vwap
	) {
		cls = "REJECT_FROM_ABOVE_SAME_BRICK"
	} else if (
		cls === "NONE" &&
		state.sticky === "below" &&
		wickedUp &&
		candle.close < vwap
	) {
		cls = "REJECT_FROM_BELOW_SAME_BRICK"
	}

	if (
		cls === "NONE" &&
		state.sticky === "above" &&
		wickedDown &&
		candle.close === vwap
	) {
		cls = "TOUCH_FROM_ABOVE"
	} else if (
		cls === "NONE" &&
		state.sticky === "below" &&
		wickedUp &&
		candle.close === vwap
	) {
		cls = "TOUCH_FROM_BELOW"
	}

	if (cls === "NONE" && state.sticky === "above" && candle.close < vwap) {
		cls = "CROSS"
	} else if (
		cls === "NONE" &&
		state.sticky === "below" &&
		candle.close > vwap
	) {
		cls = "CROSS"
	}

	if (cls === "CROSS") {
		state.priorCrossSide = state.sticky
	} else {
		state.priorCrossSide = "unknown"
	}

	if (candle.close > vwap) {
		state.sticky = "above"
	} else if (candle.close < vwap) {
		state.sticky = "below"
	}

	return { touchReject: cls, value: vwap }
}

const buildVwapTouchRejectWalker = (
	candles: CandleRow[],
	config: HawksTripleScreenConfig
): Map<string, VwapTouchRejectSnapshot> => {
	const out = new Map<string, VwapTouchRejectSnapshot>()
	if (candles.length === 0) {
		return out
	}

	const dState = initSourceState()
	const wState = initSourceState()
	const mState = initSourceState()

	for (const candle of candles) {
		const vwapD = numericFromCandle(candle, config.vwap_d_key)
		const vwapW = numericFromCandle(candle, config.vwap_w_key)
		const vwapM = numericFromCandle(candle, config.vwap_m_key)

		if (vwapD === null && vwapW === null && vwapM === null) {
			out.set(candle.timestamp, NO_DATA_SNAPSHOT)
			dState.sticky = "unknown"
			dState.priorCrossSide = "unknown"
			wState.sticky = "unknown"
			wState.priorCrossSide = "unknown"
			mState.sticky = "unknown"
			mState.priorCrossSide = "unknown"
			continue
		}

		out.set(candle.timestamp, {
			d: stepSource(candle, vwapD, dState),
			w: stepSource(candle, vwapW, wState),
			m: stepSource(candle, vwapM, mState),
		})
	}

	return out
}

export { buildVwapTouchRejectWalker }
