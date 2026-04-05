import { describe, it, expect } from "vitest"
import {
	conditionsToParams,
	RATING_ORDER,
	type FilterCondition,
} from "@/components/journal/smart-search"
import { QUICK_FILTERS } from "@/components/journal/quick-filters"

// ============================================================================
// conditionsToParams
// ============================================================================

describe("conditionsToParams", () => {
	it("returns empty object for empty conditions", () => {
		expect(conditionsToParams([])).toEqual({})
	})

	it("maps outcome 'is' to outcomes array", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "outcome", operator: "is", value: "loss" },
		]
		expect(conditionsToParams(conditions)).toEqual({ outcomes: ["loss"] })
	})

	it("combines multiple outcomes into array", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "outcome", operator: "is", value: "win" },
			{ id: "2", field: "outcome", operator: "is", value: "loss" },
		]
		expect(conditionsToParams(conditions)).toEqual({
			outcomes: ["win", "loss"],
		})
	})

	it("maps direction to directions array", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "direction", operator: "is", value: "long" },
		]
		expect(conditionsToParams(conditions)).toEqual({ directions: ["long"] })
	})

	it("maps rating 'is' to rating array", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "rating", operator: "is", value: "A" },
		]
		expect(conditionsToParams(conditions)).toEqual({ rating: ["A"] })
	})

	it("maps rating 'isAtLeast' A to just ['A']", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "rating", operator: "isAtLeast", value: "A" },
		]
		expect(conditionsToParams(conditions)).toEqual({ rating: ["A"] })
	})

	it("maps rating 'isAtLeast' C to ['A', 'B', 'C']", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "rating", operator: "isAtLeast", value: "C" },
		]
		expect(conditionsToParams(conditions)).toEqual({
			rating: ["A", "B", "C"],
		})
	})

	it("maps rating 'isAtLeast' F to all grades", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "rating", operator: "isAtLeast", value: "F" },
		]
		expect(conditionsToParams(conditions)).toEqual({
			rating: ["A", "B", "C", "D", "F"],
		})
	})

	it("maps followedPlan to string value", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "followedPlan", operator: "is", value: "true" },
		]
		expect(conditionsToParams(conditions)).toEqual({ followedPlan: "true" })
	})

	it("maps followedPlan false", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "followedPlan", operator: "is", value: "false" },
		]
		expect(conditionsToParams(conditions)).toEqual({ followedPlan: "false" })
	})

	it("maps pnl greaterThan to pnlMin", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "pnl", operator: "greaterThan", value: "500" },
		]
		expect(conditionsToParams(conditions)).toEqual({ pnlMin: "500" })
	})

	it("maps pnl lessThan to pnlMax", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "pnl", operator: "lessThan", value: "200" },
		]
		expect(conditionsToParams(conditions)).toEqual({ pnlMax: "200" })
	})

	it("maps timeOfDay between to hourFrom/hourTo", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "timeOfDay", operator: "between", value: "9-12" },
		]
		expect(conditionsToParams(conditions)).toEqual({
			hourFrom: "9",
			hourTo: "12",
		})
	})

	it("maps asset to assets array", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "asset", operator: "is", value: "WDO" },
		]
		expect(conditionsToParams(conditions)).toEqual({ assets: ["WDO"] })
	})

	it("combines multiple assets", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "asset", operator: "is", value: "WDO" },
			{ id: "2", field: "asset", operator: "is", value: "WIN" },
		]
		expect(conditionsToParams(conditions)).toEqual({
			assets: ["WDO", "WIN"],
		})
	})

	it("handles mixed conditions correctly", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "outcome", operator: "is", value: "loss" },
			{ id: "2", field: "rating", operator: "isAtLeast", value: "B" },
			{ id: "3", field: "pnl", operator: "lessThan", value: "0" },
			{ id: "4", field: "timeOfDay", operator: "between", value: "10-14" },
		]

		const result = conditionsToParams(conditions)
		expect(result.outcomes).toEqual(["loss"])
		expect(result.rating).toEqual(["A", "B"])
		expect(result.pnlMax).toBe("0")
		expect(result.hourFrom).toBe("10")
		expect(result.hourTo).toBe("14")
	})

	it("handles timeOfDay with missing to part", () => {
		const conditions: FilterCondition[] = [
			{ id: "1", field: "timeOfDay", operator: "between", value: "9-" },
		]
		const result = conditionsToParams(conditions)
		expect(result.hourFrom).toBe("9")
		// Empty string is falsy, so hourTo is not set
		expect(result.hourTo).toBeUndefined()
	})
})

// ============================================================================
// RATING_ORDER
// ============================================================================

describe("RATING_ORDER", () => {
	it("has exactly 5 grades", () => {
		expect(RATING_ORDER).toHaveLength(5)
	})

	it("is in order A through F without E", () => {
		expect(RATING_ORDER).toEqual(["A", "B", "C", "D", "F"])
	})

	it("does not contain E", () => {
		expect(RATING_ORDER).not.toContain("E")
	})
})

// ============================================================================
// QUICK_FILTERS
// ============================================================================

describe("QUICK_FILTERS", () => {
	it("has exactly 6 presets", () => {
		expect(QUICK_FILTERS).toHaveLength(6)
	})

	it("each preset has key, labelKey, and params", () => {
		for (const filter of QUICK_FILTERS) {
			expect(filter.key).toBeTruthy()
			expect(filter.labelKey).toBeTruthy()
			expect(filter.params).toBeDefined()
		}
	})

	it("morningTrades has hourFrom and hourTo", () => {
		const morning = QUICK_FILTERS.find((f) => f.key === "morningTrades")
		expect(morning).toBeDefined()
		expect(morning!.params.hourFrom).toBe("9")
		expect(morning!.params.hourTo).toBe("12")
	})

	it("losingTrades has outcomes loss", () => {
		const losing = QUICK_FILTERS.find((f) => f.key === "losingTrades")
		expect(losing).toBeDefined()
		expect(losing!.params.outcomes).toEqual(["loss"])
	})

	it("winningTrades has outcomes win", () => {
		const winning = QUICK_FILTERS.find((f) => f.key === "winningTrades")
		expect(winning).toBeDefined()
		expect(winning!.params.outcomes).toEqual(["win"])
	})

	it("aRatedOnly has rating A", () => {
		const aRated = QUICK_FILTERS.find((f) => f.key === "aRatedOnly")
		expect(aRated).toBeDefined()
		expect(aRated!.params.rating).toEqual(["A"])
	})

	it("unfollowedPlan has followedPlan false", () => {
		const unfollowed = QUICK_FILTERS.find((f) => f.key === "unfollowedPlan")
		expect(unfollowed).toBeDefined()
		expect(unfollowed!.params.followedPlan).toBe("false")
	})

	it("highPnl has pnlMin", () => {
		const highPnl = QUICK_FILTERS.find((f) => f.key === "highPnl")
		expect(highPnl).toBeDefined()
		expect(highPnl!.params.pnlMin).toBeDefined()
	})

	it("all keys are unique", () => {
		const keys = QUICK_FILTERS.map((f) => f.key)
		expect(new Set(keys).size).toBe(keys.length)
	})
})

// ============================================================================
// Extended TradeFilters validation
// ============================================================================

describe("tradeFiltersSchema — extended fields", () => {
	// Import dynamically to avoid circular dependency issues
	const getSchema = async () => {
		const { tradeFiltersSchema } = await import("@/lib/validations/trade")
		return tradeFiltersSchema
	}

	it("accepts valid rating array", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ rating: ["A", "C", "F"] })
		expect(result.success).toBe(true)
	})

	it("rejects invalid rating values", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ rating: ["A", "E"] })
		expect(result.success).toBe(false)
	})

	it("accepts followedPlan boolean", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ followedPlan: true })
		expect(result.success).toBe(true)
	})

	it("accepts hourFrom in valid range", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ hourFrom: 9, hourTo: 17 })
		expect(result.success).toBe(true)
	})

	it("rejects hourFrom > 23", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ hourFrom: 24 })
		expect(result.success).toBe(false)
	})

	it("rejects hourFrom < 0", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ hourFrom: -1 })
		expect(result.success).toBe(false)
	})

	it("accepts pnlMin and pnlMax", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({ pnlMin: -500, pnlMax: 1000 })
		expect(result.success).toBe(true)
	})

	it("all extended fields are optional", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({})
		expect(result.success).toBe(true)
	})

	it("extended fields coexist with base fields", async () => {
		const schema = await getSchema()
		const result = schema.safeParse({
			assets: ["WDO"],
			outcomes: ["win"],
			rating: ["A", "B"],
			followedPlan: true,
			hourFrom: 9,
			hourTo: 12,
		})
		expect(result.success).toBe(true)
	})
})
