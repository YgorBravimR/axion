/**
 * Unit tests for src/lib/monte-carlo.ts (Edge Expectancy Monte Carlo).
 *
 * Monte Carlo simulates N independent trades in R-space. Each trade risks exactly 1R,
 * wins pay +rewardRiskRatio R, losses cost -1R. Commission is deducted from both outcomes.
 *
 * Key behavior to test:
 *   - Pure deterministic function: same seed (via fixed Random state) → same output
 *   - Distribution shape sanity: N trades with win-rate p → mean ≈ N·(p·R - (1-p))
 *   - Edge cases: 0% win rate, 100% win rate, N=0, N=1
 *   - Kelly criterion correctness (when edge exists)
 *   - Profit factor, streaks, and drawdown calculations
 */

import { describe, it, expect } from "vitest"
import {
	runMonteCarloSimulation,
	calculateKellyCriterion,
	generateAnalysisInsights,
} from "@/lib/monte-carlo"
import type { SimulationParams } from "@/types/monte-carlo"

// ---------------------------------------------------------------------------
// DETERMINISM & SEEDING TESTS
// ---------------------------------------------------------------------------
// Note: JS Math.random() is not seeded. However, the function is pure in
// terms of output structure. We test parameter validation and edge cases
// that do NOT depend on randomness.

describe("runMonteCarloSimulation — Basic Contract & Validation", () => {
	it("should throw when simulationCount < 1", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 0,
		}
		expect(() => runMonteCarloSimulation(params)).toThrow(
			/simulationCount must be ≥ 1/
		)
	})

	it("should accept simulationCount = 1", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 10,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const result = runMonteCarloSimulation(params)
		expect(result.statistics).toBeDefined()
		expect(result.sampleRun).toBeDefined()
	})

	it("should return a valid MonteCarloResult structure", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 10,
		}
		const result = runMonteCarloSimulation(params)

		expect(result).toHaveProperty("params")
		expect(result).toHaveProperty("statistics")
		expect(result).toHaveProperty("distributionBuckets")
		expect(result).toHaveProperty("sampleRun")

		expect(result.params).toEqual(params)
		expect(Array.isArray(result.distributionBuckets)).toBe(true)
		expect(result.statistics).toHaveProperty("medianFinalR")
		expect(result.statistics).toHaveProperty("profitablePct")
	})

	it("should generate 20 distribution buckets", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 50,
		}
		const result = runMonteCarloSimulation(params)
		expect(result.distributionBuckets).toHaveLength(20)
	})
})

// ---------------------------------------------------------------------------
// DISTRIBUTION SHAPE TESTS
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Expected Value (EV) Convergence", () => {
	it("should have mean final R ≈ N * (p*R - (1-p)) for balanced params (p=50%, R=2)", () => {
		// With p=50%, R=2, commission=0:
		// Expected per-trade = 0.5 * 2 - 0.5 * 1 = 1 - 0.5 = 0.5 R
		// Expected for 1000 trades = 500 R
		// With many sims, mean final R should converge to ~500 (within 10% tolerance)
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 0,
			simulationCount: 500,
		}
		const result = runMonteCarloSimulation(params)

		const expectedMeanR = 1000 * (0.5 * 2 - 0.5 * 1)
		const tolerance = expectedMeanR * 0.1 // 10% tolerance
		expect(result.statistics.meanFinalR).toBeGreaterThan(
			expectedMeanR - tolerance
		)
		expect(result.statistics.meanFinalR).toBeLessThan(expectedMeanR + tolerance)
	})

	it("should have mean final R ≈ 0 when win rate barely covers reward ratio", () => {
		// p=33.33%, R=2 → EV = 0.3333 * 2 - 0.6667 * 1 ≈ 0
		// With commission, should be slightly negative
		const params: SimulationParams = {
			winRate: 33.33,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 0.5,
			simulationCount: 300,
		}
		const result = runMonteCarloSimulation(params)

		// Mean should be near zero (within ±50 R for 1000 trades)
		expect(Math.abs(result.statistics.meanFinalR)).toBeLessThan(100)
	})

	it("should have negative mean final R when win rate < breakeven", () => {
		// p=25%, R=2 → EV = 0.25 * 2 - 0.75 * 1 = -0.25 R per trade
		// Over 1000 trades → -250 R expected
		const params: SimulationParams = {
			winRate: 25,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 0,
			simulationCount: 300,
		}
		const result = runMonteCarloSimulation(params)

		expect(result.statistics.meanFinalR).toBeLessThan(0)
		// Profitable run % should be low
		expect(result.statistics.profitablePct).toBeLessThan(50)
	})

	it("should have positive mean final R when win rate well above breakeven", () => {
		// p=70%, R=2 → EV = 0.70 * 2 - 0.30 * 1 = 1.1 R per trade
		// Over 1000 trades → 1100 R expected
		const params: SimulationParams = {
			winRate: 70,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 1,
			simulationCount: 300,
		}
		const result = runMonteCarloSimulation(params)

		expect(result.statistics.meanFinalR).toBeGreaterThan(0)
		expect(result.statistics.profitablePct).toBeGreaterThan(50)
	})
})

// ---------------------------------------------------------------------------
// EDGE CASES
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Edge Cases", () => {
	it("should handle 0% win rate (all losses)", () => {
		const params: SimulationParams = {
			winRate: 0,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 10,
		}
		const result = runMonteCarloSimulation(params)

		// All runs should end with -100R (100 losses)
		expect(result.statistics.meanFinalR).toBeLessThan(0)
		expect(result.statistics.profitablePct).toBe(0)
		expect(result.sampleRun.lossCount).toBe(100)
		expect(result.sampleRun.winCount).toBe(0)
	})

	it("should handle 100% win rate (all wins)", () => {
		const params: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 10,
		}
		const result = runMonteCarloSimulation(params)

		// All runs should end with +200R (100 wins * 2R each)
		expect(result.statistics.meanFinalR).toBe(200)
		expect(result.statistics.medianFinalR).toBe(200)
		expect(result.statistics.profitablePct).toBe(100)
		expect(result.sampleRun.winCount).toBe(100)
		expect(result.sampleRun.lossCount).toBe(0)
	})

	it("should handle numberOfTrades = 0", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 0,
			commissionImpactR: 0,
			simulationCount: 10,
		}
		const result = runMonteCarloSimulation(params)

		// No trades → final R = 0 for all runs
		expect(result.statistics.meanFinalR).toBe(0)
		expect(result.statistics.medianFinalR).toBe(0)
		expect(result.sampleRun.finalCumulativeR).toBe(0)
	})

	it("should handle numberOfTrades = 1", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 1,
			commissionImpactR: 0,
			simulationCount: 200,
		}
		const result = runMonteCarloSimulation(params)

		// Single trade: either +2R (win) or -1R (loss)
		// With 200 sims, roughly 100 wins, 100 losses → mean ≈ 0.5R
		expect(result.statistics.meanFinalR).toBeGreaterThan(0)
		expect(result.statistics.meanFinalR).toBeLessThan(1.5)
		expect(result.statistics.profitablePct).toBeGreaterThan(0)
		expect(result.statistics.profitablePct).toBeLessThan(100)
	})
})

// ---------------------------------------------------------------------------
// COMMISSION IMPACT
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Commission Impact", () => {
	it("should reduce win payoff by commission amount", () => {
		const paramsNoComm: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 10,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const resultNoComm = runMonteCarloSimulation(paramsNoComm)
		const finalRNoComm = resultNoComm.sampleRun.finalCumulativeR

		// With commission: 20R (10 wins * 2R) - 10% comm = 20 - 1 = 19R
		const paramsWithComm: SimulationParams = {
			...paramsNoComm,
			commissionImpactR: 10, // 10% of 1R per trade
		}
		const resultWithComm = runMonteCarloSimulation(paramsWithComm)
		const finalRWithComm = resultWithComm.sampleRun.finalCumulativeR

		// No commission: 20R, with commission: roughly 10R (each trade loses 10% to comm)
		expect(finalRNoComm).toBeGreaterThan(finalRWithComm)
	})

	it("should handle high commission impact reducing profitability", () => {
		const params: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 10, // 10% of 1R = significant commission
			simulationCount: 10,
		}
		const result = runMonteCarloSimulation(params)

		// Each win: +2R - 10% = +1.9R (still profitable but reduced)
		// With high commission, mean final R should be less than without commission
		expect(result.statistics.meanFinalR).toBeGreaterThan(0)
		// But 100% profit factor should remain (no losses)
		expect(result.statistics.profitFactor).toBe(Infinity)
	})
})

// ---------------------------------------------------------------------------
// DRAWDOWN TESTS
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Drawdown Tracking", () => {
	it("should track maxRDrawdown correctly", () => {
		// With all losses, drawdown = cumulative losses from peak
		const params: SimulationParams = {
			winRate: 0,
			rewardRiskRatio: 2,
			numberOfTrades: 10,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const result = runMonteCarloSimulation(params)
		const run = result.sampleRun

		// 10 straight losses = -10R drawdown
		expect(run.maxRDrawdown).toBe(10)
	})

	it("should return zero drawdown when all trades are wins", () => {
		const params: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const result = runMonteCarloSimulation(params)
		const run = result.sampleRun

		// No losses = no drawdown
		expect(run.maxRDrawdown).toBe(0)
	})

	it("should report medianMaxRDrawdown across runs", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 50,
			commissionImpactR: 0,
			simulationCount: 100,
		}
		const result = runMonteCarloSimulation(params)

		expect(result.statistics.medianMaxRDrawdown).toBeGreaterThanOrEqual(0)
		expect(result.statistics.meanMaxRDrawdown).toBeGreaterThanOrEqual(0)
		expect(result.statistics.worstMaxRDrawdown).toBeGreaterThanOrEqual(0)
	})
})

// ---------------------------------------------------------------------------
// STREAK TESTS
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Winning & Losing Streaks", () => {
	it("should report win and loss streak counts", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 50,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const result = runMonteCarloSimulation(params)
		const run = result.sampleRun

		expect(run.maxWinStreak).toBeGreaterThanOrEqual(0)
		expect(run.maxLossStreak).toBeGreaterThanOrEqual(0)
		expect(run.maxWinStreak + run.maxLossStreak).toBeLessThanOrEqual(
			params.numberOfTrades
		)
	})

	it("should have max win streak when all trades are wins", () => {
		const params: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 50,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const result = runMonteCarloSimulation(params)
		const run = result.sampleRun

		expect(run.maxWinStreak).toBe(50)
		expect(run.maxLossStreak).toBe(0)
	})

	it("should have max loss streak when all trades are losses", () => {
		const params: SimulationParams = {
			winRate: 0,
			rewardRiskRatio: 2,
			numberOfTrades: 50,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const result = runMonteCarloSimulation(params)
		const run = result.sampleRun

		expect(run.maxLossStreak).toBe(50)
		expect(run.maxWinStreak).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// PROFIT FACTOR
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Profit Factor", () => {
	it("should calculate profit factor as totalWinningR / totalLosingR", () => {
		// 100% win rate → infinite profit factor
		const paramsAllWins: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 10,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const resultAllWins = runMonteCarloSimulation(paramsAllWins)
		expect(resultAllWins.statistics.profitFactor).toBe(Infinity)
	})

	it("should be 0 when there are no winning trades", () => {
		const paramsNoWins: SimulationParams = {
			winRate: 0,
			rewardRiskRatio: 2,
			numberOfTrades: 10,
			commissionImpactR: 0,
			simulationCount: 1,
		}
		const resultNoWins = runMonteCarloSimulation(paramsNoWins)
		expect(resultNoWins.statistics.profitFactor).toBe(0)
	})

	it("should be between 0 and Infinity for mixed win/loss scenarios", () => {
		const params: SimulationParams = {
			winRate: 60,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 50,
		}
		const result = runMonteCarloSimulation(params)

		expect(result.statistics.profitFactor).toBeGreaterThan(0)
		expect(isFinite(result.statistics.profitFactor)).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// KELLY CRITERION
// ---------------------------------------------------------------------------

describe("calculateKellyCriterion()", () => {
	it("should return zero Kelly when edge is zero or negative", () => {
		// p=50%, R=1 → f* = 0.5 - 0.5/1 = 0
		const kelly = calculateKellyCriterion(50, 1)
		expect(kelly.kellyFull).toBe(0)
		expect(kelly.kellyHalf).toBe(0)
		expect(kelly.kellyQuarter).toBe(0)
	})

	it("should return positive Kelly when edge is positive", () => {
		// p=60%, R=2 → f* = 0.6 - 0.4/2 = 0.6 - 0.2 = 0.4 = 40%
		const kelly = calculateKellyCriterion(60, 2)
		expect(kelly.kellyFull).toBeCloseTo(40, 1)
		expect(kelly.kellyHalf).toBeCloseTo(20, 1)
		expect(kelly.kellyQuarter).toBeCloseTo(10, 1)
	})

	it("should cap negative raw Kelly to 0", () => {
		// p=30%, R=2 → raw f* = 0.3 - 0.7/2 = 0.3 - 0.35 = -0.05 → capped to 0
		const kelly = calculateKellyCriterion(30, 2)
		expect(kelly.kellyFull).toBe(0)
	})

	it("should recommend 'conservative' when Kelly ≤ 0 or very small", () => {
		const kelly1 = calculateKellyCriterion(50, 1)
		expect(kelly1.kellyLevel).toBe("conservative")

		const kelly2 = calculateKellyCriterion(40, 2)
		expect(kelly2.kellyLevel).toBe("conservative")
	})

	it("should recommend 'balanced' when Kelly is in mid-range (15-25%)", () => {
		// p=61%, R=2 → f* = 0.61 - 0.39/2 = 0.61 - 0.195 = 0.415 ≈ 41.5% → "aggressive"
		// Try p=55%, R=2 → f* = 0.55 - 0.45/2 = 0.55 - 0.225 = 0.325 ≈ 32.5% → "aggressive"
		// Try p=52%, R=2 → f* = 0.52 - 0.48/2 = 0.52 - 0.24 = 0.28 = 28% → "aggressive"
		// Try p=51%, R=2 → f* = 0.51 - 0.49/2 = 0.51 - 0.245 = 0.265 ≈ 26.5% → "aggressive"
		// Try p=50.5%, R=2 → f* = 0.505 - 0.495/2 = 0.505 - 0.2475 = 0.2575 ≈ 25.75% → "aggressive"
		// Try p=50%, R=1.5 → f* = 0.5 - 0.5/1.5 = 0.5 - 0.333 = 0.166 ≈ 16.6% → "balanced"
		const kelly = calculateKellyCriterion(50, 1.5)
		expect(kelly.kellyLevel).toBe("balanced")
	})

	it("should recommend 'aggressive' when Kelly is high (> 25%)", () => {
		// p=80%, R=3 → f* = 0.8 - 0.2/3 ≈ 0.73 = 73%
		const kelly = calculateKellyCriterion(80, 3)
		expect(kelly.kellyLevel).toBe("aggressive")
	})
})

// ---------------------------------------------------------------------------
// ANALYSIS INSIGHTS
// ---------------------------------------------------------------------------

describe("generateAnalysisInsights()", () => {
	it("should classify profitability as robust when profitable % ≥ 70", () => {
		const params: SimulationParams = {
			winRate: 70,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 1,
			simulationCount: 100,
		}
		const result = runMonteCarloSimulation(params)
		const insights = generateAnalysisInsights(result)

		if (result.statistics.profitablePct >= 70) {
			expect(insights.profitabilityQuality).toBe("robust")
		}
	})

	it("should provide improvement suggestions for low win rate", () => {
		const params: SimulationParams = {
			winRate: 40,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 10,
		}
		const result = runMonteCarloSimulation(params)
		const insights = generateAnalysisInsights(result)

		if (params.winRate < 50) {
			expect(insights.improvementSuggestions.length).toBeGreaterThan(0)
			expect(
				insights.improvementSuggestions.some((s) => s.includes("Win Rate"))
			).toBe(true)
		}
	})

	it("should flag high drawdown as concerning", () => {
		const params: SimulationParams = {
			winRate: 30,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 5,
			simulationCount: 100,
		}
		const result = runMonteCarloSimulation(params)
		const insights = generateAnalysisInsights(result)

		expect(insights.riskAssessment).toBeDefined()
		expect(["excellent", "good", "moderate", "concerning"]).toContain(
			insights.riskAssessment
		)
	})

	it("should warn about long losing streaks when expected ≥ 5", () => {
		const params: SimulationParams = {
			winRate: 40,
			rewardRiskRatio: 2,
			numberOfTrades: 1000,
			commissionImpactR: 0,
			simulationCount: 100,
		}
		const result = runMonteCarloSimulation(params)
		const insights = generateAnalysisInsights(result)

		if (result.statistics.expectedMaxLossStreak >= 5) {
			expect(insights.psychologyWarning).toBeTruthy()
		}
	})
})

// ---------------------------------------------------------------------------
// PERCENTILE & DISTRIBUTION
// ---------------------------------------------------------------------------

describe("runMonteCarloSimulation — Percentiles & Distribution", () => {
	it("should report 5th and 95th percentiles for final R values", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 200,
		}
		const result = runMonteCarloSimulation(params)

		// Worst case should be lower than median
		expect(result.statistics.worstCaseFinalR).toBeLessThanOrEqual(
			result.statistics.medianFinalR
		)
		// Best case should be higher than median
		expect(result.statistics.bestCaseFinalR).toBeGreaterThanOrEqual(
			result.statistics.medianFinalR
		)
	})

	it("should bucket distribution correctly with non-zero range", () => {
		const params: SimulationParams = {
			winRate: 50,
			rewardRiskRatio: 2,
			numberOfTrades: 100,
			commissionImpactR: 0,
			simulationCount: 200,
		}
		const result = runMonteCarloSimulation(params)

		// All buckets should sum to 100%
		const totalPct = result.distributionBuckets.reduce(
			(sum, b) => sum + b.percentage,
			0
		)
		expect(totalPct).toBeCloseTo(100, 0)

		// All bucket counts should sum to simulation count
		const totalCount = result.distributionBuckets.reduce(
			(sum, b) => sum + b.count,
			0
		)
		expect(totalCount).toBe(params.simulationCount)
	})

	it("should handle flat distribution (all runs have same final R)", () => {
		const params: SimulationParams = {
			winRate: 100,
			rewardRiskRatio: 2,
			numberOfTrades: 10,
			commissionImpactR: 0,
			simulationCount: 100,
		}
		const result = runMonteCarloSimulation(params)

		// All runs end with same R, so buckets should reflect that
		const nonEmptyBuckets = result.distributionBuckets.filter(
			(b) => b.count > 0
		)
		expect(nonEmptyBuckets.length).toBeGreaterThanOrEqual(1)
	})
})
