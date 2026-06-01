/**
 * ORB sweep-leaf catalog — mirrors the Hawks catalog shape so the
 * generic StrategySweepBuilder can render it without strategy-specific
 * glue. Consumed by `OrbSweepBuilder` and `grid-conditional.ts`.
 *
 * ORB has no quality bundle, so there is no owner-locking section.
 * The leaf set is intentionally a strict superset of the legacy
 * `ORB_SWEEPABLE_PARAMS` (the pre-leaf system) — every previously
 * sweepable knob is here, plus a few that were silently fixed before
 * (startTime, ignorarGaps, target exit pcts, eodTime, breakeven addon).
 */

import type {
	LeafGroupValidator,
	SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"

const ORB_LEAVES: SweepableLeaf[] = [
	// ── Entry ───────────────────────────────────────────────────────────
	{
		kind: "time",
		path: "entry.config.startTime",
		labelKey: "orbStartTime",
	},
	{
		kind: "time",
		path: "entry.config.endTime",
		labelKey: "orbEndTime",
	},
	{
		kind: "number",
		path: "entry.config.ticksBuffer",
		labelKey: "orbTicksBuffer",
		defaultMin: 0,
		defaultMax: 6,
		defaultStep: 1,
	},
	{
		kind: "bool",
		path: "entry.config.ignorarGaps",
		labelKey: "orbIgnoreGaps",
	},

	// ── Stop — initial ──────────────────────────────────────────────────
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
		defaultMax: 70,
		defaultStep: 10,
		condition: {
			parentPath: "stop.initial.type",
			allowedValues: ["pct_range"],
		},
	},
	{
		kind: "number",
		path: "stop.initial.points",
		labelKey: "stopFixedPointsValue",
		defaultMin: 50,
		defaultMax: 500,
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

	// ── Stop — breakeven addon ──────────────────────────────────────────
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
		labelKey: "orbBreakevenTrigger",
		defaultMin: 50,
		defaultMax: 200,
		defaultStep: 25,
		condition: {
			parentPath: "stop.breakeven.type",
			allowedValues: ["on_pct_risk"],
		},
	},

	// ── Reversal addon ──────────────────────────────────────────────────
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

	// ── Target — first level ────────────────────────────────────────────
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
		labelKey: "orbTarget1",
		defaultMin: 1,
		defaultMax: 3,
		defaultStep: 0.5,
	},
	{
		kind: "number",
		path: "target.levels.0.exitPct",
		labelKey: "target1ExitPct",
		defaultMin: 25,
		defaultMax: 100,
		defaultStep: 25,
	},

	// ── Target — second level ───────────────────────────────────────────
	{
		kind: "number",
		path: "target.levels.1.value",
		labelKey: "orbTarget2",
		defaultMin: 1,
		defaultMax: 4,
		defaultStep: 0.5,
	},
	{
		kind: "time",
		path: "target.eodTime",
		labelKey: "targetEodTime",
	},

	// ── Execution ───────────────────────────────────────────────────────
	{
		kind: "number",
		path: "slippageTicks",
		labelKey: "slippage",
		defaultMin: 0,
		defaultMax: 3,
		defaultStep: 1,
	},
]

// ── Cross-leaf invariants ───────────────────────────────────────────

const PATH_START_TIME = "entry.config.startTime"
const PATH_END_TIME = "entry.config.endTime"
const PATH_TARGET_1_MODE = "target.levels.0.mode"
const PATH_TARGET_1_VALUE = "target.levels.0.value"
const PATH_TARGET_2_VALUE = "target.levels.1.value"
const PATH_BE_ENABLED = "stop.breakeven.enabled"
const PATH_BE_TYPE = "stop.breakeven.type"
const PATH_BE_TRIGGER_PCT = "stop.breakeven.triggerPct"

const ORB_VALIDATORS: LeafGroupValidator[] = [
	{
		// Session window must open before it closes. HHMM-encoded ints, so
		// integer comparison is correct (910 = 09:10 < 1730 = 17:30).
		paths: [PATH_START_TIME, PATH_END_TIME],
		validate: (c) => Number(c[PATH_START_TIME]) < Number(c[PATH_END_TIME]),
		reasonKey: "sessionWindow",
	},
	{
		// Target 2 must sit beyond Target 1. Same unit by construction (both
		// values live under the same `mode` on the first level — second level
		// inherits mode in current ORB recipes). When modes diverge in future,
		// gate the validator on equal modes.
		paths: [PATH_TARGET_1_VALUE, PATH_TARGET_2_VALUE],
		validate: (c) =>
			Number(c[PATH_TARGET_2_VALUE]) > Number(c[PATH_TARGET_1_VALUE]),
		reasonKey: "target2OverTarget1",
	},
	{
		// When breakeven uses `on_pct_risk` AND target 1 is `r_multiple`:
		// triggerPct (e.g. 125 = 1.25R) must be < target 1's R-multiple,
		// otherwise TP1 closes the position before BE arms.
		paths: [
			PATH_BE_ENABLED,
			PATH_BE_TYPE,
			PATH_BE_TRIGGER_PCT,
			PATH_TARGET_1_MODE,
			PATH_TARGET_1_VALUE,
		],
		validate: (c) => {
			if (c[PATH_BE_ENABLED] !== true) {
				return true
			}
			if (c[PATH_BE_TYPE] !== "on_pct_risk") {
				return true
			}
			if (c[PATH_TARGET_1_MODE] !== "r_multiple") {
				return true
			}
			const triggerR = Number(c[PATH_BE_TRIGGER_PCT]) / 100
			return triggerR < Number(c[PATH_TARGET_1_VALUE])
		},
		reasonKey: "breakevenBeforeFirstTarget",
	},
]

export { ORB_LEAVES, ORB_VALIDATORS }
