/**
 * `vwap_rejection` playbook — "rejeição de VWAP" (v0.9 spec §4.3).
 *
 * Idea: in a BULL gate, price dipped BELOW VWAP and then closed back
 * ABOVE it — the dip failed. We enter on the close-back. Mirror for
 * BEAR gate.
 *
 * Trigger condition (LONG case, gate=BULL):
 *   1. Within the last N=5 priors AT LEAST ONE brick closed BELOW vwap_d
 *      (the dip — gate-unfavoured side).
 *   2. The current brick is a bullish brick closing ABOVE vwap_d.
 *   3. The current brick's open is at or below vwap_d (the rejection
 *      candle that "punched through" from below).
 *
 * SHORT mirror: at least one of the last N closed ABOVE vwap_d, current
 * bearish brick closes BELOW vwap_d, opened at/above.
 *
 * Stop: beyond the VWAP-pierce extreme — the most extreme low (for
 * LONG) or high (for SHORT) among the dip bricks. We add a brickBody
 * buffer to keep the stop outside the noise wick.
 *
 * Exit config: locked from `PLAYBOOK_EXIT_DEFAULTS.vwap_rejection` (=
 *   Mode 2-ish, static3R + trail-after-3R). Spec §9.
 */

import type { Playbook, PlaybookContext, PlaybookFire } from "./types"
import { PLAYBOOK_EXIT_DEFAULTS } from "./types"

const N_LOOKBACK_BRICKS = 5

const numericIndicator = (
	brick: PlaybookContext["brick"],
	key: string
): number | null => {
	if (key === "") {
		return null
	}
	const v = brick.indicators[key]
	return typeof v === "number" ? v : null
}

const evaluate = (ctx: PlaybookContext): PlaybookFire | null => {
	const { brick, priorBricks, direction, brickSize, indicatorKeys } = ctx
	const vwapKey = indicatorKeys.vwap_d_key
	const vwapNow = numericIndicator(brick, vwapKey)
	if (vwapNow === null) {
		return null
	}
	if (priorBricks.length < 1) {
		return null
	}
	const lookback = priorBricks.slice(-N_LOOKBACK_BRICKS)
	const isBullishBrick = brick.close > brick.open
	const isBearishBrick = brick.close < brick.open

	if (direction === "long") {
		// At least one prior closed BELOW vwap (the dip).
		const dipBricks = lookback.filter((b) => {
			const v = numericIndicator(b, vwapKey)
			return v !== null && b.close < v
		})
		if (dipBricks.length === 0) {
			return null
		}
		// Current bullish brick closing ABOVE vwap.
		if (!isBullishBrick) {
			return null
		}
		if (brick.close <= vwapNow) {
			return null
		}
		// Current brick's open should be at/below vwap — i.e. it punched
		// through from below. Allows pierce + rejection within one brick.
		if (brick.open > vwapNow) {
			return null
		}
		// Stop beyond the lowest low among the dip bricks.
		const pierceExtreme = Math.min(...dipBricks.map((b) => b.low))
		const brickBody = Math.abs(brick.close - brick.open) || brickSize
		return {
			id: "vwap_rejection",
			price: brick.close,
			stopReference: pierceExtreme - brickBody,
			label: "vwap-rej",
			exitConfig: PLAYBOOK_EXIT_DEFAULTS.vwap_rejection,
		}
	}

	// SHORT mirror.
	const dipBricks = lookback.filter((b) => {
		const v = numericIndicator(b, vwapKey)
		return v !== null && b.close > v
	})
	if (dipBricks.length === 0) {
		return null
	}
	if (!isBearishBrick) {
		return null
	}
	if (brick.close >= vwapNow) {
		return null
	}
	if (brick.open < vwapNow) {
		return null
	}
	const pierceExtreme = Math.max(...dipBricks.map((b) => b.high))
	const brickBody = Math.abs(brick.close - brick.open) || brickSize
	return {
		id: "vwap_rejection",
		price: brick.close,
		stopReference: pierceExtreme + brickBody,
		label: "vwap-rej",
		exitConfig: PLAYBOOK_EXIT_DEFAULTS.vwap_rejection,
	}
}

export const vwapRejectionPlaybook: Playbook = {
	id: "vwap_rejection",
	evaluate,
}
