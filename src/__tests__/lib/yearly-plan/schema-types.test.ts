import { describe, it, expect } from "vitest"
import { getTableColumns } from "drizzle-orm"

describe("yearly_plans schema shape", () => {
	it("exports yearlyPlans table", async () => {
		const schema = await import("@/db/schema")
		expect(schema.yearlyPlans).toBeDefined()
	})
})

describe("trades.pointsPnl column", () => {
	it("is present on trades table", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.trades)
		expect(cols.pointsPnl).toBeDefined()
	})
})
