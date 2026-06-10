import { describe, expect, it } from "vitest"
import {
	deriveMonthGoal,
	sumWeekTargetRs,
} from "@/lib/fractal-plan/derive-goal"

describe("derive-goal", () => {
	describe("sumWeekTargetRs", () => {
		it("sums numeric week targets", () => {
			expect(sumWeekTargetRs(["1.5", "2.0", "1.0"])).toBe(4.5)
		})

		it("ignores null values", () => {
			expect(sumWeekTargetRs(["1.5", null, "2.0"])).toBe(3.5)
		})

		it("handles all nulls", () => {
			expect(sumWeekTargetRs([null, null, null])).toBe(0)
		})

		it("handles non-numeric strings", () => {
			expect(sumWeekTargetRs(["invalid", "1.5"])).toBe(1.5)
		})
	})

	describe("deriveMonthGoal", () => {
		it("returns manual goal when set and > 0", () => {
			const result = deriveMonthGoal({
				manualGoalCents: 50000,
				weekTargetRs: ["1.0", "1.0"],
				snapshotOneRCents: 100,
				cascadeDailyTargetR: "2.0",
				totalTradingDays: 22,
			})
			expect(result.planGoalCents).toBe(50000)
			expect(result.planGoalSource).toBe("manual")
		})

		it("derives goal from week targets when manual is null", () => {
			const result = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: ["1.0", "1.0", "1.0", "1.0"],
				snapshotOneRCents: 10000,
				cascadeDailyTargetR: "2.0",
				totalTradingDays: 22,
			})
			expect(result.planGoalCents).toBe(40000)
			expect(result.planGoalSource).toBe("weeks")
		})

		it("derives from cascade when weeks sum is 0", () => {
			const result = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: [null, null],
				snapshotOneRCents: 10000,
				cascadeDailyTargetR: "2.0",
				totalTradingDays: 22,
				assertivityPct: 100,
			})
			expect(result.planGoalCents).toBe(440000)
			expect(result.planGoalSource).toBe("default")
		})

		it("returns none when no source is available", () => {
			const result = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: [null],
				snapshotOneRCents: 0,
				cascadeDailyTargetR: null,
				totalTradingDays: 22,
			})
			expect(result.planGoalCents).toBeNull()
			expect(result.planGoalSource).toBe("none")
		})

		it("applies assertivity factor to cascade", () => {
			const result = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: [null],
				snapshotOneRCents: 10000,
				cascadeDailyTargetR: "1.0",
				totalTradingDays: 20,
				assertivityPct: 50,
			})
			expect(result.planGoalCents).toBe(100000)
			expect(result.planGoalSource).toBe("default")
		})

		it("defaults assertivityPct to 100 if not provided", () => {
			const result = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: [null],
				snapshotOneRCents: 10000,
				cascadeDailyTargetR: "1.0",
				totalTradingDays: 20,
			})
			expect(result.planGoalCents).toBe(200000)
		})

		it("clamps assertivityPct to 1-100 range", () => {
			const result1 = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: [null],
				snapshotOneRCents: 10000,
				cascadeDailyTargetR: "1.0",
				totalTradingDays: 20,
				assertivityPct: 200,
			})
			expect(result1.planGoalCents).toBe(200000)

			const result2 = deriveMonthGoal({
				manualGoalCents: null,
				weekTargetRs: [null],
				snapshotOneRCents: 10000,
				cascadeDailyTargetR: "1.0",
				totalTradingDays: 20,
				assertivityPct: -10,
			})
			expect(result2.planGoalCents).toBe(2000)
		})
	})
})
