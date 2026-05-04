import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "acc-1", userId: "u-1" }),
}))
vi.mock("@/lib/fractal-plan/auto-seed", () => ({
	autoSeedYearlyTree: vi.fn().mockResolvedValue({
		yearlyPlanId: "y-1",
		quarterlyPlanIds: ["q1", "q2", "q3", "q4"],
		monthlyPlanIds: Array.from({ length: 12 }, (_, i) => `m${i}`),
	}),
}))

import { createYearlyPlanV2 } from "@/app/actions/fractal-plan/yearly"

describe("createYearlyPlanV2", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns success with the new yearly plan id", async () => {
		const result = await createYearlyPlanV2({
			year: 2026,
			initialCapitalCents: 600_000,
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			defaultDailyLossR: 3,
			defaultWeeklyLossR: 6,
			defaultMonthlyLossR: 10,
			defaultDailyTargetR: 2,
			drawdownTriggerThresholdR: 2,
			tradingDaysPerWeek: 5,
		})
		expect(result.status).toBe("success")
		expect(result.data?.yearlyPlanId).toBe("y-1")
	})

	it("returns error on invalid input (missing ladder rules)", async () => {
		const result = await createYearlyPlanV2({
			year: 2026,
			initialCapitalCents: 600_000,
			ladderRules: [],
			defaultDailyLossR: 3,
			defaultWeeklyLossR: 6,
			defaultMonthlyLossR: 10,
			defaultDailyTargetR: 2,
			drawdownTriggerThresholdR: 2,
			tradingDaysPerWeek: 5,
		} as unknown as Parameters<typeof createYearlyPlanV2>[0])
		expect(result.status).toBe("error")
	})
})
