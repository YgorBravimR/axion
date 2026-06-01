import { describe, it, expect } from "vitest"
import {
	deriveInitialSelections,
	readLeafValueFromRecipe,
	readNestedValue,
	readSynthesizedValue,
	fallbackValueForLeaf,
} from "@/lib/optimize/recipe-to-selections"
import { HAWKS_LEAVES, BUNDLE_PATH } from "@/lib/backtest/presets/hawks-leaves"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { SweepableLeaf } from "@/lib/optimize/sweep-leaf"

describe("readNestedValue", () => {
	it("walks dotted paths through nested objects", () => {
		const obj = { a: { b: { c: 42 } } }
		expect(readNestedValue(obj, "a.b.c")).toBe(42)
	})

	it("returns undefined when any segment is missing", () => {
		const obj = { a: { b: {} } }
		expect(readNestedValue(obj, "a.b.c")).toBeUndefined()
		expect(readNestedValue(obj, "a.x.y")).toBeUndefined()
	})

	it("traverses array indices as numeric keys", () => {
		const obj = { levels: [{ value: 2 }, { value: 3 }] }
		expect(readNestedValue(obj, "levels.0.value")).toBe(2)
		expect(readNestedValue(obj, "levels.1.value")).toBe(3)
	})
})

describe("readSynthesizedValue", () => {
	it("synthesizes stop.breakeven.enabled from presence of stop.breakeven", () => {
		const withBE = { ...hawksV0 } // hawksV0 has breakeven by default
		expect(readSynthesizedValue(withBE, "stop.breakeven.enabled")).toBe(true)

		const withoutBE = {
			...hawksV0,
			stop: { ...hawksV0.stop, breakeven: undefined },
		}
		expect(readSynthesizedValue(withoutBE, "stop.breakeven.enabled")).toBe(
			false
		)
	})

	it("synthesizes stop.trailing.enabled from presence of stop.trailing", () => {
		const withoutTrailing = hawksV0 // hawksV0 has no trailing
		expect(readSynthesizedValue(withoutTrailing, "stop.trailing.enabled")).toBe(
			false
		)
	})

	it("synthesizes reversal.enabled from reversal.type !== 'none'", () => {
		expect(readSynthesizedValue(hawksV0, "reversal.enabled")).toBe(
			hawksV0.reversal.type !== "none"
		)
	})

	it("resolves bundle path to a matched quality preset name", () => {
		const value = readSynthesizedValue(hawksV0, BUNDLE_PATH)
		expect(typeof value).toBe("string")
		expect(["off", "lite", "standard", "strict", "custom"]).toContain(value)
	})

	it("returns null for non-synthesized paths", () => {
		expect(readSynthesizedValue(hawksV0, "stop.initial.type")).toBeNull()
	})
})

describe("fallbackValueForLeaf", () => {
	it("returns false for bool leaves", () => {
		const leaf: SweepableLeaf = { kind: "bool", path: "x", labelKey: "x" }
		expect(fallbackValueForLeaf(leaf)).toBe(false)
	})

	it("returns defaultMin for number leaves", () => {
		const leaf: SweepableLeaf = {
			kind: "number",
			path: "x",
			labelKey: "x",
			defaultMin: 7,
			defaultMax: 20,
			defaultStep: 1,
		}
		expect(fallbackValueForLeaf(leaf)).toBe(7)
	})

	it("returns first option value for enum leaves", () => {
		const leaf: SweepableLeaf = {
			kind: "enum",
			path: "x",
			labelKey: "x",
			options: [
				{ value: "a", labelKey: "a" },
				{ value: "b", labelKey: "b" },
			],
		}
		expect(fallbackValueForLeaf(leaf)).toBe("a")
	})

	it("returns 910 (09:10 HHMM) for time leaves", () => {
		const leaf: SweepableLeaf = { kind: "time", path: "x", labelKey: "x" }
		expect(fallbackValueForLeaf(leaf)).toBe(910)
	})
})

describe("readLeafValueFromRecipe", () => {
	it("reads number leaves from the recipe", () => {
		const leaf = HAWKS_LEAVES.find((l) => l.path === "slippageTicks")!
		const value = readLeafValueFromRecipe(hawksV0, leaf)
		expect(value).toBe(hawksV0.slippageTicks)
	})

	it("reads synthesized addon-enabled bools", () => {
		const leaf = HAWKS_LEAVES.find((l) => l.path === "stop.breakeven.enabled")!
		const value = readLeafValueFromRecipe(hawksV0, leaf)
		expect(typeof value).toBe("boolean")
	})

	it("falls back to leaf default when path is missing", () => {
		// stop.initial.points is only set when initial.type === "fixed_points";
		// hawksV0 may use pct_range, in which case points falls back to leaf default.
		const leaf = HAWKS_LEAVES.find((l) => l.path === "stop.initial.points")!
		const value = readLeafValueFromRecipe(hawksV0, leaf)
		if (hawksV0.stop.initial.type !== "fixed_points") {
			expect(value).toBe(leaf.kind === "number" ? leaf.defaultMin : 0)
		}
	})
})

describe("deriveInitialSelections", () => {
	it("returns one fix-mode selection for every leaf in the catalog", () => {
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)
		expect(selections.size).toBe(HAWKS_LEAVES.length)
		for (const sel of selections.values()) {
			expect(sel.kind).toBe("fixed")
		}
	})

	it("bundle path resolves to a valid preset name", () => {
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)
		const bundleSel = selections.get(BUNDLE_PATH)
		expect(bundleSel?.kind).toBe("fixed")
		if (bundleSel?.kind === "fixed") {
			expect(["off", "lite", "standard", "strict", "custom"]).toContain(
				bundleSel.value
			)
		}
	})
})
