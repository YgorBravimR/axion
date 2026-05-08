import type { StrategyRecipe, TargetMode } from "@/types/backtest"

// ── Types ────────────────────────────────────────────────────────

// --- Parameter ranges (runtime, user-configured) ---

interface NumericParameterRange {
	kind: "numeric"
	path: string
	label: string
	min: number
	max: number
	step: number
}

interface EnumParameterRange {
	kind: "enum"
	path: string
	label: string
	selectedValues: string[]
	/** Reference to the catalog definition — needed for applyOption during grid gen */
	enumDef: EnumSweepableParam
}

type ParameterRange = NumericParameterRange | EnumParameterRange

// --- Sweepable param definitions (catalog, build-time) ---

interface NumericSweepableParam {
	kind: "numeric"
	path: string
	labelKey: string
	defaultMin: number
	defaultMax: number
	defaultStep: number
	condition?: (_recipe: StrategyRecipe) => boolean
	unitSuffix?: (_recipe: StrategyRecipe) => string
	dynamicDefaults?: (_recipe: StrategyRecipe) => {
		min: number
		max: number
		step: number
	}
}

interface EnumOption {
	value: string
	labelKey: string
	/** Apply this option's structural mutation to a recipe (mutates and returns) */
	applyOption: (_recipe: StrategyRecipe) => StrategyRecipe
}

interface EnumSweepableParam {
	kind: "enum"
	path: string
	labelKey: string
	options: EnumOption[]
	condition?: (_recipe: StrategyRecipe) => boolean
	/** Read the current value from a recipe (for UI pre-selection) */
	getCurrentValue: (_recipe: StrategyRecipe) => string
}

type SweepableParam = NumericSweepableParam | EnumSweepableParam

// ── Enum option factories ───────────────────────────────────────

const applyStopType = (
	recipe: StrategyRecipe,
	type: string
): StrategyRecipe => {
	const base = { ...recipe, stop: { ...recipe.stop } }
	switch (type) {
		case "pct_range":
			base.stop.initial = { type: "pct_range", pct: 30 }
			break
		case "full_range":
			base.stop.initial = { type: "full_range", ticksBuffer: 2 }
			break
		case "fixed_points":
			base.stop.initial = { type: "fixed_points", points: 200 }
			break
	}
	return base
}

const applyTargetMode = (
	recipe: StrategyRecipe,
	mode: string
): StrategyRecipe => {
	if (recipe.target.type !== "fixed_levels") {
		return recipe
	}
	return {
		...recipe,
		target: {
			...recipe.target,
			levels: recipe.target.levels.map((l) => ({
				...l,
				mode: mode as TargetMode,
			})),
		},
	}
}

const applyTrailingType = (
	recipe: StrategyRecipe,
	type: string
): StrategyRecipe => {
	const base = { ...recipe, stop: { ...recipe.stop } }
	switch (type) {
		case "indicator":
			base.stop.trailing = { type: "indicator", wmaPeriod: 9, offset: 1 }
			break
		case "price_distance":
			base.stop.trailing = { type: "price_distance", distance: 100 }
			break
	}
	return base
}

// ── Target mode helpers ─────────────────────────────────────────

const getTargetUnitSuffix = (recipe: StrategyRecipe): string => {
	if (
		recipe.target.type !== "fixed_levels" ||
		recipe.target.levels.length === 0
	) {
		return ""
	}
	const mode = recipe.target.levels[0]!.mode
	switch (mode) {
		case "r_multiple":
			return "R"
		case "pct_range":
			return "% range"
		case "pct_stop":
			return "% stop"
		case "fixed_points":
			return "pts"
	}
}

const getTargetDefaults = (
	recipe: StrategyRecipe
): { min: number; max: number; step: number } => {
	if (
		recipe.target.type !== "fixed_levels" ||
		recipe.target.levels.length === 0
	) {
		return { min: 1, max: 3, step: 0.5 }
	}
	const mode = recipe.target.levels[0]!.mode
	switch (mode) {
		case "r_multiple":
			return { min: 0.5, max: 3, step: 0.5 }
		case "pct_range":
			return { min: 500, max: 2000, step: 250 }
		case "pct_stop":
			return { min: 50, max: 200, step: 25 }
		case "fixed_points":
			return { min: 50, max: 500, step: 50 }
	}
}

const getTarget2Defaults = (
	recipe: StrategyRecipe
): { min: number; max: number; step: number } => {
	if (
		recipe.target.type !== "fixed_levels" ||
		recipe.target.levels.length === 0
	) {
		return { min: 1, max: 4, step: 0.5 }
	}
	const mode = recipe.target.levels[0]!.mode
	switch (mode) {
		case "r_multiple":
			return { min: 1, max: 4, step: 0.5 }
		case "pct_range":
			return { min: 1000, max: 3000, step: 500 }
		case "pct_stop":
			return { min: 100, max: 300, step: 50 }
		case "fixed_points":
			return { min: 100, max: 800, step: 100 }
	}
}

// ── Sweepable parameter catalogs ────────────────────────────────

const ORB_PARAMS: SweepableParam[] = [
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
				labelKey: "stopType.pctRange",
				applyOption: (r) => applyStopType(r, "pct_range"),
			},
			{
				value: "full_range",
				labelKey: "stopType.fullRange",
				applyOption: (r) => applyStopType(r, "full_range"),
			},
			{
				value: "fixed_points",
				labelKey: "stopType.fixedPoints",
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

const DEZK_PARAMS: SweepableParam[] = [
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

// ── Param resolution ────────────────────────────────────────────

/**
 * Get available sweepable params for the current recipe.
 * When enum selections are provided, numeric params are shown if their
 * condition passes for ANY selected enum variant (union filtering).
 */
const getSweepableParams = (
	recipe: StrategyRecipe,
	activeEnumValues?: Record<string, string[]>
): SweepableParam[] => {
	const catalog =
		recipe.entry.type === "orb_breakout" ? ORB_PARAMS : DEZK_PARAMS

	return catalog.filter((param) => {
		if (!param.condition) {
			return true
		}

		// Base recipe condition check
		if (param.condition(recipe)) {
			return true
		}

		// For enum params, only the base check matters
		if (param.kind === "enum") {
			return false
		}

		// For numeric params with active enum selections, check if any variant enables it
		if (activeEnumValues) {
			for (const [enumPath, values] of Object.entries(activeEnumValues)) {
				const enumParam = catalog.find(
					(p) => p.kind === "enum" && p.path === enumPath
				) as EnumSweepableParam | undefined
				if (!enumParam) {
					continue
				}

				for (const val of values) {
					const option = enumParam.options.find((o) => o.value === val)
					if (option) {
						const variant = option.applyOption(structuredClone(recipe))
						if (param.condition(variant)) {
							return true
						}
					}
				}
			}
		}

		return false
	})
}

// ── Grid generation utilities ───────────────────────────────────

/** Generate array of values from min to max with step */
const generateValues = (min: number, max: number, step: number): number[] => {
	const values: number[] = []
	for (let v = min; v <= max + step * 0.001; v += step) {
		values.push(Math.round(v * 1000) / 1000)
	}
	return values
}

/** Compute Cartesian product of multiple value arrays */
const cartesianProduct = <T>(arrays: T[][]): T[][] => {
	if (arrays.length === 0) {
		return [[]]
	}
	return arrays.reduce<T[][]>(
		(acc, values) => acc.flatMap((combo) => values.map((v) => [...combo, v])),
		[[]]
	)
}

/** Set a value at a dot-path in a deeply nested object */
const setNestedValue = (obj: unknown, path: string, value: number): void => {
	const keys = path.split(".")
	let current = obj as Record<string, unknown>

	for (let i = 0; i < keys.length - 1; i++) {
		current = current[keys[i]!] as Record<string, unknown>
	}

	current[keys[keys.length - 1]!] = value
}

/** Get a value at a dot-path from a deeply nested object */
const getNestedValue = (obj: unknown, path: string): number => {
	const keys = path.split(".")
	let current = obj as Record<string, unknown>

	for (let i = 0; i < keys.length - 1; i++) {
		current = current[keys[i]!] as Record<string, unknown>
	}

	return current[keys[keys.length - 1]!] as number
}

// ── Combination counting ────────────────────────────────────────

/**
 * Count total combinations — exact 2-phase count.
 * For each enum combo, only numerics whose condition passes are counted.
 */
const countCombinations = (
	ranges: ParameterRange[],
	baseRecipe: StrategyRecipe
): number => {
	const enumRanges = ranges.filter(
		(r): r is EnumParameterRange => r.kind === "enum"
	)
	const numericRanges = ranges.filter(
		(r): r is NumericParameterRange => r.kind === "numeric"
	)

	if (enumRanges.length === 0 && numericRanges.length === 0) {
		return 0
	}

	const catalog =
		baseRecipe.entry.type === "orb_breakout" ? ORB_PARAMS : DEZK_PARAMS

	// Helper: count numeric combos for applicable ranges on a given recipe variant
	const countNumericsForVariant = (variant: StrategyRecipe): number => {
		const applicable = numericRanges.filter((nr) => {
			const def = catalog.find(
				(p) => p.kind === "numeric" && p.path === nr.path
			) as NumericSweepableParam | undefined
			return !def?.condition || def.condition(variant)
		})
		if (applicable.length === 0) {
			return 1
		}
		return applicable.reduce(
			(acc, r) => acc * generateValues(r.min, r.max, r.step).length,
			1
		)
	}

	// No enum ranges → simple numeric count against base recipe
	if (enumRanges.length === 0) {
		return numericRanges.reduce(
			(acc, r) => acc * generateValues(r.min, r.max, r.step).length,
			1
		)
	}

	// With enum ranges → iterate all enum combos, sum per-variant numeric counts
	const enumValueArrays = enumRanges.map((er) => er.selectedValues)
	const enumCombos = cartesianProduct(enumValueArrays)

	let total = 0
	for (const combo of enumCombos) {
		let variant = structuredClone(baseRecipe)
		for (let i = 0; i < enumRanges.length; i++) {
			const option = enumRanges[i]!.enumDef.options.find(
				(o) => o.value === combo[i]
			)
			if (option) {
				variant = option.applyOption(variant)
			}
		}
		total += countNumericsForVariant(variant)
	}

	return total
}

// ── Two-phase recipe grid generation ────────────────────────────

/**
 * Generate all recipe variants from a base recipe and parameter ranges.
 *
 * Phase 1: expand enum combos → structural variants
 * Phase 2: for each variant, expand applicable numeric ranges
 */
const generateRecipeGrid = (
	baseRecipe: StrategyRecipe,
	ranges: ParameterRange[]
): StrategyRecipe[] => {
	const enumRanges = ranges.filter(
		(r): r is EnumParameterRange => r.kind === "enum"
	)
	const numericRanges = ranges.filter(
		(r): r is NumericParameterRange => r.kind === "numeric"
	)

	if (enumRanges.length === 0 && numericRanges.length === 0) {
		return [structuredClone(baseRecipe)]
	}

	const catalog =
		baseRecipe.entry.type === "orb_breakout" ? ORB_PARAMS : DEZK_PARAMS

	// Phase 1: build enum combos (or a single "identity" combo if no enums)
	const enumValueArrays = enumRanges.map((er) => er.selectedValues)
	const enumCombos =
		enumValueArrays.length > 0
			? cartesianProduct(enumValueArrays)
			: ([[]] as string[][])

	const recipes: StrategyRecipe[] = []

	for (const combo of enumCombos) {
		// Apply all enum mutations → structural variant
		let variant = structuredClone(baseRecipe)
		const enumDescs: string[] = []

		for (let i = 0; i < enumRanges.length; i++) {
			const option = enumRanges[i]!.enumDef.options.find(
				(o) => o.value === combo[i]
			)
			if (option) {
				variant = option.applyOption(variant)
				enumDescs.push(`${enumRanges[i]!.label}=${combo[i]}`)
			}
		}

		// Phase 2: filter numeric ranges by condition against this variant
		const applicable = numericRanges.filter((nr) => {
			const def = catalog.find(
				(p) => p.kind === "numeric" && p.path === nr.path
			) as NumericSweepableParam | undefined
			return !def?.condition || def.condition(variant)
		})

		if (applicable.length === 0) {
			// No numeric dimensions — just the structural variant
			const r = structuredClone(variant)
			if (enumDescs.length > 0) {
				r.displayName = `${baseRecipe.displayName} (${enumDescs.join(", ")})`
			}
			recipes.push(r)
		} else {
			// Expand numeric grid on this variant
			const valueArrays = applicable.map((nr) =>
				generateValues(nr.min, nr.max, nr.step)
			)
			const numericCombos = cartesianProduct(valueArrays)

			for (const numValues of numericCombos) {
				const r = structuredClone(variant)
				const numDescs: string[] = []
				for (let j = 0; j < applicable.length; j++) {
					setNestedValue(r, applicable[j]!.path, numValues[j]!)
					numDescs.push(`${applicable[j]!.label}=${numValues[j]}`)
				}
				r.displayName = `${baseRecipe.displayName} (${[...enumDescs, ...numDescs].join(", ")})`
				recipes.push(r)
			}
		}
	}

	return recipes
}

// ── Constants ───────────────────────────────────────────────────

const MAX_COMBINATIONS = 2000
const WARN_COMBINATIONS = 500

// ── Exports ─────────────────────────────────────────────────────

export {
	getSweepableParams,
	generateValues,
	countCombinations,
	generateRecipeGrid,
	getNestedValue,
	MAX_COMBINATIONS,
	WARN_COMBINATIONS,
}

export type {
	ParameterRange,
	NumericParameterRange,
	EnumParameterRange,
	SweepableParam,
	NumericSweepableParam,
	EnumSweepableParam,
	EnumOption,
}
