/**
 * One-click remediations for validator-induced cardinality collapse.
 *
 * Each remediation collapses the axes that a validator touches to fixed
 * values that satisfy the constraint. Predictable + safe — at worst the
 * user loses their sweep on those axes and can re-enable it knowing the
 * constraint they have to honour.
 *
 * Why collapse instead of narrow ranges?
 *   - Narrowing is validator-specific (e.g. tier AAA's range determines
 *     AA's upper bound) and can collide with the user's own bounds.
 *   - Collapse is deterministic — clicking "Fix" produces the same
 *     selection state every time, regardless of where the user started.
 *   - The chosen fixed values are designed to satisfy multiple
 *     validators at once where possible (tier triple `5/3/1` honours
 *     `AAA > AA > A`; BE/TP triple honours `BE before TP1`; etc.).
 *
 * The unlock CTA from `sweep-diagnosis.ts` (owner-lock remediation) is
 * the precedent for this module — same pattern, one button per problem.
 */
import type { LeafSelection } from "./sweep-leaf"

// ── Hawks paths (mirror hawks-leaves.ts) ──────────────────────────────
const QG = "entry.config.qualityGates."
const TIER_AAA = `${QG}tierThresholds.AAA`
const TIER_AA = `${QG}tierThresholds.AA`
const TIER_A = `${QG}tierThresholds.A`
const START_TIME = "entry.config.startTime"
const END_TIME = "entry.config.endTime"
const WAVE1_MIN = "entry.config.wave1MinBricks"
const RETRACEMENT_MIN = "entry.config.retracementMinBricks"
const BE_TRIGGER_PCT = "stop.breakeven.triggerPct"
const TARGET_1_VALUE = "target.levels.0.value"
const TARGET_2_VALUE = "target.levels.1.value"

type RemediationFn = (
	_selections: Map<string, LeafSelection>
) => Map<string, LeafSelection>

/**
 * Tier monotonicity: AAA > AA > A. Collapse to a safe descending triple.
 *
 * 5/3/1 sits inside the Hawks leaf defaults (AAA 1..5, AA 1..4, A 0..3)
 * so each value is a legal fixed value for its leaf.
 */
const fixTierMonotonic: RemediationFn = (selections) => {
	const next = new Map(selections)
	next.set(TIER_AAA, { kind: "fixed", value: 5 })
	next.set(TIER_AA, { kind: "fixed", value: 3 })
	next.set(TIER_A, { kind: "fixed", value: 1 })
	return next
}

/**
 * Session window: start < end. Collapse to the canonical Brazilian
 * cash-market session 09:00 — 17:30 (HHMM-encoded).
 */
const fixSessionWindow: RemediationFn = (selections) => {
	const next = new Map(selections)
	next.set(START_TIME, { kind: "fixed", value: 900 })
	next.set(END_TIME, { kind: "fixed", value: 1730 })
	return next
}

/**
 * Wave-1 vs retracement: wave1MinBricks > retracementMinBricks. Collapse
 * to a textbook 5/2 split (wave-1 of 5 bricks, retracement of 2).
 */
const fixWave1OverRetracement: RemediationFn = (selections) => {
	const next = new Map(selections)
	next.set(WAVE1_MIN, { kind: "fixed", value: 5 })
	next.set(RETRACEMENT_MIN, { kind: "fixed", value: 2 })
	return next
}

/**
 * Breakeven before first target: when BE is `on_pct_risk` and TP1 is
 * `r_multiple`, triggerPct/100 must be < TP1's R-multiple.
 *
 * Collapse: triggerPct = 100 (= 1R favorable), TP1 = 3R. 1 < 3 ✓ for any
 * BE type / target mode combination because the validator is vacuous when
 * either side doesn't match — the chosen pair stays valid regardless.
 *
 * `stop.breakeven.enabled` is left untouched so the user keeps their
 * intent to use BE (or not). If they had it disabled the validator is
 * already vacuous.
 */
const fixBreakevenBeforeFirstTarget: RemediationFn = (selections) => {
	const next = new Map(selections)
	next.set(BE_TRIGGER_PCT, { kind: "fixed", value: 100 })
	next.set(TARGET_1_VALUE, { kind: "fixed", value: 3 })
	return next
}

/**
 * Target 2 must be beyond target 1 (ORB). Collapse to TP1 = 2, TP2 = 4
 * (R-multiples — same mode for both levels in current ORB recipes).
 */
const fixTarget2OverTarget1: RemediationFn = (selections) => {
	const next = new Map(selections)
	next.set(TARGET_1_VALUE, { kind: "fixed", value: 2 })
	next.set(TARGET_2_VALUE, { kind: "fixed", value: 4 })
	return next
}

const REMEDIATIONS: Record<string, RemediationFn> = {
	tierMonotonic: fixTierMonotonic,
	sessionWindow: fixSessionWindow,
	wave1OverRetracement: fixWave1OverRetracement,
	breakevenBeforeFirstTarget: fixBreakevenBeforeFirstTarget,
	target2OverTarget1: fixTarget2OverTarget1,
}

/**
 * Apply the remediation registered for `reasonKey`. Returns `null` when
 * no remediation exists (caller should hide the button).
 */
const remediateForReason = (
	reasonKey: string,
	selections: Map<string, LeafSelection>
): Map<string, LeafSelection> | null => {
	const fn = REMEDIATIONS[reasonKey]
	if (!fn) {
		return null
	}
	return fn(selections)
}

/**
 * Apply every available remediation in `reasonKeys` sequentially. Order
 * doesn't matter — each remediation touches a disjoint set of paths.
 */
const remediateAll = (
	reasonKeys: string[],
	selections: Map<string, LeafSelection>
): Map<string, LeafSelection> => {
	let current = selections
	for (const reason of reasonKeys) {
		const next = remediateForReason(reason, current)
		if (next) {
			current = next
		}
	}
	return current
}

/** Whether a reason has a registered remediation. */
const hasRemediation = (reasonKey: string): boolean => reasonKey in REMEDIATIONS

export { remediateForReason, remediateAll, hasRemediation }
export type { RemediationFn }
