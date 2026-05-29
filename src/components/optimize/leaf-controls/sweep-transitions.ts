/**
 * Pure mode-transition helpers for the three leaf-controls.
 *
 * Switching between "fix" and "sweep" must preserve as much of the user's
 * current value as possible — losing data on a mode flip is a UX bug.
 * These helpers encode the preservation rules and live here (separate
 * from the React components) so they can be unit-tested against the
 * design-doc semantics without spinning up a renderer.
 */

// ── Number leaf ──────────────────────────────────────────────────────

interface NumberFixed {
	kind: "fixed"
	value: number
}

interface NumberSweep {
	kind: "sweep_range"
	min: number
	max: number
	step: number
}

type NumberSelection = NumberFixed | NumberSweep

interface NumberRangeDefaults {
	min: number
	max: number
	step: number
}

/**
 * fix → sweep for numbers. If the current fix value is inside the
 * default range, we center the range on it; otherwise we just use the
 * leaf's default range. Step is always inherited.
 */
const numberFixedToSweep = (
	current: NumberFixed,
	defaults: NumberRangeDefaults
): NumberSweep => {
	const v = current.value
	if (v >= defaults.min && v <= defaults.max) {
		// Center default range around the current value, clamped to defaults.
		const span = defaults.max - defaults.min
		const half = span / 2
		const min = Math.max(defaults.min, v - half)
		const max = Math.min(defaults.max, v + half)
		return { kind: "sweep_range", min, max, step: defaults.step }
	}
	return {
		kind: "sweep_range",
		min: defaults.min,
		max: defaults.max,
		step: defaults.step,
	}
}

/**
 * sweep → fix for numbers. Collapse to the range's `min` — least
 * surprising of (min, max, midpoint) because it's a value the user
 * actually typed.
 */
const numberSweepToFixed = (current: NumberSweep): NumberFixed => ({
	kind: "fixed",
	value: current.min,
})

// ── Bool leaf ────────────────────────────────────────────────────────

interface BoolFixed {
	kind: "fixed"
	value: boolean
}

interface BoolSweep {
	kind: "sweep_set"
	values: boolean[]
}

type BoolSelection = BoolFixed | BoolSweep

/**
 * fix → sweep for bools. There's only one meaningful sweep for a
 * boolean: both values. Single-value bool sweeps are equivalent to fix.
 */
const boolFixedToSweep = (): BoolSweep => ({
	kind: "sweep_set",
	values: [true, false],
})

/**
 * sweep → fix for bools. Collapse to the first value in the swept set,
 * defaulting to `false` if somehow empty (defensive).
 */
const boolSweepToFixed = (current: BoolSweep): BoolFixed => ({
	kind: "fixed",
	value: current.values[0] ?? false,
})

// ── Enum leaf ────────────────────────────────────────────────────────

interface EnumFixed {
	kind: "fixed"
	value: string
}

interface EnumSweep {
	kind: "sweep_set"
	values: string[]
}

type EnumSelection = EnumFixed | EnumSweep

/**
 * fix → sweep for enums. Seed the sweep set with the current fix value
 * (so the user sees their choice carried over). They add more via the
 * multi-select chip group; if they pare back to 1, the control collapses
 * to fix mode on the next render.
 */
const enumFixedToSweep = (current: EnumFixed): EnumSweep => ({
	kind: "sweep_set",
	values: [current.value],
})

/**
 * sweep → fix for enums. Collapse to the first value in the set; if
 * empty (defensive), fall back to `fallbackValue` (the first option).
 */
const enumSweepToFixed = (
	current: EnumSweep,
	fallbackValue: string
): EnumFixed => ({
	kind: "fixed",
	value: current.values[0] ?? fallbackValue,
})

// ── Time leaf ────────────────────────────────────────────────────────
// Times are HHMM-encoded integers (e.g. 910 = 09:10, 1530 = 15:30) so
// integer comparison and existing number-axis sweep code paths work
// unchanged. Sweep mode is a discrete SET of times — ranges across times
// would explode cardinality (every minute = 60 axes per hour).

interface TimeFixed {
	kind: "fixed"
	value: number
}

interface TimeSweep {
	kind: "sweep_set"
	values: number[]
}

type TimeSelection = TimeFixed | TimeSweep

/**
 * fix → sweep for times. Seed with the current fix value so the user's
 * choice carries over. They add more times via the picker; if they pare
 * back to 1 we collapse to fix on the next render.
 */
const timeFixedToSweep = (current: TimeFixed): TimeSweep => ({
	kind: "sweep_set",
	values: [current.value],
})

/**
 * sweep → fix for times. Collapse to the first value; default to 09:10
 * (HHMM 910) if the set is empty (defensive).
 */
const timeSweepToFixed = (current: TimeSweep): TimeFixed => ({
	kind: "fixed",
	value: current.values[0] ?? 910,
})

const toggleTimeMode = (current: TimeSelection): TimeSelection => {
	if (current.kind === "fixed") {
		return timeFixedToSweep(current)
	}
	return timeSweepToFixed(current)
}

// ── Toggle helpers (the user clicked the "Sweep" pill) ───────────────

const toggleNumberMode = (
	current: NumberSelection,
	defaults: NumberRangeDefaults
): NumberSelection => {
	if (current.kind === "fixed") {
		return numberFixedToSweep(current, defaults)
	}
	return numberSweepToFixed(current)
}

const toggleBoolMode = (current: BoolSelection): BoolSelection => {
	if (current.kind === "fixed") {
		return boolFixedToSweep()
	}
	return boolSweepToFixed(current)
}

const toggleEnumMode = (
	current: EnumSelection,
	fallbackValue: string
): EnumSelection => {
	if (current.kind === "fixed") {
		return enumFixedToSweep(current)
	}
	return enumSweepToFixed(current, fallbackValue)
}

// ── Exports ──────────────────────────────────────────────────────────

export {
	numberFixedToSweep,
	numberSweepToFixed,
	toggleNumberMode,
	boolFixedToSweep,
	boolSweepToFixed,
	toggleBoolMode,
	enumFixedToSweep,
	enumSweepToFixed,
	toggleEnumMode,
	timeFixedToSweep,
	timeSweepToFixed,
	toggleTimeMode,
}

export type {
	NumberFixed,
	NumberSweep,
	NumberSelection,
	NumberRangeDefaults,
	BoolFixed,
	BoolSweep,
	BoolSelection,
	EnumFixed,
	EnumSweep,
	EnumSelection,
	TimeFixed,
	TimeSweep,
	TimeSelection,
}
