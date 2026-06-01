import type { StrategyRecipe } from "@/types/backtest"
import type { SweepableParam } from "@/lib/optimize/sweepable-params"
import {
	applyStopType,
	applyTargetMode,
	getTargetUnitSuffix,
	getTargetDefaults,
	getTarget2Defaults,
} from "@/lib/optimize/sweepable-params"

/**
 * Pre-built ORB strategy recipes matching the 4 tests from
 * /Users/ygorbravim/personal/projects/nelogica/working/BREAKOUT_1C_BACKTEST_GUIDE.md
 */

/** Test 1: Article replica — stop curto, sem parcial, EoD exit */
const orbTest1: StrategyRecipe = {
	presetId: "orb_test_1",
	displayName: "ORB Test 1 — Article Replica",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 905, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "pct_range", pct: 30 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 1000, mode: "pct_range", exitPct: 50, label: "target1" },
			{ value: 2000, mode: "pct_range", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: {
		type: "monetary_risk",
		riskAmountCents: 8000,
		valuePerPointCents: 20,
		riskDistribution: "per_trade",
	},
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** Test 2: Conservative A — parcial 100%, alvo 200%, virada */
const orbTest2: StrategyRecipe = {
	presetId: "orb_test_2",
	displayName: "ORB Test 2 — Conservative A",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 910, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "full_range", ticksBuffer: 2 },
		breakeven: { type: "on_partial" },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 1, mode: "r_multiple", exitPct: 50, label: "target1" },
			{ value: 2, mode: "r_multiple", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: {
		type: "monetary_risk",
		riskAmountCents: 8000,
		valuePerPointCents: 20,
		riskDistribution: "per_trade",
	},
	reversal: { type: "reverse_on_stop", maxReversals: 1, virarNoBE: false },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** Test 3: Conservative B — stop apertado + BE antecipado + alvos longos */
const orbTest3: StrategyRecipe = {
	presetId: "orb_test_3",
	displayName: "ORB Test 3 — Conservative B",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 915, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "pct_range", pct: 60 },
		breakeven: { type: "on_pct_risk", triggerPct: 50 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 1, mode: "r_multiple", exitPct: 50, label: "target1" },
			{ value: 3, mode: "r_multiple", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: {
		type: "monetary_risk",
		riskAmountCents: 8000,
		valuePerPointCents: 20,
		riskDistribution: "per_trade",
	},
	reversal: { type: "reverse_on_stop", maxReversals: 1, virarNoBE: false },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** Test 4: Conservative C — range curto, parcial agressivo, sem virada */
const orbTest4: StrategyRecipe = {
	presetId: "orb_test_4",
	displayName: "ORB Test 4 — Conservative C",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 905, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "pct_range", pct: 40 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 75, mode: "pct_range", exitPct: 50, label: "target1" },
			{ value: 200, mode: "pct_range", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: {
		type: "monetary_risk",
		riskAmountCents: 8000,
		valuePerPointCents: 20,
		riskDistribution: "per_trade",
	},
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

const orbPresets: readonly [StrategyRecipe, ...StrategyRecipe[]] = [
	orbTest1,
	orbTest2,
	orbTest3,
	orbTest4,
]

// ── Sweepable parameters for ORB strategy ────────────────────

const ORB_SWEEPABLE_PARAMS: SweepableParam[] = [
	// -- Enum: Stop Type --
	{
		kind: "enum",
		path: "stop.initial.type",
		labelKey: "stopInitialType",
		condition: (r) => r.entry.type === "orb_breakout",
		getCurrentValue: (r) => r.stop.initial.type,
		options: [
			{
				value: "pct_range",
				labelKey: "stopType_pctRange",
				applyOption: (r) => applyStopType(r, "pct_range"),
			},
			{
				value: "full_range",
				labelKey: "stopType_fullRange",
				applyOption: (r) => applyStopType(r, "full_range"),
			},
			{
				value: "fixed_points",
				labelKey: "stopType_fixedPoints",
				applyOption: (r) => applyStopType(r, "fixed_points"),
			},
		],
	},
	// -- Enum: Target Mode --
	{
		kind: "enum",
		path: "target.levels.0.mode",
		labelKey: "targetModeLabel",
		condition: (r) =>
			r.target.type === "fixed_levels" && r.target.levels.length > 0,
		getCurrentValue: (r) =>
			r.target.type === "fixed_levels"
				? r.target.levels[0]!.mode
				: "r_multiple",
		options: [
			{
				value: "r_multiple",
				labelKey: "targetMode_rMultiple",
				applyOption: (r) => applyTargetMode(r, "r_multiple"),
			},
			{
				value: "pct_range",
				labelKey: "targetMode_pctRange",
				applyOption: (r) => applyTargetMode(r, "pct_range"),
			},
			{
				value: "pct_stop",
				labelKey: "targetMode_pctStop",
				applyOption: (r) => applyTargetMode(r, "pct_stop"),
			},
			{
				value: "fixed_points",
				labelKey: "targetMode_fixedPoints",
				applyOption: (r) => applyTargetMode(r, "fixed_points"),
			},
		],
	},
	// -- Numeric: ORB entry params --
	{
		kind: "numeric",
		path: "entry.config.endTime",
		labelKey: "orbEndTime",
		defaultMin: 903,
		defaultMax: 915,
		defaultStep: 2,
		condition: (r) => r.entry.type === "orb_breakout",
	},
	{
		kind: "numeric",
		path: "entry.config.ticksBuffer",
		labelKey: "orbTicksBuffer",
		defaultMin: 0,
		defaultMax: 6,
		defaultStep: 1,
		condition: (r) => r.entry.type === "orb_breakout",
	},
	// -- Numeric: Stop sub-params (conditional on stop type) --
	{
		kind: "numeric",
		path: "stop.initial.pct",
		labelKey: "stopPctRange",
		defaultMin: 20,
		defaultMax: 70,
		defaultStep: 10,
		condition: (r) => r.stop.initial.type === "pct_range",
	},
	{
		kind: "numeric",
		path: "stop.initial.ticksBuffer",
		labelKey: "stopTicksBuffer",
		defaultMin: 1,
		defaultMax: 5,
		defaultStep: 1,
		condition: (r) => r.stop.initial.type === "full_range",
	},
	{
		kind: "numeric",
		path: "stop.initial.points",
		labelKey: "stopFixedPointsValue",
		defaultMin: 50,
		defaultMax: 500,
		defaultStep: 50,
		condition: (r) => r.stop.initial.type === "fixed_points",
	},
	// -- Numeric: Target values --
	{
		kind: "numeric",
		path: "target.levels.0.value",
		labelKey: "target1Value",
		defaultMin: 1,
		defaultMax: 3,
		defaultStep: 0.5,
		unitSuffix: getTargetUnitSuffix,
		dynamicDefaults: getTargetDefaults,
	},
	{
		kind: "numeric",
		path: "target.levels.1.value",
		labelKey: "target2Value",
		defaultMin: 1,
		defaultMax: 4,
		defaultStep: 0.5,
		condition: (r) =>
			r.target.type === "fixed_levels" && r.target.levels.length >= 2,
		unitSuffix: getTargetUnitSuffix,
		dynamicDefaults: getTarget2Defaults,
	},
	// -- Numeric: Slippage --
	{
		kind: "numeric",
		path: "slippageTicks",
		labelKey: "slippage",
		defaultMin: 0,
		defaultMax: 3,
		defaultStep: 1,
	},
]

export {
	orbPresets,
	orbTest1,
	orbTest2,
	orbTest3,
	orbTest4,
	ORB_SWEEPABLE_PARAMS,
}
