import { describe, it, expect } from "vitest"
import {
	generateConditionalGrid,
	countConditionalGrid,
} from "@/lib/optimize/grid-conditional"
import {
	expandRange,
	countSelectionValues,
	type LeafSelection,
	type PrimitiveValue,
	type SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"

// ── expandRange ─────────────────────────────────────────────────────

describe("expandRange", () => {
	it("inclusive of both endpoints when step divides cleanly", () => {
		expect(expandRange(1, 4, 1)).toStrictEqual([1, 2, 3, 4])
	})

	it("stops at last step that fits ≤ max", () => {
		expect(expandRange(20, 40, 5)).toStrictEqual([20, 25, 30, 35, 40])
	})

	it("returns single value when min === max regardless of step", () => {
		expect(expandRange(10, 10, 1)).toStrictEqual([10])
	})

	it("returns empty when max < min (caller misuse)", () => {
		expect(expandRange(10, 5, 1)).toStrictEqual([])
	})

	it("handles fractional steps without float drift", () => {
		// Classic 0.1 + 0.2 = 0.30000000000000004 case
		const r = expandRange(2, 4, 0.5)
		expect(r).toStrictEqual([2, 2.5, 3, 3.5, 4])
	})

	it("falls back to [min] when step ≤ 0 (defensive)", () => {
		expect(expandRange(10, 20, 0)).toStrictEqual([10])
		expect(expandRange(10, 20, -1)).toStrictEqual([10])
	})
})

// ── countSelectionValues ────────────────────────────────────────────

describe("countSelectionValues", () => {
	it("counts 1 for fixed", () => {
		expect(countSelectionValues({ kind: "fixed", value: 42 })).toBe(1)
	})

	it("counts set length for sweep_set", () => {
		expect(
			countSelectionValues({ kind: "sweep_set", values: ["a", "b", "c"] })
		).toBe(3)
	})

	it("counts expanded range size for sweep_range", () => {
		expect(
			countSelectionValues({ kind: "sweep_range", min: 1, max: 4, step: 1 })
		).toBe(4)
	})
})

// ── generateConditionalGrid — basic flat sweeps ─────────────────────

describe("generateConditionalGrid — flat (no conditions, no owners)", () => {
	it("returns one combination when all leaves are fixed", () => {
		const leaves: SweepableLeaf[] = [
			{ kind: "bool", path: "a", labelKey: "a" },
			{
				kind: "number",
				path: "b",
				labelKey: "b",
				defaultMin: 0,
				defaultMax: 0,
				defaultStep: 1,
			},
		]
		const selections = new Map<string, LeafSelection>()
		const fallback = new Map<string, PrimitiveValue>([
			["a", true],
			["b", 42],
		])

		const combos = generateConditionalGrid(leaves, selections, fallback)
		expect(combos).toStrictEqual([{ a: true, b: 42 }])
	})

	it("multiplies independent sweeps as a Cartesian product", () => {
		const leaves: SweepableLeaf[] = [
			{ kind: "bool", path: "a", labelKey: "a" },
			{
				kind: "number",
				path: "b",
				labelKey: "b",
				defaultMin: 0,
				defaultMax: 0,
				defaultStep: 1,
			},
		]
		const selections = new Map<string, LeafSelection>([
			["a", { kind: "sweep_set", values: [true, false] }],
			["b", { kind: "sweep_range", min: 1, max: 3, step: 1 }],
		])

		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(combos).toHaveLength(2 * 3)
		const distinct = new Set(combos.map((c) => `${c.a}|${c.b}`))
		expect(distinct.size).toBe(6)
	})
})

// ── generateConditionalGrid — conditional ranges (the stop example) ─

describe("generateConditionalGrid — conditional ranges", () => {
	// Matches the stop-type example in `docs/design/hawks-sweep-tree.md` §4:
	//   sweep stop.type over {pct_range, fixed_points}
	//   sweep stop.pct       [20..40 step 5]   conditional: type=pct_range
	//   sweep stop.points    [150..250 step 50] conditional: type=fixed_points
	// Expected: 5 + 3 = 8 combos (NOT 2 × 5 × 3 = 30).
	it("dedupes irrelevant axes per branch (stop-type doc example)", () => {
		const leaves: SweepableLeaf[] = [
			{
				kind: "enum",
				path: "stop.type",
				labelKey: "stopType",
				options: [
					{ value: "pct_range", labelKey: "pct" },
					{ value: "fixed_points", labelKey: "fp" },
				],
			},
			{
				kind: "number",
				path: "stop.pct",
				labelKey: "pct",
				defaultMin: 20,
				defaultMax: 40,
				defaultStep: 5,
				condition: {
					parentPath: "stop.type",
					allowedValues: ["pct_range"],
				},
			},
			{
				kind: "number",
				path: "stop.points",
				labelKey: "points",
				defaultMin: 150,
				defaultMax: 250,
				defaultStep: 50,
				condition: {
					parentPath: "stop.type",
					allowedValues: ["fixed_points"],
				},
			},
		]
		const selections = new Map<string, LeafSelection>([
			[
				"stop.type",
				{ kind: "sweep_set", values: ["pct_range", "fixed_points"] },
			],
			["stop.pct", { kind: "sweep_range", min: 20, max: 40, step: 5 }],
			["stop.points", { kind: "sweep_range", min: 150, max: 250, step: 50 }],
		])

		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(combos).toHaveLength(5 + 3)
		expect(
			combos.filter((c) => c.type === "pct_range" && c.points !== undefined)
		).toHaveLength(0)
		expect(
			combos.filter((c) => c.type === "fixed_points" && c.pct !== undefined)
		).toHaveLength(0)
	})

	it("skips conditional leaf entirely when single parent value rules it out", () => {
		const leaves: SweepableLeaf[] = [
			{
				kind: "bool",
				path: "be.enabled",
				labelKey: "beEnabled",
			},
			{
				kind: "number",
				path: "be.triggerPct",
				labelKey: "beTrigger",
				defaultMin: 50,
				defaultMax: 150,
				defaultStep: 25,
				condition: {
					parentPath: "be.enabled",
					allowedValues: [true],
				},
			},
		]
		const selections = new Map<string, LeafSelection>([
			["be.enabled", { kind: "fixed", value: false }],
			["be.triggerPct", { kind: "sweep_range", min: 50, max: 150, step: 25 }],
		])

		// be.enabled = false → triggerPct is inactive → swept range is suppressed
		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(combos).toHaveLength(1)
		expect(combos[0]).toStrictEqual({ "be.enabled": false })
		// The path is intentionally absent — leaf is inactive, no value written.
	})
})

// ── generateConditionalGrid — bundle ownership ──────────────────────

describe("generateConditionalGrid — bundle ownership", () => {
	// Three-bundle minimal world for clarity. Real Hawks tree has 14 gates;
	// the locking semantics are identical and the test stays readable.
	const NAMED_BUNDLES: Record<string, Record<string, PrimitiveValue>> = {
		off: { srLevelBlock: false, srBlockBuffer: 1 },
		strict: { srLevelBlock: true, srBlockBuffer: 3 },
	}

	const bundleLeaf: SweepableLeaf = {
		kind: "enum",
		path: "qualityBundle",
		labelKey: "bundle",
		options: [
			{ value: "off", labelKey: "off" },
			{ value: "strict", labelKey: "strict" },
			{ value: "custom", labelKey: "custom" },
		],
		ownsPaths: ["srLevelBlock", "srBlockBuffer"],
		resolveOwnedValue: (ownerValue, ownedPath) => {
			if (ownerValue === "custom") {
				return null // custom → don't lock, leaf retains user control
			}
			return NAMED_BUNDLES[ownerValue]?.[ownedPath] ?? null
		},
	}

	const srLevelBlockLeaf: SweepableLeaf = {
		kind: "bool",
		path: "srLevelBlock",
		labelKey: "srLevelBlock",
		managedBy: "qualityBundle",
	}

	const srBlockBufferLeaf: SweepableLeaf = {
		kind: "number",
		path: "srBlockBuffer",
		labelKey: "srBlockBuffer",
		defaultMin: 1,
		defaultMax: 4,
		defaultStep: 1,
		managedBy: "qualityBundle",
	}

	const leaves: SweepableLeaf[] = [
		bundleLeaf,
		srLevelBlockLeaf,
		srBlockBufferLeaf,
	]

	it("bundle in fix mode (named) locks owned leaves to bundle values", () => {
		const selections = new Map<string, LeafSelection>([
			["qualityBundle", { kind: "fixed", value: "strict" }],
			// User tries to sweep srBlockBuffer — but bundle owns it; this
			// selection must be suppressed.
			["srBlockBuffer", { kind: "sweep_range", min: 1, max: 4, step: 1 }],
		])

		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(combos).toHaveLength(1)
		expect(combos[0]).toStrictEqual({
			qualityBundle: "strict",
			srLevelBlock: true,
			srBlockBuffer: 3,
		})
	})

	it("bundle = custom DOES NOT lock — owned leaves use user selection", () => {
		const selections = new Map<string, LeafSelection>([
			["qualityBundle", { kind: "fixed", value: "custom" }],
			["srLevelBlock", { kind: "fixed", value: true }],
			["srBlockBuffer", { kind: "sweep_range", min: 1, max: 4, step: 1 }],
		])

		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(combos).toHaveLength(4)
		expect(new Set(combos.map((c) => c.srBlockBuffer))).toStrictEqual(
			new Set([1, 2, 3, 4])
		)
		expect(combos.every((c) => c.srLevelBlock === true)).toBe(true)
	})

	it("bundle in sweep mode generates one sub-tree per bundle value", () => {
		// Sweep over {off, strict, custom}. Within `off` and `strict`, gates
		// are locked → 1 combo each. Within `custom`, srBlockBuffer sweeps
		// [1..4] → 4 combos. Total 1 + 1 + 4 = 6.
		const selections = new Map<string, LeafSelection>([
			[
				"qualityBundle",
				{ kind: "sweep_set", values: ["off", "strict", "custom"] },
			],
			["srLevelBlock", { kind: "fixed", value: true }],
			["srBlockBuffer", { kind: "sweep_range", min: 1, max: 4, step: 1 }],
		])

		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(combos).toHaveLength(6)

		const offCombos = combos.filter((c) => c.qualityBundle === "off")
		expect(offCombos).toHaveLength(1)
		expect(offCombos[0]).toStrictEqual({
			qualityBundle: "off",
			srLevelBlock: false,
			srBlockBuffer: 1,
		})

		const strictCombos = combos.filter((c) => c.qualityBundle === "strict")
		expect(strictCombos).toHaveLength(1)
		expect(strictCombos[0]?.srBlockBuffer).toBe(3)

		const customCombos = combos.filter((c) => c.qualityBundle === "custom")
		expect(customCombos).toHaveLength(4)
		expect(new Set(customCombos.map((c) => c.srBlockBuffer))).toStrictEqual(
			new Set([1, 2, 3, 4])
		)
		// User's srLevelBlock fix applies within the custom sub-tree.
		expect(customCombos.every((c) => c.srLevelBlock === true)).toBe(true)
	})
})

// ── countConditionalGrid ────────────────────────────────────────────

describe("countConditionalGrid", () => {
	it("returns the same count as the materialized grid length", () => {
		const leaves: SweepableLeaf[] = [
			{ kind: "bool", path: "a", labelKey: "a" },
			{
				kind: "number",
				path: "b",
				labelKey: "b",
				defaultMin: 0,
				defaultMax: 0,
				defaultStep: 1,
			},
		]
		const selections = new Map<string, LeafSelection>([
			["a", { kind: "sweep_set", values: [true, false] }],
			["b", { kind: "sweep_range", min: 1, max: 5, step: 1 }],
		])

		const count = countConditionalGrid(leaves, selections, new Map())
		const combos = generateConditionalGrid(leaves, selections, new Map())
		expect(count).toBe(combos.length)
		expect(count).toBe(10)
	})
})
