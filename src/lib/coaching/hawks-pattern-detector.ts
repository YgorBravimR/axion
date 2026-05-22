import { formatDateKey } from "@/lib/dates"
import { detectAllPatterns } from "@/lib/coaching/pattern-detector"
import type { CoachingInsight, TradeForCoaching } from "@/lib/coaching/types"
import type { TradeForHawks } from "@/lib/coaching/hawks-types"

const MIN_OCCURRENCES = 2
const DAILY_TRADE_CAP = 3
const CASCADE_PAUSE_R = -5
const CASCADE_STOP_R = -10

const parseR = (value: string | null): number => {
	if (value == null) {
		return 0
	}
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

const detectStopMethodViolations = (
	trades: readonly TradeForHawks[]
): CoachingInsight[] => {
	const violatingTrades = trades.filter((t) =>
		t.stopEvents.some(
			(e) => e.methodViolation || e.directionVsPosition === "against"
		)
	)
	if (violatingTrades.length < MIN_OCCURRENCES) {
		return []
	}
	const violationRate = Math.round(
		(violatingTrades.length / trades.length) * 100
	)
	return [
		{
			id: "hawks-stop-method-violation",
			category: "risk",
			severity: "warning",
			titleKey: "coaching.insights.hawksStopMethodViolation.title",
			descriptionKey: "coaching.insights.hawksStopMethodViolation.description",
			params: {
				violatingTrades: violatingTrades.length,
				totalTrades: trades.length,
				violationRate,
			},
			confidence: 1,
		},
	]
}

const detectTripleScreenGap = (
	trades: readonly TradeForHawks[]
): CoachingInsight[] => {
	const unconfirmed = trades.filter((t) => !t.tripleScreenConfirmed)
	if (unconfirmed.length < MIN_OCCURRENCES) {
		return []
	}
	const losses = unconfirmed.filter((t) => t.outcome === "loss").length
	const lossRate = unconfirmed.length
		? Math.round((losses / unconfirmed.length) * 100)
		: 0
	return [
		{
			id: "hawks-triple-screen-gap",
			category: "strategy",
			severity: "warning",
			titleKey: "coaching.insights.hawksTripleScreenGap.title",
			descriptionKey: "coaching.insights.hawksTripleScreenGap.description",
			params: {
				unconfirmedTrades: unconfirmed.length,
				totalTrades: trades.length,
				lossRate,
			},
			confidence: unconfirmed.length >= 5 ? 0.95 : 0.8,
		},
	]
}

const detectDailyTradeCapBreach = (
	trades: readonly TradeForHawks[]
): CoachingInsight[] => {
	const dayCounts = new Map<string, number>()
	for (const trade of trades) {
		const day = formatDateKey(trade.entryDate)
		dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
	}
	const breachedDays = Array.from(dayCounts.values()).filter(
		(n) => n > DAILY_TRADE_CAP
	).length
	if (breachedDays < MIN_OCCURRENCES) {
		return []
	}
	return [
		{
			id: "hawks-daily-cap-breach",
			category: "psychology",
			severity: "warning",
			titleKey: "coaching.insights.hawksDailyCapBreach.title",
			descriptionKey: "coaching.insights.hawksDailyCapBreach.description",
			params: {
				breachedDays,
				totalDays: dayCounts.size,
				cap: DAILY_TRADE_CAP,
			},
			confidence: 1,
		},
	]
}

const detectBiasDirectionMismatch = (
	trades: readonly TradeForHawks[]
): CoachingInsight[] => {
	const mismatches = trades.filter((t) => {
		if (t.biasAtEntry === "neutral") {
			return true
		}
		return t.biasAtEntry !== t.direction
	})
	if (mismatches.length < MIN_OCCURRENCES) {
		return []
	}
	const losses = mismatches.filter((t) => t.outcome === "loss").length
	const lossRate = mismatches.length
		? Math.round((losses / mismatches.length) * 100)
		: 0
	return [
		{
			id: "hawks-bias-direction-mismatch",
			category: "strategy",
			severity: "warning",
			titleKey: "coaching.insights.hawksBiasDirectionMismatch.title",
			descriptionKey:
				"coaching.insights.hawksBiasDirectionMismatch.description",
			params: {
				mismatches: mismatches.length,
				totalTrades: trades.length,
				lossRate,
			},
			confidence: mismatches.length >= 5 ? 0.95 : 0.8,
		},
	]
}

const detectCascadeTrigger = (
	trades: readonly TradeForHawks[]
): CoachingInsight[] => {
	const tradesByDay = new Map<string, TradeForHawks[]>()
	for (const trade of trades) {
		const day = formatDateKey(trade.entryDate)
		const bucket = tradesByDay.get(day) ?? []
		bucket.push(trade)
		tradesByDay.set(day, bucket)
	}

	let pauseDays = 0
	let stopDays = 0
	for (const [, dayTrades] of tradesByDay) {
		const sorted = [...dayTrades].sort(
			(a, b) => a.entryDate.getTime() - b.entryDate.getTime()
		)
		let runningR = 0
		let hitPause = false
		let hitStop = false
		for (const trade of sorted) {
			runningR += parseR(trade.realizedRMultiple)
			if (!hitPause && runningR <= CASCADE_PAUSE_R) {
				hitPause = true
			}
			if (!hitStop && runningR <= CASCADE_STOP_R) {
				hitStop = true
			}
		}
		if (hitStop) {
			stopDays++
		} else if (hitPause) {
			pauseDays++
		}
	}

	if (pauseDays + stopDays < MIN_OCCURRENCES) {
		return []
	}
	return [
		{
			id: "hawks-cascade-trigger",
			category: "risk",
			severity: stopDays > 0 ? "warning" : "attention",
			titleKey: "coaching.insights.hawksCascadeTrigger.title",
			descriptionKey: "coaching.insights.hawksCascadeTrigger.description",
			params: {
				pauseDays,
				stopDays,
				totalDays: tradesByDay.size,
				pauseThresholdR: CASCADE_PAUSE_R,
				stopThresholdR: CASCADE_STOP_R,
			},
			confidence: 1,
		},
	]
}

const detectAllHawksPatterns = (
	trades: readonly TradeForHawks[]
): CoachingInsight[] => {
	const baseInsights = detectAllPatterns(
		trades as unknown as TradeForCoaching[]
	)
	const hawksInsights = [
		...detectStopMethodViolations(trades),
		...detectTripleScreenGap(trades),
		...detectDailyTradeCapBreach(trades),
		...detectBiasDirectionMismatch(trades),
		...detectCascadeTrigger(trades),
	]

	const severityOrder: Record<string, number> = {
		warning: 0,
		attention: 1,
		info: 2,
	}

	return [...baseInsights, ...hawksInsights].toSorted(
		(a, b) => severityOrder[a.severity]! - severityOrder[b.severity]!
	)
}

export {
	detectAllHawksPatterns,
	detectStopMethodViolations,
	detectTripleScreenGap,
	detectDailyTradeCapBreach,
	detectBiasDirectionMismatch,
	detectCascadeTrigger,
}
