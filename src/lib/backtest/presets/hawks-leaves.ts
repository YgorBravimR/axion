/**
 * Hawks sweep-leaf catalog — Phase A of
 * `docs/design/hawks-sweep-tree.md` §2.
 *
 * Every Hawks recipe field listed as a `SweepableLeaf` in topological
 * order (parents before children, owners before owned). This file is the
 * canonical source of truth for "what is sweepable in Hawks" and is
 * consumed by the new conditional-ranges grid generator
 * (`src/lib/optimize/grid-conditional.ts`).
 *
 * Phase A ships this catalog INERT — no UI imports it yet. Phase B wires
 * it through the recipe builder. The i18n `labelKey`s are not yet
 * populated in `messages/*.json`; Phase B adds them alongside the inline
 * sweep controls.
 */

import { getQualityPresetBundle } from "./hawks-quality-presets"
import type {
	LeafGroupValidator,
	PrimitiveValue,
	SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"
import type { QualityGatesConfig } from "@/types/backtest"

// ── Bundle owner resolver ────────────────────────────────────────────

const QUALITY_GATES_PREFIX = "entry.config.qualityGates."
const BUNDLE_PATH = `${QUALITY_GATES_PREFIX}__bundle__`

/** Strip the prefix to get the bundle-side key for a gate path. */
const toGateKey = (ownedPath: string): string =>
	ownedPath.replace(QUALITY_GATES_PREFIX, "")

/**
 * Read a flat-or-nested value out of a QualityGatesConfig given a dotted
 * relative key (e.g. `"srLevelBlock"`, `"tierThresholds.AAA"`).
 */
const readGateValue = (
	config: QualityGatesConfig,
	relativeKey: string
): PrimitiveValue | null => {
	const segments = relativeKey.split(".")
	let cursor: unknown = config
	for (const seg of segments) {
		if (cursor === null || cursor === undefined || typeof cursor !== "object") {
			return null
		}
		cursor = (cursor as Record<string, unknown>)[seg]
	}
	if (
		cursor === null ||
		cursor === undefined ||
		(typeof cursor !== "string" &&
			typeof cursor !== "number" &&
			typeof cursor !== "boolean")
	) {
		return null
	}
	return cursor
}

const resolveBundleOwnedValue = (
	optionValue: string,
	ownedPath: string
): PrimitiveValue | null => {
	if (optionValue === "custom") {
		return null
	}
	if (
		optionValue !== "off" &&
		optionValue !== "lite" &&
		optionValue !== "standard" &&
		optionValue !== "strict"
	) {
		return null
	}
	const config = getQualityPresetBundle(optionValue)
	return readGateValue(config, toGateKey(ownedPath))
}

// ── Owned paths under qualityBundle ──────────────────────────────────

const BUNDLE_OWNED_PATHS = [
	`${QUALITY_GATES_PREFIX}srLevelBlock`,
	`${QUALITY_GATES_PREFIX}srLevelFavor`,
	`${QUALITY_GATES_PREFIX}srBlockBufferBricks`,
	`${QUALITY_GATES_PREFIX}srFavorRangeBricks`,
	`${QUALITY_GATES_PREFIX}keltnerOuterBlock`,
	`${QUALITY_GATES_PREFIX}keltnerInnerPenalty`,
	`${QUALITY_GATES_PREFIX}keltnerNearBricks`,
	`${QUALITY_GATES_PREFIX}vwapWickRejectBlock`,
	`${QUALITY_GATES_PREFIX}colorStreakFavor`,
	`${QUALITY_GATES_PREFIX}macdAlignmentScore`,
	`${QUALITY_GATES_PREFIX}macdSlopeWindow`,
	`${QUALITY_GATES_PREFIX}aggressionMode`,
	`${QUALITY_GATES_PREFIX}aggressionThreshold`,
	`${QUALITY_GATES_PREFIX}volumeScore`,
	`${QUALITY_GATES_PREFIX}volumeEmaPeriod`,
	`${QUALITY_GATES_PREFIX}htfMaBlock`,
	`${QUALITY_GATES_PREFIX}tierThresholds.AAA`,
	`${QUALITY_GATES_PREFIX}tierThresholds.AA`,
	`${QUALITY_GATES_PREFIX}tierThresholds.A`,
	// Dual-mode rule axes (Piece B). Bundle presets don't define these yet —
	// they're independent user-controlled enums whose runtime fallback to the
	// legacy flat fields lives in `hawks-quality-rules.ts`.
	`${QUALITY_GATES_PREFIX}keltnerInner.mode`,
	`${QUALITY_GATES_PREFIX}macd.mode`,
	`${QUALITY_GATES_PREFIX}volume.mode`,
	`${QUALITY_GATES_PREFIX}aggression.scoreMode`,
	`${QUALITY_GATES_PREFIX}aggression.blockMode`,
]

// ── HAWKS_LEAVES (topological order) ─────────────────────────────────

const HAWKS_LEAVES: SweepableLeaf[] = [
	// ── Entry — non-quality top-level leaves ────────────────────────
	{
		kind: "time",
		path: "entry.config.startTime",
		labelKey: "hawksStartTime",
	},
	{
		kind: "time",
		path: "entry.config.endTime",
		labelKey: "hawksEndTime",
	},
	{
		kind: "number",
		path: "entry.config.fireCooldownBricks",
		labelKey: "hawksFireCooldown",
		defaultMin: 1,
		defaultMax: 10,
		defaultStep: 1,
	},
	{
		kind: "number",
		path: "entry.config.wave1MinBricks",
		labelKey: "hawksWave1Min",
		defaultMin: 3,
		defaultMax: 8,
		defaultStep: 1,
	},
	{
		kind: "number",
		path: "entry.config.retracementMinBricks",
		labelKey: "hawksRetracementMin",
		defaultMin: 1,
		defaultMax: 5,
		defaultStep: 1,
	},

	// ── Quality bundle (owner) — MUST come before owned leaves ──────
	{
		kind: "enum",
		path: BUNDLE_PATH,
		labelKey: "hawksQualityBundle",
		options: [
			{ value: "off", labelKey: "hawksQualityBundle_off" },
			{ value: "lite", labelKey: "hawksQualityBundle_lite" },
			{ value: "standard", labelKey: "hawksQualityBundle_standard" },
			{ value: "strict", labelKey: "hawksQualityBundle_strict" },
			{ value: "custom", labelKey: "hawksQualityBundle_custom" },
		],
		ownsPaths: BUNDLE_OWNED_PATHS,
		resolveOwnedValue: resolveBundleOwnedValue,
	},

	// ── Quality gates — owned by bundle ─────────────────────────────
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}srLevelBlock`,
		labelKey: "hawksSrBlockToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}srLevelFavor`,
		labelKey: "hawksSrFavorToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}srBlockBufferBricks`,
		labelKey: "hawksSrBlockBuffer",
		defaultMin: 1,
		defaultMax: 4,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}srFavorRangeBricks`,
		labelKey: "hawksSrFavorRange",
		defaultMin: 2,
		defaultMax: 5,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}keltnerOuterBlock`,
		labelKey: "hawksKeltnerBlockToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}keltnerInnerPenalty`,
		labelKey: "hawksKeltnerPenaltyToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}keltnerNearBricks`,
		labelKey: "hawksKeltnerNear",
		defaultMin: 1,
		defaultMax: 3,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}vwapWickRejectBlock`,
		labelKey: "hawksVwapWickRejectBlockToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}colorStreakFavor`,
		labelKey: "hawksColorStreakFavorToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}macdAlignmentScore`,
		labelKey: "hawksMacdToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}macdSlopeWindow`,
		labelKey: "hawksMacdSlope",
		defaultMin: 2,
		defaultMax: 5,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "enum",
		path: `${QUALITY_GATES_PREFIX}aggressionMode`,
		labelKey: "hawksAggressionMode",
		options: [
			{ value: "off", labelKey: "hawksAggressionMode_off" },
			{ value: "original", labelKey: "hawksAggressionMode_original" },
			// "reversed" pruned 2026-06-16; see Group F audit.
		],
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}aggressionThreshold`,
		labelKey: "hawksAggressionThreshold",
		defaultMin: 10000,
		defaultMax: 25000,
		defaultStep: 5000,
		managedBy: BUNDLE_PATH,
		// Inactive when aggressionMode = "off" (sweep doesn't multiply).
		condition: {
			parentPath: `${QUALITY_GATES_PREFIX}aggressionMode`,
			allowedValues: ["original", "reversed"],
		},
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}volumeScore`,
		labelKey: "hawksVolumeToggle",
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}volumeEmaPeriod`,
		labelKey: "hawksVolumeEma",
		defaultMin: 300,
		defaultMax: 700,
		defaultStep: 100,
		managedBy: BUNDLE_PATH,
		condition: {
			parentPath: `${QUALITY_GATES_PREFIX}volumeScore`,
			allowedValues: [true],
		},
	},
	{
		kind: "bool",
		path: `${QUALITY_GATES_PREFIX}htfMaBlock`,
		labelKey: "hawksHtfMaBlockToggle",
		managedBy: BUNDLE_PATH,
	},
	// ── Dual-mode rule axes (Piece B) ─────────────────────────────────
	// Score/block/both promotion of the existing score-only quality rules.
	// `mode: "block"` or `"both"` actually gates entry (affects PnL); `"score"`
	// keeps the legacy tier-label-only behavior. See docs/postMorten/backend.md.
	{
		kind: "enum",
		path: `${QUALITY_GATES_PREFIX}keltnerInner.mode`,
		labelKey: "hawksKeltnerInnerMode",
		options: [
			{ value: "off", labelKey: "hawksMode_off" },
			{ value: "score", labelKey: "hawksMode_score" },
			{ value: "block", labelKey: "hawksMode_block" },
			{ value: "both", labelKey: "hawksMode_both" },
		],
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "enum",
		path: `${QUALITY_GATES_PREFIX}macd.mode`,
		labelKey: "hawksMacdMode",
		options: [
			{ value: "off", labelKey: "hawksMode_off" },
			{ value: "score", labelKey: "hawksMode_score" },
			{ value: "block", labelKey: "hawksMode_block" },
			{ value: "both", labelKey: "hawksMode_both" },
		],
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "enum",
		path: `${QUALITY_GATES_PREFIX}volume.mode`,
		labelKey: "hawksVolumeMode",
		options: [
			{ value: "off", labelKey: "hawksMode_off" },
			{ value: "score", labelKey: "hawksMode_score" },
			{ value: "block", labelKey: "hawksMode_block" },
			{ value: "both", labelKey: "hawksMode_both" },
		],
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "enum",
		path: `${QUALITY_GATES_PREFIX}aggression.scoreMode`,
		labelKey: "hawksAggressionScoreMode",
		options: [
			{ value: "off", labelKey: "hawksAggressionMode_off" },
			{ value: "original", labelKey: "hawksAggressionMode_original" },
			// "reversed" pruned 2026-06-16; see Group F audit.
		],
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "enum",
		path: `${QUALITY_GATES_PREFIX}aggression.blockMode`,
		labelKey: "hawksAggressionBlockMode",
		options: [
			{ value: "off", labelKey: "hawksAggressionMode_off" },
			{ value: "blockOnAligned", labelKey: "hawksAggressionBlockOnAligned" },
			{ value: "blockOnAnti", labelKey: "hawksAggressionBlockOnAnti" },
		],
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}tierThresholds.AAA`,
		labelKey: "hawksTierAAA",
		defaultMin: 1,
		defaultMax: 5,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}tierThresholds.AA`,
		labelKey: "hawksTierAA",
		defaultMin: 1,
		defaultMax: 4,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},
	{
		kind: "number",
		path: `${QUALITY_GATES_PREFIX}tierThresholds.A`,
		labelKey: "hawksTierA",
		defaultMin: 0,
		defaultMax: 3,
		defaultStep: 1,
		managedBy: BUNDLE_PATH,
	},

	// ── Stop — initial ──────────────────────────────────────────────
	{
		kind: "enum",
		path: "stop.initial.type",
		labelKey: "stopInitialType",
		options: [
			{ value: "pct_range", labelKey: "stopType_pctRange" },
			{ value: "fixed_points", labelKey: "stopType_fixedPoints" },
			{ value: "full_range", labelKey: "stopType_fullRange" },
		],
	},
	{
		kind: "number",
		path: "stop.initial.pct",
		labelKey: "stopPct",
		defaultMin: 20,
		defaultMax: 40,
		defaultStep: 5,
		condition: {
			parentPath: "stop.initial.type",
			allowedValues: ["pct_range"],
		},
	},
	{
		kind: "number",
		path: "stop.initial.points",
		labelKey: "stopFixedPointsValue",
		defaultMin: 100,
		defaultMax: 300,
		defaultStep: 50,
		condition: {
			parentPath: "stop.initial.type",
			allowedValues: ["fixed_points"],
		},
	},
	{
		kind: "number",
		path: "stop.initial.ticksBuffer",
		labelKey: "stopTicksBuffer",
		defaultMin: 1,
		defaultMax: 5,
		defaultStep: 1,
		condition: {
			parentPath: "stop.initial.type",
			allowedValues: ["full_range"],
		},
	},

	// ── Stop — breakeven addon ──────────────────────────────────────
	{
		kind: "bool",
		path: "stop.breakeven.enabled",
		labelKey: "breakevenEnabled",
	},
	{
		kind: "enum",
		path: "stop.breakeven.type",
		labelKey: "breakevenType",
		options: [
			{ value: "on_partial", labelKey: "breakevenType_onPartial" },
			{ value: "on_pct_risk", labelKey: "breakevenType_onPctRisk" },
		],
		condition: {
			parentPath: "stop.breakeven.enabled",
			allowedValues: [true],
		},
	},
	{
		kind: "number",
		path: "stop.breakeven.triggerPct",
		labelKey: "hawksBreakevenTrigger",
		defaultMin: 50,
		defaultMax: 200,
		defaultStep: 25,
		condition: {
			parentPath: "stop.breakeven.type",
			allowedValues: ["on_pct_risk"],
		},
	},

	// ── Stop — trailing addon ───────────────────────────────────────
	{
		kind: "bool",
		path: "stop.trailing.enabled",
		labelKey: "trailingEnabled",
	},
	{
		kind: "number",
		path: "stop.trailing.distance",
		labelKey: "trailingDistance",
		defaultMin: 50,
		defaultMax: 200,
		defaultStep: 25,
		condition: {
			parentPath: "stop.trailing.enabled",
			allowedValues: [true],
		},
	},

	// ── Reversal addon ──────────────────────────────────────────────
	{
		kind: "bool",
		path: "reversal.enabled",
		labelKey: "reversalEnabled",
	},
	{
		kind: "number",
		path: "reversal.maxReversals",
		labelKey: "reversalMaxReversals",
		defaultMin: 1,
		defaultMax: 3,
		defaultStep: 1,
		condition: {
			parentPath: "reversal.enabled",
			allowedValues: [true],
		},
	},

	// ── Target — first level only (Phase B will expand to N levels) ─
	{
		kind: "enum",
		path: "target.levels.0.mode",
		labelKey: "targetModeLabel",
		options: [
			{ value: "r_multiple", labelKey: "targetMode_rMultiple" },
			{ value: "pct_range", labelKey: "targetMode_pctRange" },
			{ value: "pct_stop", labelKey: "targetMode_pctStop" },
			{ value: "fixed_points", labelKey: "targetMode_fixedPoints" },
		],
	},
	{
		kind: "number",
		path: "target.levels.0.value",
		labelKey: "hawksTargetR",
		defaultMin: 2,
		defaultMax: 4,
		defaultStep: 0.5,
	},
	{
		kind: "number",
		path: "target.levels.0.exitPct",
		labelKey: "target1ExitPct",
		defaultMin: 50,
		defaultMax: 100,
		defaultStep: 25,
	},
	{
		kind: "time",
		path: "target.eodTime",
		labelKey: "targetEodTime",
	},

	// ── Execution ───────────────────────────────────────────────────
	{
		kind: "number",
		path: "slippageTicks",
		labelKey: "slippage",
		defaultMin: 0,
		defaultMax: 5,
		defaultStep: 1,
	},
]

// ── Cross-leaf invariants ────────────────────────────────────────────

/**
 * Cross-leaf invariants for Hawks. The conditional-grid generator drops
 * any combination that fails one of these — the cardinality breakdown
 * reports drops per `reasonKey` so the UI can explain WHY combos are
 * being filtered out.
 *
 * Each validator is a pure function on a `combo: Record<path, value>` map.
 * Validators with unpopulated paths stay dormant (no false positives when
 * a path isn't in the current recipe shape).
 *
 * `reasonKey` is an i18n key under `optimize.invariants.<reasonKey>`.
 */

const PATH_TIER_AAA = `${QUALITY_GATES_PREFIX}tierThresholds.AAA`
const PATH_TIER_AA = `${QUALITY_GATES_PREFIX}tierThresholds.AA`
const PATH_TIER_A = `${QUALITY_GATES_PREFIX}tierThresholds.A`
const PATH_START_TIME = "entry.config.startTime"
const PATH_END_TIME = "entry.config.endTime"
const PATH_WAVE1_MIN = "entry.config.wave1MinBricks"
const PATH_RETRACEMENT_MIN = "entry.config.retracementMinBricks"
const PATH_BE_ENABLED = "stop.breakeven.enabled"
const PATH_BE_TYPE = "stop.breakeven.type"
const PATH_BE_TRIGGER_PCT = "stop.breakeven.triggerPct"
const PATH_TARGET_MODE = "target.levels.0.mode"
const PATH_TARGET_VALUE = "target.levels.0.value"

const HAWKS_VALIDATORS: LeafGroupValidator[] = [
	{
		// Tier thresholds form a strict hierarchy. If a combo lands at
		// AAA=6, AA cannot exceed 5 and A cannot exceed 4. Equal or
		// inverted values collapse the tier system into nonsense.
		paths: [PATH_TIER_AAA, PATH_TIER_AA, PATH_TIER_A],
		validate: (c) =>
			Number(c[PATH_TIER_AAA]) > Number(c[PATH_TIER_AA]) &&
			Number(c[PATH_TIER_AA]) > Number(c[PATH_TIER_A]),
		reasonKey: "tierMonotonic",
	},
	{
		// Entry window must start before it ends. Encoded as HHMM ints
		// (e.g. 910 = 09:10), so integer comparison is correct.
		paths: [PATH_START_TIME, PATH_END_TIME],
		validate: (c) => Number(c[PATH_START_TIME]) < Number(c[PATH_END_TIME]),
		reasonKey: "sessionWindow",
	},
	{
		// Retracement is by definition a partial pullback of wave 1. A
		// retracement longer than the impulse isn't a retracement — the
		// engine would never fire.
		paths: [PATH_WAVE1_MIN, PATH_RETRACEMENT_MIN],
		validate: (c) =>
			Number(c[PATH_WAVE1_MIN]) > Number(c[PATH_RETRACEMENT_MIN]),
		reasonKey: "wave1OverRetracement",
	},
	{
		// When breakeven uses `on_pct_risk` AND target is `r_multiple`:
		// triggerPct (e.g. 125 = 1.25R) must be < first TP's R-multiple,
		// otherwise TP1 closes the position before BE arms.
		paths: [
			PATH_BE_ENABLED,
			PATH_BE_TYPE,
			PATH_BE_TRIGGER_PCT,
			PATH_TARGET_MODE,
			PATH_TARGET_VALUE,
		],
		validate: (c) => {
			if (c[PATH_BE_ENABLED] !== true) {
				return true
			}
			if (c[PATH_BE_TYPE] !== "on_pct_risk") {
				return true
			}
			if (c[PATH_TARGET_MODE] !== "r_multiple") {
				return true
			}
			const triggerR = Number(c[PATH_BE_TRIGGER_PCT]) / 100
			return triggerR < Number(c[PATH_TARGET_VALUE])
		},
		reasonKey: "breakevenBeforeFirstTarget",
	},
]

export { HAWKS_LEAVES, HAWKS_VALIDATORS, BUNDLE_PATH, BUNDLE_OWNED_PATHS }
