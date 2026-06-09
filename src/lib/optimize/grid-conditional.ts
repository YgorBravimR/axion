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
	type LeafGroupValidator,
	type LeafSelection,
	type PrimitiveValue,
	type SweepableLeaf,
} from "./sweep-leaf"

type Combination = Record<string, PrimitiveValue>

/**
 * Apply every validator whose paths are fully populated. Returns `null`
 * when the combo passes, or the failing validator's `reasonKey` on the
 * FIRST failure (one-reason-per-combo so the breakdown is unambiguous).
 *
 * A validator with paths the combo doesn't carry is treated as inactive
 * — e.g. tier-monotonicity is dormant when tier thresholds aren't part
 * of the recipe shape yet.
 */
const findFirstViolatedValidator = (
	combo: Combination,
	validators: LeafGroupValidator[]
): string | null => {
	for (const v of validators) {
		const allPathsPopulated = v.paths.every((p) => combo[p] !== undefined)
		if (!allPathsPopulated) {
			continue
		}
		if (!v.validate(combo)) {
			return v.reasonKey
		}
	}
	return null
}

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
	fallbackFixedValues: Map<string, PrimitiveValue>,
	validators: LeafGroupValidator[] = []
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
			let nextValue: PrimitiveValue | null = null

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
						nextValue = locked
					}
					// Owner did not lock (e.g. qualityBundle = "custom") — fall through
				}
			}

			// 2. Inactive (condition not satisfied) — skip without writing.
			if (nextValue === null && !conditionSatisfied(combo, leaf)) {
				nextCombinations.push(combo)
				continue
			}

			// 3. Normal expansion — write fix value or multiply by sweep set.
			if (nextValue !== null) {
				const next = { ...combo }
				next[leaf.path] = nextValue
				nextCombinations.push(next)
			} else {
				const values = iterateSelectionValues(selection)
				for (const v of values) {
					const next = { ...combo }
					next[leaf.path] = v
					nextCombinations.push(next)
				}
			}
		}

		combinations = nextCombinations
	}

	if (validators.length === 0) {
		return combinations
	}
	return combinations.filter(
		(c) => findFirstViolatedValidator(c, validators) === null
	)
}

/**
 * Count combinations without materializing them. Pure cardinality recursion
 * that walks the leaf tree and multiplies per-branch sizes. Never allocates
 * combo objects — fires on every keystroke in optimize UI.
 */
const countConditionalGrid = (
	leaves: SweepableLeaf[],
	selections: Map<string, LeafSelection>,
	fallbackFixedValues: Map<string, PrimitiveValue>,
	validators: LeafGroupValidator[] = []
): number => {
	// Start recursion with empty combo
	const countFromLeafIndex = (
		leafIdx: number,
		partialCombo: Combination
	): number => {
		if (leafIdx >= leaves.length) {
			// Base case: check if partial combo passes all validators
			if (validators.length === 0) {
				return 1
			}
			return findFirstViolatedValidator(partialCombo, validators) === null
				? 1
				: 0
		}

		const leaf = leaves[leafIdx]!
		let cardinality = 0

		const selection =
			selections.get(leaf.path) ??
			({
				kind: "fixed",
				value: fallbackFixedValues.get(leaf.path) ?? "",
			} satisfies LeafSelection)

		// 1. Owner lock takes precedence
		if (leaf.managedBy) {
			const ownerValue = partialCombo[leaf.managedBy]
			if (ownerValue !== undefined) {
				const locked = resolveLockValue(
					leaves,
					leaf.managedBy,
					ownerValue,
					leaf.path
				)
				if (locked !== null) {
					const nextCombo = { ...partialCombo, [leaf.path]: locked }
					return countFromLeafIndex(leafIdx + 1, nextCombo)
				}
			}
		}

		// 2. Inactive (condition not satisfied) — skip without writing
		if (!conditionSatisfied(partialCombo, leaf)) {
			return countFromLeafIndex(leafIdx + 1, partialCombo)
		}

		// 3. Normal expansion — multiply by selection cardinality
		const values = iterateSelectionValues(selection)
		for (const v of values) {
			const nextCombo = { ...partialCombo, [leaf.path]: v }
			cardinality += countFromLeafIndex(leafIdx + 1, nextCombo)
		}

		return cardinality
	}

	return countFromLeafIndex(0, {})
}

/**
 * Detailed cardinality breakdown for the UI. Separates `raw` (before
 * validator filtering) from `valid` (after) and reports per-reason drop
 * counts so the user can see WHY combos are being filtered out.
 */
interface GridCountBreakdown {
	raw: number
	valid: number
	droppedByReason: Map<string, number>
}

const countConditionalGridBreakdown = (
	leaves: SweepableLeaf[],
	selections: Map<string, LeafSelection>,
	fallbackFixedValues: Map<string, PrimitiveValue>,
	validators: LeafGroupValidator[] = []
): GridCountBreakdown => {
	// Always generate without validators first to get the raw count, then
	// classify each combo. This is exactly N walks instead of 2N — we
	// reuse the same combination array.
	const raw = generateConditionalGrid(
		leaves,
		selections,
		fallbackFixedValues,
		[]
	)
	const droppedByReason = new Map<string, number>()
	let validCount = 0
	for (const combo of raw) {
		const reason = findFirstViolatedValidator(combo, validators)
		if (reason === null) {
			validCount++
		} else {
			droppedByReason.set(reason, (droppedByReason.get(reason) ?? 0) + 1)
		}
	}
	return { raw: raw.length, valid: validCount, droppedByReason }
}

export {
	generateConditionalGrid,
	countConditionalGrid,
	countConditionalGridBreakdown,
}
export type { Combination, GridCountBreakdown }
