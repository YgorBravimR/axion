/**
 * Hawks Higher-TF Gate — stateful walker (engine v0.9).
 *
 * Per the indicator-isolation audit Group A (see
 * `docs/hawks-strategy/indicator-isolation/group-a-htf-gate.md`), Axion's
 * stateless `higherTfGate` reads the 4 EMA inequalities correctly but lacks
 * the sticky state machine the methodology requires. On 17,517 audited bricks
 * the stateless reader produced 804 / 195 (15m / 60m) state changes vs the
 * methodology walker's 207 / 47 — ~4× too many "transitions" because each
 * inequality flicker re-classified the gate as `mixed`.
 *
 * This walker fixes that. For each timeframe (15m and 60m) independently:
 *
 *   - State ∈ {BULL, BEAR, NO_SIGNAL}.
 *   - NO_SIGNAL until the first brick where all 4 EMA inequalities align
 *     (prev_open AND prev_close on the same side of mme27 AND mme55).
 *   - BULL → BEAR (or BEAR → BULL) flip ONLY when all 4 inequalities reverse
 *     unambiguously on a single brick. Mixed-zone bricks carry prior state.
 *   - Missing data on a brick carries prior state forward (no spurious flip
 *     at data-gap boundaries — confirmed correct by the audit's
 *     `BOTH_PRESEEDED` bucket distribution).
 *   - State carries across session/day boundaries — engine-init walk pre-seeds
 *     the state so the first brick of day N+1 starts from where day N closed.
 *
 * Use as a precomputed lookup: build once at engine init via
 * `buildHtfWalker(candles, config)`, then call
 * `walker.get(timestamp)` per brick. O(N) build + O(1) per lookup.
 *
 * Parallel to the stateless reader in `hawks-indicators.ts:readHtfGate` —
 * that one stays in place for analytics + journaling enrichment, this one
 * is the engine's gate.
 */

import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

export type HtfWalkerState = "BULL" | "BEAR" | "NO_SIGNAL"

export interface HtfWalkerSnapshot {
	gate15m: HtfWalkerState
	gate60m: HtfWalkerState
}

const ALL_NO_SIGNAL: HtfWalkerSnapshot = {
	gate15m: "NO_SIGNAL",
	gate60m: "NO_SIGNAL",
}

const stepOneTf = (
	prev: HtfWalkerState,
	openKey: string,
	closeKey: string,
	ema27Key: string,
	ema55Key: string,
	candle: CandleRow
): HtfWalkerState => {
	const i = candle.indicators
	const open = i[openKey]
	const close = i[closeKey]
	const ema27 = i[ema27Key]
	const ema55 = i[ema55Key]
	if (
		typeof open !== "number" ||
		typeof close !== "number" ||
		typeof ema27 !== "number" ||
		typeof ema55 !== "number"
	) {
		return prev
	}
	const flipBull =
		open > ema27 && open > ema55 && close > ema27 && close > ema55
	const flipBear =
		open < ema27 && open < ema55 && close < ema27 && close < ema55
	if (prev === "NO_SIGNAL") {
		if (flipBull) {
			return "BULL"
		}
		if (flipBear) {
			return "BEAR"
		}
		return "NO_SIGNAL"
	}
	if (prev === "BEAR" && flipBull) {
		return "BULL"
	}
	if (prev === "BULL" && flipBear) {
		return "BEAR"
	}
	return prev
}

/**
 * Walk the candle history end-to-end and produce a per-timestamp snapshot of
 * the methodology-correct HTF gate state.
 *
 * Candles MUST be sorted by timestamp ascending (engine guarantee). State is
 * seeded as NO_SIGNAL and carries forward across day boundaries.
 *
 * Returns a Map keyed by candle.timestamp. When two candles share a timestamp
 * (rare but possible with sub-second exports), the LAST one wins — same
 * behavior as iterating a JS Map with duplicate keys.
 */
export const buildHtfWalker = (
	candles: CandleRow[],
	config: HawksTripleScreenConfig
): Map<string, HtfWalkerSnapshot> => {
	const out = new Map<string, HtfWalkerSnapshot>()
	let state15m: HtfWalkerState = "NO_SIGNAL"
	let state60m: HtfWalkerState = "NO_SIGNAL"
	for (const candle of candles) {
		state15m = stepOneTf(
			state15m,
			config.prev_15m_open_key,
			config.prev_15m_close_key,
			config.ema27_15m_key,
			config.ema55_15m_key,
			candle
		)
		state60m = stepOneTf(
			state60m,
			config.prev_60m_open_key,
			config.prev_60m_close_key,
			config.ema27_60m_key,
			config.ema55_60m_key,
			candle
		)
		out.set(candle.timestamp, { gate15m: state15m, gate60m: state60m })
	}
	return out
}

/**
 * Look up the walker snapshot at a candle. Returns ALL_NO_SIGNAL when no
 * snapshot is available — the engine treats NO_SIGNAL as gate-off (same
 * semantics as the stateless reader's missing-data branch), so a missing
 * lookup is fail-safe rather than fail-open.
 */
export const lookupHtfGate = (
	walker: Map<string, HtfWalkerSnapshot> | null,
	candle: CandleRow
): HtfWalkerSnapshot => {
	if (!walker) {
		return ALL_NO_SIGNAL
	}
	return walker.get(candle.timestamp) ?? ALL_NO_SIGNAL
}

/**
 * Engine-facing predicate: returns true iff BOTH 15m and 60m walkers are on
 * the favorable side for `direction`. Mirrors the stateless `higherTfGate`'s
 * AND semantics — the gate is "both timeframes aligned with the trade
 * direction." The difference from the stateless gate: methodology-correct
 * `BULL` / `BEAR` are SUFFICIENT for favorable; the stateless gate required
 * `above_both` / `below_both` on the current brick, which excludes transition
 * zones where methodology would carry the prior state.
 */
export const isHtfGateFavorable = (
	snapshot: HtfWalkerSnapshot,
	direction: "short" | "long"
): boolean => {
	if (direction === "short") {
		return snapshot.gate15m === "BEAR" && snapshot.gate60m === "BEAR"
	}
	return snapshot.gate15m === "BULL" && snapshot.gate60m === "BULL"
}
