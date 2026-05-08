import { describe, it, expect } from "vitest"
import { resolveCascade } from "@/lib/fractal-plan/cascade-merge"

describe("resolveCascade", () => {
	it("falls back to the deepest level with a defined value", () => {
		const result = resolveCascade([
			{ level: "day", value: undefined },
			{ level: "week", value: undefined },
			{ level: "month", value: 2.5 },
			{ level: "year", value: 3.0 },
		])
		expect(result).toEqual({ value: 2.5, source: "month" })
	})

	it("returns the topmost (first) override when present", () => {
		const result = resolveCascade([
			{ level: "day", value: 1.0 },
			{ level: "week", value: 2.0 },
			{ level: "month", value: 3.0 },
			{ level: "year", value: 4.0 },
		])
		expect(result).toEqual({ value: 1.0, source: "day" })
	})

	it("falls all the way to year when only year is set", () => {
		const result = resolveCascade([
			{ level: "day", value: undefined },
			{ level: "week", value: undefined },
			{ level: "month", value: undefined },
			{ level: "year", value: 5.0 },
		])
		expect(result).toEqual({ value: 5.0, source: "year" })
	})

	it("treats null and undefined identically", () => {
		const result = resolveCascade([
			{ level: "day", value: null },
			{ level: "week", value: undefined },
			{ level: "month", value: 7.0 },
			{ level: "year", value: 9.0 },
		])
		expect(result.source).toBe("month")
	})

	it("throws if no level provides a value (root must be non-null)", () => {
		expect(() =>
			resolveCascade([
				{ level: "day", value: null },
				{ level: "week", value: null },
				{ level: "month", value: null },
				{ level: "year", value: null },
			])
		).toThrow("cascade has no defined value at any level")
	})
})
