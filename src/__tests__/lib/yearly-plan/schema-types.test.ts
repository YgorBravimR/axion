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

describe("monthly_risk_config rename (Phase 4b)", () => {
	it("exports renamed monthlyRiskConfig", async () => {
		const schema = (await import("@/db/schema")) as Record<string, unknown>
		expect(schema.monthlyRiskConfig).toBeDefined()
	})

	it("no longer exports legacy monthlyPlans", async () => {
		const schema = (await import("@/db/schema")) as Record<string, unknown>
		expect(schema.monthlyPlans).toBeUndefined()
	})
})

describe("legacy commission/fees columns dropped (Fee Unification Phase 3)", () => {
	it("tradingAccounts no longer has defaultCommission/defaultFees columns", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.tradingAccounts) as Record<string, unknown>
		expect(cols.defaultCommission).toBeUndefined()
		expect(cols.defaultFees).toBeUndefined()
	})

	it("accountAssets no longer has commissionOverride/feesOverride columns; breakevenTicksOverride remains", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.accountAssets) as Record<string, unknown>
		expect(cols.commissionOverride).toBeUndefined()
		expect(cols.feesOverride).toBeUndefined()
		expect(cols.breakevenTicksOverride).toBeDefined()
	})
})
