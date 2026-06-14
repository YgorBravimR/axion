/**
 * Booster scorer for the Hawks engine v0.9.
 *
 * Spec: docs/hawks-strategy/engine-v0.9-playbook-spec.md §3.
 *
 * A playbook trigger fires with base tier C. Each booster aligned with
 * the trade direction bumps the tier. Boosters never gate the entry —
 * they only affect tier / downstream sizing.
 *
 * v0.9 booster checklist (5 items):
 *   1. 15m HTF gate agrees with 60m gate (`htf15mAligned`)
 *   2. 5m MACD histogram sign agrees with direction (`macdAligned`)
 *   3. 5m EMA slope (fast > slow for LONG, < for SHORT) (`ema5mAligned`)
 *   4. 5m close is on the gate-favoured side of daily VWAP (`vwapAligned`)
 *   5. A recent HTF structural pivot (15m or 60m) confirms the bias
 *      (`htfPivotAligned`)
 *
 * Each booster is a flag. The number of `true` flags maps to a tier:
 *   0 → C, 1 → B, 2 → A, 3+ → AA, all 5 → AAA.
 *
 * This module is **pure** — given a checklist, it scores. Computing the
 * checklist itself (reading indicators, walking pivots) lives in the
 * orchestrator. Keeping the scorer pure makes unit testing trivial.
 */

import type { QualityTier } from "@/types/backtest"

export interface BoosterChecklist {
	htf15mAligned: boolean
	macdAligned: boolean
	ema5mAligned: boolean
	vwapAligned: boolean
	htfPivotAligned: boolean
}

export const EMPTY_CHECKLIST: BoosterChecklist = {
	htf15mAligned: false,
	macdAligned: false,
	ema5mAligned: false,
	vwapAligned: false,
	htfPivotAligned: false,
}

export const countAligned = (c: BoosterChecklist): number =>
	(c.htf15mAligned ? 1 : 0) +
	(c.macdAligned ? 1 : 0) +
	(c.ema5mAligned ? 1 : 0) +
	(c.vwapAligned ? 1 : 0) +
	(c.htfPivotAligned ? 1 : 0)

export const tierFromChecklist = (c: BoosterChecklist): QualityTier => {
	const aligned = countAligned(c)
	if (aligned >= 5) {
		return "AAA"
	}
	if (aligned >= 3) {
		return "AA"
	}
	if (aligned >= 2) {
		return "A"
	}
	// Spec §3 maps "1 booster" to tier B and "0 boosters" to tier C, but
	// the canonical TradeQuality tier union does not include "C". Collapse
	// both into "B" for now — when we extend QualityTier with "C" the
	// orchestrator can swap to `aligned === 0 ? "C" : "B"`.
	return "B"
}
