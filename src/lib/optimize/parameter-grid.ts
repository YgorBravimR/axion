import type { StrategyRecipe } from "@/types/backtest"
import type {
	SweepableParam,
	NumericSweepableParam,
	EnumSweepableParam,
	EnumOption,
} from "@/lib/optimize/sweepable-params"
import { ORB_SWEEPABLE_PARAMS } from "@/lib/backtest/presets/orb-presets"
import { DEZK_SWEEPABLE_PARAMS } from "@/lib/backtest/presets/dezk-presets"
import { HAWKS_SWEEPABLE_PARAMS } from "@/lib/backtest/presets/hawks-presets"

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

// ── Strategy params registry ──────────────────────────────────────

const STRATEGY_PARAMS_REGISTRY: Partial<Record<string, SweepableParam[]>> = {
	orb_breakout: ORB_SWEEPABLE_PARAMS,
	macd_wma_alignment: DEZK_SWEEPABLE_PARAMS,
	hawks_playbook: HAWKS_SWEEPABLE_PARAMS,
	user_catalog: HAWKS_SWEEPABLE_PARAMS,
}

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
	const catalog = STRATEGY_PARAMS_REGISTRY[recipe.entry.type] ?? []

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

/** Compute Cartesian product of multiple value arrays (imperative, O(product) space only) */
const cartesianProduct = <T>(arrays: T[][]): T[][] => {
	if (arrays.length === 0) {
		return [[]]
	}

	// Pre-compute product size to allocate result array once
	let productSize = 1
	for (const arr of arrays) {
		productSize *= arr.length
	}

	const result: T[][] = []
	const indices = new Array(arrays.length).fill(0)

	// Generate all combinations by treating indices as a mixed-radix number
	for (let i = 0; i < productSize; i++) {
		const combo: T[] = []
		for (let j = 0; j < arrays.length; j++) {
			combo.push(arrays[j]![indices[j]!]!)
		}
		result.push(combo)

		// Increment indices (mixed-radix: each position has its own modulus)
		let carry = 1
		for (let j = arrays.length - 1; j >= 0 && carry; j--) {
			indices[j] = (indices[j]! + carry) % arrays[j]!.length
			carry = indices[j]! === 0 ? 1 : 0
		}
	}

	return result
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

/**
 * Get a numeric value at a dot-path from a deeply nested object.
 * Returns `NaN` when ANY intermediate segment is null/undefined or when the
 * final value isn't a number — Hawks recipes legitimately carry
 * `stop.breakeven = undefined` (BE disabled), and the legacy non-defensive
 * walk used to crash on the first missing intermediate.
 *
 * Callers compare with `Number.isFinite(...)` or filter NaN out of Sets.
 */
const getNestedValue = (obj: unknown, path: string): number => {
	const keys = path.split(".")
	let current: unknown = obj
	for (const key of keys) {
		if (
			current === null ||
			current === undefined ||
			typeof current !== "object"
		) {
			return Number.NaN
		}
		current = (current as Record<string, unknown>)[key]
	}
	return typeof current === "number" ? current : Number.NaN
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

	const catalog = STRATEGY_PARAMS_REGISTRY[baseRecipe.entry.type] ?? []

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

	const catalog = STRATEGY_PARAMS_REGISTRY[baseRecipe.entry.type] ?? []

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
				enumDescs.push(`${enumRanges[i]!.label}=${combo[i] ?? ""}`)
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
					numDescs.push(`${applicable[j]!.label}=${numValues[j] ?? 0}`)
				}
				r.displayName = `${baseRecipe.displayName} (${[...enumDescs, ...numDescs].join(", ")})`
				recipes.push(r)
			}
		}
	}

	return recipes
}

// ── Constants ───────────────────────────────────────────────────

const MAX_COMBINATIONS = 5000
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
