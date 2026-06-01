/**
 * K-parent neighborhood union — turns K Pareto-survivor recipes into a refine-stage
 * sweep selection. Per the locked PR2 decisions:
 *   - Numeric leaves: smooth range `[min(parentVals)-step, max(parentVals)+step]`
 *     where `step = min(observed parent step, leaf.defaultStep)`. Observed step =
 *     greatest common divisor of pairwise differences between parent values,
 *     capped at leaf.defaultStep.
 *   - Enum leaves: `sweep_set` = union of parent values.
 *   - Bool leaves: `sweep_set` = union of parent values.
 *   - Time leaves: `sweep_set` = union of parent values (HHMM integers).
 *
 * If all K parents have the SAME value for a leaf, that leaf collapses to
 * `fixed` — no point sweeping a single value. This is what makes refine
 * "narrower" than broad: leaves on which all parents agree are locked.
 *
 * Numeric clamping uses `Math.max/min` against the leaf's defaultMin/defaultMax
 * so the smooth range never escapes the leaf's declared domain.
 */
import type {
	SweepableLeaf,
	LeafSelection,
	NumberLeaf,
	PrimitiveValue,
} from "./sweep-leaf"

/** Read a value out of a recipe by dot-path. */
const readPath = (obj: unknown, path: string): unknown => {
	const parts = path.split(".")
	let cur: unknown = obj
	for (const part of parts) {
		if (cur === null || typeof cur !== "object") {
			return undefined
		}
		cur = (cur as Record<string, unknown>)[part]
	}
	return cur
}

/** Greatest common divisor of two non-negative numbers (integer-scaled). */
const gcd = (a: number, b: number): number => {
	while (b > 0) {
		const t = b
		b = a % b
		a = t
	}
	return a
}

/**
 * Derive a sensible step from observed parent values. Uses GCD of pairwise
 * differences scaled to the leaf's defaultStep precision, capped at defaultStep.
 * Returns defaultStep if parents are too sparse / pathological to infer.
 */
const inferNumericStep = (values: number[], defaultStep: number): number => {
	if (values.length < 2) {
		return defaultStep
	}
	const sorted = [...values].sort((a, b) => a - b)
	const scale = 1_000_000
	let g = 0
	for (let i = 1; i < sorted.length; i++) {
		const diff = Math.round((sorted[i]! - sorted[i - 1]!) * scale)
		g = g === 0 ? diff : gcd(g, diff)
	}
	if (g === 0) {
		return defaultStep
	}
	const inferred = g / scale
	return Math.min(inferred, defaultStep) || defaultStep
}

const buildNumericRange = (
	leaf: NumberLeaf,
	values: number[]
): LeafSelection => {
	if (values.length === 0) {
		return {
			kind: "sweep_range",
			min: leaf.defaultMin,
			max: leaf.defaultMax,
			step: leaf.defaultStep,
		}
	}
	const allSame = values.every((v) => v === values[0])
	if (allSame) {
		return { kind: "fixed", value: values[0]! }
	}
	const step = inferNumericStep(values, leaf.defaultStep)
	const min = Math.max(leaf.defaultMin, Math.min(...values) - step)
	const max = Math.min(leaf.defaultMax, Math.max(...values) + step)
	return { kind: "sweep_range", min, max, step }
}

const buildSet = (values: PrimitiveValue[]): LeafSelection => {
	const unique = Array.from(new Set(values))
	if (unique.length === 1) {
		return { kind: "fixed", value: unique[0]! }
	}
	return { kind: "sweep_set", values: unique }
}

/**
 * Build the refine-stage selections from K parent recipes.
 *
 * @param leaves   - The strategy's full leaf catalog (e.g. HAWKS_LEAVES).
 * @param parents  - Array of recipe-shaped objects (typically OptimizationRun.recipe).
 *                   Length should be >= 1. K=1 still works: numeric leaves collapse
 *                   to fixed (single observed value), set leaves do the same.
 * @returns A Map from leaf path to its refine LeafSelection.
 */
const buildKParentNeighborhood = (
	leaves: SweepableLeaf[],
	parents: unknown[]
): Map<string, LeafSelection> => {
	const out = new Map<string, LeafSelection>()
	for (const leaf of leaves) {
		const observed: PrimitiveValue[] = []
		for (const parent of parents) {
			const raw = readPath(parent, leaf.path)
			if (
				raw === undefined ||
				raw === null ||
				(typeof raw !== "string" &&
					typeof raw !== "number" &&
					typeof raw !== "boolean")
			) {
				continue
			}
			observed.push(raw)
		}
		if (observed.length === 0) {
			continue
		}
		if (leaf.kind === "number") {
			const nums = observed.filter((v): v is number => typeof v === "number")
			out.set(leaf.path, buildNumericRange(leaf, nums))
		} else if (leaf.kind === "time") {
			const times = observed.filter((v): v is number => typeof v === "number")
			out.set(leaf.path, buildSet(times))
		} else {
			out.set(leaf.path, buildSet(observed))
		}
	}
	return out
}

export { buildKParentNeighborhood, inferNumericStep }
