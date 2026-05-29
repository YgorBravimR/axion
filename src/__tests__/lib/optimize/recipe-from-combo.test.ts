import { describe, it, expect } from "vitest"
import {
	recipeFromCombo,
	setNestedValue,
} from "@/lib/optimize/recipe-from-combo"
import { generateConditionalGrid } from "@/lib/optimize/grid-conditional"
import { deriveInitialSelections } from "@/lib/optimize/recipe-to-selections"
import { HAWKS_LEAVES, BUNDLE_PATH } from "@/lib/backtest/presets/hawks-leaves"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { getQualityPresetBundle } from "@/lib/backtest/presets/hawks-quality-presets"
import type { LeafSelection, PrimitiveValue } from "@/lib/optimize/sweep-leaf"
import type { Combination } from "@/lib/optimize/grid-conditional"

describe("setNestedValue", () => {
	it("writes a value at a dotted path, creating intermediates", () => {
		const obj: Record<string, unknown> = {}
		setNestedValue(obj, "a.b.c", 42)
		expect(obj).toStrictEqual({ a: { b: { c: 42 } } })
	})

	it("overwrites existing values without disturbing siblings", () => {
		const obj: Record<string, unknown> = { a: { b: { c: 1, d: 2 } } }
		setNestedValue(obj, "a.b.c", 99)
		expect(obj).toStrictEqual({ a: { b: { c: 99, d: 2 } } })
	})

	it("handles numeric path segments (array-like access)", () => {
		const obj: Record<string, unknown> = { levels: [{ value: 1 }] }
		setNestedValue(obj, "levels.0.value", 5)
		expect(obj.levels).toStrictEqual([{ value: 5 }])
	})
})

describe("recipeFromCombo — plain paths", () => {
	it("writes a slippage value into the recipe", () => {
		const combo: Combination = { slippageTicks: 3 }
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.slippageTicks).toBe(3)
		// Baseline untouched fields are preserved.
		expect(recipe.entry.type).toBe(hawksV0.entry.type)
	})

	it("writes a target value into the nested array path", () => {
		const combo: Combination = { "target.levels.0.value": 3.5 }
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.target.type).toBe("fixed_levels")
		if (recipe.target.type === "fixed_levels") {
			expect(recipe.target.levels[0]?.value).toBe(3.5)
		}
	})
})

describe("recipeFromCombo — bundle handling", () => {
	it("ignores the BUNDLE_PATH marker — it's not a real recipe field", () => {
		const combo: Combination = { [BUNDLE_PATH]: "strict" }
		const recipe = recipeFromCombo(hawksV0, combo)
		// Bundle marker doesn't appear anywhere on the recipe shape.
		expect((recipe as unknown as Record<string, unknown>).__bundle__).toBe(
			undefined
		)
		expect(
			(recipe.entry.type === "hawks_triple_screen"
				? (recipe.entry.config.qualityGates as Record<string, unknown>)
				: {})["__bundle__"]
		).toBe(undefined)
	})

	it("when a bundle is fixed, the combo carries the bundle's gate values directly", () => {
		// The conditional grid generator already locks owned gates to the
		// bundle's values when bundle is fixed. recipeFromCombo just writes
		// those values verbatim. We verify the end-to-end flow here.
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)
		selections.set(BUNDLE_PATH, { kind: "fixed", value: "strict" })

		const fallback = new Map<string, PrimitiveValue>()
		for (const [p, s] of selections) {
			if (s.kind === "fixed") {
				fallback.set(p, s.value)
			}
		}

		const combos = generateConditionalGrid(HAWKS_LEAVES, selections, fallback)
		expect(combos).toHaveLength(1)

		const recipe = recipeFromCombo(hawksV0, combos[0]!)
		const strictGates = getQualityPresetBundle("strict")
		if (recipe.entry.type === "hawks_triple_screen") {
			expect(recipe.entry.config.qualityGates?.srLevelBlock).toBe(
				strictGates.srLevelBlock
			)
			expect(recipe.entry.config.qualityGates?.srBlockBufferBricks).toBe(
				strictGates.srBlockBufferBricks
			)
			expect(recipe.entry.config.qualityGates?.aggressionMode).toBe(
				strictGates.aggressionMode
			)
		}
	})
})

describe("recipeFromCombo — addon reconstruction", () => {
	it("sets stop.breakeven = undefined when synthesized enabled=false", () => {
		const combo: Combination = { "stop.breakeven.enabled": false }
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.stop.breakeven).toBeUndefined()
	})

	it("builds an on_pct_risk breakeven from enabled + type + triggerPct", () => {
		const combo: Combination = {
			"stop.breakeven.enabled": true,
			"stop.breakeven.type": "on_pct_risk",
			"stop.breakeven.triggerPct": 125,
		}
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.stop.breakeven).toStrictEqual({
			type: "on_pct_risk",
			triggerPct: 125,
		})
	})

	it("builds an on_partial breakeven (no trigger needed) when type matches", () => {
		const combo: Combination = {
			"stop.breakeven.enabled": true,
			"stop.breakeven.type": "on_partial",
		}
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.stop.breakeven).toStrictEqual({ type: "on_partial" })
	})

	it("builds a trailing config from enabled + distance", () => {
		const combo: Combination = {
			"stop.trailing.enabled": true,
			"stop.trailing.distance": 150,
		}
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.stop.trailing).toStrictEqual({
			type: "price_distance",
			distance: 150,
		})
	})

	it("sets reversal to {type:'none'} when synthesized enabled=false", () => {
		const combo: Combination = { "reversal.enabled": false }
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.reversal).toStrictEqual({ type: "none" })
	})

	it("builds reverse_on_stop reversal from enabled + maxReversals", () => {
		const combo: Combination = {
			"reversal.enabled": true,
			"reversal.maxReversals": 2,
		}
		const recipe = recipeFromCombo(hawksV0, combo)
		expect(recipe.reversal).toStrictEqual({
			type: "reverse_on_stop",
			maxReversals: 2,
			virarNoBE: false,
		})
	})
})

describe("recipeFromCombo — end-to-end round-trip", () => {
	it("preserves a clean baseline through selections → grid → recipe", () => {
		// Default selections (all fix-mode at baseline) → single combination →
		// the resulting recipe should be functionally equivalent to baseline.
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)
		const fallback = new Map<string, PrimitiveValue>()
		for (const [p, s] of selections) {
			if (s.kind === "fixed") {
				fallback.set(p, s.value)
			}
		}
		const combos = generateConditionalGrid(HAWKS_LEAVES, selections, fallback)
		expect(combos).toHaveLength(1)

		const recipe = recipeFromCombo(hawksV0, combos[0]!)
		expect(recipe.slippageTicks).toBe(hawksV0.slippageTicks)
		// Breakeven preservation depends on hawksV0's baseline.
		expect(!!recipe.stop.breakeven).toBe(!!hawksV0.stop.breakeven)
	})

	it("a 2-axis sweep produces N distinct recipes", () => {
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)
		// Sweep slippage [0, 1, 2] AND breakeven trigger [50, 100, 150] when
		// breakeven is enabled. Should yield 3 × 3 = 9 combinations.
		const beEnabledSel = selections.get("stop.breakeven.enabled")
		const hasBaselineBE =
			beEnabledSel?.kind === "fixed" && beEnabledSel.value === true
		if (!hasBaselineBE) {
			// Force BE enabled so the trigger sweep is active.
			selections.set("stop.breakeven.enabled", {
				kind: "fixed",
				value: true,
			})
		}
		selections.set("stop.breakeven.type", {
			kind: "fixed",
			value: "on_pct_risk",
		})
		selections.set("slippageTicks", {
			kind: "sweep_range",
			min: 0,
			max: 2,
			step: 1,
		})
		selections.set("stop.breakeven.triggerPct", {
			kind: "sweep_range",
			min: 50,
			max: 150,
			step: 50,
		})

		const fallback = new Map<string, PrimitiveValue>()
		for (const [p, s] of selections) {
			if (s.kind === "fixed") {
				fallback.set(p, s.value)
			}
		}
		const combos = generateConditionalGrid(HAWKS_LEAVES, selections, fallback)
		expect(combos).toHaveLength(9)

		const recipes = combos.map((c) => recipeFromCombo(hawksV0, c))
		const slipValues = new Set(recipes.map((r) => r.slippageTicks))
		expect(slipValues).toStrictEqual(new Set([0, 1, 2]))

		const triggerValues = new Set(
			recipes.map((r) =>
				r.stop.breakeven?.type === "on_pct_risk"
					? r.stop.breakeven.triggerPct
					: undefined
			)
		)
		expect(triggerValues).toStrictEqual(new Set([50, 100, 150]))
	})
})

describe("LeafSelection consumer", () => {
	// Anchor a use-site type-check that the LeafSelection union is exported.
	it("LeafSelection union is structurally usable", () => {
		const sel: LeafSelection = { kind: "fixed", value: true }
		expect(sel.kind).toBe("fixed")
	})
})
