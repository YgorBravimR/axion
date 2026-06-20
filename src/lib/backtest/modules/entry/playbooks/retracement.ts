/**
 * `retracement` playbook — "retração do movimento" (v0.9 spec §4.2).
 *
 * Idea: a structural pivot in trade direction has been confirmed on 5m
 * (TOPO for SHORTs, FUNDO for LONGs). Price then retraced from that
 * pivot by at least 2 brick-sizes, capped by the prior opposite pivot.
 * The current brick is the FIRST brick that closes back in trend
 * direction AFTER the retracement — that resumption is the trigger.
 *
 * Trigger condition (SHORT case, gate=BEAR):
 *   1. The most recent confirmed pivot in `priorBricks` is a TOPO.
 *   2. Since that TOPO, price has rallied (retraced UP) by ≥ 2 ×
 *      brickSize, and that rally peak is BELOW the prior TOPO (the
 *      one before the most-recent one — i.e. the retracement is
 *      capped by structure).
 *   3. The current brick is a bearish brick that closes BELOW the
 *      rally peak — i.e. the resumption candle.
 *
 * LONG case is the mirror: most-recent pivot is FUNDO, retracement
 * down ≥ 2 brickSizes, current bullish brick closing above retracement
 * low.
 *
 * Stop: just beyond the retracement extreme (the rally peak for SHORT,
 * the dip low for LONG) — that level is the pivot the next move would
 * have to break to invalidate the setup.
 *
 * Exit config: locked from `PLAYBOOK_EXIT_DEFAULTS.retracement` (=
 *   Mode 3b, fibo_T2 + trail-after-3R). Spec §9.
 */

import type { CandleRow } from "@/types/candle"
import type { Playbook, PlaybookContext, PlaybookFire } from "./types"
import { PLAYBOOK_EXIT_DEFAULTS } from "./types"
import {
	createStructuralPivotState,
	stepStructuralPivot,
} from "@/lib/backtest/hawks-structural-pivots"

interface PivotInfo {
	type: "topo" | "fundo"
	price: number
	peakBrickIdx: number
}

// Walk priors and return the most recent TOPO and most recent FUNDO,
// deduped by topo↔fundo alternation (same pattern as the lab + indicator
// chart — see `hawks-isolation-charts.tsx:547`).
const lastAlternatingPivots = (
	priors: ReadonlyArray<CandleRow>
): { lastTopo: PivotInfo | null; lastFundo: PivotInfo | null } => {
	let state = createStructuralPivotState()
	let lastTopo: PivotInfo | null = null
	let lastFundo: PivotInfo | null = null
	let lastAdoptedType: "topo" | "fundo" | null = null
	for (let i = 0; i < priors.length; i++) {
		const r = stepStructuralPivot(priors[i]!, i, state)
		state = r.state
		if (r.pivot && r.pivot.type !== lastAdoptedType) {
			lastAdoptedType = r.pivot.type
			const info: PivotInfo = {
				type: r.pivot.type,
				price: r.pivot.price,
				peakBrickIdx: r.pivot.peakBrickIdx,
			}
			if (r.pivot.type === "topo") {
				lastTopo = info
			} else {
				lastFundo = info
			}
		}
	}
	return { lastTopo, lastFundo }
}

const evaluate = (ctx: PlaybookContext): PlaybookFire | null => {
	const { brick, priorBricks, direction, brickSize } = ctx
	if (priorBricks.length < 4) {
		return null
	}
	const { lastTopo, lastFundo } = lastAlternatingPivots(priorBricks)
	const isBullishBrick = brick.close > brick.open
	const isBearishBrick = brick.close < brick.open

	if (direction === "short") {
		if (lastTopo === null) {
			return null
		}
		// Most-recent pivot must be the TOPO (i.e. the run since then is a
		// rally we're shorting against). If FUNDO is more recent than
		// TOPO, structure already flipped to up-leg — wrong setup.
		if (lastFundo !== null && lastFundo.peakBrickIdx > lastTopo.peakBrickIdx) {
			return null
		}
		// Bricks AFTER the TOPO peak — the rally + any resumption so far.
		const after = priorBricks.slice(lastTopo.peakBrickIdx + 1)
		if (after.length === 0) {
			return null
		}
		const rallyPeak = Math.max(...after.map((b) => b.high))
		const lowSinceTopo = Math.min(...after.map((b) => b.low))
		// Retracement size ≥ 2 brickSizes, AND rally peak strictly below
		// the TOPO it retraced from (structurally contained).
		if (rallyPeak - lowSinceTopo < 2 * brickSize) {
			return null
		}
		if (rallyPeak >= lastTopo.price) {
			return null
		}
		// Trigger: current bearish brick closing BELOW the rally peak —
		// resumption of trend after retracement.
		if (!isBearishBrick) {
			return null
		}
		if (brick.close >= rallyPeak) {
			return null
		}
		const brickBody = Math.abs(brick.close - brick.open) || brickSize
		return {
			id: "retracement",
			price: brick.close,
			stopReference: rallyPeak + brickBody,
			label: "retr",
			exitConfig: PLAYBOOK_EXIT_DEFAULTS.retracement,
		}
	}

	// LONG mirror.
	if (lastFundo === null) {
		return null
	}
	if (lastTopo !== null && lastTopo.peakBrickIdx > lastFundo.peakBrickIdx) {
		return null
	}
	const after = priorBricks.slice(lastFundo.peakBrickIdx + 1)
	if (after.length === 0) {
		return null
	}
	const dipLow = Math.min(...after.map((b) => b.low))
	const highSinceFundo = Math.max(...after.map((b) => b.high))
	if (highSinceFundo - dipLow < 2 * brickSize) {
		return null
	}
	if (dipLow <= lastFundo.price) {
		return null
	}
	if (!isBullishBrick) {
		return null
	}
	if (brick.close <= dipLow) {
		return null
	}
	const brickBody = Math.abs(brick.close - brick.open) || brickSize
	return {
		id: "retracement",
		price: brick.close,
		stopReference: dipLow - brickBody,
		label: "retr",
		exitConfig: PLAYBOOK_EXIT_DEFAULTS.retracement,
	}
}

export const retracementPlaybook: Playbook = {
	id: "retracement",
	evaluate,
}
