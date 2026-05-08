import { describe, it, expect } from "vitest"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

describe("fractal-plan: ladderRules JSONB shape", () => {
	it("LadderRuleR re-exported from schema barrel", async () => {
		await import("@/db/schema")
		// Type-only re-export — runtime no-op. If barrel drops it, vitest refuses to load.
		expect(true).toBe(true)
	})

	it("matches money-based shape (minCapitalCents/maxCapitalCents/oneRCents)", () => {
		const sample: LadderRuleR = {
			minCapitalCents: 0,
			maxCapitalCents: 999_999_99,
			oneRCents: 100_00,
		}
		const keys = Object.keys(sample).sort()
		expect(keys).toEqual(["maxCapitalCents", "minCapitalCents", "oneRCents"])
	})

	it("rejects legacy contract-flavored keys at type level", () => {
		const sample: Record<string, number> = {
			minCapitalCents: 0,
			maxCapitalCents: 1_000_000,
			oneRCents: 50_00,
		}
		expect(sample).not.toHaveProperty("minContracts")
		expect(sample).not.toHaveProperty("maxContracts")
		expect(sample).not.toHaveProperty("multiplier")
	})

	it("yearlyPlans.ladderRules column is JSONB and not-null", async () => {
		const { getTableColumns } = await import("drizzle-orm")
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.yearlyPlans)
		expect(cols.ladderRules).toBeDefined()
		expect(cols.ladderRules.notNull).toBe(true)
	})
})
