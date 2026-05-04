import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the db module BEFORE importing resolver.
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			yearlyPlans: { findFirst: vi.fn() },
			quarterlyPlan: { findFirst: vi.fn() },
			monthlyPlan: { findFirst: vi.fn() },
			weeklyPlan: { findFirst: vi.fn() },
			dailyPlan: { findFirst: vi.fn() },
		},
	},
}))

import { db } from "@/db/drizzle"
import { resolveDay } from "@/lib/fractal-plan/resolver"

const mockedDb = db as unknown as {
	query: Record<string, { findFirst: ReturnType<typeof vi.fn> }>
}

describe("resolveDay", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns null when no yearly plan exists for the year", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue(undefined)

		const result = await resolveDay("acc-1", new Date("2026-05-04"))
		expect(result).toBeNull()
	})

	it("falls back to year defaults when no overrides exist", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultDailyLossR: "3.00",
			defaultDailyTargetR: "2.00",
			ladderRules: [{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 5_000 }],
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			id: "m1",
			snapshotOneRCents: 5_000,
			snapshotTierIndex: 0,
			overrideDailyLossR: null,
			overrideDailyTargetR: null,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(null)

		const result = await resolveDay("acc-1", new Date("2026-05-04"))
		expect(result).not.toBeNull()
		expect(result!.dailyLossR.value).toBe("3.00")
		expect(result!.dailyLossR.source).toBe("year")
		expect(result!.oneRCents).toBe(5_000)
	})

	it("uses month override when present, marks provenance as 'month'", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultDailyLossR: "3.00",
			defaultDailyTargetR: "2.00",
			ladderRules: [{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 5_000 }],
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			id: "m1",
			snapshotOneRCents: 5_000,
			overrideDailyLossR: "2.00",
			overrideDailyTargetR: null,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(null)

		const result = await resolveDay("acc-1", new Date("2026-05-04"))
		expect(result!.dailyLossR.value).toBe("2.00")
		expect(result!.dailyLossR.source).toBe("month")
	})

	it("reads defaultDailyLossR directly (no cast) when present on yearly row", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultDailyLossR: "1.50",
			defaultDailyTargetR: "2.00",
			defaultWeeklyLossR: null,
			defaultMonthlyLossR: null,
			ladderRules: [],
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(null)

		const result = await resolveDay("acc-1", new Date("2026-01-15"))
		expect(result).not.toBeNull()
		expect(result!.dailyLossR.value).toBe("1.50")
		expect(result!.dailyLossR.source).toBe("year")
	})
})
