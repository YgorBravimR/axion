/**
 * Convert a generated `Combination` (flat `{path: value}` map) back into
 * a full `StrategyRecipe` ready for the engine. Inverse of
 * `recipe-to-selections`.
 *
 * Three classes of paths need handling:
 *   1. Plain dotted paths → write into the nested recipe shape.
 *   2. Synthesized addon-enabled bools → reconstruct the addon config
 *      object from `enabled` + sub-leaves, or set to `undefined`.
 *   3. The bundle marker path → drop from combo and trust the owned
 *      gate paths in the combo (already written to bundle values by the
 *      conditional grid generator).
 */

import type { StrategyRecipe } from "@/types/backtest"
import { BUNDLE_PATH } from "@/lib/backtest/presets/hawks-leaves"
import type { Combination } from "@/lib/optimize/grid-conditional"
import type { PrimitiveValue } from "@/lib/optimize/sweep-leaf"

const SYNTH_BE_ENABLED = "stop.breakeven.enabled"
const SYNTH_TRAILING_ENABLED = "stop.trailing.enabled"
const SYNTH_REVERSAL_ENABLED = "reversal.enabled"
const BE_TYPE_PATH = "stop.breakeven.type"
const BE_TRIGGER_PATH = "stop.breakeven.triggerPct"
const TRAILING_DISTANCE_PATH = "stop.trailing.distance"
const REVERSAL_MAX_PATH = "reversal.maxReversals"

const SYNTHESIZED_PATHS = new Set<string>([
	SYNTH_BE_ENABLED,
	SYNTH_TRAILING_ENABLED,
	SYNTH_REVERSAL_ENABLED,
])

/** Synthesized owners — sub-leaves whose values feed back into the addon. */
const ADDON_SUB_PATHS = new Set<string>([
	BE_TYPE_PATH,
	BE_TRIGGER_PATH,
	TRAILING_DISTANCE_PATH,
	REVERSAL_MAX_PATH,
])

/**
 * Mutating nested-path setter. Creates intermediate objects as needed.
 * Numeric path segments (e.g. `levels.0.value`) work because JS arrays
 * are objects with numeric keys.
 */
const setNestedValue = (
	root: Record<string, unknown>,
	path: string,
	value: PrimitiveValue
): void => {
	const segments = path.split(".")
	let cursor: Record<string, unknown> = root
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i]!
		if (
			cursor[seg] === undefined ||
			cursor[seg] === null ||
			typeof cursor[seg] !== "object"
		) {
			cursor[seg] = {}
		}
		cursor = cursor[seg] as Record<string, unknown>
	}
	cursor[segments[segments.length - 1]!] = value
}

/**
 * Apply addon-enabled reconstruction. When `enabled=true`, build the
 * addon config from sub-leaves in the combo (with sensible fallbacks
 * when a sub-leaf isn't present — e.g. trailing has only one sub-field).
 * When `enabled=false`, set the addon to undefined.
 */
const applyAddons = (recipe: StrategyRecipe, combo: Combination): void => {
	const beEnabled = combo[SYNTH_BE_ENABLED]
	if (beEnabled === true) {
		const beType = combo[BE_TYPE_PATH] ?? "on_partial"
		if (beType === "on_pct_risk") {
			const triggerPct = combo[BE_TRIGGER_PATH]
			recipe.stop.breakeven = {
				type: "on_pct_risk",
				triggerPct: typeof triggerPct === "number" ? triggerPct : 50,
			}
		} else {
			recipe.stop.breakeven = { type: "on_partial" }
		}
	} else if (beEnabled === false) {
		recipe.stop.breakeven = undefined
	}

	const trailingEnabled = combo[SYNTH_TRAILING_ENABLED]
	if (trailingEnabled === true) {
		const distance = combo[TRAILING_DISTANCE_PATH]
		recipe.stop.trailing = {
			type: "price_distance",
			distance: typeof distance === "number" ? distance : 100,
		}
	} else if (trailingEnabled === false) {
		recipe.stop.trailing = undefined
	}

	const reversalEnabled = combo[SYNTH_REVERSAL_ENABLED]
	if (reversalEnabled === true) {
		const max = combo[REVERSAL_MAX_PATH]
		recipe.reversal = {
			type: "reverse_on_stop",
			maxReversals: typeof max === "number" ? max : 1,
			virarNoBE: false,
		}
	} else if (reversalEnabled === false) {
		recipe.reversal = { type: "none" }
	}
}

/**
 * Reconstruct a full recipe by deep-cloning the baseline, then applying
 * every leaf value from the combo. Synthesized paths take a different
 * code path; the bundle marker is dropped.
 */
const recipeFromCombo = (
	baseRecipe: StrategyRecipe,
	combo: Combination
): StrategyRecipe => {
	const recipe = structuredClone(baseRecipe) as StrategyRecipe

	for (const [path, value] of Object.entries(combo)) {
		// Skip the bundle marker — it's not a real recipe field. The combo
		// already has each gate path written to the bundle's resolved value
		// (or to the user's override under `custom`), which we'll set below.
		if (path === BUNDLE_PATH) {
			continue
		}
		// Skip synthesized + addon sub-paths — handled separately via
		// `applyAddons` so the addon config object is built atomically.
		if (SYNTHESIZED_PATHS.has(path)) {
			continue
		}
		if (ADDON_SUB_PATHS.has(path)) {
			continue
		}
		setNestedValue(recipe as unknown as Record<string, unknown>, path, value)
	}

	applyAddons(recipe, combo)

	return recipe
}

export { recipeFromCombo, setNestedValue }
