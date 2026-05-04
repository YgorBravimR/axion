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
import { resolveDay, resolveMonth, resolveYear } from "@/lib/fractal-plan/resolver"

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

describe("resolveMonth", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns year default monthlyWinR when present (only year-level for win)", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultMonthlyWinR: "8.00",
			defaultMonthlyLossR: "5.00",
			targetWeeksToYearly: null,
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({ id: "m1", overrideMonthlyLossR: null })

		const result = await resolveMonth({ accountId: "acc-1", year: 2026, month: 3 })
		expect(result.monthlyWinR).toBe(8)
		expect(result.monthlyWinR_provenance).toBe("year")
		expect(result.monthlyLossR).toBe(5)
		expect(result.monthlyLossR_provenance).toBe("year")
	})

	it("uses month overrideMonthlyLossR when present", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultMonthlyWinR: "8.00",
			defaultMonthlyLossR: "5.00",
			targetWeeksToYearly: null,
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({ id: "m1", overrideMonthlyLossR: "4.00" })

		const result = await resolveMonth({ accountId: "acc-1", year: 2026, month: 3 })
		expect(result.monthlyLossR).toBe(4)
		expect(result.monthlyLossR_provenance).toBe("month")
	})

	it("returns null + provenance 'none' when no level has a value", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultMonthlyWinR: null,
			defaultMonthlyLossR: null,
			targetWeeksToYearly: null,
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({ id: "m1", overrideMonthlyLossR: null })

		const result = await resolveMonth({ accountId: "acc-1", year: 2026, month: 3 })
		expect(result.monthlyWinR).toBeNull()
		expect(result.monthlyWinR_provenance).toBe("none")
	})
})

describe("resolveYear", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns year-level defaults with provenance 'year'", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultDailyLossR: "1.50",
			defaultDailyWinR: "2.00",
			defaultWeeklyLossR: "6.00",
			defaultWeeklyWinR: "9.00",
			defaultMonthlyLossR: "8.00",
			defaultMonthlyWinR: "8.00",
		})

		const result = await resolveYear({ accountId: "acc-1", year: 2026 })
		expect(result.defaultDailyLossR).toBe(1.5)
		expect(result.defaultDailyLossR_provenance).toBe("year")
		expect(result.defaultMonthlyWinR).toBe(8)
	})

	it("returns null + 'none' when no yearly row exists", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue(undefined)

		const result = await resolveYear({ accountId: "acc-1", year: 2099 })
		expect(result.defaultDailyLossR).toBeNull()
		expect(result.defaultDailyLossR_provenance).toBe("none")
	})
})
