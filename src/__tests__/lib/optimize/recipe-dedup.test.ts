import { describe, expect, it } from "vitest"
import { dedupeRecipes } from "@/lib/optimize/recipe-dedup"
import type { StrategyRecipe } from "@/types/backtest"

const baseRecipe = (overrides: Partial<StrategyRecipe> = {}): StrategyRecipe =>
	({
		displayName: "Hawks v0",
		entry: { type: "hawks_playbook" },
		stop: { type: "fixed", riskPerTradeBRL: 100 },
		target: { type: "fixed_r", multiple: 3 },
		sizing: { type: "fixed_risk", riskPerTradeBRL: 100 },
		...overrides,
	}) as unknown as StrategyRecipe

describe("dedupeRecipes", () => {
	it("returns input unchanged when no duplicates", () => {
		const a = baseRecipe({ target: { type: "fixed_r", multiple: 2 } as never })
		const b = baseRecipe({ target: { type: "fixed_r", multiple: 3 } as never })
		const { unique, droppedCount } = dedupeRecipes([a, b])
		expect(unique).toHaveLength(2)
		expect(droppedCount).toBe(0)
	})

	it("drops structural duplicates and counts them", () => {
		const a = baseRecipe()
		const b = baseRecipe()
		const c = baseRecipe()
		const { unique, droppedCount } = dedupeRecipes([a, b, c])
		expect(unique).toHaveLength(1)
		expect(droppedCount).toBe(2)
	})

	it("treats different displayName as same recipe (label is cosmetic)", () => {
		const a = baseRecipe({ displayName: "Hawks (a)" })
		const b = baseRecipe({ displayName: "Hawks (b)" })
		const { unique, droppedCount } = dedupeRecipes([a, b])
		expect(unique).toHaveLength(1)
		expect(droppedCount).toBe(1)
	})

	it("preserves first occurrence order", () => {
		const a = baseRecipe({ target: { type: "fixed_r", multiple: 1 } as never })
		const b = baseRecipe({ target: { type: "fixed_r", multiple: 2 } as never })
		const aDup = baseRecipe({
			target: { type: "fixed_r", multiple: 1 } as never,
		})
		const { unique } = dedupeRecipes([a, b, aDup])
		expect(unique).toEqual([a, b])
	})

	it("handles empty input", () => {
		const { unique, droppedCount } = dedupeRecipes([])
		expect(unique).toEqual([])
		expect(droppedCount).toBe(0)
	})
})
