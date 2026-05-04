import { describe, it, expect } from "vitest"
import { getTableColumns } from "drizzle-orm"

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

describe("fractal-plan: quarterlyPlan table", () => {
	it("exports quarterlyPlan with required columns", async () => {
		const schema = await import("@/db/schema")
		expect(schema.quarterlyPlan).toBeDefined()
		const cols = getTableColumns(schema.quarterlyPlan)
		expect(cols.id).toBeDefined()
		expect(cols.yearlyPlanId).toBeDefined()
		expect(cols.quarter).toBeDefined()
		expect(cols.goalCents).toBeDefined()
		expect(cols.reflectionNotes).toBeDefined()
		expect(cols.postMortemNotes).toBeDefined()
		expect(cols.activePlaybookIds).toBeDefined()
		expect(cols.createdAt).toBeDefined()
		expect(cols.updatedAt).toBeDefined()
	})

	it("makes yearlyPlanId not-null and quarter not-null", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.quarterlyPlan)
		expect(cols.yearlyPlanId.notNull).toBe(true)
		expect(cols.quarter.notNull).toBe(true)
	})

	it("makes goal/notes/playbookIds nullable", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.quarterlyPlan)
		expect(cols.goalCents.notNull).toBe(false)
		expect(cols.reflectionNotes.notNull).toBe(false)
		expect(cols.postMortemNotes.notNull).toBe(false)
		expect(cols.activePlaybookIds.notNull).toBe(false)
	})
})
