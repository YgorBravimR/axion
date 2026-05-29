/**
 * Conditional-ranges grid generator — Phase A of
 * `docs/design/hawks-sweep-tree.md` §9.
 *
 * Walks `leaves[]` in topological order and expands the running
 * combinations array per leaf, respecting:
 *   1. Owner locks — if a leaf is `managedBy` an owner whose value in the
 *      current combo locks it, the lock value is written and the leaf's
 *      own selection is ignored.
 *   2. Conditional activation — if a leaf has a `condition` not satisfied
 *      in the current combo, the leaf is skipped (no multiplication, no
 *      write).
 *   3. Otherwise — fix writes one value; sweep_set / sweep_range each
 *      multiply combinations by their value count.
 *
 * Combinations are flat `Record<path, PrimitiveValue>` maps. Reconstructing
 * a full recipe from one of them is the caller's responsibility (Phase B
 * will add a `recipe-from-combo.ts` helper).
 *
 * This generator is INERT in production until Phase B wires it through
 * `sweep-runner.ts`. Today it exists only to be exercised by unit tests
 * and to be importable by Phase B code without further model churn.
 */

import {
	expandRange,
	type LeafSelection,
	type PrimitiveValue,
	type SweepableLeaf,
} from "./sweep-leaf"

type Combination = Record<string, PrimitiveValue>

/**
 * Resolve the lock value the owner enum forces on `ownedLeaf` when the
 * owner resolves to `ownerValue` in the current combo. Returns `null`
 * when the owner does NOT lock (e.g. `qualityBundle = "custom"`).
 */
const resolveLockValue = (
	leaves: SweepableLeaf[],
	ownerPath: string,
	ownerValue: PrimitiveValue,
	ownedPath: string
): PrimitiveValue | null => {
	const ownerLeaf = leaves.find((l) => l.path === ownerPath)
	if (!ownerLeaf || ownerLeaf.kind !== "enum") {
		return null
	}
	if (!ownerLeaf.resolveOwnedValue) {
		return null
	}
	if (typeof ownerValue !== "string") {
		return null
	}
	return ownerLeaf.resolveOwnedValue(ownerValue, ownedPath)
}

const conditionSatisfied = (
	combo: Combination,
	leaf: SweepableLeaf
): boolean => {
	if (!leaf.condition) {
		return true
	}
	const parentValue = combo[leaf.condition.parentPath]
	if (parentValue === undefined) {
		// Parent hasn't been resolved yet — generator misuse (input not in
		// topological order). Treat as unsatisfied so the leaf is skipped.
		return false
	}
	return leaf.condition.allowedValues.some((v) => v === parentValue)
}

/**
 * Iterate the values a swept leaf contributes. Falls back to `[fix.value]`
 * when the selection is `fixed`.
 */
const iterateSelectionValues = (selection: LeafSelection): PrimitiveValue[] => {
	if (selection.kind === "fixed") {
		return [selection.value]
	}
	if (selection.kind === "sweep_set") {
		return selection.values
	}
	return expandRange(selection.min, selection.max, selection.step)
}

/**
 * Generate the full conditional-ranges grid.
 *
 * @param leaves        Sweepable leaves IN TOPOLOGICAL ORDER (parents
 *                      before children, owners before owned).
 * @param selections    Per-path user selection. Missing entries are
 *                      treated as fix-mode at `fallbackFixedValues[path]`.
 * @param fallbackFixedValues  Per-path fix-mode value when `selections`
 *                             has no entry. Used to honour the recipe's
 *                             baseline values for untouched leaves.
 */
const generateConditionalGrid = (
	leaves: SweepableLeaf[],
	selections: Map<string, LeafSelection>,
	fallbackFixedValues: Map<string, PrimitiveValue>
): Combination[] => {
	let combinations: Combination[] = [{}]

	for (const leaf of leaves) {
		const nextCombinations: Combination[] = []

		const selection =
			selections.get(leaf.path) ??
			({
				kind: "fixed",
				value: fallbackFixedValues.get(leaf.path) ?? "",
			} satisfies LeafSelection)

		for (const combo of combinations) {
			// 1. Owner lock takes precedence over everything else.
			if (leaf.managedBy) {
				const ownerValue = combo[leaf.managedBy]
				if (ownerValue !== undefined) {
					const locked = resolveLockValue(
						leaves,
						leaf.managedBy,
						ownerValue,
						leaf.path
					)
					if (locked !== null) {
						nextCombinations.push({ ...combo, [leaf.path]: locked })
						continue
					}
					// Owner did not lock (e.g. qualityBundle = "custom") — fall
					// through to normal selection handling below.
				}
			}

			// 2. Inactive (condition not satisfied) — skip without writing.
			if (!conditionSatisfied(combo, leaf)) {
				nextCombinations.push(combo)
				continue
			}

			// 3. Normal expansion — write fix value or multiply by sweep set.
			const values = iterateSelectionValues(selection)
			for (const v of values) {
				nextCombinations.push({ ...combo, [leaf.path]: v })
			}
		}

		combinations = nextCombinations
	}

	return combinations
}

/**
 * Count combinations without materializing them. Useful for the live
 * cardinality preview in the Sweep Summary panel.
 *
 * Note: this currently DOES materialize internally — counting "correctly"
 * with conditionals + owner locks essentially requires walking the tree.
 * If profiling shows this is hot, we can rewrite to a per-combo size
 * accumulator. For now correctness > speed.
 */
const countConditionalGrid = (
	leaves: SweepableLeaf[],
	selections: Map<string, LeafSelection>,
	fallbackFixedValues: Map<string, PrimitiveValue>
): number => {
	return generateConditionalGrid(leaves, selections, fallbackFixedValues).length
}

export { generateConditionalGrid, countConditionalGrid }
export type { Combination }
