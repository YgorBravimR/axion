/**
 * Pre-execution recipe dedup. Two recipes are structurally identical when
 * their full nested shape is the same — `displayName` is a cosmetic label
 * derived from enum/numeric leaf paths and MUST be excluded from the hash
 * (the legacy `generateRecipeGrid` mutates it per variant; structurally
 * equivalent recipes from different enum routes would otherwise miss the
 * dedup). The refine-wave path via `recipeFromCombo` inherits a single
 * baseline `displayName` for the whole sweep, so this is belt + suspenders.
 *
 * Why it matters: in audited sweeps the K-parent neighborhood can emit
 * 12×12 numerically degenerate refine grids — same recipe values, same
 * resulting backtest, different label. Dropping them before dispatch is a
 * pure win: zero behavioral change for the user, no wasted engine work.
 */

import type { StrategyRecipe } from "@/types/backtest"

const canonicalize = (
	recipe: StrategyRecipe & { __canonical?: string }
): string => {
	// Return cached canonical form if available (recipes are immutable in practice)
	if (recipe.__canonical !== undefined) {
		return recipe.__canonical
	}

	const result = JSON.stringify(recipe, (key, value: unknown) => {
		if (key === "displayName" || key === "__canonical") {
			return undefined
		}
		return value
	})
	const canonical = result ?? ""

	// Cache the canonical form on the recipe object
	if (Object.isExtensible(recipe)) {
		Object.defineProperty(recipe, "__canonical", {
			value: canonical,
			writable: false,
			enumerable: false,
			configurable: false,
		})
	}

	return canonical
}

interface DedupedRecipes {
	unique: StrategyRecipe[]
	droppedCount: number
}

const dedupeRecipes = (recipes: StrategyRecipe[]): DedupedRecipes => {
	const seen = new Map<string, StrategyRecipe>()
	for (const r of recipes) {
		const key = canonicalize(r)
		if (!seen.has(key)) {
			seen.set(key, r)
		}
	}
	return {
		unique: [...seen.values()],
		droppedCount: recipes.length - seen.size,
	}
}

export { dedupeRecipes, canonicalize }
export type { DedupedRecipes }
