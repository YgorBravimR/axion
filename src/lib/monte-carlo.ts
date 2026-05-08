import type {
	SimulationParams,
	SimulatedTrade,
	SimulationRun,
	SimulationStatistics,
	MonteCarloResult,
	DistributionBucket,
} from "@/types/monte-carlo"
import {
	assertNonEmpty,
	mapNonEmpty,
	mean,
	median,
	percentile,
	toSortedNonEmpty,
	type NonEmptyArray,
} from "@/lib/non-empty"

/**
 * Run a Monte Carlo simulation in R-multiples (Edge Expectancy).
 * Every trade risks exactly 1R. Wins pay +rewardRiskRatio R, losses cost -1R.
 * No balance tracking — this measures pure strategy quality.
 */
export const runMonteCarloSimulation = (
	params: SimulationParams
): MonteCarloResult => {
	if (params.simulationCount < 1) {
		throw new Error("monte-carlo: simulationCount must be ≥ 1")
	}

	const runs: SimulationRun[] = []
	for (let i = 0; i < params.simulationCount; i++) {
		runs.push(simulateSingleRun(params, i))
	}
	assertNonEmpty(runs, "monte-carlo: runs must be non-empty after simulation")

	const statistics = aggregateStatistics(params, runs)
	const distributionBuckets = calculateDistribution(runs)

	// Find median run for sample display
	const sortedByFinalR = runs.toSorted(
		(a, b) => a.finalCumulativeR - b.finalCumulativeR
	)
	assertNonEmpty(
		sortedByFinalR,
		"monte-carlo: sortedByFinalR must be non-empty"
	)
	const medianIndex = Math.floor(sortedByFinalR.length / 2)
	const sampleRun = sortedByFinalR[medianIndex] ?? sortedByFinalR[0]

	return {
		params,
		statistics,
		distributionBuckets,
		sampleRun,
	}
}

const simulateSingleRun = (
	params: SimulationParams,
	runId: number
): SimulationRun => {
	let cumulativeR = 0
	let peakR = 0
	const trades: SimulatedTrade[] = []
	let winCount = 0
	let lossCount = 0
	let currentWinStreak = 0
	let currentLossStreak = 0
	let maxWinStreak = 0
	let maxLossStreak = 0
	let maxRDrawdown = 0

	const commissionFraction = params.commissionImpactR / 100

	for (let t = 0; t < params.numberOfTrades; t++) {
		const isWin = Math.random() * 100 < params.winRate
		const commission = commissionFraction // expressed in R units

		let rResult: number
		if (isWin) {
			// Win: earn rewardRiskRatio R, minus commission
			rResult = params.rewardRiskRatio - commission
			winCount++
			currentWinStreak++
			currentLossStreak = 0
			maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
		} else {
			// Loss: lose 1R, plus commission
			rResult = -1 - commission
			lossCount++
			currentLossStreak++
			currentWinStreak = 0
			maxLossStreak = Math.max(maxLossStreak, currentLossStreak)
		}

		cumulativeR += rResult
		peakR = Math.max(peakR, cumulativeR)
		const rDrawdown = peakR - cumulativeR
		maxRDrawdown = Math.max(maxRDrawdown, rDrawdown)

		trades.push({
			tradeNumber: t + 1,
			isWin,
			rResult,
			commission,
			cumulativeR,
			rDrawdown,
		})
		// No ruin break — R-space doesn't have bankruptcy
	}

	return {
		runId,
		trades,
		finalCumulativeR: cumulativeR,
		maxRDrawdown,
		winCount,
		lossCount,
		maxWinStreak,
		maxLossStreak,
		peakR,
	}
}

const aggregateStatistics = (
	params: SimulationParams,
	runs: NonEmptyArray<SimulationRun>
): SimulationStatistics => {
	const finalRValues = toSortedNonEmpty(
		mapNonEmpty(runs, (r) => r.finalCumulativeR),
		(a, b) => a - b
	)
	const maxDrawdowns = toSortedNonEmpty(
		mapNonEmpty(runs, (r) => r.maxRDrawdown),
		(a, b) => a - b
	)

	const profitableRuns = runs.filter((r) => r.finalCumulativeR > 0).length

	const meanOrZero = (arr: readonly number[]): number =>
		arr.length === 0 ? 0 : mean(arr as NonEmptyArray<number>)

	// Per-run Sharpe/Sortino, averaged across runs.
	// Pooling all trades from all runs into one series shrinks stddev by ~√N
	// (independent runs from same distribution) and inflates Sharpe artificially.
	// Correct approach: compute the ratio within each run, then average.
	const perRunSharpes: number[] = []
	const perRunSortinos: number[] = []
	let totalWinningR = 0
	let totalLosingR = 0
	for (const run of runs) {
		const runResults = run.trades.map((t) => t.rResult)
		const runMean = meanOrZero(runResults)
		const runStd = calculateStdDev(runResults)
		const runDownside = calculateDownsideDeviation(runResults, 0)
		perRunSharpes.push(runStd > 0 ? runMean / runStd : 0)
		perRunSortinos.push(runDownside > 0 ? runMean / runDownside : 0)
		for (const r of runResults) {
			if (r > 0) {
				totalWinningR += r
			} else if (r < 0) {
				totalLosingR += -r
			}
		}
	}

	const meanRPerTrade =
		params.numberOfTrades > 0
			? runs.reduce((s, r) => s + r.finalCumulativeR, 0) /
				(runs.length * params.numberOfTrades)
			: 0
	const sharpeRatio = meanOrZero(perRunSharpes)
	const sortinoRatio = meanOrZero(perRunSortinos)

	// Profit factor: total winning R / total losing R (across all sims)
	const profitFactor =
		totalLosingR > 0
			? totalWinningR / totalLosingR
			: totalWinningR > 0
				? Infinity
				: 0

	// Streak analysis (runs is NonEmpty by contract)
	const avgMaxWinStreak = mean(mapNonEmpty(runs, (r) => r.maxWinStreak))
	const avgMaxLossStreak = mean(mapNonEmpty(runs, (r) => r.maxLossStreak))
	const allWinStreaks: number[] = []
	const allLossStreaks: number[] = []
	for (const run of runs) {
		let currentWin = 0
		let currentLoss = 0
		for (const trade of run.trades) {
			if (trade.isWin) {
				currentWin++
				if (currentLoss > 0) {
					allLossStreaks.push(currentLoss)
					currentLoss = 0
				}
			} else {
				currentLoss++
				if (currentWin > 0) {
					allWinStreaks.push(currentWin)
					currentWin = 0
				}
			}
		}
		if (currentWin > 0) {
			allWinStreaks.push(currentWin)
		}
		if (currentLoss > 0) {
			allLossStreaks.push(currentLoss)
		}
	}

	// Kelly uses net reward (after commission impact) so f* isn't overstated.
	const aggregateCommissionFraction = params.commissionImpactR / 100
	const netRewardRiskRatio = Math.max(
		0.0001,
		params.rewardRiskRatio - aggregateCommissionFraction
	)
	const {
		kellyFull,
		kellyHalf,
		kellyQuarter,
		kellyRecommendation,
		kellyLevel,
	} = calculateKellyCriterion(params.winRate, netRewardRiskRatio)

	return {
		medianFinalR: median(finalRValues),
		meanFinalR: mean(finalRValues),
		bestCaseFinalR: percentile(finalRValues, 95),
		worstCaseFinalR: percentile(finalRValues, 5),
		medianMaxRDrawdown: median(maxDrawdowns),
		meanMaxRDrawdown: mean(maxDrawdowns),
		worstMaxRDrawdown: percentile(maxDrawdowns, 95),
		profitablePct: (profitableRuns / runs.length) * 100,
		sharpeRatio,
		sortinoRatio,
		expectedRPerTrade: meanRPerTrade,
		expectedMaxWinStreak: avgMaxWinStreak,
		expectedMaxLossStreak: avgMaxLossStreak,
		avgWinStreak: meanOrZero(allWinStreaks),
		avgLossStreak: meanOrZero(allLossStreaks),
		kellyFull,
		kellyHalf,
		kellyQuarter,
		kellyRecommendation,
		kellyLevel,
		profitFactor,
		avgRecoveryTrades: 0,
	}
}

/**
 * Kelly % = W - (1-W)/R where W = win probability, R = reward/risk ratio
 */
export const calculateKellyCriterion = (
	winRate: number,
	rewardRiskRatio: number
): {
	kellyFull: number
	kellyHalf: number
	kellyQuarter: number
	kellyRecommendation: string
	kellyLevel: "aggressive" | "balanced" | "conservative"
} => {
	const W = winRate / 100
	const rawKelly = W - (1 - W) / rewardRiskRatio
	const cappedKelly = Math.max(0, rawKelly) * 100

	let kellyRecommendation: string
	let kellyLevel: "aggressive" | "balanced" | "conservative"

	if (cappedKelly <= 0) {
		kellyRecommendation = "monteCarlo.kelly.negativeEdge"
		kellyLevel = "conservative"
	} else if (cappedKelly > 25) {
		kellyRecommendation = "monteCarlo.kelly.highPotential"
		kellyLevel = "aggressive"
	} else if (cappedKelly > 15) {
		kellyRecommendation = "monteCarlo.kelly.reasonable"
		kellyLevel = "balanced"
	} else {
		kellyRecommendation = "monteCarlo.kelly.conservative"
		kellyLevel = "conservative"
	}

	return {
		kellyFull: cappedKelly,
		kellyHalf: cappedKelly / 2,
		kellyQuarter: cappedKelly / 4,
		kellyRecommendation,
		kellyLevel,
	}
}

/**
 * Bucket by final cumulative R ranges
 */
const calculateDistribution = (runs: SimulationRun[]): DistributionBucket[] => {
	const finalRValues = runs.map((r) => r.finalCumulativeR)
	let min = Infinity
	let max = -Infinity
	for (const rValue of finalRValues) {
		if (rValue < min) {
			min = rValue
		}
		if (rValue > max) {
			max = rValue
		}
	}
	const bucketCount = 20
	const bucketSize = (max - min) / bucketCount || 1

	const buckets: DistributionBucket[] = []

	for (let i = 0; i < bucketCount; i++) {
		const rangeStart = min + i * bucketSize
		const rangeEnd = min + (i + 1) * bucketSize
		const isLastBucket = i === bucketCount - 1

		const count = finalRValues.filter(
			(r) => r >= rangeStart && (isLastBucket ? r <= rangeEnd : r < rangeEnd)
		).length

		buckets.push({
			rangeStart,
			rangeEnd,
			count,
			percentage: (count / runs.length) * 100,
		})
	}

	return buckets
}

const calculateStdDev = (values: number[]): number => {
	if (values.length === 0) {
		return 0
	}
	const avg = values.reduce((sum, v) => sum + v, 0) / values.length
	const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
	const avgSquaredDiff =
		squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length
	return Math.sqrt(avgSquaredDiff)
}

/**
 * Downside deviation for Sortino ratio.
 * Measures volatility of returns below the target (typically 0).
 * Uses ALL values in the denominator, not just the negative ones.
 *
 * DD = sqrt( (1/N) * Σ min(0, r_i - target)^2 )
 */
const calculateDownsideDeviation = (
	values: number[],
	target: number
): number => {
	if (values.length === 0) {
		return 0
	}
	const sumSquaredDownside = values.reduce((sum, v) => {
		const diff = v - target
		return diff < 0 ? sum + diff * diff : sum
	}, 0)
	return Math.sqrt(sumSquaredDownside / values.length)
}

interface AnalysisInsights {
	profitabilityQuality: "robust" | "moderate" | "risky"
	riskAssessment: "excellent" | "good" | "moderate" | "concerning"
	psychologyWarning: string | null
	commissionAssessment: "negligible" | "moderate" | "high"
	improvementSuggestions: string[]
}

export const generateAnalysisInsights = (
	result: MonteCarloResult
): AnalysisInsights => {
	const { statistics: stats, params } = result

	const getProfitabilityQuality = (): "robust" | "moderate" | "risky" => {
		if (stats.profitablePct >= 70) {
			return "robust"
		}
		if (stats.profitablePct >= 50) {
			return "moderate"
		}
		return "risky"
	}

	const getRiskAssessment = ():
		| "excellent"
		| "good"
		| "moderate"
		| "concerning" => {
		if (stats.sharpeRatio >= 0.5 && stats.medianMaxRDrawdown <= 3) {
			return "excellent"
		}
		if (stats.sharpeRatio >= 0.3 && stats.medianMaxRDrawdown <= 5) {
			return "good"
		}
		if (stats.sharpeRatio >= 0.1 && stats.medianMaxRDrawdown <= 8) {
			return "moderate"
		}
		return "concerning"
	}

	const getPsychologyWarning = (): string | null => {
		const streak = Math.round(stats.expectedMaxLossStreak)
		if (stats.expectedMaxLossStreak >= 7) {
			return `Can you maintain discipline during a ${streak}-trade losing streak? This is crucial for success.`
		}
		if (stats.expectedMaxLossStreak >= 5) {
			return `Prepare for potential ${streak}-trade losing streaks. Have a plan to stay disciplined.`
		}
		return null
	}

	const getCommissionAssessment = (): "negligible" | "moderate" | "high" => {
		if (params.commissionImpactR <= 1) {
			return "negligible"
		}
		if (params.commissionImpactR <= 5) {
			return "moderate"
		}
		return "high"
	}

	const suggestions: string[] = []
	if (params.rewardRiskRatio < 1.5) {
		suggestions.push("Improve Reward/Risk: Focus on letting winners run longer")
	}
	if (params.winRate < 50) {
		suggestions.push(
			"Improve Win Rate: Review entry criteria and market selection"
		)
	}
	if (stats.medianMaxRDrawdown > 5) {
		suggestions.push(
			"High R-Drawdown: The strategy may test psychological limits during losing streaks"
		)
	}

	return {
		profitabilityQuality: getProfitabilityQuality(),
		riskAssessment: getRiskAssessment(),
		psychologyWarning: getPsychologyWarning(),
		commissionAssessment: getCommissionAssessment(),
		improvementSuggestions: suggestions,
	}
}
