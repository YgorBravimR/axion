/**
 * Hawks Keltner channel touch+reject walker — stateful (engine v0.10).
 *
 * Per the indicator-isolation audit Group C
 * (`docs/hawks-strategy/indicator-isolation/group-c-keltner.md`), Axion's
 * engine has zero Keltner reads despite the UI exposing four KC-related
 * quality-gate toggles. This walker is the methodology-correct reader the
 * audit prescribed.
 *
 * Per 5m brick (or whichever TF the candles belong to — the walker is
 * TF-agnostic), classifies the brick against KC1 inner (1.25× ATR) and KC2
 * outer (1.65× ATR) bands using wick-based touch detection and same-brick /
 * next-brick reject confirmation. See the audit script
 * (`scripts/indicator-isolation/group-c-keltner.ts`) for the validated
 * reference implementation — this walker is the production port of that
 * script.
 *
 * Touch definition: wick-based, per CLAUDE.md rule 0a (engine-wide convention
 * that pivot direction + band touches read the visible swing at the wick).
 *   SUP: high >= sup           — wick reached/pierced the upper band.
 *   INF: low  <= inf           — wick reached/pierced the lower band.
 *
 * Reject definition:
 *   Same-brick: touched the band AND close came back to the opposite side.
 *   Next-brick: prior brick touched, this brick closes back to the opposite
 *     side (the asymmetric N+1 confirmation).
 *
 * Class priority on collisions (outer rejects beat inner; rejects beat touches):
 *   1. REJECT_KC2_*_SAME_BRICK
 *   2. REJECT_KC2_*_NEXT_BRICK
 *   3. REJECT_KC1_*_SAME_BRICK
 *   4. REJECT_KC1_*_NEXT_BRICK
 *   5. TOUCH_KC2_SUP / TOUCH_KC2_INF
 *   6. TOUCH_KC1_SUP / TOUCH_KC1_INF
 *   7. NONE
 *
 * Build once at engine init via `buildKeltnerWalker(candles, config)`,
 * lookup per brick via `walker.get(timestamp)`. O(N) build + O(1) lookup.
 * Parallel to (not replacing) any existing analytics readers.
 */

import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

export type KeltnerTouchRejectClass =
	| "NONE"
	| "TOUCH_KC1_INF"
	| "TOUCH_KC1_SUP"
	| "TOUCH_KC2_INF"
	| "TOUCH_KC2_SUP"
	| "REJECT_KC1_INF_SAME_BRICK"
	| "REJECT_KC1_SUP_SAME_BRICK"
	| "REJECT_KC2_INF_SAME_BRICK"
	| "REJECT_KC2_SUP_SAME_BRICK"
	| "REJECT_KC1_INF_NEXT_BRICK"
	| "REJECT_KC1_SUP_NEXT_BRICK"
	| "REJECT_KC2_INF_NEXT_BRICK"
	| "REJECT_KC2_SUP_NEXT_BRICK"
	| "NO_DATA"

export interface KeltnerWalkerSnapshot {
	touchReject: KeltnerTouchRejectClass
	// Raw band values at this brick — null when missing.
	kc1Inf: number | null
	kc1Sup: number | null
	kc2Inf: number | null
	kc2Sup: number | null
}

const NO_DATA_SNAPSHOT: KeltnerWalkerSnapshot = {
	touchReject: "NO_DATA",
	kc1Inf: null,
	kc1Sup: null,
	kc2Inf: null,
	kc2Sup: null,
}

const numericFromCandle = (candle: CandleRow, key: string): number | null => {
	if (key === "") {
		return null
	}
	const v = candle.indicators[key]
	return typeof v === "number" ? v : null
}

const buildKeltnerWalker = (
	candles: CandleRow[],
	config: HawksTripleScreenConfig
): Map<string, KeltnerWalkerSnapshot> => {
	const out = new Map<string, KeltnerWalkerSnapshot>()
	if (candles.length === 0) {
		return out
	}

	const kc1InfKey = config.keltner_inner_inf_key
	const kc1SupKey = config.keltner_inner_sup_key
	const kc2InfKey = config.keltner_outer_inf_key
	const kc2SupKey = config.keltner_outer_sup_key

	let priorTouchKc1Inf = false
	let priorTouchKc1Sup = false
	let priorTouchKc2Inf = false
	let priorTouchKc2Sup = false

	for (const candle of candles) {
		const kc1Inf = numericFromCandle(candle, kc1InfKey)
		const kc1Sup = numericFromCandle(candle, kc1SupKey)
		const kc2Inf = numericFromCandle(candle, kc2InfKey)
		const kc2Sup = numericFromCandle(candle, kc2SupKey)

		if (
			kc1Inf === null ||
			kc1Sup === null ||
			kc2Inf === null ||
			kc2Sup === null
		) {
			out.set(candle.timestamp, NO_DATA_SNAPSHOT)
			priorTouchKc1Inf = false
			priorTouchKc1Sup = false
			priorTouchKc2Inf = false
			priorTouchKc2Sup = false
			continue
		}

		const touchKc1Inf = candle.low <= kc1Inf
		const touchKc1Sup = candle.high >= kc1Sup
		const touchKc2Inf = candle.low <= kc2Inf
		const touchKc2Sup = candle.high >= kc2Sup

		const rejectKc1InfSame = touchKc1Inf && candle.close > kc1Inf
		const rejectKc1SupSame = touchKc1Sup && candle.close < kc1Sup
		const rejectKc2InfSame = touchKc2Inf && candle.close > kc2Inf
		const rejectKc2SupSame = touchKc2Sup && candle.close < kc2Sup

		const rejectKc1InfNext = priorTouchKc1Inf && candle.close > kc1Inf
		const rejectKc1SupNext = priorTouchKc1Sup && candle.close < kc1Sup
		const rejectKc2InfNext = priorTouchKc2Inf && candle.close > kc2Inf
		const rejectKc2SupNext = priorTouchKc2Sup && candle.close < kc2Sup

		let cls: KeltnerTouchRejectClass = "NONE"
		if (rejectKc2SupSame) {
			cls = "REJECT_KC2_SUP_SAME_BRICK"
		} else if (rejectKc2InfSame) {
			cls = "REJECT_KC2_INF_SAME_BRICK"
		} else if (rejectKc2SupNext) {
			cls = "REJECT_KC2_SUP_NEXT_BRICK"
		} else if (rejectKc2InfNext) {
			cls = "REJECT_KC2_INF_NEXT_BRICK"
		} else if (rejectKc1SupSame) {
			cls = "REJECT_KC1_SUP_SAME_BRICK"
		} else if (rejectKc1InfSame) {
			cls = "REJECT_KC1_INF_SAME_BRICK"
		} else if (rejectKc1SupNext) {
			cls = "REJECT_KC1_SUP_NEXT_BRICK"
		} else if (rejectKc1InfNext) {
			cls = "REJECT_KC1_INF_NEXT_BRICK"
		} else if (touchKc2Sup) {
			cls = "TOUCH_KC2_SUP"
		} else if (touchKc2Inf) {
			cls = "TOUCH_KC2_INF"
		} else if (touchKc1Sup) {
			cls = "TOUCH_KC1_SUP"
		} else if (touchKc1Inf) {
			cls = "TOUCH_KC1_INF"
		}

		out.set(candle.timestamp, {
			touchReject: cls,
			kc1Inf,
			kc1Sup,
			kc2Inf,
			kc2Sup,
		})

		priorTouchKc1Inf = touchKc1Inf
		priorTouchKc1Sup = touchKc1Sup
		priorTouchKc2Inf = touchKc2Inf
		priorTouchKc2Sup = touchKc2Sup
	}

	return out
}

export { buildKeltnerWalker }
