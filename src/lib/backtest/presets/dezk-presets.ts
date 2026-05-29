import type { StrategyRecipe } from "@/types/backtest"
import type { SweepableParam } from "@/lib/optimize/sweepable-params"
import {
	applyTargetMode,
	applyTrailingType,
	getTargetUnitSuffix,
	getTargetDefaults,
} from "@/lib/optimize/sweepable-params"

/**
 * Pre-built 10K (dezK) strategy recipes.
 * Based on BRAVO_E_10k_v3.pas and BRAVO_E_10k_v4.pas (Diego TAT mentorship).
 */

/** 10K v4 — Diego TAT faithful replica. Color turn, 2nd candle entry, pivot stop. */
const dezk10kV4: StrategyRecipe = {
	presetId: "custom",
	displayName: "10K v4 — Diego TAT",
	entry: {
		type: "macd_wma_alignment",
		config: {
			macdFast: 12,
			macdSlow: 26,
			macdSignal: 15,
			wmaFast: 9,
			wmaSlow: 21,
			candlesAfterAlignment: 2,
			stopBufferPoints: 30,
			requireZeroCross: false,
			startTime: 903,
			endTime: 1630,
		},
	},
	stop: {
		initial: { type: "fixed_points", points: 0 }, // stop from entry signal's stopReference
		breakeven: { type: "on_partial" },
		trailing: { type: "indicator", wmaPeriod: 9, offset: 1 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 80, mode: "fixed_points", exitPct: 50, label: "partial" },
		],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 10 },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** 10K v3 — Zero-cross required, same-bar entry, tighter stop. */
const dezk10kV3: StrategyRecipe = {
	presetId: "custom",
	displayName: "10K v3 — Zero Cross",
	entry: {
		type: "macd_wma_alignment",
		config: {
			macdFast: 12,
			macdSlow: 26,
			macdSignal: 15,
			wmaFast: 9,
			wmaSlow: 21,
			candlesAfterAlignment: 0, // enter same bar
			stopBufferPoints: 10, // tighter stop (1 Renko + buffer)
			requireZeroCross: true,
			startTime: 905,
			endTime: 1630,
		},
	},
	stop: {
		initial: { type: "fixed_points", points: 0 },
		breakeven: { type: "on_partial" },
		trailing: { type: "indicator", wmaPeriod: 9, offset: 1 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 500, mode: "fixed_points", exitPct: 50, label: "partial" },
			{ value: 1250, mode: "fixed_points", exitPct: 100, label: "final" },
		],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 10 },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

const dezkPresets: readonly [StrategyRecipe, ...StrategyRecipe[]] = [
	dezk10kV4,
	dezk10kV3,
]

// ── Sweepable parameters for dezK (MACD+WMA) strategy ────────

const DEZK_SWEEPABLE_PARAMS: SweepableParam[] = [
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
				: "fixed_points",
		options: [
			{
				value: "r_multiple",
				labelKey: "targetMode.rMultiple",
				applyOption: (r) => applyTargetMode(r, "r_multiple"),
			},
			{
				value: "pct_range",
				labelKey: "targetMode.pctRange",
				applyOption: (r) => applyTargetMode(r, "pct_range"),
			},
			{
				value: "pct_stop",
				labelKey: "targetMode.pctStop",
				applyOption: (r) => applyTargetMode(r, "pct_stop"),
			},
			{
				value: "fixed_points",
				labelKey: "targetMode.fixedPoints",
				applyOption: (r) => applyTargetMode(r, "fixed_points"),
			},
		],
	},
	// -- Enum: Trailing Type --
	{
		kind: "enum",
		path: "stop.trailing.type",
		labelKey: "trailingTypeLabel",
		condition: (r) => !!r.stop.trailing,
		getCurrentValue: (r) => r.stop.trailing?.type ?? "indicator",
		options: [
			{
				value: "indicator",
				labelKey: "trailingType.indicator",
				applyOption: (r) => applyTrailingType(r, "indicator"),
			},
			{
				value: "price_distance",
				labelKey: "trailingType.priceDistance",
				applyOption: (r) => applyTrailingType(r, "price_distance"),
			},
		],
	},
	// -- Numeric: dezK entry params --
	{
		kind: "numeric",
		path: "entry.config.stopBufferPoints",
		labelKey: "dezkStopBuffer",
		defaultMin: 5,
		defaultMax: 50,
		defaultStep: 5,
		condition: (r) => r.entry.type === "macd_wma_alignment",
	},
	{
		kind: "numeric",
		path: "entry.config.candlesAfterAlignment",
		labelKey: "dezkCandlesAfter",
		defaultMin: 0,
		defaultMax: 3,
		defaultStep: 1,
		condition: (r) => r.entry.type === "macd_wma_alignment",
	},
	{
		kind: "numeric",
		path: "entry.config.macdSignal",
		labelKey: "dezkMacdSignal",
		defaultMin: 9,
		defaultMax: 21,
		defaultStep: 3,
		condition: (r) => r.entry.type === "macd_wma_alignment",
	},
	{
		kind: "numeric",
		path: "entry.config.wmaFast",
		labelKey: "dezkWmaFast",
		defaultMin: 5,
		defaultMax: 14,
		defaultStep: 3,
		condition: (r) => r.entry.type === "macd_wma_alignment",
	},
	// -- Numeric: Target value --
	{
		kind: "numeric",
		path: "target.levels.0.value",
		labelKey: "target1Value",
		defaultMin: 40,
		defaultMax: 150,
		defaultStep: 20,
		unitSuffix: getTargetUnitSuffix,
		dynamicDefaults: getTargetDefaults,
	},
	// -- Numeric: Trailing sub-params (conditional on trailing type) --
	{
		kind: "numeric",
		path: "stop.trailing.wmaPeriod",
		labelKey: "dezkTrailingWma",
		defaultMin: 5,
		defaultMax: 14,
		defaultStep: 3,
		condition: (r) => r.stop.trailing?.type === "indicator",
	},
	{
		kind: "numeric",
		path: "stop.trailing.distance",
		labelKey: "trailingDistance",
		defaultMin: 50,
		defaultMax: 300,
		defaultStep: 50,
		condition: (r) => r.stop.trailing?.type === "price_distance",
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

export { dezkPresets, dezk10kV4, dezk10kV3, DEZK_SWEEPABLE_PARAMS }
