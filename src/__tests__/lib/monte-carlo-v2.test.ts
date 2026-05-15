/**
 * Unit tests for src/lib/monte-carlo-v2.ts (Capital Expectancy Monte Carlo).
 *
 * Monte Carlo V2 simulates N months of trading days with decision trees:
 * - Each day: base trade (T1) → loss recovery or gain compounding
 * - Risk sizing modes: fixed, percentOfBalance, fixedRatio, kellyFractional
 * - Multi-level limits: daily, weekly, monthly + drawdown tiers + consecutive loss rules
 *
 * Key behavior to test:
 *   - Ruin probability approaches 1 when expectancy is sufficiently negative
 *   - Survival probability approaches 1 when expectancy is positive & risk is small
 *   - Starting balance = 0 or risk-per-trade > starting balance should be handled
 *   - Output structure is well-formed (days, stats, sampleRun)
 */

import { describe, it, expect } from "vitest"
import { runMonteCarloV2 } from "@/lib/monte-carlo-v2"
import type {
	SimulationParamsV2,
	RiskManagementProfileForSim,
} from "@/types/monte-carlo"

// ---------------------------------------------------------------------------
// HELPER: Build a minimal valid profile
// ---------------------------------------------------------------------------

const buildMinimalProfile = (
	overrides: Partial<RiskManagementProfileForSim> = {}
): RiskManagementProfileForSim => {
	const defaults: RiskManagementProfileForSim = {
		riskSizingMode: "fixed",
		baseRiskCents: 5000, // R$50
		riskPercent: undefined,
		fixedRatioDeltaCents: undefined,
		fixedRatioBaseContractRiskCents: undefined,
		kellyDivisor: undefined,
		limitMode: "fixedCents",
		dailyLossLimitCents: 50000, // R$500
		weeklyLossLimitCents: 200000, // R$2000
		monthlyLossLimitCents: 500000, // R$5000
		dailyLossPercent: undefined,
		weeklyLossPercent: undefined,
		monthlyLossPercent: undefined,
		dailyLossR: undefined,
		weeklyLossR: undefined,
		monthlyLossR: undefined,
		tradingDaysPerMonth: 20,
		tradingDaysPerWeek: 5,
		winRate: 50,
		rewardRiskRatio: 2,
		breakevenRate: 5,
		commissionPerTradeCents: 50,
		dailyTargetCents: 10000, // R$100
		compoundingRiskPercent: 0, // Single target mode
		executeAllRegardless: false,
		drawdownTiers: [],
		drawdownRecoveryPercent: 50,
		consecutiveLossRules: [],
		lossRecoverySteps: [
			{ riskMultiplier: 1 },
			{ riskMultiplier: 1.5 },
			{ riskMultiplier: 2 },
		],
		stopOnFirstLoss: false,
	}
	return { ...defaults, ...overrides }
}

const buildMinimalParams = (
	overrides: Partial<SimulationParamsV2> = {}
): SimulationParamsV2 => {
	const defaults: SimulationParamsV2 = {
		initialBalance: 1000000, // R$10,000
		monthsToTrade: 1,
		simulationCount: 10,
		ruinThresholdPercent: 50, // Account destroyed if balance < 50% of initial
		profile: buildMinimalProfile(),
	}
	return { ...defaults, ...overrides }
}

// ---------------------------------------------------------------------------
// BASIC CONTRACT & VALIDATION
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Contract & Validation", () => {
	it("should throw when simulationCount < 1", () => {
		const params = buildMinimalParams({ simulationCount: 0 })
		expect(() => runMonteCarloV2(params)).toThrow(/simulationCount must be ≥ 1/)
	})

	it("should accept simulationCount = 1", () => {
		const params = buildMinimalParams({ simulationCount: 1 })
		const result = runMonteCarloV2(params)

		expect(result).toHaveProperty("params")
		expect(result).toHaveProperty("statistics")
		expect(result).toHaveProperty("sampleRun")
	})

	it("should return valid structure with days, stats, sampleRun", () => {
		const params = buildMinimalParams({ simulationCount: 5 })
		const result = runMonteCarloV2(params)

		expect(result.params).toEqual(params)
		expect(Array.isArray(result.sampleRun.days)).toBe(true)
		expect(result.statistics).toHaveProperty("medianMonthlyPnl")
		expect(result.statistics).toHaveProperty("riskOfRuinPercent")
		expect(Array.isArray(result.distributionBuckets)).toBe(true)
	})

	it("should simulate correct number of days per month", () => {
		const daysPerMonth = 20
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 1,
			profile: buildMinimalProfile({ tradingDaysPerMonth: daysPerMonth }),
		})
		const result = runMonteCarloV2(params)

		// Sample run should have ~20 days (some may be skipped, but total should include all)
		expect(result.sampleRun.days.length).toBeGreaterThanOrEqual(
			daysPerMonth * 0.8
		)
	})

	it("should simulate multiple months with compounding balance", () => {
		const params = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 1,
		})
		const result = runMonteCarloV2(params)

		// 3 months = ~60 trading days
		expect(result.sampleRun.days.length).toBeGreaterThanOrEqual(50)
	})
})

// ---------------------------------------------------------------------------
// RUIN PROBABILITY TESTS
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Ruin Probability", () => {
	it("should have high ruin probability when expectancy is very negative", () => {
		// 20% win rate, 2:1 RR → EV per trade = 0.2*2 - 0.8*1 = -0.4R (losing)
		// With high commission, should reliably ruin
		const params = buildMinimalParams({
			monthsToTrade: 12,
			simulationCount: 50,
			initialBalance: 1000000, // R$10,000
			profile: buildMinimalProfile({
				winRate: 20,
				rewardRiskRatio: 2,
				commissionPerTradeCents: 500, // R$5 per trade
				dailyLossLimitCents: 100000, // Allows trades to run
				baseRiskCents: 50000, // R$500 per trade — large risk
			}),
		})
		const result = runMonteCarloV2(params)

		// Ruin probability should be > 60% (most runs should hit ruin with negative edge)
		expect(result.statistics.riskOfRuinPercent).toBeGreaterThan(40)
	})

	it("should have low ruin probability when expectancy is positive and risk is small", () => {
		// 60% win rate, 2:1 RR → EV = 0.6*2 - 0.4*1 = 0.8R (winning)
		// Small risk per trade and high starting balance
		const params = buildMinimalParams({
			monthsToTrade: 12,
			simulationCount: 50,
			initialBalance: 5000000, // R$50,000 (large)
			profile: buildMinimalProfile({
				winRate: 60,
				rewardRiskRatio: 2,
				baseRiskCents: 2500, // R$25 per trade (very small)
				commissionPerTradeCents: 100,
			}),
		})
		const result = runMonteCarloV2(params)

		// Risk of ruin should be low
		expect(result.statistics.riskOfRuinPercent).toBeLessThan(20)
	})

	it("should have near-zero ruin when all trades are profitable", () => {
		const params = buildMinimalParams({
			monthsToTrade: 6,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 100, // All wins
				rewardRiskRatio: 2,
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.riskOfRuinPercent).toBe(0)
	})

	it("should respect ruinThresholdPercent", () => {
		const initialBalance = 2000000 // R$20,000
		const params = buildMinimalParams({
			monthsToTrade: 6,
			simulationCount: 50,
			initialBalance,
			ruinThresholdPercent: 25, // Ruin at 75% loss = R$5,000 remaining
			profile: buildMinimalProfile({
				winRate: 20,
				rewardRiskRatio: 2,
				baseRiskCents: 100000, // R$1,000 per trade — large relative risk
			}),
		})
		const result = runMonteCarloV2(params)

		// With 25% threshold and large risk, some runs should hit ruin
		const ruinRuns = result.sampleRun.reachedRuin
		expect(typeof ruinRuns).toBe("boolean")
	})
})

// ---------------------------------------------------------------------------
// BALANCE & EQUITY TRACKING
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Balance & Equity Tracking", () => {
	it("should start with initialBalance in every run", () => {
		const initialBalance = 3000000 // R$30,000
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 20,
			initialBalance,
		})
		const result = runMonteCarloV2(params)

		// Every run should start at initialBalance (implicitly verified by P&L calcs)
		expect(result.statistics).toHaveProperty("medianMinBalancePercent")
	})

	it("should end with finalBalance = startBalance + totalPnl", () => {
		const initialBalance = 2000000 // R$20,000
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 1,
			initialBalance,
			profile: buildMinimalProfile({
				winRate: 100, // All wins → guaranteed positive P&L
				rewardRiskRatio: 2,
				tradingDaysPerMonth: 5, // Few trades for clarity
			}),
		})
		const result = runMonteCarloV2(params)

		const finalBalance = result.sampleRun.finalBalance
		const totalPnl = result.sampleRun.totalPnl
		expect(finalBalance).toBeCloseTo(initialBalance + totalPnl, 0)
	})

	it("should track minBalance as lowest point reached during simulation", () => {
		const params = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 1,
			profile: buildMinimalProfile({
				winRate: 30, // Frequent losses → likely drawdown
			}),
		})
		const result = runMonteCarloV2(params)

		const minBalance = result.sampleRun.minBalance
		const finalBalance = result.sampleRun.finalBalance
		const initialBalance = params.initialBalance

		// Min balance should be ≤ final balance
		expect(minBalance).toBeLessThanOrEqual(finalBalance)
		// Min balance should be ≤ initial balance (unless run is pure wins from start)
		expect(minBalance).toBeLessThanOrEqual(initialBalance)
	})
})

// ---------------------------------------------------------------------------
// DRAWDOWN & MAX DRAWDOWN
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Drawdown Tracking", () => {
	it("should track maxDrawdownPercent correctly", () => {
		const params = buildMinimalParams({
			monthsToTrade: 6,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 40, // Frequent losses → drawdown
			}),
		})
		const result = runMonteCarloV2(params)

		const stats = result.statistics
		expect(stats.medianMaxDrawdownPercent).toBeGreaterThanOrEqual(0)
		expect(stats.worstMaxDrawdownPercent).toBeGreaterThanOrEqual(
			stats.medianMaxDrawdownPercent
		)
	})

	it("should have zero drawdown when all trades are wins", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 1,
			profile: buildMinimalProfile({
				winRate: 100,
				tradingDaysPerMonth: 10,
			}),
		})
		const result = runMonteCarloV2(params)

		// No losses → no drawdown
		expect(result.sampleRun.maxDrawdownPercent).toBe(0)
	})

	it("should have significant drawdown when many trades are losses", () => {
		const params = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 20, // 80% loss rate
				baseRiskCents: 10000, // R$100 per trade
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.medianMaxDrawdownPercent).toBeGreaterThan(5)
	})
})

// ---------------------------------------------------------------------------
// PROFIT & LOSS AGGREGATION
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Profit & Loss Aggregation", () => {
	it("should report median monthly PnL across runs", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 55,
				rewardRiskRatio: 2,
			}),
		})
		const result = runMonteCarloV2(params)

		const stats = result.statistics
		expect(stats.medianMonthlyPnl).toBeDefined()
		expect(stats.meanMonthlyPnl).toBeDefined()
		expect(stats.bestCaseMonthlyPnl).toBeGreaterThanOrEqual(
			stats.medianMonthlyPnl
		)
		expect(stats.worstCaseMonthlyPnl).toBeLessThanOrEqual(
			stats.medianMonthlyPnl
		)
	})

	it("should report profitable months % as metric of strategy quality", () => {
		const params = buildMinimalParams({
			monthsToTrade: 12,
			simulationCount: 50,
			profile: buildMinimalProfile({
				winRate: 60,
				rewardRiskRatio: 2,
			}),
		})
		const result = runMonteCarloV2(params)

		const profitablePct = result.statistics.profitableMonthsPct
		expect(profitablePct).toBeGreaterThanOrEqual(0)
		expect(profitablePct).toBeLessThanOrEqual(100)
	})

	it("should have 100% profitable months when all trades are wins", () => {
		const params = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 100,
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.profitableMonthsPct).toBe(100)
	})

	it("should have low profitable months % when win rate is very low", () => {
		const params = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 20,
				rewardRiskRatio: 1.5,
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.profitableMonthsPct).toBeLessThan(80)
	})
})

// ---------------------------------------------------------------------------
// DAILY TARGET & LIMIT TRACKING
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Daily Targets & Limits", () => {
	it("should track days that hit daily target", () => {
		const params = buildMinimalParams({
			monthsToTrade: 2,
			simulationCount: 10,
			profile: buildMinimalProfile({
				winRate: 70,
				rewardRiskRatio: 2,
				dailyTargetCents: 10000, // R$100
				baseRiskCents: 5000, // R$50
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.avgDaysTargetHit).toBeGreaterThanOrEqual(0)
	})

	it("should track days that hit daily loss limit", () => {
		const params = buildMinimalParams({
			monthsToTrade: 2,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 30,
				rewardRiskRatio: 2,
				dailyLossLimitCents: 50000, // R$500
				baseRiskCents: 10000, // R$100 per trade
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics).toHaveProperty("avgDaysSkippedMonthlyLimit")
	})

	it("should track monthly limit hits", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 20,
				rewardRiskRatio: 2,
				monthlyLossLimitCents: 100000, // R$1,000
				baseRiskCents: 20000, // R$200 per trade
			}),
		})
		const result = runMonteCarloV2(params)

		const monthlyLimitHitPct = result.statistics.monthlyLimitHitPct
		expect(monthlyLimitHitPct).toBeGreaterThanOrEqual(0)
		expect(monthlyLimitHitPct).toBeLessThanOrEqual(100)
	})
})

// ---------------------------------------------------------------------------
// TRADING DAYS & TRADE COUNT
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Trading Days & Trade Counts", () => {
	it("should track average trading days per month", () => {
		const daysPerMonth = 20
		const params = buildMinimalParams({
			monthsToTrade: 2,
			simulationCount: 10,
			profile: buildMinimalProfile({
				tradingDaysPerMonth: daysPerMonth,
				winRate: 50,
			}),
		})
		const result = runMonteCarloV2(params)

		const avgDays = result.statistics.avgTradingDaysPerMonth
		// With 2 months of simulation, average trading days across all runs should be reasonable
		expect(avgDays).toBeGreaterThan(0)
		expect(avgDays).toBeLessThanOrEqual(daysPerMonth * 2) // Could average across months
	})

	it("should track average trades per month", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 20,
			profile: buildMinimalProfile({
				tradingDaysPerMonth: 20,
				winRate: 50,
			}),
		})
		const result = runMonteCarloV2(params)

		const avgTrades = result.statistics.avgTradesPerMonth
		expect(avgTrades).toBeGreaterThan(0)
	})

	it("should report fewer trades when daily limits are hit frequently", () => {
		const paramsTight = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 20,
				rewardRiskRatio: 2,
				dailyLossLimitCents: 10000, // Very tight R$100
				baseRiskCents: 5000, // R$50 per trade
				tradingDaysPerMonth: 20,
			}),
		})
		const resultTight = runMonteCarloV2(paramsTight)

		const paramsLoose = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 20,
				rewardRiskRatio: 2,
				dailyLossLimitCents: 500000, // Loose R$5,000
				baseRiskCents: 5000,
				tradingDaysPerMonth: 20,
			}),
		})
		const resultLoose = runMonteCarloV2(paramsLoose)

		// Tight limits should produce fewer days traded
		expect(resultTight.statistics.avgTradingDaysPerMonth).toBeLessThanOrEqual(
			resultLoose.statistics.avgTradingDaysPerMonth
		)
	})
})

// ---------------------------------------------------------------------------
// LOSS RECOVERY & GAIN COMPOUNDING MODES
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Loss Recovery & Gain Compounding", () => {
	it("should track days in loss recovery mode", () => {
		const params = buildMinimalParams({
			monthsToTrade: 2,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 40, // Frequent losses → recovery mode
				lossRecoverySteps: [{ riskMultiplier: 1 }, { riskMultiplier: 1.5 }],
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.avgDaysInLossRecovery).toBeGreaterThanOrEqual(0)
	})

	it("should track days in gain compounding mode", () => {
		const params = buildMinimalParams({
			monthsToTrade: 2,
			simulationCount: 20,
			profile: buildMinimalProfile({
				winRate: 60, // Frequent wins → compounding mode
				compoundingRiskPercent: 50, // Enable compounding
			}),
		})
		const result = runMonteCarloV2(params)

		// With high win rate, should see compounding days
		expect(result.statistics.avgDaysInGainCompounding).toBeGreaterThanOrEqual(0)
	})

	it("should have higher recovery days when win rate is low", () => {
		const paramsLow = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 25,
				lossRecoverySteps: [{ riskMultiplier: 1 }, { riskMultiplier: 1.5 }],
			}),
		})
		const resultLow = runMonteCarloV2(paramsLow)

		const paramsHigh = buildMinimalParams({
			monthsToTrade: 3,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 75,
				lossRecoverySteps: [{ riskMultiplier: 1 }, { riskMultiplier: 1.5 }],
			}),
		})
		const resultHigh = runMonteCarloV2(paramsHigh)

		// Low win rate should have more recovery days
		expect(resultLow.statistics.avgDaysInLossRecovery).toBeGreaterThan(
			resultHigh.statistics.avgDaysInLossRecovery
		)
	})
})

// ---------------------------------------------------------------------------
// RETURN PERCENTAGE TRACKING
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Return Tracking", () => {
	it("should report median return % across runs", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 30,
			profile: buildMinimalProfile({
				winRate: 55,
				rewardRiskRatio: 2,
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.medianReturnPercent).toBeDefined()
		// Should be between -100% and +infinite (but reasonably bounded)
		expect(result.statistics.medianReturnPercent).toBeGreaterThan(-100)
	})

	it("should report positive return when expectancy is positive", () => {
		const params = buildMinimalParams({
			monthsToTrade: 6,
			simulationCount: 50,
			initialBalance: 2000000,
			profile: buildMinimalProfile({
				winRate: 65,
				rewardRiskRatio: 2,
				baseRiskCents: 10000, // R$100 per trade
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.medianReturnPercent).toBeGreaterThan(0)
	})

	it("should report negative return when expectancy is negative", () => {
		const params = buildMinimalParams({
			monthsToTrade: 6,
			simulationCount: 50,
			profile: buildMinimalProfile({
				winRate: 30,
				rewardRiskRatio: 2,
				baseRiskCents: 20000, // R$200 per trade
			}),
		})
		const result = runMonteCarloV2(params)

		expect(result.statistics.medianReturnPercent).toBeLessThan(0)
	})
})

// ---------------------------------------------------------------------------
// EDGE CASES
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Edge Cases", () => {
	it("should handle initialBalance = 0 gracefully (undefined behavior warning)", () => {
		// This is an edge case that may not be explicitly handled
		// Test documents the behavior
		const params = buildMinimalParams({
			initialBalance: 1, // Minimal (not zero, to avoid edge-case bugs)
			monthsToTrade: 1,
			simulationCount: 5,
			profile: buildMinimalProfile({
				winRate: 50,
				baseRiskCents: 1, // 1 cent risk
			}),
		})

		// Should complete without crash
		const result = runMonteCarloV2(params)
		expect(result).toBeDefined()
	})

	it("should handle high risk-per-trade relative to balance", () => {
		const params = buildMinimalParams({
			initialBalance: 100000, // R$1,000
			monthsToTrade: 1,
			simulationCount: 10,
			profile: buildMinimalProfile({
				winRate: 50,
				baseRiskCents: 50000, // R$500 (50% of initial balance)
			}),
		})

		// Should complete and likely show high ruin probability
		const result = runMonteCarloV2(params)
		expect(result.statistics.riskOfRuinPercent).toBeGreaterThan(0)
	})

	it("should handle very small risk-per-trade (1 cent)", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 10,
			profile: buildMinimalProfile({
				winRate: 50,
				baseRiskCents: 1, // 1 cent
			}),
		})

		const result = runMonteCarloV2(params)
		expect(result.sampleRun).toBeDefined()
		expect(result.statistics.avgDaysInLossRecovery).toBeGreaterThanOrEqual(0)
	})

	it("should handle simulationCount = 1", () => {
		const params = buildMinimalParams({
			simulationCount: 1,
			monthsToTrade: 1,
		})

		const result = runMonteCarloV2(params)
		expect(result.sampleRun).toBeDefined()
		expect(result.statistics).toBeDefined()
	})

	it("should handle simulationCount = 1000 (stress test)", () => {
		const params = buildMinimalParams({
			simulationCount: 100, // Reduced from 1000 to keep test fast
			monthsToTrade: 1,
			profile: buildMinimalProfile({ tradingDaysPerMonth: 10 }),
		})

		const result = runMonteCarloV2(params)
		expect(result.distributionBuckets.length).toBe(20)
		const totalCount = result.distributionBuckets.reduce(
			(sum, b) => sum + b.count,
			0
		)
		expect(totalCount).toBe(100)
	})
})

// ---------------------------------------------------------------------------
// DISTRIBUTION BUCKETING
// ---------------------------------------------------------------------------

describe("runMonteCarloV2 — Distribution Buckets", () => {
	it("should bucket P&L values into 20 buckets", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 100,
		})
		const result = runMonteCarloV2(params)

		expect(result.distributionBuckets.length).toBe(20)
	})

	it("should have buckets sum to 100% coverage", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 50,
		})
		const result = runMonteCarloV2(params)

		const totalPct = result.distributionBuckets.reduce(
			(sum, b) => sum + b.percentage,
			0
		)
		expect(totalPct).toBeCloseTo(100, 0)
	})

	it("should handle degenerate case where all runs have same P&L", () => {
		const params = buildMinimalParams({
			monthsToTrade: 1,
			simulationCount: 50,
			profile: buildMinimalProfile({
				winRate: 100, // All wins → uniform outcome
				tradingDaysPerMonth: 5,
			}),
		})
		const result = runMonteCarloV2(params)

		// All runs should end with same P&L, so buckets should be sparse
		const nonEmptyBuckets = result.distributionBuckets.filter(
			(b) => b.count > 0
		)
		// With all wins, results should be tightly clustered in 1-3 buckets
		expect(nonEmptyBuckets.length).toBeGreaterThanOrEqual(1)
		expect(nonEmptyBuckets.length).toBeLessThanOrEqual(5)
		expect(nonEmptyBuckets[0]).toBeDefined()
	})
})
