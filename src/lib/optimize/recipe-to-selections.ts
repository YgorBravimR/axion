/**
 * Map a `StrategyRecipe` baseline to initial fix-mode `LeafSelection`s
 * for every leaf in a sweep catalog (typically `HAWKS_LEAVES`). This is
 * the "load the baseline into the sweep builder" step.
 *
 * Path semantics:
 *   - `"stop.initial.points"` → recipe.stop.initial.points
 *   - `"entry.config.qualityGates.srLevelBlock"` → recipe.entry.config.qualityGates.srLevelBlock
 *   - `"entry.config.qualityGates.__bundle__"` → SPECIAL: resolved via
 *     `matchQualityPreset()` since the recipe stores the resolved gates,
 *     not the bundle name.
 *   - `"stop.breakeven.enabled"` → SYNTHESIZED: true iff
 *     recipe.stop.breakeven !== undefined
 *   - `"stop.trailing.enabled"` → SYNTHESIZED: same pattern
 *   - `"reversal.enabled"` → SYNTHESIZED: recipe.reversal.type !== "none"
 */

import { matchQualityPreset } from "@/lib/backtest/presets/hawks-quality-presets"
import { BUNDLE_PATH } from "@/lib/backtest/presets/hawks-leaves"
import type { StrategyRecipe } from "@/types/backtest"
import type { LeafSelection, PrimitiveValue, SweepableLeaf } from "./sweep-leaf"

// Synthesized paths whose value isn't a direct read from the recipe shape.
const SYNTHESIZED_BREAKEVEN_ENABLED = "stop.breakeven.enabled"
const SYNTHESIZED_TRAILING_ENABLED = "stop.trailing.enabled"
const SYNTHESIZED_REVERSAL_ENABLED = "reversal.enabled"

/**
 * Walk a dotted path through a nested object. Returns `undefined` for
 * any null/undefined segment along the way — caller decides the
 * fallback. Numeric path segments (e.g. `"levels.0.value"`) work
 * naturally since arrays are objects with numeric keys in JS.
 */
const readNestedValue = (root: unknown, path: string): unknown => {
	const segments = path.split(".")
	let cursor: unknown = root
	for (const seg of segments) {
		if (cursor === null || cursor === undefined || typeof cursor !== "object") {
			return undefined
		}
		cursor = (cursor as Record<string, unknown>)[seg]
	}
	return cursor
}

/**
 * Special-case readers for synthesized paths. Returns `null` for paths
 * we don't synthesize; the caller falls through to readNestedValue.
 */
const readSynthesizedValue = (
	recipe: StrategyRecipe,
	path: string
): PrimitiveValue | null => {
	if (path === BUNDLE_PATH) {
		// `matchQualityPreset` returns "custom" when nothing matches — which is
		// exactly the right enum value for the bundle leaf.
		const gates =
			recipe.entry.type === "hawks_playbook"
				? recipe.entry.config.qualityGates
				: undefined
		return matchQualityPreset(gates)
	}
	if (path === SYNTHESIZED_BREAKEVEN_ENABLED) {
		return recipe.stop.breakeven !== undefined
	}
	if (path === SYNTHESIZED_TRAILING_ENABLED) {
		return recipe.stop.trailing !== undefined
	}
	if (path === SYNTHESIZED_REVERSAL_ENABLED) {
		return recipe.reversal.type !== "none"
	}
	return null
}

/**
 * Sensible per-kind fallback when a path has no value in the recipe AND
 * no synthesized value (e.g. brand-new leaves the recipe shape doesn't
 * yet carry, like Tier 3A's `wave1MinBricks`).
 */
const fallbackValueForLeaf = (leaf: SweepableLeaf): PrimitiveValue => {
	if (leaf.kind === "bool") {
		return false
	}
	if (leaf.kind === "number") {
		return leaf.defaultMin
	}
	if (leaf.kind === "enum") {
		return leaf.options[0]?.value ?? ""
	}
	// time leaves: HHMM-encoded, default to 09:10.
	return 910
}

/**
 * Read the recipe's current value at `leaf.path`. Handles synthesized
 * paths (bundle, addon enabled), then nested reads, then falls back to
 * leaf defaults.
 */
const readLeafValueFromRecipe = (
	recipe: StrategyRecipe,
	leaf: SweepableLeaf
): PrimitiveValue => {
	const synthesized = readSynthesizedValue(recipe, leaf.path)
	if (synthesized !== null) {
		return synthesized
	}
	const raw = readNestedValue(recipe, leaf.path)
	if (
		raw === undefined ||
		raw === null ||
		(typeof raw !== "string" &&
			typeof raw !== "number" &&
			typeof raw !== "boolean")
	) {
		return fallbackValueForLeaf(leaf)
	}
	return raw
}

/**
 * Build the initial `selections` Map for a sweep builder by reading
 * every leaf's current value from `recipe`. All selections start in
 * fix mode — the user opts into sweep mode by clicking the Sweep pill.
 */
const deriveInitialSelections = (
	leaves: SweepableLeaf[],
	recipe: StrategyRecipe
): Map<string, LeafSelection> => {
	const selections = new Map<string, LeafSelection>()
	for (const leaf of leaves) {
		const value = readLeafValueFromRecipe(recipe, leaf)
		selections.set(leaf.path, { kind: "fixed", value })
	}
	return selections
}

export {
	deriveInitialSelections,
	readLeafValueFromRecipe,
	readNestedValue,
	readSynthesizedValue,
	fallbackValueForLeaf,
	SYNTHESIZED_BREAKEVEN_ENABLED,
	SYNTHESIZED_TRAILING_ENABLED,
	SYNTHESIZED_REVERSAL_ENABLED,
}
