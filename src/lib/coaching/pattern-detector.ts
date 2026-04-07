/**
 * Pure-stats pattern detection for trading coaching.
 * Finds statistically significant anomalies in trade data without LLM.
 * Each detector returns CoachingInsight[] — only insights with sufficient confidence.
 */

import { fromCents } from "@/lib/money"
import { calculateWinRate } from "@/lib/calculations"
import { getBrtTimeParts, formatDateKey } from "@/lib/dates"

// ============================================================================
// TYPES
// ============================================================================

interface CoachingInsight {
	id: string
	category: "time" | "strategy" | "risk" | "psychology" | "fees"
	severity: "info" | "attention" | "warning"
	titleKey: string
	descriptionKey: string
	params: Record<string, string | number>
	confidence: number
}

/** Superset trade shape for all pattern detectors */
interface TradeForCoaching {
	entryDate: Date
	exitDate: Date | null
	pnl: number | string | null
	outcome: "win" | "loss" | "breakeven" | null
	realizedRMultiple: string | null
	asset: string
	direction: "long" | "short"
	strategyName: string | null
	setupRank: "A" | "AA" | "AAA" | null
	rating: "A" | "B" | "C" | "D" | "F" | null
	followedPlan: boolean | null
	commission: number | string | null
	fees: number | string | null
}

/** Minimum decided trades overall to run a detector */
const MIN_SAMPLE_SIZE = 10

/** Minimum trades in a sub-group (per hour, per day, per strategy) */
const MIN_GROUP_SIZE = 5

/** Minimum absolute difference in win rate to be "significant" */
const MIN_WIN_RATE_DIFF = 8

/** Calculate confidence based on sample size (0-1) */
const calcConfidence = (sampleSize: number): number => {
	if (sampleSize < MIN_GROUP_SIZE) return 0
	if (sampleSize < 10) return 0.4
	if (sampleSize < 20) return 0.6
	if (sampleSize < 50) return 0.75
	if (sampleSize < 100) return 0.85
	return 0.95
}

// ============================================================================
// DETECTOR 1: Time-of-Day Edge
// ============================================================================

const detectTimeOfDayEdge = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const decidedTrades = trades.filter((t) => t.outcome === "win" || t.outcome === "loss")
	if (decidedTrades.length < MIN_SAMPLE_SIZE) return insights

	const overallWinRate = calculateWinRate(
		decidedTrades.filter((t) => t.outcome === "win").length,
		decidedTrades.length
	)

	// Group by hour
	const hourMap = new Map<number, { wins: number; total: number }>()
	for (const trade of decidedTrades) {
		const { hour } = getBrtTimeParts(trade.entryDate)
		const entry = hourMap.get(hour) || { wins: 0, total: 0 }
		entry.total++
		if (trade.outcome === "win") entry.wins++
		hourMap.set(hour, entry)
	}

	// Find best and worst hours with sufficient sample
	let bestHour: { hour: number; winRate: number; count: number } | null = null
	let worstHour: { hour: number; winRate: number; count: number } | null = null

	for (const [hour, data] of hourMap) {
		if (data.total < MIN_GROUP_SIZE) continue
		const wr = calculateWinRate(data.wins, data.total)

		if (!bestHour || wr > bestHour.winRate) {
			bestHour = { hour, winRate: wr, count: data.total }
		}
		if (!worstHour || wr < worstHour.winRate) {
			worstHour = { hour, winRate: wr, count: data.total }
		}
	}

	if (bestHour && bestHour.winRate - overallWinRate >= MIN_WIN_RATE_DIFF) {
		insights.push({
			id: "time-best-hour",
			category: "time",
			severity: "info",
			titleKey: "coaching.insights.bestHour.title",
			descriptionKey: "coaching.insights.bestHour.description",
			params: {
				hour: `${bestHour.hour}:00`,
				winRate: Math.round(bestHour.winRate),
				overallWinRate: Math.round(overallWinRate),
				trades: bestHour.count,
			},
			confidence: calcConfidence(bestHour.count),
		})
	}

	if (worstHour && overallWinRate - worstHour.winRate >= MIN_WIN_RATE_DIFF) {
		insights.push({
			id: "time-worst-hour",
			category: "time",
			severity: "warning",
			titleKey: "coaching.insights.worstHour.title",
			descriptionKey: "coaching.insights.worstHour.description",
			params: {
				hour: `${worstHour.hour}:00`,
				winRate: Math.round(worstHour.winRate),
				overallWinRate: Math.round(overallWinRate),
				trades: worstHour.count,
			},
			confidence: calcConfidence(worstHour.count),
		})
	}

	return insights
}

// ============================================================================
// DETECTOR 2: Day-of-Week Edge
// ============================================================================

const detectDayOfWeekEdge = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const decidedTrades = trades.filter((t) => t.outcome === "win" || t.outcome === "loss")
	if (decidedTrades.length < MIN_SAMPLE_SIZE) return insights

	// English keys — client translates via analytics.time.dayNames.{key}
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

	const dayMap = new Map<number, { totalPnl: number; count: number }>()
	for (const trade of decidedTrades) {
		const { dayOfWeek } = getBrtTimeParts(trade.entryDate)
		const entry = dayMap.get(dayOfWeek) || { totalPnl: 0, count: 0 }
		entry.totalPnl += fromCents(trade.pnl)
		entry.count++
		dayMap.set(dayOfWeek, entry)
	}

	// Find worst day with sufficient sample
	let worstDay: { day: number; avgPnl: number; count: number } | null = null
	for (const [day, data] of dayMap) {
		if (data.count < 10) continue
		const avgPnl = data.totalPnl / data.count
		if (!worstDay || avgPnl < worstDay.avgPnl) {
			worstDay = { day, avgPnl, count: data.count }
		}
	}

	if (worstDay && worstDay.avgPnl < 0) {
		insights.push({
			id: "day-worst",
			category: "time",
			severity: "attention",
			titleKey: "coaching.insights.worstDay.title",
			descriptionKey: "coaching.insights.worstDay.description",
			params: {
				day: dayNames[worstDay.day],
				avgPnl: Math.round(worstDay.avgPnl * 100) / 100,
				trades: worstDay.count,
			},
			confidence: calcConfidence(worstDay.count),
		})
	}

	return insights
}

// ============================================================================
// DETECTOR 3: Strategy Performance Gap
// ============================================================================

const detectStrategyGap = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const decidedTrades = trades.filter(
		(t) => (t.outcome === "win" || t.outcome === "loss") && t.strategyName
	)
	if (decidedTrades.length < MIN_SAMPLE_SIZE) return insights

	const stratMap = new Map<string, { wins: number; total: number }>()
	for (const trade of decidedTrades) {
		const name = trade.strategyName!
		const entry = stratMap.get(name) || { wins: 0, total: 0 }
		entry.total++
		if (trade.outcome === "win") entry.wins++
		stratMap.set(name, entry)
	}

	// Find best and worst strategies with sufficient sample
	const strategies = Array.from(stratMap.entries())
		.filter(([, data]) => data.total >= 10)
		.map(([name, data]) => ({
			name,
			winRate: calculateWinRate(data.wins, data.total),
			count: data.total,
		}))
		.toSorted((a, b) => b.winRate - a.winRate)

	if (strategies.length >= 2) {
		const best = strategies[0]
		const worst = strategies[strategies.length - 1]
		const gap = best.winRate - worst.winRate

		if (gap >= MIN_WIN_RATE_DIFF) {
			insights.push({
				id: "strategy-gap",
				category: "strategy",
				severity: gap >= 25 ? "warning" : "attention",
				titleKey: "coaching.insights.strategyGap.title",
				descriptionKey: "coaching.insights.strategyGap.description",
				params: {
					bestStrategy: best.name,
					bestWinRate: Math.round(best.winRate),
					worstStrategy: worst.name,
					worstWinRate: Math.round(worst.winRate),
					gap: Math.round(gap),
				},
				confidence: calcConfidence(Math.min(best.count, worst.count)),
			})
		}
	}

	return insights
}

// ============================================================================
// DETECTOR 4: Holding Period Insight
// ============================================================================

const detectHoldingPeriodEdge = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const closedTrades = trades.filter(
		(t) => t.exitDate && (t.outcome === "win" || t.outcome === "loss")
	)
	if (closedTrades.length < MIN_SAMPLE_SIZE) return insights

	// Compare short holds (< 5min) vs medium holds (15-60min)
	const shortHolds = closedTrades.filter((t) => {
		const dur = (t.exitDate!.getTime() - t.entryDate.getTime()) / 60_000
		return dur < 5
	})
	const mediumHolds = closedTrades.filter((t) => {
		const dur = (t.exitDate!.getTime() - t.entryDate.getTime()) / 60_000
		return dur >= 15 && dur <= 60
	})

	if (shortHolds.length >= MIN_GROUP_SIZE && mediumHolds.length >= MIN_GROUP_SIZE) {
		const shortRCount = shortHolds.filter((t) => t.realizedRMultiple).length
		const shortRSum = shortHolds.reduce((sum, t) =>
			sum + (t.realizedRMultiple ? Number(t.realizedRMultiple) : 0), 0
		)
		const shortAvgR = shortRCount > 0 ? shortRSum / shortRCount : 0

		const mediumRCount = mediumHolds.filter((t) => t.realizedRMultiple).length
		const mediumRSum = mediumHolds.reduce((sum, t) =>
			sum + (t.realizedRMultiple ? Number(t.realizedRMultiple) : 0), 0
		)
		const mediumAvgR = mediumRCount > 0 ? mediumRSum / mediumRCount : 0

		if (Math.abs(mediumAvgR - shortAvgR) > 0.3) {
			insights.push({
				id: "holding-period-edge",
				category: "time",
				severity: shortAvgR < 0 ? "warning" : "info",
				titleKey: "coaching.insights.holdingPeriod.title",
				descriptionKey: "coaching.insights.holdingPeriod.description",
				params: {
					shortAvgR: Math.round(shortAvgR * 100) / 100,
					mediumAvgR: Math.round(mediumAvgR * 100) / 100,
					shortCount: shortHolds.length,
					mediumCount: mediumHolds.length,
				},
				confidence: calcConfidence(Math.min(shortHolds.length, mediumHolds.length)),
			})
		}
	}

	return insights
}

// ============================================================================
// DETECTOR 5: Overtrading Signal
// ============================================================================

const detectOvertrading = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const decidedTrades = trades.filter((t) => t.outcome === "win" || t.outcome === "loss")
	if (decidedTrades.length < MIN_SAMPLE_SIZE) return insights

	// Group trades by day
	const dayMap = new Map<string, { wins: number; total: number }>()
	for (const trade of decidedTrades) {
		const dateKey = formatDateKey(trade.entryDate)
		const entry = dayMap.get(dateKey) || { wins: 0, total: 0 }
		entry.total++
		if (trade.outcome === "win") entry.wins++
		dayMap.set(dateKey, entry)
	}

	// Compare low-volume days (1-3 trades) vs high-volume days (5+)
	let lowVolumeWins = 0
	let lowVolumeTotal = 0
	let highVolumeWins = 0
	let highVolumeTotal = 0

	for (const [, data] of dayMap) {
		if (data.total <= 3) {
			lowVolumeWins += data.wins
			lowVolumeTotal += data.total
		} else if (data.total >= 5) {
			highVolumeWins += data.wins
			highVolumeTotal += data.total
		}
	}

	if (lowVolumeTotal >= MIN_GROUP_SIZE && highVolumeTotal >= MIN_GROUP_SIZE) {
		const lowWR = calculateWinRate(lowVolumeWins, lowVolumeTotal)
		const highWR = calculateWinRate(highVolumeWins, highVolumeTotal)

		if (lowWR - highWR >= MIN_WIN_RATE_DIFF) {
			insights.push({
				id: "overtrading",
				category: "psychology",
				severity: "warning",
				titleKey: "coaching.insights.overtrading.title",
				descriptionKey: "coaching.insights.overtrading.description",
				params: {
					lowVolumeWinRate: Math.round(lowWR),
					highVolumeWinRate: Math.round(highWR),
					lowVolumeTrades: lowVolumeTotal,
					highVolumeTrades: highVolumeTotal,
				},
				confidence: calcConfidence(Math.min(lowVolumeTotal, highVolumeTotal)),
			})
		}
	}

	return insights
}

// ============================================================================
// DETECTOR 6: Fee Drag
// ============================================================================

const detectFeeDrag = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	if (trades.length < MIN_SAMPLE_SIZE) return insights

	let totalFees = 0
	let totalNetPnl = 0

	for (const trade of trades) {
		totalFees += fromCents(trade.commission) + fromCents(trade.fees)
		totalNetPnl += fromCents(trade.pnl)
	}

	const grossPnl = totalNetPnl + totalFees
	if (grossPnl <= 0) return insights

	const feePercent = (totalFees / grossPnl) * 100

	if (feePercent > 5) {
		insights.push({
			id: "fee-drag",
			category: "fees",
			severity: feePercent > 20 ? "warning" : "attention",
			titleKey: "coaching.insights.feeDrag.title",
			descriptionKey: "coaching.insights.feeDrag.description",
			params: {
				feePercent: Math.round(feePercent * 10) / 10,
				totalFees: Math.round(totalFees * 100) / 100,
			},
			confidence: calcConfidence(trades.length),
		})
	}

	return insights
}

// ============================================================================
// DETECTOR 7: Streak Patterns
// ============================================================================

const detectStreakPatterns = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const decidedTrades = trades
		.filter((t) => t.outcome === "win" || t.outcome === "loss")
		.toSorted((a, b) => a.entryDate.getTime() - b.entryDate.getTime())

	if (decidedTrades.length < MIN_SAMPLE_SIZE) return insights

	// Track win rate after 2+ consecutive losses
	let consecutiveLosses = 0
	let afterStreakWins = 0
	let afterStreakTotal = 0

	for (const trade of decidedTrades) {
		if (consecutiveLosses >= 2) {
			afterStreakTotal++
			if (trade.outcome === "win") afterStreakWins++
		}

		if (trade.outcome === "loss") {
			consecutiveLosses++
		} else {
			consecutiveLosses = 0
		}
	}

	if (afterStreakTotal >= MIN_GROUP_SIZE) {
		const overallWinRate = calculateWinRate(
			decidedTrades.filter((t) => t.outcome === "win").length,
			decidedTrades.length
		)
		const afterStreakWR = calculateWinRate(afterStreakWins, afterStreakTotal)

		if (overallWinRate - afterStreakWR >= MIN_WIN_RATE_DIFF) {
			insights.push({
				id: "streak-tilt",
				category: "psychology",
				severity: "warning",
				titleKey: "coaching.insights.streakTilt.title",
				descriptionKey: "coaching.insights.streakTilt.description",
				params: {
					afterStreakWinRate: Math.round(afterStreakWR),
					overallWinRate: Math.round(overallWinRate),
					afterStreakTrades: afterStreakTotal,
				},
				confidence: calcConfidence(afterStreakTotal),
			})
		}
	}

	return insights
}

// ============================================================================
// DETECTOR 8: Rating Correlation
// ============================================================================

const detectRatingCorrelation = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const ratedTrades = trades.filter(
		(t) => t.rating && (t.outcome === "win" || t.outcome === "loss")
	)
	if (ratedTrades.length < MIN_SAMPLE_SIZE) return insights

	const highRated = ratedTrades.filter((t) => t.rating === "A" || t.rating === "B")
	const lowRated = ratedTrades.filter((t) => t.rating === "D" || t.rating === "F")

	if (highRated.length >= MIN_GROUP_SIZE && lowRated.length >= MIN_GROUP_SIZE) {
		const highWR = calculateWinRate(
			highRated.filter((t) => t.outcome === "win").length,
			highRated.length
		)
		const lowWR = calculateWinRate(
			lowRated.filter((t) => t.outcome === "win").length,
			lowRated.length
		)

		if (highWR - lowWR >= MIN_WIN_RATE_DIFF) {
			insights.push({
				id: "rating-correlation",
				category: "psychology",
				severity: "info",
				titleKey: "coaching.insights.ratingCorrelation.title",
				descriptionKey: "coaching.insights.ratingCorrelation.description",
				params: {
					highWinRate: Math.round(highWR),
					lowWinRate: Math.round(lowWR),
					highCount: highRated.length,
					lowCount: lowRated.length,
				},
				confidence: calcConfidence(Math.min(highRated.length, lowRated.length)),
			})
		}
	}

	return insights
}

// ============================================================================
// DETECTOR 9: Discipline Impact
// ============================================================================

const detectDisciplineImpact = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const insights: CoachingInsight[] = []
	const trackedTrades = trades.filter(
		(t) => t.followedPlan !== null && t.realizedRMultiple
	)
	if (trackedTrades.length < MIN_SAMPLE_SIZE) return insights

	const followed = trackedTrades.filter((t) => t.followedPlan === true)
	const notFollowed = trackedTrades.filter((t) => t.followedPlan === false)

	if (followed.length >= MIN_GROUP_SIZE && notFollowed.length >= MIN_GROUP_SIZE) {
		const followedAvgR = followed.reduce(
			(sum, t) => sum + Number(t.realizedRMultiple), 0
		) / followed.length

		const notFollowedAvgR = notFollowed.reduce(
			(sum, t) => sum + Number(t.realizedRMultiple), 0
		) / notFollowed.length

		if (followedAvgR - notFollowedAvgR > 0.3) {
			insights.push({
				id: "discipline-impact",
				category: "psychology",
				severity: "attention",
				titleKey: "coaching.insights.disciplineImpact.title",
				descriptionKey: "coaching.insights.disciplineImpact.description",
				params: {
					followedAvgR: Math.round(followedAvgR * 100) / 100,
					notFollowedAvgR: Math.round(notFollowedAvgR * 100) / 100,
					followedCount: followed.length,
					notFollowedCount: notFollowed.length,
				},
				confidence: calcConfidence(Math.min(followed.length, notFollowed.length)),
			})
		}
	}

	return insights
}

// ============================================================================
// MAIN DETECTOR
// ============================================================================

/** Minimum confidence to surface an insight */
const MIN_CONFIDENCE = 0.4

/**
 * Run all pattern detectors and return insights sorted by severity.
 * Only includes insights with confidence >= MIN_CONFIDENCE.
 */
const detectAllPatterns = (trades: TradeForCoaching[]): CoachingInsight[] => {
	const allInsights = [
		...detectTimeOfDayEdge(trades),
		...detectDayOfWeekEdge(trades),
		...detectStrategyGap(trades),
		...detectHoldingPeriodEdge(trades),
		...detectOvertrading(trades),
		...detectFeeDrag(trades),
		...detectStreakPatterns(trades),
		...detectRatingCorrelation(trades),
		...detectDisciplineImpact(trades),
	]

	const severityOrder: Record<string, number> = {
		warning: 0,
		attention: 1,
		info: 2,
	}

	return allInsights
		.filter((i) => i.confidence >= MIN_CONFIDENCE)
		.toSorted((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}

export {
	detectAllPatterns,
	detectTimeOfDayEdge,
	detectDayOfWeekEdge,
	detectStrategyGap,
	detectHoldingPeriodEdge,
	detectOvertrading,
	detectFeeDrag,
	detectStreakPatterns,
	detectRatingCorrelation,
	detectDisciplineImpact,
	type CoachingInsight,
	type TradeForCoaching,
}
