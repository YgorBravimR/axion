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
 * The protected floor is a PARAMETER (floorR, default 0). This makes the
 * governor a general day-level risk system, not just a never-red rule:
 *   floorR = 0  → never-red (the live default)
 *   floorR = +1 → lock-in-profit          floorR = -1 → give-back-to-1R
 * Cushion and arming are measured relative to the floor. See
 * docs/plans/hawks-governor-backtest-validation.md.
 *
 * Key rules (see docs/plans/hawks-never-red-governor.md):
 * - Arming LATCHES: once totalR reaches floorR + 1R at any point in the replay,
 *   the floor
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
	/**
	 * Protected floor in R. The day cannot close below this once armed. This is
	 * the dial that turns the governor into different risk rules:
	 *   floorR = 0  → never-red (the live default)
	 *   floorR = +1 → lock-in-profit (never give back below +1R)
	 *   floorR = -1 → give-back-allowed-to-1R
	 * Cushion is measured ABOVE this floor. Defaults to 0 (never-red).
	 */
	floorR?: number
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
	floorR = 0,
}: GovernorParams): GovernorResult => {
	// Arm once the account has at least one full riskable unit ABOVE the floor.
	// At floorR = 0 this is totalR >= 1 (the never-red default).
	const armThresholdR = floorR + ARM_THRESHOLD_R
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

		if (totalR >= armThresholdR) {
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

	// Cushion only meaningful in Phase A. Riskable 1R units ABOVE the floor:
	// floor(totalR - floorR), clamped at 0. A day sitting at a fractional
	// remainder above the floor (e.g. floorR+0.5) reads cushion 0 → stop.
	const cushion =
		phase === "phaseA" ? Math.max(0, Math.floor(totalR - floorR)) : 0

	let shouldStop = false
	let stopReason: GovernorStopReason = null

	if (phase === "phaseB") {
		if (postTargetStop) {
			shouldStop = true
			stopReason = "postTargetStop"
		}
	} else if (phase === "phaseA") {
		// Floor protection: no riskable units left above the floor → close the
		// day at its (>= floorR) remainder. Armed guarantees totalR reached
		// floorR + 1R at some point, so the day can only close at the floor or
		// better. At floorR = 0 this is the never-red guarantee.
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
