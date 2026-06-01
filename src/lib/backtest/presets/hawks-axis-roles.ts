/**
 * Hawks sweep-axis role catalog.
 *
 * Source of truth for which Hawks sweepable axes change PnL versus only tier
 * label. Used by:
 *   - `<LeafControl>` in the inline sweep builder to surface a "tier label
 *     only" badge so the user doesn't waste optimizer budget on score-only
 *     axes when they want PnL-driven optimization.
 *   - `scripts/check-dead-axes.ts` CI gate to verify the classification is
 *     internally consistent with `hawks-quality-rules.ts`.
 *
 * Update protocol when adding or moving a rule:
 *   1. Add the new path to LABEL_ONLY_PATHS if it gates only `quality.tier`.
 *   2. Re-run `pnpm tsx scripts/sweep-detective.ts` and confirm the axis
 *      appears under LABEL-ONLY (or GATES if it joined `blockRules`).
 *   3. If a path stops affecting tier labels entirely, remove it from the
 *      sweep catalog AND from this file (it's dead code).
 */

/**
 * Paths whose only effect is on `trade.quality.tier` (the AAA/AA/A/B label).
 * Sweeping them does NOT change PnL, profit factor, Sharpe, trade count, or
 * max drawdown — only the tier metadata stored on each trade.
 *
 * The new dual-mode .mode axes are classified as GATES when mode is "block" or
 * "both", and LABEL-ONLY when mode is "score" or "off". However, since the mode
 * values themselves can change PnL (by switching between block/both vs score/off),
 * the .mode axes themselves are GATES. The numeric parameters (like keltnerNearBricks,
 * macdSlopeWindow, volumeEmaPeriod, aggressionThreshold) remain reused thresholds
 * and are GATES when referenced by a rule in block/both mode, LABEL-ONLY when
 * referenced only by score-side rules.
 *
 * Empirically verified by `scripts/sweep-detective.ts`.
 */
const LABEL_ONLY_AXIS_PATHS: ReadonlySet<string> = new Set([
	"entry.config.qualityGates.srLevelFavor",
	"entry.config.qualityGates.srFavorRangeBricks",
	// Legacy flat flags for the 4 dual-mode rules (backward compat):
	// These remain label-only because they only gate the score side (or pre-Piece-B behavior).
	"entry.config.qualityGates.keltnerInnerPenalty",
	"entry.config.qualityGates.macdAlignmentScore",
	"entry.config.qualityGates.macdSlopeWindow",
	"entry.config.qualityGates.volumeScore",
	"entry.config.qualityGates.volumeEmaPeriod",
	// aggressionMode is now superseded by aggression.scoreMode and aggression.blockMode.
	// The legacy flat field remains for backward compat but is label-only (score-side only).
	"entry.config.qualityGates.aggressionMode",
	"entry.config.qualityGates.aggressionThreshold",
	// aggression.scoreMode is the dual-mode replacement for aggressionMode — still label-only
	// since it only feeds the score side. The PnL-affecting partner is aggression.blockMode.
	"entry.config.qualityGates.aggression.scoreMode",
] as const)

const isLabelOnlyAxis = (path: string): boolean =>
	LABEL_ONLY_AXIS_PATHS.has(path)

export { LABEL_ONLY_AXIS_PATHS, isLabelOnlyAxis }
