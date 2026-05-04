import { describe, it, expect } from "vitest"

describe("fractal-plan: enums", () => {
	it("exports snapshotReasonEnum with three values", async () => {
		const schema = await import("@/db/schema")
		expect(schema.snapshotReasonEnum).toBeDefined()
		expect(schema.snapshotReasonEnum.enumValues).toEqual([
			"month_start",
			"drawdown_trigger",
			"manual",
		])
	})

	it("exports planMoodEnum with four values", async () => {
		const schema = await import("@/db/schema")
		expect(schema.planMoodEnum).toBeDefined()
		expect(schema.planMoodEnum.enumValues).toEqual([
			"focused",
			"neutral",
			"distracted",
			"risk_off",
		])
	})

	it("exports tierChangeReasonEnum with three values", async () => {
		const schema = await import("@/db/schema")
		expect(schema.tierChangeReasonEnum).toBeDefined()
		expect(schema.tierChangeReasonEnum.enumValues).toEqual([
			"month_start",
			"drawdown_trigger",
			"manual",
		])
	})
})
