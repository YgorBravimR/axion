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

describe("fractal-plan: tierChangeLog table", () => {
	it("exports tierChangeLog with audit columns", async () => {
		const schema = await import("@/db/schema")
		expect(schema.tierChangeLog).toBeDefined()
		const cols = getTableColumns(schema.tierChangeLog)
		expect(cols.id).toBeDefined()
		expect(cols.accountId).toBeDefined()
		expect(cols.monthlyPlanId).toBeDefined()
		expect(cols.fromTierIndex).toBeDefined()
		expect(cols.toTierIndex).toBeDefined()
		expect(cols.fromOneRCents).toBeDefined()
		expect(cols.toOneRCents).toBeDefined()
		expect(cols.triggerReason).toBeDefined()
		expect(cols.triggeredAt).toBeDefined()
	})

	it("makes all fields not-null", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.tierChangeLog)
		expect(cols.accountId.notNull).toBe(true)
		expect(cols.monthlyPlanId.notNull).toBe(true)
		expect(cols.fromTierIndex.notNull).toBe(true)
		expect(cols.toTierIndex.notNull).toBe(true)
		expect(cols.fromOneRCents.notNull).toBe(true)
		expect(cols.toOneRCents.notNull).toBe(true)
		expect(cols.triggerReason.notNull).toBe(true)
		expect(cols.triggeredAt.notNull).toBe(true)
	})
})

describe("fractal-plan: dailyPlan table", () => {
	it("exports dailyPlan with pre-market + post-market columns", async () => {
		const schema = await import("@/db/schema")
		expect(schema.dailyPlan).toBeDefined()
		const cols = getTableColumns(schema.dailyPlan)
		expect(cols.id).toBeDefined()
		expect(cols.weeklyPlanId).toBeDefined()
		expect(cols.date).toBeDefined()
		expect(cols.targetR).toBeDefined()
		expect(cols.maxTradesToday).toBeDefined()
		expect(cols.preMarketNotes).toBeDefined()
		expect(cols.mood).toBeDefined()
		expect(cols.overrideDailyLossR).toBeDefined()
		expect(cols.overrideDailyTargetR).toBeDefined()
		expect(cols.overrideActivePlaybookIds).toBeDefined()
		expect(cols.actualR).toBeDefined()
		expect(cols.tradesCount).toBeDefined()
		expect(cols.actualSyncedAt).toBeDefined()
		expect(cols.postMarketNotes).toBeDefined()
	})

	it("makes weeklyPlanId/date not-null and rest nullable", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.dailyPlan)
		expect(cols.weeklyPlanId.notNull).toBe(true)
		expect(cols.date.notNull).toBe(true)
		expect(cols.targetR.notNull).toBe(false)
		expect(cols.mood.notNull).toBe(false)
		expect(cols.actualR.notNull).toBe(false)
	})
})

describe("fractal-plan: weeklyPlan table", () => {
	it("exports weeklyPlan with target/actual + override columns", async () => {
		const schema = await import("@/db/schema")
		expect(schema.weeklyPlan).toBeDefined()
		const cols = getTableColumns(schema.weeklyPlan)
		expect(cols.id).toBeDefined()
		expect(cols.monthlyPlanId).toBeDefined()
		expect(cols.isoWeek).toBeDefined()
		expect(cols.isoYear).toBeDefined()
		expect(cols.targetR).toBeDefined()
		expect(cols.actualR).toBeDefined()
		expect(cols.actualSyncedAt).toBeDefined()
		expect(cols.overrideDailyLossR).toBeDefined()
		expect(cols.overrideWeeklyLossR).toBeDefined()
		expect(cols.overrideDailyTargetR).toBeDefined()
		expect(cols.overrideActivePlaybookIds).toBeDefined()
		expect(cols.intentNotes).toBeDefined()
		expect(cols.postMortemNotes).toBeDefined()
	})

	it("makes monthlyPlanId/isoWeek/isoYear not-null and rest nullable", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.weeklyPlan)
		expect(cols.monthlyPlanId.notNull).toBe(true)
		expect(cols.isoWeek.notNull).toBe(true)
		expect(cols.isoYear.notNull).toBe(true)
		expect(cols.targetR.notNull).toBe(false)
		expect(cols.actualR.notNull).toBe(false)
	})
})

describe("fractal-plan: monthlyPlan table", () => {
	it("exports monthlyPlan with snapshot + override columns", async () => {
		const schema = await import("@/db/schema")
		expect(schema.monthlyPlan).toBeDefined()
		const cols = getTableColumns(schema.monthlyPlan)
		expect(cols.id).toBeDefined()
		expect(cols.quarterlyPlanId).toBeDefined()
		expect(cols.year).toBeDefined()
		expect(cols.month).toBeDefined()
		expect(cols.snapshotCapitalCents).toBeDefined()
		expect(cols.snapshotOneRCents).toBeDefined()
		expect(cols.snapshotTierIndex).toBeDefined()
		expect(cols.snapshotComputedAt).toBeDefined()
		expect(cols.snapshotReason).toBeDefined()
		expect(cols.overrideDailyLossR).toBeDefined()
		expect(cols.overrideWeeklyLossR).toBeDefined()
		expect(cols.overrideMonthlyLossR).toBeDefined()
		expect(cols.overrideDailyTargetR).toBeDefined()
		expect(cols.overrideActivePlaybookIds).toBeDefined()
		expect(cols.monthlyTaxLedgerId).toBeDefined()
		expect(cols.monthlyGoalCents).toBeDefined()
		expect(cols.intentNotes).toBeDefined()
		expect(cols.postMortemNotes).toBeDefined()
	})

	it("makes snapshot fields not-null and overrides nullable", async () => {
		const schema = await import("@/db/schema")
		const cols = getTableColumns(schema.monthlyPlan)
		expect(cols.snapshotCapitalCents.notNull).toBe(true)
		expect(cols.snapshotOneRCents.notNull).toBe(true)
		expect(cols.snapshotTierIndex.notNull).toBe(true)
		expect(cols.snapshotComputedAt.notNull).toBe(true)
		expect(cols.snapshotReason.notNull).toBe(true)
		expect(cols.overrideDailyLossR.notNull).toBe(false)
		expect(cols.overrideWeeklyLossR.notNull).toBe(false)
		expect(cols.overrideMonthlyLossR.notNull).toBe(false)
		expect(cols.overrideDailyTargetR.notNull).toBe(false)
		expect(cols.monthlyTaxLedgerId.notNull).toBe(false)
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
