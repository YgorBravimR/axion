/**
 * Hawks "never-red daily governor" — pure phase state machine over a day's
 * realized R outcomes. LIVE trading status only (backtest deferred).
 *
 * Governing variable: cumulative realized R for the day (sum of trade rOutcome).
 * No fixed trade-count limit. Three phases:
 *
 *        totalR < 1R          1R <= totalR < target        totalR >= target
 *      ┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
 *      │   PHASE 0    │     │      PHASE A         │     │     PHASE B      │
 *      │  not armed   │ ──► │   armed, never-red   │ ──► │  one stop hard   │
 *      │ loss cap +   │     │ floor = 0R           │     │ any losing trade │
 *      │ cascade net  │     │ cushion=floor(totalR)│     │ ends the day     │
 *      └──────────────┘     └──────────────────────┘     └──────────────────┘
 *
 * Key rules (see docs/plans/hawks-never-red-governor.md):
 * - Arming LATCHES: once totalR reaches 1R at any point in the replay, the 0R
 *   floor holds for the rest of the day even if a later partial loss drops
 *   cumulative R below 1R. Without latching, a partial loss silently reopens
 *   full-loss-cap risk below break-even (the P0 the adversarial review caught).
 * - Cushion = floor(totalR): degrades gracefully with any loss magnitude;
 *   partial losses (e.g. -0.6R) just lower totalR, no special case.
 * - Phase B "the stop" = ANY losing trade (negative rOutcome), not only -1R.
 * - Fractional remainder is never risked: at +0.5R cushion is 0, day ends.
 * - Phase 0 does NOT stop here — the existing daily loss cap + Hawks cascade
 *   govern the pre-armed account. Governor returns shouldStop=false in Phase 0.
 */

type GovernorPhase = "phase0" | "phaseA" | "phaseB"

type GovernorStopReason = "neverRedFloor" | "postTargetStop" | null

interface GovernorTrade {
	/** Realized R for this closed trade (trades.rOutcome as a number). */
	rOutcome: number
	/** Breakeven trades accumulate nothing and are invisible to the machine. */
	outcome: "win" | "loss" | "breakeven" | null
}

interface GovernorParams {
	trades: GovernorTrade[]
	/** Daily win target in R (fractal dailyTargetR). Phase B begins at/above this. */
	dailyTargetR: number
}

interface GovernorResult {
	phase: GovernorPhase
	/** Cumulative realized R for the day. */
	totalR: number
	/** Riskable 1R units remaining before the never-red floor (Phase A only). */
	cushion: number
	/** True once totalR has reached 1R at any point today (latched). */
	armed: boolean
	shouldStop: boolean
	stopReason: GovernorStopReason
}

const ARM_THRESHOLD_R = 1

/**
 * Resolve the governor state from the day's CLOSED trades. Pure — the caller
 * loads trades (Hawks-gated) and composes the stop into the live status.
 */
const resolveHawksDailyGovernor = ({
	trades,
	dailyTargetR,
}: GovernorParams): GovernorResult => {
	let totalR = 0
	let everArmed = false
	// Phase B latches: once the target is crossed, the account is in "one stop
	// hard" mode for the rest of the day regardless of later swings.
	let reachedTarget = false
	// Phase B ends on the first losing trade AFTER the target was reached.
	let postTargetStop = false

	for (const trade of trades) {
		if (trade.outcome === "breakeven") {
			continue
		}

		const wasInPhaseB = reachedTarget

		totalR += trade.rOutcome

		if (totalR >= ARM_THRESHOLD_R) {
			everArmed = true
		}
		if (totalR >= dailyTargetR) {
			reachedTarget = true
		}

		// Phase B "one stop hard": any losing trade taken while already in
		// Phase B ends the day. `wasInPhaseB` guards the boundary case — the
		// trade that FIRST crosses the target is a win (it raised totalR to the
		// target), so it can't be the stop; only subsequent losses count.
		if (wasInPhaseB && trade.outcome === "loss") {
			postTargetStop = true
		}
	}

	const phase: GovernorPhase = reachedTarget
		? "phaseB"
		: everArmed
			? "phaseA"
			: "phase0"

	// Cushion only meaningful in Phase A. floor(totalR) clamped at 0 so a day
	// sitting at a fractional remainder (+0.5R) reads cushion 0 → stop.
	const cushion = phase === "phaseA" ? Math.max(0, Math.floor(totalR)) : 0

	let shouldStop = false
	let stopReason: GovernorStopReason = null

	if (phase === "phaseB") {
		if (postTargetStop) {
			shouldStop = true
			stopReason = "postTargetStop"
		}
	} else if (phase === "phaseA") {
		// Never-red floor: no riskable units left → close the day at its (>=0)
		// remainder. Armed guarantees totalR reached 1R at some point, so the
		// day can only close at break-even or better.
		if (cushion < 1) {
			shouldStop = true
			stopReason = "neverRedFloor"
		}
	}
	// phase0: governor does not stop — existing loss cap + cascade govern.

	return {
		phase,
		totalR,
		cushion,
		armed: everArmed,
		shouldStop,
		stopReason,
	}
}

export { resolveHawksDailyGovernor, ARM_THRESHOLD_R }
export type {
	GovernorPhase,
	GovernorStopReason,
	GovernorTrade,
	GovernorParams,
	GovernorResult,
}
