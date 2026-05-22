/**
 * Pure orchestration logic for strategy comparison simulation.
 * No I/O, no auth — accepts pre-loaded data and results as arguments.
 */

import type {
	StrategyComparisonResult,
	ComparisonRecommendation,
} from "@/types/monte-carlo"

/**
 * Rank comparison results by profitable percentage.
 * @param results Unsorted comparison results
 * @returns Results sorted by profitablePct (descending) with rank assigned
 */
export function rankComparisonResults(
	results: StrategyComparisonResult[]
): StrategyComparisonResult[] {
	const sorted = results.toSorted((a, b) => b.profitablePct - a.profitablePct)
	for (const [i, result] of sorted.entries()) {
		result.rank = i + 1
	}
	return sorted
}

/**
 * Extract top performers from ranked results.
 * @param results Ranked comparison results
 * @param threshold Profitable percentage threshold (default: 70)
 * @returns Strategy names that qualify as top performers
 */
export function extractTopPerformers(
	results: StrategyComparisonResult[],
	threshold: number = 70
): string[] {
	return results
		.filter((r) => r.profitablePct >= threshold)
		.map((r) => r.strategyName)
}

/**
 * Extract strategies needing improvement from ranked results.
 * @param results Ranked comparison results
 * @param threshold Profitable percentage threshold (default: 50)
 * @returns Strategy names below the threshold
 */
export function extractNeedsImprovement(
	results: StrategyComparisonResult[],
	threshold: number = 50
): string[] {
	return results
		.filter((r) => r.profitablePct < threshold)
		.map((r) => r.strategyName)
}

/**
 * Calculate allocation score for a strategy.
 * @param profitablePct Profitable percentage of the strategy
 * @returns Score used for allocation calculation
 */
export function calculateAllocationScore(profitablePct: number): number {
	return Math.max(0, profitablePct - 30)
}

/**
 * Determine allocation reason text based on profitable percentage.
 * @param pct Profitable percentage
 * @returns Reason string
 */
export function getAllocationReason(pct: number): string {
	if (pct >= 80) {
		return "Excellent"
	}
	if (pct >= 70) {
		return "Good"
	}
	return "Moderate"
}

/**
 * Calculate total score across all strategies.
 * @param results Ranked comparison results
 * @returns Sum of allocation scores
 */
export function calculateTotalScore(
	results: StrategyComparisonResult[]
): number {
	return results.reduce(
		(sum, r) => sum + calculateAllocationScore(r.profitablePct),
		0
	)
}

/**
 * Generate suggested allocations from ranked results.
 * @param results Ranked comparison results
 * @param improvementThreshold Minimum profitable pct to include in allocations (default: 50)
 * @returns Array of allocation suggestions with percentages and reasons
 */
export function generateSuggestedAllocations(
	results: StrategyComparisonResult[],
	improvementThreshold: number = 50
): ComparisonRecommendation["suggestedAllocations"] {
	const totalScore = calculateTotalScore(results)

	const suggestedAllocations = results
		.filter((r) => r.profitablePct >= improvementThreshold)
		.map((r) => {
			const score = calculateAllocationScore(r.profitablePct)
			return {
				strategyName: r.strategyName,
				allocationPct:
					totalScore > 0 ? Math.round((score / totalScore) * 100) : 0,
				reason: getAllocationReason(r.profitablePct),
			}
		})

	// Add pause recommendations for strategies needing improvement
	const needsImprovement = extractNeedsImprovement(
		results,
		improvementThreshold
	)
	for (const strategyName of needsImprovement) {
		suggestedAllocations.push({
			strategyName,
			allocationPct: 0,
			reason: "Pause",
		})
	}

	return suggestedAllocations
}

/**
 * Build complete comparison recommendations from ranked results.
 * @param results Ranked comparison results
 * @returns Complete recommendation object with top performers, needs improvement, and allocations
 */
export function buildComparisonRecommendations(
	results: StrategyComparisonResult[]
): ComparisonRecommendation {
	const topPerformers = extractTopPerformers(results)
	const needsImprovement = extractNeedsImprovement(results)
	const suggestedAllocations = generateSuggestedAllocations(results)

	return {
		topPerformers,
		needsImprovement,
		suggestedAllocations,
	}
}
