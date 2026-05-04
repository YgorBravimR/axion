import { describe, it, expect } from "vitest"

describe("yearly_plans schema shape", () => {
	it("exports yearlyPlans table", async () => {
		const schema = await import("@/db/schema")
		expect(schema.yearlyPlans).toBeDefined()
		expect(schema.weeklyTargets).toBeDefined()
	})
})
