import { describe, it, expect, vi, beforeEach } from "vitest"

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
import { resolveBehavior } from "@/lib/fractal-plan/resolver"

const mockedDb = db as unknown as {
	query: Record<string, { findFirst: ReturnType<typeof vi.fn> }>
}

const baseYear = {
	id: "y1",
	defaultRiskProfileId: null,
	defaultMaxConsecutiveLosses: null,
	defaultAllowSecondOpAfterLoss: null,
	defaultReduceRiskAfterLoss: null,
	defaultRiskReductionFactor: null,
	defaultIncreaseRiskAfterWin: null,
	defaultCapRiskAfterWin: null,
	defaultProfitReinvestmentPercent: null,
}

const baseMonth = {
	id: "m1",
	overrideRiskProfileId: null,
	overrideMaxConsecutiveLosses: null,
	overrideAllowSecondOpAfterLoss: null,
	overrideReduceRiskAfterLoss: null,
	overrideRiskReductionFactor: null,
	overrideIncreaseRiskAfterWin: null,
	overrideCapRiskAfterWin: null,
	overrideProfitReinvestmentPercent: null,
}

const baseWeek = {
	id: "w1",
	overrideMaxConsecutiveLosses: null,
	overrideAllowSecondOpAfterLoss: null,
}

const baseDay = {
	id: "d1",
	overrideMaxConsecutiveLosses: null,
	overrideAllowSecondOpAfterLoss: null,
}

describe("resolveBehavior", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
	})

	it("returns fallback when no rows exist anywhere", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue(undefined)
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue(undefined)
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(undefined)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(undefined)

		const result = await resolveBehavior({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.riskProfileId).toBeNull()
		expect(result.riskProfileId_provenance).toBe("fallback")
		expect(result.maxConsecutiveLosses).toBeNull()
		expect(result.maxConsecutiveLosses_provenance).toBe("fallback")
		expect(result.allowSecondOpAfterLoss).toBe(false)
		expect(result.allowSecondOpAfterLoss_provenance).toBe("fallback")
		expect(result.reduceRiskAfterLoss).toBe(false)
		expect(result.riskReductionFactor).toBeNull()
		expect(result.profitReinvestmentPercent).toBeNull()
	})

	it("reads year defaults when month/week/day are unset", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			...baseYear,
			defaultRiskProfileId: "profile-y",
			defaultMaxConsecutiveLosses: 3,
			defaultAllowSecondOpAfterLoss: true,
			defaultReduceRiskAfterLoss: true,
			defaultRiskReductionFactor: "0.50",
			defaultIncreaseRiskAfterWin: true,
			defaultCapRiskAfterWin: false,
			defaultProfitReinvestmentPercent: "25.00",
		})
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue(baseMonth)
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(baseWeek)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(baseDay)

		const result = await resolveBehavior({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.riskProfileId).toBe("profile-y")
		expect(result.riskProfileId_provenance).toBe("year")
		expect(result.maxConsecutiveLosses).toBe(3)
		expect(result.maxConsecutiveLosses_provenance).toBe("year")
		expect(result.allowSecondOpAfterLoss).toBe(true)
		expect(result.allowSecondOpAfterLoss_provenance).toBe("year")
		expect(result.reduceRiskAfterLoss).toBe(true)
		expect(result.riskReductionFactor).toBe(0.5)
		expect(result.riskReductionFactor_provenance).toBe("year")
		expect(result.increaseRiskAfterWin).toBe(true)
		expect(result.profitReinvestmentPercent).toBe(25)
	})

	it("month override beats year for both within-session and strategy fields", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			...baseYear,
			defaultRiskProfileId: "profile-y",
			defaultMaxConsecutiveLosses: 3,
			defaultReduceRiskAfterLoss: false,
		})
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			...baseMonth,
			overrideRiskProfileId: "profile-m",
			overrideMaxConsecutiveLosses: 2,
			overrideReduceRiskAfterLoss: true,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(baseWeek)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(baseDay)

		const result = await resolveBehavior({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.riskProfileId).toBe("profile-m")
		expect(result.riskProfileId_provenance).toBe("month")
		expect(result.maxConsecutiveLosses).toBe(2)
		expect(result.maxConsecutiveLosses_provenance).toBe("month")
		expect(result.reduceRiskAfterLoss).toBe(true)
		expect(result.reduceRiskAfterLoss_provenance).toBe("month")
	})

	it("week override beats month/year for within-session fields only", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			...baseYear,
			defaultMaxConsecutiveLosses: 3,
			defaultAllowSecondOpAfterLoss: true,
		})
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			...baseMonth,
			overrideMaxConsecutiveLosses: 2,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue({
			...baseWeek,
			overrideMaxConsecutiveLosses: 1,
			overrideAllowSecondOpAfterLoss: false,
		})
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(baseDay)

		const result = await resolveBehavior({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.maxConsecutiveLosses).toBe(1)
		expect(result.maxConsecutiveLosses_provenance).toBe("week")
		expect(result.allowSecondOpAfterLoss).toBe(false)
		expect(result.allowSecondOpAfterLoss_provenance).toBe("week")
	})

	it("day override beats all higher levels for within-session fields", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			...baseYear,
			defaultMaxConsecutiveLosses: 3,
		})
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			...baseMonth,
			overrideMaxConsecutiveLosses: 2,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue({
			...baseWeek,
			overrideMaxConsecutiveLosses: 1,
		})
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue({
			...baseDay,
			overrideMaxConsecutiveLosses: 0,
			overrideAllowSecondOpAfterLoss: true,
		})

		const result = await resolveBehavior({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.maxConsecutiveLosses).toBe(0)
		expect(result.maxConsecutiveLosses_provenance).toBe("day")
		expect(result.allowSecondOpAfterLoss).toBe(true)
		expect(result.allowSecondOpAfterLoss_provenance).toBe("day")
	})

	it("strategy fields ignore week/day rows even if those levels existed", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			...baseYear,
			defaultRiskProfileId: "profile-y",
			defaultIncreaseRiskAfterWin: false,
		})
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			...baseMonth,
			overrideRiskProfileId: null,
			overrideIncreaseRiskAfterWin: null,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(baseWeek)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(baseDay)

		const result = await resolveBehavior({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.riskProfileId).toBe("profile-y")
		expect(result.riskProfileId_provenance).toBe("year")
		expect(result.increaseRiskAfterWin).toBe(false)
		expect(result.increaseRiskAfterWin_provenance).toBe("year")
	})
})
