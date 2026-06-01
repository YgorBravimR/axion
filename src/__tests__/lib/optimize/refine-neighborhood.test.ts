import { describe, it, expect } from "vitest"
import {
	buildKParentNeighborhood,
	inferNumericStep,
} from "@/lib/optimize/refine-neighborhood"
import type { SweepableLeaf } from "@/lib/optimize/sweep-leaf"

const numberLeaf = (
	path: string,
	defaultMin: number,
	defaultMax: number,
	defaultStep: number
): SweepableLeaf => ({
	kind: "number",
	path,
	labelKey: path,
	defaultMin,
	defaultMax,
	defaultStep,
})

const enumLeaf = (path: string, options: string[]): SweepableLeaf => ({
	kind: "enum",
	path,
	labelKey: path,
	options: options.map((v) => ({ value: v, labelKey: v })),
})

const boolLeaf = (path: string): SweepableLeaf => ({
	kind: "bool",
	path,
	labelKey: path,
})

const timeLeaf = (path: string): SweepableLeaf => ({
	kind: "time",
	path,
	labelKey: path,
})

describe("inferNumericStep", () => {
	it("returns defaultStep with fewer than 2 values", () => {
		expect(inferNumericStep([], 5)).toBe(5)
		expect(inferNumericStep([20], 5)).toBe(5)
	})

	it("returns GCD of pairwise differences when all are multiples of one step", () => {
		expect(inferNumericStep([20, 25, 30], 1)).toBe(1)
		expect(inferNumericStep([20, 25, 30], 5)).toBe(5)
	})

	it("caps inferred step at defaultStep (never enlarge below grid)", () => {
		expect(inferNumericStep([0, 10, 20], 3)).toBe(3)
	})
})

describe("buildKParentNeighborhood", () => {
	it("numeric leaf with 3 differing parents → smooth range with clamping", () => {
		const leaves = [numberLeaf("stop.points", 0, 100, 5)]
		const parents = [
			{ stop: { points: 20 } },
			{ stop: { points: 25 } },
			{ stop: { points: 30 } },
		]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("stop.points")).toEqual({
			kind: "sweep_range",
			min: 15,
			max: 35,
			step: 5,
		})
	})

	it("numeric leaf with all parents agreeing → collapses to fixed", () => {
		const leaves = [numberLeaf("stop.points", 0, 100, 5)]
		const parents = [{ stop: { points: 25 } }, { stop: { points: 25 } }]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("stop.points")).toEqual({ kind: "fixed", value: 25 })
	})

	it("numeric range clamps against leaf bounds", () => {
		const leaves = [numberLeaf("stop.points", 0, 30, 5)]
		const parents = [{ stop: { points: 5 } }, { stop: { points: 30 } }]
		const result = buildKParentNeighborhood(leaves, parents)
		const sel = result.get("stop.points")!
		if (sel.kind !== "sweep_range") {
			throw new Error("expected sweep_range")
		}
		expect(sel.min).toBeGreaterThanOrEqual(0)
		expect(sel.max).toBeLessThanOrEqual(30)
	})

	it("enum leaf → sweep_set with unique union", () => {
		const leaves = [enumLeaf("mode", ["a", "b", "c"])]
		const parents = [{ mode: "a" }, { mode: "b" }, { mode: "a" }]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("mode")).toEqual({
			kind: "sweep_set",
			values: ["a", "b"],
		})
	})

	it("enum leaf with all parents agreeing → fixed", () => {
		const leaves = [enumLeaf("mode", ["a", "b"])]
		const parents = [{ mode: "a" }, { mode: "a" }]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("mode")).toEqual({ kind: "fixed", value: "a" })
	})

	it("bool leaf → sweep_set with both values when parents disagree", () => {
		const leaves = [boolLeaf("breakeven.enabled")]
		const parents = [
			{ breakeven: { enabled: true } },
			{ breakeven: { enabled: false } },
		]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("breakeven.enabled")).toEqual({
			kind: "sweep_set",
			values: [true, false],
		})
	})

	it("time leaf → sweep_set of HHMM integers", () => {
		const leaves = [timeLeaf("entry.start")]
		const parents = [{ entry: { start: 900 } }, { entry: { start: 910 } }]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("entry.start")).toEqual({
			kind: "sweep_set",
			values: [900, 910],
		})
	})

	it("skips leaves where no parent has a value at that path", () => {
		const leaves = [numberLeaf("missing.path", 0, 100, 5)]
		const parents = [{ stop: { points: 25 } }]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.has("missing.path")).toBe(false)
	})

	it("K=1 single parent → all leaves collapse to fixed", () => {
		const leaves = [
			numberLeaf("stop.points", 0, 100, 5),
			enumLeaf("mode", ["a", "b"]),
		]
		const parents = [{ stop: { points: 25 }, mode: "b" }]
		const result = buildKParentNeighborhood(leaves, parents)
		expect(result.get("stop.points")).toEqual({ kind: "fixed", value: 25 })
		expect(result.get("mode")).toEqual({ kind: "fixed", value: "b" })
	})
})
