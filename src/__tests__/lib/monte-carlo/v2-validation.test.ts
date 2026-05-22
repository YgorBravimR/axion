import { describe, it, expect } from "vitest"
import type { SimulationParamsV2 } from "@/types/monte-carlo"
import {
	validateV2SimulationBudget,
	isV2ProfileComplete,
	getSimulationTimeframe,
	estimateV2TradeCount,
	validateV2SimulationSetup,
} from "@/lib/monte-carlo/v2-validation"

const createMockV2Params = (
	overrides: Partial<SimulationParamsV2> = {}
): SimulationParamsV2 => ({
	profile: {
		name: "Balanced",
		baseRiskCents: 100000,
		rewardRiskRatio: 1.5,
		winRate: 55,
		breakevenRate: 10,
		dailyTargetCents: null,
		dailyLossLimitCents: 500000,
		lossRecoverySteps: [],
		executeAllRegardless: true,
		stopAfterSequence: false,
		compoundingRiskPercent: 100,
		stopOnFirstLoss: false,
		weeklyLossLimitCents: null,
		monthlyLossLimitCents: 2000000,
		tradingDaysPerMonth: 20,
		tradingDaysPerWeek: 5,
		commissionPerTradeCents: 50,
		riskSizingMode: "fixed",
		riskPercent: null,
		fixedRatioDeltaCents: null,
		fixedRatioBaseContractRiskCents: null,
		kellyDivisor: null,
		limitMode: "fixedCents",
		dailyLossPercent: null,
		weeklyLossPercent: null,
		monthlyLossPercent: null,
		dailyLossR: null,
		weeklyLossR: null,
		monthlyLossR: null,
		drawdownTiers: [],
		drawdownRecoveryPercent: 50,
		consecutiveLossRules: [],
	},
	simulationCount: 1000,
	initialBalance: 100000,
	monthsToTrade: 12,
	...overrides,
})

describe("v2-validation", () => {
	describe("validateV2SimulationBudget", () => {
		it("should pass valid parameters within budget", () => {
			const params = createMockV2Params({
				simulationCount: 1000,
				monthsToTrade: 12,
			})

			expect(() => validateV2SimulationBudget(params)).not.toThrow()
		})

		it("should throw when simulation budget exceeded", () => {
			const params = createMockV2Params({
				simulationCount: 50000,
				monthsToTrade: 48,
			})

			expect(() => validateV2SimulationBudget(params)).toThrow()
		})

		it("should return the same params when valid", () => {
			const params = createMockV2Params()
			const result = validateV2SimulationBudget(params)

			expect(result).toBe(params)
		})
	})

	describe("isV2ProfileComplete", () => {
		it("should return true for complete profile", () => {
			const params = createMockV2Params()

			expect(isV2ProfileComplete(params.profile)).toBe(true)
		})

		it("should return false when name is missing", () => {
			const params = createMockV2Params({
				profile: { ...createMockV2Params().profile, name: null as never },
			})

			expect(isV2ProfileComplete(params.profile)).toBe(false)
		})

		it("should return false when baseRiskCents is missing", () => {
			const params = createMockV2Params({
				profile: {
					...createMockV2Params().profile,
					baseRiskCents: null as never,
				},
			})

			expect(isV2ProfileComplete(params.profile)).toBe(false)
		})

		it("should return false when winRate is missing", () => {
			const params = createMockV2Params({
				profile: { ...createMockV2Params().profile, winRate: null as never },
			})

			expect(isV2ProfileComplete(params.profile)).toBe(false)
		})
	})

	describe("getSimulationTimeframe", () => {
		it("should extract timeframe from params", () => {
			const params = createMockV2Params({
				monthsToTrade: 24,
				profile: { ...createMockV2Params().profile, tradingDaysPerMonth: 21 },
			})

			const timeframe = getSimulationTimeframe(params)

			expect(timeframe.monthsToTrade).toBe(24)
			expect(timeframe.tradingDaysPerMonth).toBe(21)
		})

		it("should use defaults when not specified", () => {
			const params = createMockV2Params({
				monthsToTrade: undefined as never,
				profile: {
					...createMockV2Params().profile,
					tradingDaysPerMonth: undefined as never,
				},
			})

			const timeframe = getSimulationTimeframe(params)

			expect(timeframe.monthsToTrade).toBe(12)
			expect(timeframe.tradingDaysPerMonth).toBe(20)
		})
	})

	describe("estimateV2TradeCount", () => {
		it("should estimate trade count based on timeframe", () => {
			const params = createMockV2Params({
				monthsToTrade: 12,
				profile: { ...createMockV2Params().profile, tradingDaysPerMonth: 20 },
			})

			const estimate = estimateV2TradeCount(params)

			// 12 months * 20 days * 50 trades per day = 12,000
			expect(estimate).toBe(12000)
		})

		it("should handle custom trading days per month", () => {
			const params = createMockV2Params({
				monthsToTrade: 1,
				profile: { ...createMockV2Params().profile, tradingDaysPerMonth: 21 },
			})

			const estimate = estimateV2TradeCount(params)

			// 1 month * 21 days * 50 trades = 1,050
			expect(estimate).toBe(1050)
		})
	})

	describe("validateV2SimulationSetup", () => {
		it("should return valid for good parameters", () => {
			const params = createMockV2Params()

			const result = validateV2SimulationSetup(params)

			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("should reject simulationCount < 100", () => {
			const params = createMockV2Params({ simulationCount: 50 })

			const result = validateV2SimulationSetup(params)

			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("at least 100"))).toBe(true)
		})

		it("should reject simulationCount > 50,000", () => {
			const params = createMockV2Params({ simulationCount: 60000 })

			const result = validateV2SimulationSetup(params)

			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("exceeds maximum"))).toBe(
				true
			)
		})

		it("should reject invalid initial balance", () => {
			const params = createMockV2Params({ initialBalance: -100 })

			const result = validateV2SimulationSetup(params)

			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("positive"))).toBe(true)
		})

		it("should reject invalid months to trade", () => {
			const params = createMockV2Params({ monthsToTrade: -1 })

			const result = validateV2SimulationSetup(params)

			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("positive"))).toBe(true)
		})

		it("should collect multiple errors", () => {
			const params = createMockV2Params({
				simulationCount: 1,
				initialBalance: -100,
				monthsToTrade: 0,
			})

			const result = validateV2SimulationSetup(params)

			expect(result.valid).toBe(false)
			expect(result.errors.length).toBeGreaterThan(1)
		})
	})
})
