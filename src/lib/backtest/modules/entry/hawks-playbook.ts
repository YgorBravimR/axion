/**
 * Hawks engine v0.9 — playbook orchestrator.
 *
 * Replaces the v0.6 / v0.8 monolithic state machine
 * (`hawks-triple-screen.ts`) with a thin per-brick orchestrator that
 * delegates trigger detection to a registry of `Playbook` modules.
 *
 * Per-brick flow (matches spec §6):
 *   1. Read `gate60m` from the HTF walker. If `NO_SIGNAL`, return null
 *      immediately — no playbook may fire counter-gate or with no gate.
 *   2. Derive trade `direction` from `gate60m` (BULL → long, BEAR → short).
 *   3. Apply the 5-brick cooldown (carried from v0.6).
 *   4. Iterate every registered playbook. Collect every one whose
 *      `evaluate()` returns a fire.
 *   5. If any fired: pick the primary playbook by `PLAYBOOK_PRIORITY`,
 *      score the booster checklist (separate module), emit a single
 *      `EntrySignal` with the primary playbook's stop reference,
 *      and record `playbooksFired[]` on the trade quality metadata.
 *
 * State the orchestrator owns:
 *   - `priorBricksToday` — running list of bricks in the current day,
 *     reset on day boundary. Playbooks read from this for lookback.
 *   - `lastFireBrickIndex` — index of last fire today, for cooldown.
 *   - The cross-day persistent state is currently empty — v0.9 has no
 *     anchor that carries across days (anchors are derived per-brick
 *     from prior bricks). Kept as an exported interface anyway because
 *     the engine wires it through `persistentHawksState`.
 *
 * Spec: docs/hawks-strategy/engine-v0.9-playbook-spec.md
 */

import type {
	HawksTripleScreenConfig,
	EntrySignal,
	DayContext,
	Direction,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import type { HtfWalkerSnapshot, HtfWalkerState } from "../../hawks-htf-walker"
import type { KeltnerWalkerSnapshot } from "../../hawks-keltner-walker"
import { meanReversionPlaybook } from "./playbooks/mean-reversion"
import { retracementPlaybook } from "./playbooks/retracement"
import { vwapRejectionPlaybook } from "./playbooks/vwap-rejection"
import {
	type Playbook,
	type PlaybookFire,
	type PlaybookId,
	type PlaybookIndicatorKeys,
	PLAYBOOK_PRIORITY,
} from "./playbooks/types"
import { EMPTY_CHECKLIST, tierFromChecklist } from "./hawks-boosters"

// Cooldown between consecutive fires on 5m (spec §2). Carried from v0.6
// to prevent stacking on the same setup.
const FIRE_COOLDOWN_BRICKS = 5

const REGISTRY: ReadonlyArray<Playbook> = [
	meanReversionPlaybook,
	retracementPlaybook,
	vwapRejectionPlaybook,
]

export interface HawksPlaybookState {
	/** Bricks earlier today (excludes current brick). Cleared on day boundary. */
	priorBricksToday: CandleRow[]
	/** Index-in-day of last fire today. null = no fire yet today. */
	lastFireBrickIndex: number | null
}

export const createInitialHawksPlaybookState = (): HawksPlaybookState => ({
	priorBricksToday: [],
	lastFireBrickIndex: null,
})

/**
 * `keltnerOuterBlock` quality gate. When enabled, vetoes a playbook fire if
 * the current 5m brick is a confirmed methodology touch+reject of the outer
 * Keltner band on the side that contradicts the trade direction:
 *
 *   SHORT vetoed by REJECT_KC2_INF_* (bearish exhaustion against the trend).
 *   LONG  vetoed by REJECT_KC2_SUP_* (bullish exhaustion against the trend).
 *
 * Touch-only classes (TOUCH_KC2_*) and inner-band rejects (KC1) do NOT veto —
 * the outer band is the exhaustion-grade signal per the Group C audit
 * (`docs/hawks-strategy/indicator-isolation/group-c-keltner.md`). Outer
 * touch+reject fires on ~0.4% of 5m bricks in the catalog so the veto is
 * intentionally rare-and-strong.
 */
const isKeltnerOuterVeto = (
	snapshot: KeltnerWalkerSnapshot | null,
	direction: Direction
): boolean => {
	if (snapshot === null) {
		return false
	}
	const cls = snapshot.touchReject
	if (direction === "short") {
		return (
			cls === "REJECT_KC2_INF_SAME_BRICK" || cls === "REJECT_KC2_INF_NEXT_BRICK"
		)
	}
	return (
		cls === "REJECT_KC2_SUP_SAME_BRICK" || cls === "REJECT_KC2_SUP_NEXT_BRICK"
	)
}

const directionFromGate = (gate: HtfWalkerState): Direction | null => {
	if (gate === "BULL") {
		return "long"
	}
	if (gate === "BEAR") {
		return "short"
	}
	return null
}

const buildIndicatorKeys = (
	config: HawksTripleScreenConfig
): PlaybookIndicatorKeys => ({
	// Phase G — 5m EMA wired via `ema_fast_5m_key` (preset default "ema9").
	// When the config omits it, mean_reversion sees the empty string and
	// bails (returns null) — defensive against legacy recipes that pre-date
	// v0.10. Slow 5m EMA stays pinned at the 15m projection until a real
	// playbook needs it.
	ema_fast_5m_key: config.ema_fast_5m_key ?? "",
	ema_slow_5m_key: config.ema55_15m_key,
	vwap_d_key: config.vwap_d_key,
})

export const processHawksPlaybookCandle = (
	candle: CandleRow,
	state: HawksPlaybookState,
	ctx: DayContext,
	_tickSize: number,
	config: HawksTripleScreenConfig,
	htfSnapshot: HtfWalkerSnapshot | null,
	keltnerSnapshot: KeltnerWalkerSnapshot | null
): { state: HawksPlaybookState; signal: EntrySignal | null } => {
	// Day boundary: reset intraday history. Cross-day persistent state is
	// currently empty in v0.9 — no anchor carries over.
	const dayBoundary = ctx.candleIndexInDay === 0
	const base: HawksPlaybookState = dayBoundary
		? createInitialHawksPlaybookState()
		: state

	// Trading window guard (matches v0.8 semantics).
	if (ctx.brtHHMM < config.startTime || ctx.brtHHMM >= config.endTime) {
		return appendPrior(base, candle)
	}

	// Gate: 60m only. No snapshot → no fire (engine wasn't initialised with
	// stateful walker). NO_SIGNAL → no fire. Counter-gate is impossible
	// because direction itself is derived from the gate.
	if (htfSnapshot === null) {
		return appendPrior(base, candle)
	}
	const direction = directionFromGate(htfSnapshot.gate60m)
	if (direction === null) {
		return appendPrior(base, candle)
	}

	// Cooldown (§2). 5-brick gap between fires.
	const fireCooldown = config.fireCooldownBricks ?? FIRE_COOLDOWN_BRICKS
	if (
		base.lastFireBrickIndex !== null &&
		ctx.candleIndexInDay - base.lastFireBrickIndex < fireCooldown
	) {
		return appendPrior(base, candle)
	}

	// Dispatch to all playbooks. Collect every fire; we'll pick a primary.
	const bodySize = Math.abs(candle.close - candle.open)
	const brickSize = bodySize > 0 ? bodySize : config.brickSize5mPoints
	const playbookCtx = {
		brick: candle,
		priorBricks: base.priorBricksToday,
		brickIndexInDay: ctx.candleIndexInDay,
		direction,
		brickSize,
		indicatorKeys: buildIndicatorKeys(config),
	}
	const fires: Array<{ id: PlaybookId; fire: PlaybookFire }> = []
	for (const pb of REGISTRY) {
		const result = pb.evaluate(playbookCtx)
		if (result !== null) {
			fires.push({ id: pb.id, fire: result })
		}
	}

	if (fires.length === 0) {
		return appendPrior(base, candle)
	}

	// Quality-gate vetoes — applied AFTER playbooks fire so the gate-killed
	// fires don't burn cooldown (the trade never happened, the next valid
	// setup shouldn't be penalised). Today only `keltnerOuterBlock` is wired;
	// the other `qualityGates.*` flags remain UI-only until similar audits
	// promote them.
	const keltnerOuterBlock = config.qualityGates?.keltnerOuterBlock === true
	if (keltnerOuterBlock && isKeltnerOuterVeto(keltnerSnapshot, direction)) {
		return appendPrior(base, candle)
	}

	// Primary playbook = the first id in PLAYBOOK_PRIORITY that fired.
	// All fires still recorded in playbooksFired for downstream stats.
	const primaryId = PLAYBOOK_PRIORITY.find((pid) =>
		fires.some((f) => f.id === pid)
	)
	const primary =
		fires.find((f) => f.id === primaryId) ?? /* unreachable */ fires[0]!
	const playbooksFired = fires.map((f) => f.id)

	// Booster scoring — TODO step 3: read indicators and compute the
	// checklist. For now we emit C-tier (empty checklist → tier B per
	// the boosters module's collapse rule).
	const checklist = EMPTY_CHECKLIST
	const tier = tierFromChecklist(checklist)

	const signal: EntrySignal = {
		direction,
		price: primary.fire.price,
		stopReference: primary.fire.stopReference,
		label: `${primary.fire.label} [${playbooksFired.join(",")}]`,
		quality: {
			tier,
			score: 0,
			contributions: [],
		},
	}

	const next: HawksPlaybookState = {
		priorBricksToday: [...base.priorBricksToday, candle],
		lastFireBrickIndex: ctx.candleIndexInDay,
	}
	return { state: next, signal }
}

const appendPrior = (
	state: HawksPlaybookState,
	candle: CandleRow
): { state: HawksPlaybookState; signal: EntrySignal | null } => ({
	state: { ...state, priorBricksToday: [...state.priorBricksToday, candle] },
	signal: null,
})
