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
import {
	createStructuralPivotState,
	stepStructuralPivot,
} from "./hawks-structural-pivots"

export type HtfWalkerState = "BULL" | "BEAR" | "NO_SIGNAL"

/**
 * Per-5m-brick snapshot of HTF state. Carries:
 *   - `gate15m` / `gate60m` — methodology-correct sticky-state gates
 *     (Phase A engine v0.9 contract).
 *   - `lastTopo15m` / `lastFundo15m` — most recent CONFIRMED 15m
 *     structural pivot price, deduped by topo↔fundo alternation per
 *     the indicator-lab pattern (`hawks-isolation-charts.tsx:547`).
 *     Used by the exit-management subsystem (spec §5, Phase E fibo
 *     measured-move) to anchor the impulse size. null when no
 *     confirmed pivot of that type has been seen yet in the walk.
 */
export interface HtfWalkerSnapshot {
	gate15m: HtfWalkerState
	gate60m: HtfWalkerState
	lastTopo15m: number | null
	lastFundo15m: number | null
	// ISO timestamp of the 15m brick that DEFINED the pivot (the
	// `peakBrickIdx` brick from the detector — strictly before the
	// confirmation brick). null if the pivot hasn't been confirmed yet.
	// Used by the lab to render anchor stubs at the correct 15m brick.
	lastTopo15mAtTimestamp: string | null
	lastFundo15mAtTimestamp: string | null
	// Which pivot type was MOST RECENTLY adopted (after the topo↔fundo
	// alternation dedup). Used by the exit-management subsystem to know
	// whether the impulse leg points up (last = topo) or down (last =
	// fundo). For SHORT to have a valid down-impulse, this must be
	// "fundo" — meaning the leg is topo → fundo, completed, and the
	// retracement is now in progress. Vice versa for LONG.
	lastAdoptedType15m: "topo" | "fundo" | null
}

const ALL_NO_SIGNAL: HtfWalkerSnapshot = {
	gate15m: "NO_SIGNAL",
	gate60m: "NO_SIGNAL",
	lastTopo15m: null,
	lastFundo15m: null,
	lastTopo15mAtTimestamp: null,
	lastFundo15mAtTimestamp: null,
	lastAdoptedType15m: null,
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
 * Walk the 5m candle history end-to-end and produce a per-timestamp snapshot
 * of the methodology-correct HTF gate state PLUS the most recent confirmed
 * 15m structural pivot prices.
 *
 * Candles MUST be sorted by timestamp ascending (engine guarantee). State is
 * seeded as NO_SIGNAL and carries forward across day boundaries.
 *
 * The optional `candles15m` argument is a separate brick stream for the 15m
 * timeframe. When provided, the structural-pivot detector runs on those
 * bricks and the most recent confirmed topo/fundo is forward-filled into
 * each 5m snapshot whose timestamp is ≥ that pivot's confirmation timestamp.
 * Pass an empty array (or omit) to skip — `lastTopo15m` / `lastFundo15m`
 * will be null in every snapshot.
 *
 * Returns a Map keyed by 5m candle.timestamp. When two candles share a
 * timestamp the LAST one wins — same as iterating a JS Map with duplicate
 * keys.
 */
export const buildHtfWalker = (
	candles: CandleRow[],
	config: HawksTripleScreenConfig,
	candles15m: CandleRow[] = []
): Map<string, HtfWalkerSnapshot> => {
	// Pre-walk the 15m structural pivots into a list of (timestamp, topo,
	// fundo) where the topo/fundo prices are the LATEST confirmed value of
	// that type at or before this timestamp. Deduped by topo↔fundo
	// alternation (the detector emits noise topos during a bearish run with
	// `price` = prior brick's low, etc — same quirk as 5m).
	interface FifteenPivotRow {
		timestamp: string
		topo: number | null
		fundo: number | null
		topoAtTimestamp: string | null
		fundoAtTimestamp: string | null
		lastAdoptedType: "topo" | "fundo" | null
	}
	const fifteenRows: FifteenPivotRow[] = []
	{
		let pivotState = createStructuralPivotState()
		let lastTopo: number | null = null
		let lastFundo: number | null = null
		let lastTopoAt: string | null = null
		let lastFundoAt: string | null = null
		let lastAdoptedType: "topo" | "fundo" | null = null
		for (let i = 0; i < candles15m.length; i++) {
			const c = candles15m[i]!
			const r = stepStructuralPivot(c, i, pivotState)
			pivotState = r.state
			if (r.pivot && r.pivot.type !== lastAdoptedType) {
				lastAdoptedType = r.pivot.type
				// `peakBrickIdx` is the brick where the actual extreme
				// sits (strictly before the confirmation brick `i`).
				const peakTs = candles15m[r.pivot.peakBrickIdx]?.timestamp ?? null
				if (r.pivot.type === "topo") {
					lastTopo = r.pivot.price
					lastTopoAt = peakTs
				} else {
					lastFundo = r.pivot.price
					lastFundoAt = peakTs
				}
			}
			fifteenRows.push({
				timestamp: c.timestamp,
				topo: lastTopo,
				fundo: lastFundo,
				topoAtTimestamp: lastTopoAt,
				fundoAtTimestamp: lastFundoAt,
				lastAdoptedType,
			})
		}
	}
	// Lookup helper: find the latest 15m row with timestamp ≤ ts via a
	// running cursor (both candle streams are sorted ascending).
	let cursor = -1
	const advanceTo = (ts: string): FifteenPivotRow | null => {
		while (
			cursor + 1 < fifteenRows.length &&
			fifteenRows[cursor + 1]!.timestamp <= ts
		) {
			cursor++
		}
		return cursor >= 0 ? fifteenRows[cursor]! : null
	}

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
		const fifteen = advanceTo(candle.timestamp)
		out.set(candle.timestamp, {
			gate15m: state15m,
			gate60m: state60m,
			lastTopo15m: fifteen?.topo ?? null,
			lastFundo15m: fifteen?.fundo ?? null,
			lastTopo15mAtTimestamp: fifteen?.topoAtTimestamp ?? null,
			lastFundo15mAtTimestamp: fifteen?.fundoAtTimestamp ?? null,
			lastAdoptedType15m: fifteen?.lastAdoptedType ?? null,
		})
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
	snapshot: Pick<HtfWalkerSnapshot, "gate15m" | "gate60m">,
	direction: "short" | "long"
): boolean => {
	if (direction === "short") {
		return snapshot.gate15m === "BEAR" && snapshot.gate60m === "BEAR"
	}
	return snapshot.gate15m === "BULL" && snapshot.gate60m === "BULL"
}
