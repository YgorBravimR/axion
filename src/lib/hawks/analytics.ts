/**
 * Hawks analytics aggregations.
 *
 * Works entirely in R-space (`realizedRMultiple`, `mfeR`, `maeR`) so we don't
 * need to decrypt money fields. Pedro's reference KPIs (2024 cohort):
 *
 * - Profit factor: 3.87×
 * - Win rate: 31.66 %
 * - Daily trade cap: 3
 * - Stop discipline: 100 % (stop never moves against position)
 *
 * @see docs/hawks-mode-research.md § 8 Phase 4
 */

import { and, desc, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	hawksScenarioOnTrade,
	hawksStopAudit,
	trades,
} from "@/db/schema"
import { HAWKS_BENCHMARKS } from "@/lib/hawks/benchmarks"

interface HawksKpis {
	tradeCount: number
	winCount: number
	lossCount: number
	winRate: number
	profitFactor: number | null
	expectancyR: number
	avgWinR: number
	avgLossR: number
	mfeCapture: number | null
}

interface ScenarioPerformance {
	scenarioCode: number
	tradeCount: number
	winRate: number
	expectancyR: number
	totalR: number
}

interface DisciplineSummary {
	stopChanges: number
	stopViolations: number
	stopDiscipline: number
	overCapDays: number
	totalSessionDays: number
	avgMfeCapture: number | null
}

interface AnalyticsRange {
	from: Date
	to: Date
}

const toNumber = (value: string | null) => {
	if (value === null) return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

const buildRange = (range?: Partial<AnalyticsRange>): AnalyticsRange => {
	const to = range?.to ?? new Date()
	const from =
		range?.from ?? new Date(to.getTime() - 1000 * 60 * 60 * 24 * 90)
	return { from, to }
}

const fetchHawksTrades = async (accountId: string, range: AnalyticsRange) => {
	return db
		.select({
			id: trades.id,
			asset: trades.asset,
			direction: trades.direction,
			entryDate: trades.entryDate,
			exitDate: trades.exitDate,
			outcome: trades.outcome,
			realizedRMultiple: trades.realizedRMultiple,
			mfeR: trades.mfeR,
			maeR: trades.maeR,
		})
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, range.from),
				lte(trades.entryDate, range.to)
			)
		)
		.orderBy(desc(trades.entryDate))
}

const computeHawksKpis = (
	rows: Awaited<ReturnType<typeof fetchHawksTrades>>
): HawksKpis => {
	let winCount = 0
	let lossCount = 0
	let grossWinR = 0
	let grossLossR = 0
	let totalR = 0
	let mfeNumer = 0
	let mfeDenom = 0
	let mfeSamples = 0

	for (const row of rows) {
		const r = toNumber(row.realizedRMultiple)
		if (r === null) continue
		totalR += r
		if (r > 0) {
			winCount += 1
			grossWinR += r
		} else if (r < 0) {
			lossCount += 1
			grossLossR += Math.abs(r)
		}
		const mfeR = toNumber(row.mfeR)
		if (mfeR !== null && mfeR > 0) {
			mfeNumer += r
			mfeDenom += mfeR
			mfeSamples += 1
		}
	}

	const tradeCount = rows.length
	const closedCount = winCount + lossCount
	const winRate = closedCount > 0 ? winCount / closedCount : 0
	const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : null
	const expectancyR = closedCount > 0 ? totalR / closedCount : 0
	const avgWinR = winCount > 0 ? grossWinR / winCount : 0
	const avgLossR = lossCount > 0 ? grossLossR / lossCount : 0
	const mfeCapture = mfeSamples > 0 && mfeDenom > 0 ? mfeNumer / mfeDenom : null

	return {
		tradeCount,
		winCount,
		lossCount,
		winRate,
		profitFactor,
		expectancyR,
		avgWinR,
		avgLossR,
		mfeCapture,
	}
}

const fetchScenarioPerformance = async (
	accountId: string,
	range: AnalyticsRange
): Promise<ScenarioPerformance[]> => {
	const rows = await db
		.select({
			scenarioCode: hawksScenarioOnTrade.scenarioCode,
			realizedRMultiple: trades.realizedRMultiple,
		})
		.from(hawksScenarioOnTrade)
		.innerJoin(trades, eq(trades.id, hawksScenarioOnTrade.tradeId))
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, range.from),
				lte(trades.entryDate, range.to)
			)
		)

	const buckets = new Map<number, { tradeCount: number; wins: number; totalR: number }>()
	for (const row of rows) {
		if (row.scenarioCode === null) continue
		const bucket = buckets.get(row.scenarioCode) ?? { tradeCount: 0, wins: 0, totalR: 0 }
		bucket.tradeCount += 1
		const r = toNumber(row.realizedRMultiple)
		if (r !== null) {
			bucket.totalR += r
			if (r > 0) bucket.wins += 1
		}
		buckets.set(row.scenarioCode, bucket)
	}

	return Array.from(buckets.entries())
		.map(([scenarioCode, bucket]) => ({
			scenarioCode,
			tradeCount: bucket.tradeCount,
			winRate: bucket.tradeCount > 0 ? bucket.wins / bucket.tradeCount : 0,
			expectancyR: bucket.tradeCount > 0 ? bucket.totalR / bucket.tradeCount : 0,
			totalR: bucket.totalR,
		}))
		.sort((a, b) => b.tradeCount - a.tradeCount)
}

const fetchDisciplineSummary = async (
	accountId: string,
	range: AnalyticsRange
): Promise<DisciplineSummary> => {
	const stopRows = await db
		.select({
			tradeId: hawksStopAudit.tradeId,
			violation: hawksStopAudit.violation,
		})
		.from(hawksStopAudit)
		.innerJoin(trades, eq(trades.id, hawksStopAudit.tradeId))
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, range.from),
				lte(trades.entryDate, range.to)
			)
		)

	const tradesInRange = await fetchHawksTrades(accountId, range)
	const dailyCounts = new Map<string, number>()
	let mfeNumer = 0
	let mfeDenom = 0
	let mfeSamples = 0
	for (const trade of tradesInRange) {
		const dayKey = trade.entryDate.toISOString().slice(0, 10)
		dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1)
		const r = toNumber(trade.realizedRMultiple)
		const mfeR = toNumber(trade.mfeR)
		if (r !== null && mfeR !== null && mfeR > 0) {
			mfeNumer += r
			mfeDenom += mfeR
			mfeSamples += 1
		}
	}

	let overCapDays = 0
	for (const count of dailyCounts.values()) {
		if (count > HAWKS_BENCHMARKS.dailyTradeCap) overCapDays += 1
	}

	const stopChanges = stopRows.length
	const stopViolations = stopRows.filter((row) => row.violation).length
	const stopDiscipline =
		stopChanges > 0 ? 1 - stopViolations / stopChanges : 1

	return {
		stopChanges,
		stopViolations,
		stopDiscipline,
		overCapDays,
		totalSessionDays: dailyCounts.size,
		avgMfeCapture: mfeSamples > 0 && mfeDenom > 0 ? mfeNumer / mfeDenom : null,
	}
}

const fetchHawksAnalytics = async ({
	accountId,
	range,
}: {
	accountId: string
	range?: Partial<AnalyticsRange>
}) => {
	const resolvedRange = buildRange(range)
	const tradeRows = await fetchHawksTrades(accountId, resolvedRange)
	const kpis = computeHawksKpis(tradeRows)
	const [scenarioPerformance, discipline] = await Promise.all([
		fetchScenarioPerformance(accountId, resolvedRange),
		fetchDisciplineSummary(accountId, resolvedRange),
	])

	return {
		range: {
			from: resolvedRange.from.toISOString(),
			to: resolvedRange.to.toISOString(),
		},
		kpis,
		scenarioPerformance,
		discipline,
	}
}

export {
	HAWKS_BENCHMARKS,
	fetchHawksAnalytics,
	fetchHawksTrades,
	computeHawksKpis,
	fetchScenarioPerformance,
	fetchDisciplineSummary,
}
export type {
	AnalyticsRange,
	HawksKpis,
	ScenarioPerformance,
	DisciplineSummary,
}
