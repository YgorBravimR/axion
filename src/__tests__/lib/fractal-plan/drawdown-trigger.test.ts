import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockMonthlyFindFirst, mockYearlyFindFirst, mockSet, mockWhere, mockValues } = vi.hoisted(() => ({
	mockMonthlyFindFirst: vi.fn(),
	mockYearlyFindFirst: vi.fn(),
	mockSet: vi.fn().mockReturnThis(),
	mockWhere: vi.fn().mockResolvedValue(undefined),
	mockValues: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			monthlyPlan: { findFirst: mockMonthlyFindFirst },
			yearlyPlans: { findFirst: mockYearlyFindFirst },
		},
		update: () => ({ set: mockSet, where: mockWhere }),
		insert: () => ({ values: mockValues }),
	},
}))

import { checkDrawdownTrigger } from "@/lib/fractal-plan/drawdown-trigger"

describe("checkDrawdownTrigger", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSet.mockReturnThis()
	})

	it("returns no-op when current capital is within tier", async () => {
		mockMonthlyFindFirst.mockResolvedValue({
			id: "m1",
			snapshotCapitalCents: 600_000,
			snapshotOneRCents: 10_000,
			snapshotTierIndex: 1,
			quarterlyPlanId: "q1",
		})
		mockYearlyFindFirst.mockResolvedValue({
			id: "y1",
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 500_000, oneRCents: 5_000 },
				{ minCapitalCents: 500_001, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			drawdownTriggerThresholdR: "2.00",
		})
		const result = await checkDrawdownTrigger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			currentCapitalCents: 700_000,
		})
		expect(result).toBeNull()
	})

	it("writes snapshot + tier_change_log when trigger fires", async () => {
		mockMonthlyFindFirst.mockResolvedValue({
			id: "m1",
			snapshotCapitalCents: 600_000,
			snapshotOneRCents: 10_000,
			snapshotTierIndex: 1,
			quarterlyPlanId: "q1",
		})
		mockYearlyFindFirst.mockResolvedValue({
			id: "y1",
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 500_000, oneRCents: 5_000 },
				{ minCapitalCents: 500_001, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			drawdownTriggerThresholdR: "2.00",
		})
		const result = await checkDrawdownTrigger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			currentCapitalCents: 470_000,  // 30k below floor → > 2R × 10k = 20k threshold
		})
		expect(result).not.toBeNull()
		expect(result!.toTierIndex).toBe(0)
		expect(mockSet).toHaveBeenCalled()  // snapshot updated
		expect(mockValues).toHaveBeenCalled()  // tier_change_log row inserted
	})
})
