import { describe, it, expect } from "vitest"
import type { StrategyComparisonResult } from "@/types/monte-carlo"
import {
	rankComparisonResults,
	extractTopPerformers,
	extractNeedsImprovement,
	calculateAllocationScore,
	getAllocationReason,
	calculateTotalScore,
	generateSuggestedAllocations,
	buildComparisonRecommendations,
} from "@/lib/monte-carlo/comparison-orchestration"

const createMockComparisonResult = (
	overrides: Partial<StrategyComparisonResult> = {}
): StrategyComparisonResult => ({
	strategyId: "strategy-1",
	strategyName: "Test Strategy",
	tradesCount: 100,
	winRate: 55,
	rewardRiskRatio: 1.5,
	medianFinalR: 25.5,
	profitablePct: 72.5,
	maxRDrawdown: -5.2,
	sharpeRatio: 1.8,
	rank: 0,
	result: {
		statistics: {
			medianFinalR: 25.5,
			profitablePct: 72.5,
			medianMaxRDrawdown: -5.2,
			sharpeRatio: 1.8,
			winRate: 55,
			rewardRiskRatio: 1.5,
		},
		paths: [[100, 102, 105, 103]],
	},
	...overrides,
})

describe("comparison-orchestration", () => {
	describe("rankComparisonResults", () => {
		it("should rank results by profitable percentage descending", () => {
			const results = [
				createMockComparisonResult({
					strategyId: "s1",
					strategyName: "Strategy 1",
					profitablePct: 50,
				}),
				createMockComparisonResult({
					strategyId: "s2",
					strategyName: "Strategy 2",
					profitablePct: 75,
				}),
				createMockComparisonResult({
					strategyId: "s3",
					strategyName: "Strategy 3",
					profitablePct: 60,
				}),
			]

			const ranked = rankComparisonResults(results)

			expect(ranked[0]?.strategyName).toBe("Strategy 2")
			expect(ranked[0]?.rank).toBe(1)
			expect(ranked[1]?.strategyName).toBe("Strategy 3")
			expect(ranked[1]?.rank).toBe(2)
			expect(ranked[2]?.strategyName).toBe("Strategy 1")
			expect(ranked[2]?.rank).toBe(3)
		})

		it("should handle ties by maintaining order from input", () => {
			const results = [
				createMockComparisonResult({
					strategyId: "s1",
					strategyName: "Strategy 1",
					profitablePct: 70,
				}),
				createMockComparisonResult({
					strategyId: "s2",
					strategyName: "Strategy 2",
					profitablePct: 70,
				}),
			]

			const ranked = rankComparisonResults(results)

			expect(ranked).toHaveLength(2)
			expect(ranked[0]?.rank).toBe(1)
			expect(ranked[1]?.rank).toBe(2)
		})
	})

	describe("extractTopPerformers", () => {
		it("should extract strategies above threshold", () => {
			const results = [
				createMockComparisonResult({
					strategyName: "Excellent",
					profitablePct: 85,
				}),
				createMockComparisonResult({
					strategyName: "Good",
					profitablePct: 75,
				}),
				createMockComparisonResult({
					strategyName: "Poor",
					profitablePct: 40,
				}),
			]

			const topPerformers = extractTopPerformers(results, 70)

			expect(topPerformers).toContain("Excellent")
			expect(topPerformers).toContain("Good")
			expect(topPerformers).not.toContain("Poor")
		})

		it("should respect custom threshold", () => {
			const results = [
				createMockComparisonResult({
					strategyName: "Strategy 1",
					profitablePct: 75,
				}),
			]

			const topPerformers = extractTopPerformers(results, 80)

			expect(topPerformers).not.toContain("Strategy 1")
		})
	})

	describe("extractNeedsImprovement", () => {
		it("should extract strategies below threshold", () => {
			const results = [
				createMockComparisonResult({
					strategyName: "Strong",
					profitablePct: 70,
				}),
				createMockComparisonResult({
					strategyName: "Weak",
					profitablePct: 40,
				}),
			]

			const needsImprovement = extractNeedsImprovement(results, 50)

			expect(needsImprovement).toContain("Weak")
			expect(needsImprovement).not.toContain("Strong")
		})
	})

	describe("calculateAllocationScore", () => {
		it("should calculate score as pct - 30, floored at 0", () => {
			expect(calculateAllocationScore(75)).toBe(45)
			expect(calculateAllocationScore(30)).toBe(0)
			expect(calculateAllocationScore(20)).toBe(0)
		})
	})

	describe("getAllocationReason", () => {
		it("should return Excellent for pct >= 80", () => {
			expect(getAllocationReason(80)).toBe("Excellent")
			expect(getAllocationReason(95)).toBe("Excellent")
		})

		it("should return Good for pct >= 70 and < 80", () => {
			expect(getAllocationReason(70)).toBe("Good")
			expect(getAllocationReason(75)).toBe("Good")
		})

		it("should return Moderate for pct < 70", () => {
			expect(getAllocationReason(69)).toBe("Moderate")
			expect(getAllocationReason(50)).toBe("Moderate")
		})
	})

	describe("calculateTotalScore", () => {
		it("should sum allocation scores across results", () => {
			const results = [
				createMockComparisonResult({ profitablePct: 80 }), // score: 50
				createMockComparisonResult({ profitablePct: 70 }), // score: 40
				createMockComparisonResult({ profitablePct: 40 }), // score: 10
			]

			const total = calculateTotalScore(results)

			expect(total).toBe(100)
		})
	})

	describe("generateSuggestedAllocations", () => {
		it("should generate allocations for strategies above threshold", () => {
			const results = [
				createMockComparisonResult({
					strategyName: "High",
					profitablePct: 80,
				}),
				createMockComparisonResult({
					strategyName: "Medium",
					profitablePct: 60,
				}),
				createMockComparisonResult({
					strategyName: "Low",
					profitablePct: 30,
				}),
			]

			const allocations = generateSuggestedAllocations(results, 50)

			const highAlloc = allocations.find((a) => a.strategyName === "High")
			const mediumAlloc = allocations.find((a) => a.strategyName === "Medium")
			const lowAlloc = allocations.find((a) => a.strategyName === "Low")

			expect(highAlloc?.allocationPct).toBeGreaterThan(0)
			expect(mediumAlloc?.allocationPct).toBeGreaterThan(0)
			expect(lowAlloc?.allocationPct).toBe(0)
			expect(lowAlloc?.reason).toBe("Pause")
		})

		it("should allocate proportionally based on scores", () => {
			const results = [
				createMockComparisonResult({
					strategyName: "S1",
					profitablePct: 80,
				}),
				createMockComparisonResult({
					strategyName: "S2",
					profitablePct: 70,
				}),
			]

			const allocations = generateSuggestedAllocations(results, 50)

			const s1Alloc =
				allocations.find((a) => a.strategyName === "S1")?.allocationPct || 0
			const s2Alloc =
				allocations.find((a) => a.strategyName === "S2")?.allocationPct || 0

			// S1 score: 50, S2 score: 40, total: 90
			// S1: 50/90 * 100 ≈ 56%, S2: 40/90 * 100 ≈ 44%
			expect(s1Alloc).toBeGreaterThan(s2Alloc)
			expect(s1Alloc + s2Alloc).toBe(100) // Should sum to 100
		})
	})

	describe("buildComparisonRecommendations", () => {
		it("should build complete recommendations from results", () => {
			const results = [
				createMockComparisonResult({
					strategyName: "Excellent",
					profitablePct: 85,
				}),
				createMockComparisonResult({
					strategyName: "Good",
					profitablePct: 75,
				}),
				createMockComparisonResult({
					strategyName: "Weak",
					profitablePct: 30,
				}),
			]

			const recommendations = buildComparisonRecommendations(results)

			expect(recommendations.topPerformers).toContain("Excellent")
			expect(recommendations.topPerformers).toContain("Good")
			expect(recommendations.needsImprovement).toContain("Weak")
			expect(recommendations.suggestedAllocations).toHaveLength(3)
		})
	})
})
