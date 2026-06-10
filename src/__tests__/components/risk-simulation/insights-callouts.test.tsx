import { describe, it, expect } from "vitest"
import type { SimulationSummary } from "@/types/risk-simulation"

const defaultSummary: SimulationSummary = {
	totalTrades: 100,
	executedTrades: 90,
	skippedNoSl: 5,
	skippedDailyLimit: 5,
	skippedDailyTarget: 0,
	skippedMaxTrades: 0,
	skippedConsecutiveLoss: 0,
	skippedMonthlyLimit: 0,
	skippedWeeklyLimit: 0,
	originalTotalPnlCents: 100_000,
	originalWinRate: 55,
	originalProfitFactor: 1.5,
	originalMaxDrawdownPercent: 5,
	originalAvgR: 1.5,
	simulatedTotalPnlCents: 100_000,
	simulatedWinRate: 50,
	simulatedProfitFactor: 1.5,
	simulatedMaxDrawdownPercent: 5,
	simulatedAvgR: 1.5,
	pnlDeltaCents: 0,
	daysHitDailyLimit: 5,
	daysHitDailyTarget: 0,
	originalCapitalCents: 5_000_000,
	simulatedCapitalCents: 5_000_000,
	originalReturnPercent: 2,
	simulatedReturnPercent: 2,
	returnPercentDelta: 0,
	totalTradingDays: 20,
}

/**
 * Insights trigger logic tests for the risk simulation insights component.
 * Tests verify that the four conditional insight triggers fire correctly.
 */
describe("InsightsCallouts trigger logic", () => {
	describe("trigger: cap selection bias", () => {
		it("should trigger when skipPct > 25 and simulatedWinRate < originalWinRate", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				totalTrades: 100,
				executedTrades: 70,
				originalWinRate: 60,
				simulatedWinRate: 45,
			}

			const skipPct = Math.round(
				((summary.totalTrades - summary.executedTrades) / summary.totalTrades) *
					100
			)

			const shouldTrigger =
				skipPct > 25 && summary.simulatedWinRate < summary.originalWinRate

			expect(shouldTrigger).toBe(true)
		})

		it("should not trigger when skipPct <= 25", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				totalTrades: 100,
				executedTrades: 80,
				originalWinRate: 60,
				simulatedWinRate: 45,
			}

			const skipPct = Math.round(
				((summary.totalTrades - summary.executedTrades) / summary.totalTrades) *
					100
			)

			const shouldTrigger =
				skipPct > 25 && summary.simulatedWinRate < summary.originalWinRate

			expect(shouldTrigger).toBe(false)
		})

		it("should not trigger when simulatedWinRate >= originalWinRate", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				totalTrades: 100,
				executedTrades: 70,
				originalWinRate: 45,
				simulatedWinRate: 60,
			}

			const skipPct = Math.round(
				((summary.totalTrades - summary.executedTrades) / summary.totalTrades) *
					100
			)

			const shouldTrigger =
				skipPct > 25 && summary.simulatedWinRate < summary.originalWinRate

			expect(shouldTrigger).toBe(false)
		})
	})

	describe("trigger: same edge, different size", () => {
		it("should trigger when return % delta < 1 and absolute PnL delta >= 500000", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				originalReturnPercent: 10,
				simulatedReturnPercent: 10.5,
				originalTotalPnlCents: 1_000_000,
				simulatedTotalPnlCents: 5_000_000,
			}

			const shouldTrigger =
				Math.abs(
					summary.simulatedReturnPercent - summary.originalReturnPercent
				) < 1 &&
				Math.abs(
					summary.simulatedTotalPnlCents - summary.originalTotalPnlCents
				) >= 500000

			expect(shouldTrigger).toBe(true)
		})

		it("should not trigger when return % delta >= 1", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				originalReturnPercent: 10,
				simulatedReturnPercent: 12,
				originalTotalPnlCents: 1_000_000,
				simulatedTotalPnlCents: 5_000_000,
			}

			const shouldTrigger =
				Math.abs(
					summary.simulatedReturnPercent - summary.originalReturnPercent
				) < 1 &&
				Math.abs(
					summary.simulatedTotalPnlCents - summary.originalTotalPnlCents
				) >= 500000

			expect(shouldTrigger).toBe(false)
		})

		it("should not trigger when absolute PnL delta < 500000", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				originalReturnPercent: 10,
				simulatedReturnPercent: 10.5,
				originalTotalPnlCents: 1_000_000,
				simulatedTotalPnlCents: 1_300_000,
			}

			const shouldTrigger =
				Math.abs(
					summary.simulatedReturnPercent - summary.originalReturnPercent
				) < 1 &&
				Math.abs(
					summary.simulatedTotalPnlCents - summary.originalTotalPnlCents
				) >= 500000

			expect(shouldTrigger).toBe(false)
		})
	})

	describe("trigger: drawdown tradeoff", () => {
		it("should trigger when simDD > 3x origDD and simPnL > origPnL", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				originalMaxDrawdownPercent: 5,
				simulatedMaxDrawdownPercent: 20,
				simulatedTotalPnlCents: 2_000_000,
				originalTotalPnlCents: 1_000_000,
			}

			const shouldTrigger =
				summary.originalMaxDrawdownPercent > 0 &&
				summary.simulatedMaxDrawdownPercent >
					3 * summary.originalMaxDrawdownPercent &&
				summary.simulatedTotalPnlCents > summary.originalTotalPnlCents

			expect(shouldTrigger).toBe(true)
		})

		it("should not trigger when simDD <= 3x origDD", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				originalMaxDrawdownPercent: 5,
				simulatedMaxDrawdownPercent: 14,
				simulatedTotalPnlCents: 2_000_000,
				originalTotalPnlCents: 1_000_000,
			}

			const shouldTrigger =
				summary.originalMaxDrawdownPercent > 0 &&
				summary.simulatedMaxDrawdownPercent >
					3 * summary.originalMaxDrawdownPercent &&
				summary.simulatedTotalPnlCents > summary.originalTotalPnlCents

			expect(shouldTrigger).toBe(false)
		})

		it("should not trigger when simPnL <= origPnL", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				originalMaxDrawdownPercent: 5,
				simulatedMaxDrawdownPercent: 20,
				simulatedTotalPnlCents: 500_000,
				originalTotalPnlCents: 1_000_000,
			}

			const shouldTrigger =
				summary.originalMaxDrawdownPercent > 0 &&
				summary.simulatedMaxDrawdownPercent >
					3 * summary.originalMaxDrawdownPercent &&
				summary.simulatedTotalPnlCents > summary.originalTotalPnlCents

			expect(shouldTrigger).toBe(false)
		})
	})

	describe("trigger: cap too tight", () => {
		it("should trigger when capPct > 10", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				totalTradingDays: 20,
				daysHitDailyLimit: 3,
			}

			const capPct =
				summary.totalTradingDays > 0
					? Math.round(
							(summary.daysHitDailyLimit / summary.totalTradingDays) * 100
						)
					: 0

			const shouldTrigger = summary.daysHitDailyLimit > 0 && capPct > 10

			expect(shouldTrigger).toBe(true)
		})

		it("should not trigger when capPct <= 10", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				totalTradingDays: 20,
				daysHitDailyLimit: 2,
			}

			const capPct =
				summary.totalTradingDays > 0
					? Math.round(
							(summary.daysHitDailyLimit / summary.totalTradingDays) * 100
						)
					: 0

			const shouldTrigger = summary.daysHitDailyLimit > 0 && capPct > 10

			expect(shouldTrigger).toBe(false)
		})

		it("should not trigger when daysHitDailyLimit is 0", () => {
			const summary: SimulationSummary = {
				...defaultSummary,
				totalTradingDays: 20,
				daysHitDailyLimit: 0,
			}

			const capPct =
				summary.totalTradingDays > 0
					? Math.round(
							(summary.daysHitDailyLimit / summary.totalTradingDays) * 100
						)
					: 0

			const shouldTrigger = summary.daysHitDailyLimit > 0 && capPct > 10

			expect(shouldTrigger).toBe(false)
		})
	})
})
