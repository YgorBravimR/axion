import { describe, it, expect, vi, beforeEach } from "vitest"

const mockTx = {
	insert: vi.fn().mockReturnThis(),
	values: vi.fn().mockReturnThis(),
	returning: vi.fn(),
}

vi.mock("@/db/drizzle", () => ({
	db: {
		transaction: vi.fn(async (cb: (_tx: typeof mockTx) => unknown) =>
			cb(mockTx)
		),
	},
}))

import { autoSeedYearlyTree } from "@/lib/fractal-plan/auto-seed"

describe("autoSeedYearlyTree", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Each insert returns rows; sequence: yearly → 4 quarters → 12 months → weeks
		mockTx.returning
			.mockResolvedValueOnce([{ id: "y1" }])
			.mockResolvedValueOnce([
				{ id: "q1" },
				{ id: "q2" },
				{ id: "q3" },
				{ id: "q4" },
			])
			.mockResolvedValueOnce(
				Array.from({ length: 12 }, (_, i) => ({
					id: `m${i + 1}`,
					month: i + 1,
				}))
			)
			.mockResolvedValueOnce([]) // weekly inserts
	})

	it("seeds 4 quarterly + 12 monthly rows under one transaction", async () => {
		const result = await autoSeedYearlyTree({
			accountId: "acc-1",
			year: 2026,
			initialCapitalCents: 600_000,
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			defaultDailyLossR: 3.0,
			defaultDailyWinR: 2.0,
			defaultWeeklyLossR: 6.0,
			defaultWeeklyWinR: 4.0,
			defaultMonthlyLossR: 10.0,
			defaultMonthlyWinR: 8.0,
			drawdownTriggerThresholdR: -10.0,
			tradingDaysPerWeek: 5,
			now: new Date("2026-01-01T00:00:00Z"),
		})

		expect(result.yearlyPlanId).toBe("y1")
		expect(result.quarterlyPlanIds).toHaveLength(4)
		expect(result.monthlyPlanIds).toHaveLength(12)
		expect(mockTx.insert).toHaveBeenCalled()
	})
})
