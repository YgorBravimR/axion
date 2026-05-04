/**
 * Tests for forceTierReeval server action.
 * Phase 3 Task 8.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const {
	mockRequireAuth,
	mockYearlyFindFirst,
	mockMonthlyFindFirst,
	mockEvaluateMonthStart,
	mockDbInsert,
} = vi.hoisted(() => ({
	mockRequireAuth: vi.fn(),
	mockYearlyFindFirst: vi.fn(),
	mockMonthlyFindFirst: vi.fn(),
	mockEvaluateMonthStart: vi.fn(),
	mockDbInsert: vi.fn(),
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: mockRequireAuth,
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			yearlyPlans: { findFirst: mockYearlyFindFirst },
			monthlyPlan: { findFirst: mockMonthlyFindFirst },
		},
		insert: mockDbInsert,
	},
}))

vi.mock("@/lib/fractal-plan/tier-eval", () => ({
	evaluateMonthStart: mockEvaluateMonthStart,
}))

import { forceTierReeval } from "@/app/actions/fractal-plan/tier"

describe("forceTierReeval", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockRequireAuth.mockResolvedValue({ accountId: "acc-uuid-1", userId: "user-1" })
	})

	it("returns error when account has no yearly plan", async () => {
		mockYearlyFindFirst.mockResolvedValue(undefined)

		const result = await forceTierReeval({ asOf: new Date("2026-03-01") })
		expect(result.status).toBe("error")
		expect(result.errors?.[0].code).toBe("NO_YEARLY_PLAN")
	})

	it("returns success with recomputed tier when plan exists", async () => {
		mockYearlyFindFirst.mockResolvedValue({
			id: "y1",
			year: 2026,
			ladderRules: [{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 5_000 }],
		})
		mockMonthlyFindFirst.mockResolvedValue({
			id: "m1",
			snapshotCapitalCents: 100_000,
			snapshotTierIndex: 1,
			snapshotOneRCents: 5_000,
		})
		mockEvaluateMonthStart.mockReturnValue({
			snapshotCapitalCents: 100_000,
			snapshotOneRCents: 5_000,
			snapshotTierIndex: 1,
			snapshotComputedAt: new Date("2026-03-01"),
			snapshotReason: "manual",
		})
		const mockReturning = vi.fn().mockResolvedValue([{}])
		const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
		mockDbInsert.mockReturnValue({ values: mockValues })

		const result = await forceTierReeval({ asOf: new Date("2026-03-01") })
		expect(result.status).toBe("success")
		expect(result.data?.newTierIndex).toBeDefined()
	})
})
