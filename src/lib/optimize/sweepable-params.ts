import type { StrategyRecipe, TargetMode } from "@/types/backtest"

// ── Types ────────────────────────────────────────────────────────

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

// ── Shared enum option factories ────────────────────────────────

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

// ── Target mode helpers ────────────────────────────────────────

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

// ── Exports ──────────────────────────────────────────────────────

export type {
	SweepableParam,
	NumericSweepableParam,
	EnumSweepableParam,
	EnumOption,
}

export {
	applyStopType,
	applyTargetMode,
	applyTrailingType,
	getTargetUnitSuffix,
	getTargetDefaults,
	getTarget2Defaults,
}
