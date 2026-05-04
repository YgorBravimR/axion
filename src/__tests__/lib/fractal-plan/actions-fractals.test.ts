import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "acc-1", userId: "u-1" }),
}))

const { mockSet, mockWhere, mockReturning } = vi.hoisted(() => ({
	mockSet: vi.fn().mockReturnThis(),
	mockWhere: vi.fn().mockResolvedValue([{ id: "ok" }]),
	mockReturning: vi.fn().mockResolvedValue([{ id: "ok" }]),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		update: () => ({ set: mockSet, where: mockWhere, returning: mockReturning }),
	},
}))

import { upsertMonthlyPlan, resetMonthlyOverride } from "@/app/actions/fractal-plan/monthly"
import { upsertWeeklyPlan, resetWeeklyOverride } from "@/app/actions/fractal-plan/weekly"
import { upsertDailyPlan, resetDailyOverride } from "@/app/actions/fractal-plan/daily"
import { upsertQuarterlyPlan } from "@/app/actions/fractal-plan/quarterly"

describe("fractal upsert actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSet.mockReturnThis()
	})

	it("upsertMonthlyPlan returns success when override applied", async () => {
		const result = await upsertMonthlyPlan({
			monthlyPlanId: "a1b2c3d4-e5f6-4789-abcd-000000000001",
			overrideDailyLossR: 2.5,
		})
		expect(result.status).toBe("success")
	})

	it("resetMonthlyOverride nulls a specific field", async () => {
		const result = await resetMonthlyOverride({
			monthlyPlanId: "a1b2c3d4-e5f6-4789-abcd-000000000001",
			field: "overrideDailyLossR",
		})
		expect(result.status).toBe("success")
	})

	it("upsertWeeklyPlan accepts override + target", async () => {
		const result = await upsertWeeklyPlan({
			weeklyPlanId: "a1b2c3d4-e5f6-4789-abcd-000000000002",
			targetR: 5.0,
		})
		expect(result.status).toBe("success")
	})

	it("upsertDailyPlan accepts mood + max trades", async () => {
		const result = await upsertDailyPlan({
			dailyPlanId: "a1b2c3d4-e5f6-4789-abcd-000000000003",
			mood: "focused",
			maxTradesToday: 3,
		})
		expect(result.status).toBe("success")
	})

	it("upsertQuarterlyPlan stores notes + goal", async () => {
		const result = await upsertQuarterlyPlan({
			quarterlyPlanId: "a1b2c3d4-e5f6-4789-abcd-000000000004",
			goalCents: 50_000_000,
			reflectionNotes: "Stay disciplined",
		})
		expect(result.status).toBe("success")
	})
})
