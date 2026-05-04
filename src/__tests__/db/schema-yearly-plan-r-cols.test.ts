import { describe, it, expect } from "vitest"
import { getTableColumns } from "drizzle-orm"
import * as schema from "@/db/schema"

describe("yearlyPlans cascade-default R columns (Phase 3)", () => {
	const cols = getTableColumns(schema.yearlyPlans)

	it("has nullable defaultDailyLossR", () => {
		expect(cols.defaultDailyLossR).toBeDefined()
		expect(cols.defaultDailyLossR.notNull).toBe(false)
	})

	it("has nullable defaultDailyWinR", () => {
		expect(cols.defaultDailyWinR).toBeDefined()
		expect(cols.defaultDailyWinR.notNull).toBe(false)
	})

	it("has nullable defaultWeeklyLossR", () => {
		expect(cols.defaultWeeklyLossR).toBeDefined()
		expect(cols.defaultWeeklyLossR.notNull).toBe(false)
	})

	it("has nullable defaultWeeklyWinR", () => {
		expect(cols.defaultWeeklyWinR).toBeDefined()
		expect(cols.defaultWeeklyWinR.notNull).toBe(false)
	})

	it("has nullable defaultMonthlyLossR", () => {
		expect(cols.defaultMonthlyLossR).toBeDefined()
		expect(cols.defaultMonthlyLossR.notNull).toBe(false)
	})

	it("has nullable defaultMonthlyWinR", () => {
		expect(cols.defaultMonthlyWinR).toBeDefined()
		expect(cols.defaultMonthlyWinR.notNull).toBe(false)
	})

	it("has nullable targetMonthsToYearly", () => {
		expect(cols.targetMonthsToYearly).toBeDefined()
		expect(cols.targetMonthsToYearly.notNull).toBe(false)
	})

	it("has nullable targetWeeksToYearly", () => {
		expect(cols.targetWeeksToYearly).toBeDefined()
		expect(cols.targetWeeksToYearly.notNull).toBe(false)
	})
})
