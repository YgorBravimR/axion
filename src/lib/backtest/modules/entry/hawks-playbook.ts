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
	IndicatorContribution,
	IndicatorSignal,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import type { HtfWalkerSnapshot, HtfWalkerState } from "../../hawks-htf-walker"
import type { KeltnerWalkerSnapshot } from "../../hawks-keltner-walker"
import type { SrWalkerSnapshot } from "../../hawks-sr-walker"
import type { VwapTouchRejectSnapshot } from "../../hawks-vwap-walker"
import type { VolumeEmaSnapshot } from "../../hawks-volume-walker"
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
import { tierFromChecklist, type BoosterChecklist } from "./hawks-boosters"

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

// ─── Veto consumers ────────────────────────────────────────────────────
// Each veto reads its walker snapshot + direction and returns either null
// (allow) or a short string (the veto reason, used for trace logging).
// Composed by `evaluateVetoes` below — adding a new gate is a single entry
// in the VETO_REGISTRY list.

/**
 * `keltnerOuterBlock` (Group C). Vetoes a playbook fire if the current 5m
 * brick is a confirmed methodology touch+reject of the outer Keltner band
 * AGAINST the trade direction:
 *
 *   SHORT vetoed by REJECT_KC2_INF_* (bearish exhaustion against the trend).
 *   LONG  vetoed by REJECT_KC2_SUP_* (bullish exhaustion against the trend).
 *
 * Touch-only classes (TOUCH_KC2_*) and inner-band rejects (KC1) do NOT veto.
 */
const isKeltnerOuterVeto = (
	snapshot: KeltnerWalkerSnapshot | null,
	direction: Direction
): string | null => {
	if (snapshot === null) {
		return null
	}
	const cls = snapshot.touchReject
	const matches =
		direction === "short"
			? cls === "REJECT_KC2_INF_SAME_BRICK" ||
				cls === "REJECT_KC2_INF_NEXT_BRICK"
			: cls === "REJECT_KC2_SUP_SAME_BRICK" ||
				cls === "REJECT_KC2_SUP_NEXT_BRICK"
	return matches ? `keltner_outer:${cls}` : null
}

/**
 * `srLevelBlock` (Group E). Vetoes a fire if any S/R level (4 HTF MAs +
 * vwap_d + ajuste) is AHEAD of the trade direction within
 * `srBlockBufferBricks` (default 2 bricks). For SHORT, "ahead" means below
 * the close (acts as floor); for LONG, above the close (acts as ceiling).
 */
const isSrLevelVeto = (
	snapshot: SrWalkerSnapshot | null,
	direction: Direction
): string | null => {
	if (snapshot === null) {
		return null
	}
	const dirSnap = direction === "short" ? snapshot.short : snapshot.long
	if (!dirSnap.blocked) {
		return null
	}
	const nearest = dirSnap.levelsAhead[0]
	return nearest
		? `sr_level:${nearest.level}@${nearest.distanceBricks.toFixed(2)}b`
		: "sr_level"
}

/**
 * `vwapWickRejectBlock` (Group D). Vetoes a fire if the current 5m brick is
 * a confirmed methodology wick touch+reject of vwap_d AGAINST the trade
 * direction:
 *
 *   SHORT vetoed by REJECT_FROM_BELOW_*  (bullish rejection of vwap_d).
 *   LONG  vetoed by REJECT_FROM_ABOVE_*  (bearish rejection of vwap_d).
 *
 * NOTE: this is a different signal from the existing `vwap_dip_recover`
 * playbook (which is a close-based dip-and-recover trigger). The Group D
 * audit found the two have 0% overlap. The misnamed playbook is scheduled
 * for rename in a follow-up.
 */
const isVwapWickRejectVeto = (
	snapshot: VwapTouchRejectSnapshot | null,
	direction: Direction
): string | null => {
	if (snapshot === null) {
		return null
	}
	const cls = snapshot.d.touchReject
	const matches =
		direction === "short"
			? cls === "REJECT_FROM_BELOW_SAME_BRICK" ||
				cls === "REJECT_FROM_BELOW_NEXT_BRICK"
			: cls === "REJECT_FROM_ABOVE_SAME_BRICK" ||
				cls === "REJECT_FROM_ABOVE_NEXT_BRICK"
	return matches ? `vwap_wick:${cls}` : null
}

/**
 * `aggression.blockMode = "blockOnAnti"` (Group F). Vetoes a fire if
 * |agr_saldo| ≥ threshold AND aggression direction opposes the trade:
 *
 *   SHORT vetoed when agr_saldo ≥ +threshold (buyers active during sell).
 *   LONG  vetoed when agr_saldo ≤ −threshold (sellers active during buy).
 *
 * `blockOnAligned` is the mirror polarity (vetoes the ALIGNED case). The
 * Group F audit found the ANTI bucket is structurally empty at engine v0.10
 * — the rule will rarely fire — but we wire it honestly so the flag does
 * what its name promises.
 */
const isAggressionVeto = (
	candle: CandleRow,
	config: HawksTripleScreenConfig,
	direction: Direction
): string | null => {
	const mode = config.qualityGates?.aggression?.blockMode
	if (!mode || mode === "off") {
		return null
	}
	const threshold =
		config.qualityGates?.aggression?.threshold ??
		config.qualityGates?.aggressionThreshold ??
		15000
	const agr = candle.indicators[config.aggression_key]
	if (typeof agr !== "number") {
		return null
	}
	if (Math.abs(agr) < threshold) {
		return null
	}
	const isAnti = direction === "short" ? agr >= threshold : agr <= -threshold
	const isAligned = direction === "short" ? agr <= -threshold : agr >= threshold

	if (mode === "blockOnAnti" && isAnti) {
		return `aggression_anti:${agr.toFixed(0)}`
	}
	if (mode === "blockOnAligned" && isAligned) {
		return `aggression_aligned:${agr.toFixed(0)}`
	}
	return null
}

/**
 * `volume.mode = "block" | "both"` (Group G). Vetoes a fire when the brick's
 * volume is at-or-below the running EMA (per-spec polarity: "low conviction
 * = block"). The Group G audit found the spec polarity is empirically
 * backwards on engine v0.10 — wiring honors the flag name; the optimization
 * phase can revisit polarity if/when that audit gets revisited.
 */
const isVolumeVeto = (
	snapshot: VolumeEmaSnapshot | null,
	config: HawksTripleScreenConfig
): string | null => {
	const mode = config.qualityGates?.volume?.mode
	if (!mode || mode === "off" || mode === "score") {
		return null
	}
	if (snapshot === null || snapshot.volume === null || snapshot.ema === null) {
		return null
	}
	if (snapshot.aboveEma) {
		return null
	}
	return `volume_below_ema:${snapshot.volume.toFixed(0)}<=${snapshot.ema.toFixed(0)}`
}

/**
 * Composable veto evaluator. Walks the registry of enabled vetoes and
 * returns the first non-null reason. Adding a new gate = adding one entry.
 */
interface VetoContext {
	candle: CandleRow
	config: HawksTripleScreenConfig
	direction: Direction
	keltnerSnapshot: KeltnerWalkerSnapshot | null
	srSnapshot: SrWalkerSnapshot | null
	vwapSnapshot: VwapTouchRejectSnapshot | null
	volumeSnapshot: VolumeEmaSnapshot | null
}

const evaluateVetoes = (vctx: VetoContext): string | null => {
	const qg = vctx.config.qualityGates

	// Linear walk — explicit checks, easy to extend, each veto returns its own reason.
	if (qg?.keltnerOuterBlock === true) {
		const reason = isKeltnerOuterVeto(vctx.keltnerSnapshot, vctx.direction)
		if (reason !== null) {
			return reason
		}
	}

	if (qg?.srLevelBlock === true) {
		const reason = isSrLevelVeto(vctx.srSnapshot, vctx.direction)
		if (reason !== null) {
			return reason
		}
	}

	if (qg?.vwapWickRejectBlock === true) {
		const reason = isVwapWickRejectVeto(vctx.vwapSnapshot, vctx.direction)
		if (reason !== null) {
			return reason
		}
	}

	let reason = isAggressionVeto(vctx.candle, vctx.config, vctx.direction)
	if (reason !== null) {
		return reason
	}

	reason = isVolumeVeto(vctx.volumeSnapshot, vctx.config)
	if (reason !== null) {
		return reason
	}

	return null
}

// ─── Booster checklist (Phase G — all 5 boosters wired) ─────────────────
// Computes the spec §3 booster checklist from data available at fire time.
// Each booster is binary (aligned / not aligned with trade direction).
// The result is fed to `tierFromChecklist` to derive the QualityTier:
//   0 → B, 1 → B, 2 → A, 3-4 → AA, 5 → AAA.

interface ChecklistContext {
	candle: CandleRow
	config: HawksTripleScreenConfig
	direction: Direction
	htfSnapshot: HtfWalkerSnapshot | null
}

const computeBoosterChecklist = (cctx: ChecklistContext): BoosterChecklist => {
	const { candle, config, direction, htfSnapshot } = cctx

	// 1. htf15mAligned: 15m gate matches direction (same side as 60m gate,
	// which gates the fire to begin with).
	const htf15mAligned =
		htfSnapshot !== null &&
		((direction === "long" && htfSnapshot.gate15m === "BULL") ||
			(direction === "short" && htfSnapshot.gate15m === "BEAR"))

	// 2. macdAligned: 5m MACD histogram sign agrees with direction.
	const macd = candle.indicators[config.macd_key]
	const macdAligned =
		typeof macd === "number" &&
		((direction === "long" && macd > 0) || (direction === "short" && macd < 0))

	// 3. ema5mAligned: 5m fast > slow EMA for LONG, fast < slow for SHORT.
	// When ema_fast_5m_key is unset (legacy configs pre-v0.10), this booster
	// stays false — orchestrator already handles that defensively elsewhere.
	const fastKey = config.ema_fast_5m_key
	const fast = fastKey ? candle.indicators[fastKey] : undefined
	const slow = candle.indicators[config.ema55_15m_key]
	const ema5mAligned =
		typeof fast === "number" &&
		typeof slow === "number" &&
		((direction === "long" && fast > slow) ||
			(direction === "short" && fast < slow))

	// 4. vwapAligned: close on the gate-favored side of daily VWAP.
	const vwap = candle.indicators[config.vwap_d_key]
	const vwapAligned =
		typeof vwap === "number" &&
		((direction === "long" && candle.close > vwap) ||
			(direction === "short" && candle.close < vwap))

	// 5. htfPivotAligned: most recently ADOPTED 15m structural pivot type
	// confirms the bias. Per spec §3: a recent FUNDO (low) confirms LONG,
	// a recent TOPO (high) confirms SHORT. Requires the 15m candle stream
	// to be passed to `runBacktest` (4th arg); without it `lastAdoptedType15m`
	// stays null and this booster never fires.
	const pivotType = htfSnapshot?.lastAdoptedType15m ?? null
	const htfPivotAligned =
		(direction === "long" && pivotType === "fundo") ||
		(direction === "short" && pivotType === "topo")

	return {
		htf15mAligned,
		macdAligned,
		ema5mAligned,
		vwapAligned,
		htfPivotAligned,
	}
}

// ─── Score-mode contributions (orthogonal to booster checklist) ─────────
// `quality.tier` is set from the booster checklist (count of 5 spec §3
// booster items). `quality.score` and `quality.contributions[]` are
// populated separately here, ONLY for the gates whose *score* mode is
// active (aggression.scoreMode = "original", volume.mode in
// ["score","both"]). Score is unused by the default tier path but is
// consumed by `tier-analytics.ts` when custom `TierThresholds` are
// supplied — i.e. it gives the analytics layer a re-tiering hook without
// disturbing the production tier label.

interface ScoreContext {
	candle: CandleRow
	config: HawksTripleScreenConfig
	direction: Direction
	volumeSnapshot: VolumeEmaSnapshot | null
	priorBricks: ReadonlyArray<CandleRow>
}

const computeQualityContributions = (
	sctx: ScoreContext
): { score: number; contributions: IndicatorContribution[] } => {
	const { candle, config, direction, volumeSnapshot, priorBricks } = sctx
	const contributions: IndicatorContribution[] = []

	// Aggression scoreMode = "original": agr_saldo aligned with direction
	// at |agr| ≥ threshold ⇒ favor, anti-aligned ⇒ penalty, sub-threshold
	// or missing ⇒ neutral.
	const aggMode = config.qualityGates?.aggression?.scoreMode
	if (aggMode === "original") {
		const threshold =
			config.qualityGates?.aggression?.threshold ??
			config.qualityGates?.aggressionThreshold ??
			15000
		const agr = candle.indicators[config.aggression_key]
		let signal: IndicatorSignal = "neutral"
		if (typeof agr === "number" && Math.abs(agr) >= threshold) {
			const aligned = direction === "long" ? agr > 0 : agr < 0
			signal = aligned ? "favor" : "penalty"
		}
		const weight = 1
		contributions.push({
			key: "aggression",
			signal,
			weight,
			contribution:
				signal === "favor" ? weight : signal === "penalty" ? -weight : 0,
		})
	}

	// Volume score-mode (mode in ["score","both"]): above-EMA ⇒ favor,
	// below-or-equal ⇒ penalty, missing ⇒ neutral. Polarity per spec §1
	// (Group G audit found this empirically backwards on engine v0.10 but
	// the flag does what its name promises).
	const volMode = config.qualityGates?.volume?.mode
	if (volMode === "score" || volMode === "both") {
		let signal: IndicatorSignal = "neutral"
		if (
			volumeSnapshot !== null &&
			volumeSnapshot.volume !== null &&
			volumeSnapshot.ema !== null
		) {
			signal = volumeSnapshot.aboveEma ? "favor" : "penalty"
		}
		const weight = 1
		contributions.push({
			key: "volume",
			signal,
			weight,
			contribution:
				signal === "favor" ? weight : signal === "penalty" ? -weight : 0,
		})
	}

	// Color-streak / VB favor (Group H): +1 when fire brick is STREAK_1
	// (the brick that JUST flipped color, i.e. the Virada de Box). For
	// continuation bricks or anti-aligned fires, signal = neutral. Per-spec
	// polarity per Group H audit (76.9% of aligned fires, +R$1,789 net).
	if (config.qualityGates?.colorStreakFavor === true) {
		const cur =
			candle.close > candle.open
				? "bullish"
				: candle.close < candle.open
					? "bearish"
					: "neutral"
		const aligned =
			(direction === "long" && cur === "bullish") ||
			(direction === "short" && cur === "bearish")
		// STREAK_1 = no immediately-prior same-color brick today. We only
		// need to check the LAST entry of priorBricks — color streak is
		// defined by adjacency, not the full run.
		const last = priorBricks[priorBricks.length - 1]
		const lastColor = last
			? last.close > last.open
				? "bullish"
				: last.close < last.open
					? "bearish"
					: "neutral"
			: null
		const isStreak1 = aligned && (lastColor === null || lastColor !== cur)
		const signal: IndicatorSignal = isStreak1 ? "favor" : "neutral"
		const weight = 1
		contributions.push({
			key: "colorStreakVB",
			signal,
			weight,
			contribution: signal === "favor" ? weight : 0,
		})
	}

	const score = contributions.reduce((acc, c) => acc + c.contribution, 0)
	return { score, contributions }
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
	keltnerSnapshot: KeltnerWalkerSnapshot | null,
	srSnapshot: SrWalkerSnapshot | null = null,
	vwapSnapshot: VwapTouchRejectSnapshot | null = null,
	volumeSnapshot: VolumeEmaSnapshot | null = null
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
	// setup shouldn't be penalised). Composable evaluator: each enabled
	// veto consumer is checked in order, first non-null reason wins.
	// All vetoes default-off; flipping a flag turns the rule on for runtime
	// evaluation. See Group C/D/E/F/G audits for empirical context.
	const vetoReason = evaluateVetoes({
		candle,
		config,
		direction,
		keltnerSnapshot,
		srSnapshot,
		vwapSnapshot,
		volumeSnapshot,
	})
	if (vetoReason !== null) {
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

	// Booster scoring (engine v0.11 — populated from real indicators).
	// Per spec §3, the checklist's 5 items each contribute +1 toward the
	// tier when aligned with trade direction. The orchestrator computes
	// 4 of the 5 from data it already has at hand (HTF walker, MACD,
	// 5m EMA, VWAP). `htfPivotAligned` is left false until the structural
	// pivot reader is plumbed through — that's a separate Phase G follow-up.
	const checklist = computeBoosterChecklist({
		candle,
		config,
		direction,
		htfSnapshot,
	})
	const tier = tierFromChecklist(checklist)
	const { score, contributions } = computeQualityContributions({
		candle,
		config,
		direction,
		volumeSnapshot,
		priorBricks: base.priorBricksToday,
	})

	const signal: EntrySignal = {
		direction,
		price: primary.fire.price,
		stopReference: primary.fire.stopReference,
		label: `${primary.fire.label} [${playbooksFired.join(",")}]`,
		quality: {
			tier,
			score,
			contributions,
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
