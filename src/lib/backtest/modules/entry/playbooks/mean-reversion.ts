/**
 * `mean_reversion` playbook — "retorno à média" (v0.9 spec §4.1).
 *
 * Idea: 5m close has been on the same side of the 5m fast EMA for K
 * consecutive bricks AND distance to the mean has been INCREASING for
 * the last 2 of those bricks (extension building). The current brick
 * is the first one that closes BACK toward the mean — that flip is the
 * trigger.
 *
 * Trigger condition (LONG case, gate=BULL — price has been BELOW the
 * mean and is now snapping back UP):
 *   1. priorBricks[-3], [-2], [-1] all closed BELOW ema_fast_5m.
 *   2. distance(priorBricks[-2]) > distance(priorBricks[-3]) AND
 *      distance(priorBricks[-1]) > distance(priorBricks[-2])  (rising distance).
 *   3. current brick closed ABOVE its own open (bullish brick) AND
 *      reduced distance vs priorBricks[-1] OR closed above the mean.
 *   4. Brick direction (bullish) matches gate direction (BULL).
 *
 * SHORT case is the mirror: bricks above the mean, distance rising,
 * current brick bearish AND closes back toward (or below) the mean.
 *
 * Stop: beyond the maximum-extension brick — the most distant of the
 *   K prior bricks. For LONG that's the LOWEST low among priors; for
 *   SHORT, the HIGHEST high. Per spec §4.1: "stop beyond the brick
 *   that printed the maximum extension."
 *
 * Exit config: locked from `PLAYBOOK_EXIT_DEFAULTS.mean_reversion`
 *   (= Mode 1, static3R, no trail). Spec §9.
 */

import type { Playbook, PlaybookContext, PlaybookFire } from "./types"
import { PLAYBOOK_EXIT_DEFAULTS } from "./types"

const K_EXTENSION_BRICKS = 3

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
	const { brick, priorBricks, direction, indicatorKeys } = ctx
	const meanKey = indicatorKeys.ema_fast_5m_key
	if (priorBricks.length < K_EXTENSION_BRICKS) {
		return null
	}
	const meanNow = numericIndicator(brick, meanKey)
	if (meanNow === null) {
		return null
	}
	const last3 = priorBricks.slice(-K_EXTENSION_BRICKS)
	const meansLast3 = last3.map((b) => numericIndicator(b, meanKey))
	if (meansLast3.some((m) => m === null)) {
		return null
	}
	// Side check: all K prior bricks on the gate's side of the mean.
	// LONG (gate=BULL, snapback up) → priors were BELOW mean (close < mean).
	// SHORT (gate=BEAR, snapback down) → priors were ABOVE mean.
	const priorsOnExtensionSide = last3.every((b, i) => {
		const m = meansLast3[i]!
		return direction === "long" ? b.close < m : b.close > m
	})
	if (!priorsOnExtensionSide) {
		return null
	}
	// Distance-rising check: |close - mean| must be strictly increasing
	// across the K-brick window (extension building, not flattening).
	const distances = last3.map((b, i) => Math.abs(b.close - meansLast3[i]!))
	for (let i = 1; i < distances.length; i++) {
		if (distances[i]! <= distances[i - 1]!) {
			return null
		}
	}
	// Trigger: current brick is in gate direction AND reduces distance
	// vs the most recent prior brick.
	const isBullishBrick = brick.close > brick.open
	const isBearishBrick = brick.close < brick.open
	const brickInGateDirection =
		direction === "long" ? isBullishBrick : isBearishBrick
	if (!brickInGateDirection) {
		return null
	}
	const distanceNow = Math.abs(brick.close - meanNow)
	const lastPriorDistance = distances[distances.length - 1]!
	if (distanceNow >= lastPriorDistance) {
		return null
	}
	// Stop = beyond the maximum-extension prior brick.
	// LONG: max-extension brick has the LOWEST low → stop = (that low) -
	// 1 brick body of buffer.
	// SHORT: max-extension brick has the HIGHEST high → stop = (that
	// high) + 1 brick body.
	const brickBody = Math.abs(brick.close - brick.open) || ctx.brickSize
	let extreme: number
	if (direction === "long") {
		extreme = Math.min(...last3.map((b) => b.low))
		const stopReference = extreme - brickBody
		return {
			id: "mean_reversion",
			price: brick.close,
			stopReference,
			label: "mean-rev",
			exitConfig: PLAYBOOK_EXIT_DEFAULTS.mean_reversion,
		}
	}
	extreme = Math.max(...last3.map((b) => b.high))
	const stopReference = extreme + brickBody
	return {
		id: "mean_reversion",
		price: brick.close,
		stopReference,
		label: "mean-rev",
		exitConfig: PLAYBOOK_EXIT_DEFAULTS.mean_reversion,
	}
}

export const meanReversionPlaybook: Playbook = {
	id: "mean_reversion",
	evaluate,
}
