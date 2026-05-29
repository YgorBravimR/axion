/**
 * Sweep-leaf data model — Phase A of `docs/design/hawks-sweep-tree.md`.
 *
 * Every Hawks recipe field is a "leaf" that the user either fixes to one
 * value or sweeps over a set/range. Conditional leaves are only active
 * when their parent leaf takes specific values. Owner leaves (currently
 * just `qualityBundle`) can lock subordinate leaves to bundle-defined
 * values.
 *
 * This module is inert in production until Phase B wires the generator
 * into `sweep-runner.ts`. Today it only ships types + a generator the
 * unit tests exercise.
 */

type PrimitiveValue = string | number | boolean

// A leaf is **inactive** in a combination when its parent's value is not
// in `allowedValues`. Inactive leaves contribute no combinations and
// their fix value is irrelevant (the recipe writer must still supply a
// default so the engine sees a complete shape).
interface LeafCondition {
	parentPath: string
	allowedValues: PrimitiveValue[]
}

interface LeafBase {
	/** Dot-path into the StrategyRecipe (e.g. `stop.initial.points`). */
	path: string
	/** i18n key under `optimize.sweepLeaf.<labelKey>`. */
	labelKey: string
	/** Active only when parent's resolved value is in `allowedValues`. */
	condition?: LeafCondition
	/** If set, the leaf is locked when this owner leaf takes a non-null value. */
	managedBy?: string
}

interface BoolLeaf extends LeafBase {
	kind: "bool"
}

interface NumberLeaf extends LeafBase {
	kind: "number"
	defaultMin: number
	defaultMax: number
	defaultStep: number
}

interface TimeLeaf extends LeafBase {
	kind: "time"
	/** Default HH:MM values (HHMM-encoded integers) when sweep mode is enabled. */
	defaultValues?: number[]
}

interface EnumOption {
	value: string
	labelKey: string
}

interface EnumLeaf extends LeafBase {
	kind: "enum"
	options: EnumOption[]
	/**
	 * Paths this enum owns (locks subordinate leaves). Set only on owner
	 * enums like `qualityBundle`.
	 */
	ownsPaths?: string[]
	/**
	 * For owner enums: return the value to force on `ownedPath` when this
	 * enum resolves to `optionValue`. Return `null` to NOT lock — used for
	 * `qualityBundle = "custom"` so individual gates remain user-controlled.
	 */
	resolveOwnedValue?: (
		_optionValue: string,
		_ownedPath: string
	) => PrimitiveValue | null
}

type SweepableLeaf = BoolLeaf | NumberLeaf | TimeLeaf | EnumLeaf

// ── User selection per leaf ──────────────────────────────────────────

type LeafSelection =
	| { kind: "fixed"; value: PrimitiveValue }
	| { kind: "sweep_set"; values: PrimitiveValue[] }
	| { kind: "sweep_range"; min: number; max: number; step: number }

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Expand a numeric range into discrete values. Uses float-safe stepping
 * (multiply by 1000 and integer-divide) to avoid `0.1 + 0.2 = 0.300000…`
 * drift across many steps.
 */
const expandRange = (min: number, max: number, step: number): number[] => {
	if (step <= 0) {
		return [min]
	}
	if (max < min) {
		return []
	}
	const values: number[] = []
	const scale = 1_000_000
	const iMin = Math.round(min * scale)
	const iMax = Math.round(max * scale)
	const iStep = Math.round(step * scale)
	for (let i = iMin; i <= iMax; i += iStep) {
		values.push(i / scale)
	}
	return values
}

/**
 * Count the number of values a selection contributes. Returns 1 for
 * fixed, the set size for sweep_set, and the expanded count for range.
 */
const countSelectionValues = (selection: LeafSelection): number => {
	if (selection.kind === "fixed") {
		return 1
	}
	if (selection.kind === "sweep_set") {
		return selection.values.length
	}
	return expandRange(selection.min, selection.max, selection.step).length
}

// ── Exports ──────────────────────────────────────────────────────────

export { expandRange, countSelectionValues }

export type {
	PrimitiveValue,
	LeafCondition,
	LeafBase,
	BoolLeaf,
	NumberLeaf,
	TimeLeaf,
	EnumOption,
	EnumLeaf,
	SweepableLeaf,
	LeafSelection,
}
