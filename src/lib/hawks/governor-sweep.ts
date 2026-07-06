/**
 * Hawks daily-governor floor SWEEP — the validation deliverable.
 *
 * The governor is a day-level risk system with a tunable floor (see
 * daily-governor.ts). This module answers the trust question: given a trader's
 * REAL logged Hawks trades, what would each floor have done to total R,
 * expectancy, drawdown, and red-day count?
 *
 * Method: per candidate floor, group the trades by trading day, run each day
 * through resolveHawksDailyGovernor, keep the trades up to and including the
 * stop trade (drop the rest), and aggregate metrics over the survivors. Because
 * Hawks trade generation is path-independent (entry depends on chart structure,
 * not prior outcomes), this truncation is exact — the same R distribution an
 * in-loop re-simulation would produce.
 *
 * Pure: the caller loads trades (with rOutcome + trading day) and picks the
 * floor set to sweep.
 */

import { resolveHawksDailyGovernor } from "@/lib/hawks/daily-governor"

interface SweepTrade {
	/** Realized R for this closed trade. */
	rOutcome: number
	outcome: "win" | "loss" | "breakeven" | null
	/** BRT day key "YYYY-MM-DD" — trades are grouped by this. */
	tradingDay: string
}

interface FloorRow {
	/** null = baseline (no governor); a number = that floor in R. */
	floorR: number | null
	totalR: number
	/** Mean R per kept non-breakeven trade. */
	expectancy: number
	tradesKept: number
	tradesDropped: number
	/** Max peak-to-trough drawdown of the cumulative-R curve, in R (>= 0). */
	maxDrawdownR: number
	/** Days closing below 0R. */
	redDays: number
	/** Days the governor ended early (at least one trade dropped). */
	daysCapped: number
	tradingDays: number
	avgTradesPerDay: number
}

interface SweepResult {
	baseline: FloorRow
	floors: FloorRow[]
}

const DEFAULT_FLOORS = [-1, 0, 1, 2]

/** Group trades by trading day, preserving input order within each day. */
const groupByDay = (trades: SweepTrade[]): Map<string, SweepTrade[]> => {
	const byDay = new Map<string, SweepTrade[]>()
	for (const trade of trades) {
		const day = byDay.get(trade.tradingDay)
		if (day) {
			day.push(trade)
		} else {
			byDay.set(trade.tradingDay, [trade])
		}
	}
	return byDay
}

/**
 * Apply the governor at a given floor and return the kept trades per day.
 * A day keeps trades up to and INCLUDING the trade at which the governor
 * stops; everything after is dropped (never taken).
 */
const truncateDay = (
	dayTrades: SweepTrade[],
	dailyTargetR: number,
	floorR: number
): SweepTrade[] => {
	// Walk the day trade by trade, asking the governor after each whether the
	// day should have stopped. The governor is pure over the prefix of trades.
	for (let i = 0; i < dayTrades.length; i++) {
		const prefix = dayTrades.slice(0, i + 1)
		const result = resolveHawksDailyGovernor({
			trades: prefix,
			dailyTargetR,
			floorR,
		})
		if (result.shouldStop) {
			// The stop fires ON this trade — it's the last one taken.
			return prefix
		}
	}
	return dayTrades
}

/** Aggregate a flat kept-trade list (already truncated) into a FloorRow. */
const aggregate = (
	floorR: number | null,
	keptByDay: Map<string, SweepTrade[]>,
	originalByDay: Map<string, SweepTrade[]>
): FloorRow => {
	let totalR = 0
	let tradesKept = 0
	let tradesDropped = 0
	let daysCapped = 0
	let redDays = 0

	// Drawdown on the cumulative-R curve across days (chronological).
	const dayKeys = [...originalByDay.keys()].sort()
	let cumR = 0
	let peakR = 0
	let maxDrawdownR = 0

	for (const dayKey of dayKeys) {
		const kept = keptByDay.get(dayKey) ?? []
		const original = originalByDay.get(dayKey) ?? []

		const keptNonBe = kept.filter((t) => t.outcome !== "breakeven")
		const dayR = kept.reduce((sum, t) => sum + t.rOutcome, 0)

		totalR += dayR
		tradesKept += keptNonBe.length
		tradesDropped += original.length - kept.length
		if (kept.length < original.length) {
			daysCapped++
		}
		if (dayR < 0) {
			redDays++
		}

		cumR += dayR
		if (cumR > peakR) {
			peakR = cumR
		}
		const dd = peakR - cumR
		if (dd > maxDrawdownR) {
			maxDrawdownR = dd
		}
	}

	const tradingDays = dayKeys.length
	return {
		floorR,
		totalR,
		expectancy: tradesKept > 0 ? totalR / tradesKept : 0,
		tradesKept,
		tradesDropped,
		maxDrawdownR,
		redDays,
		daysCapped,
		tradingDays,
		avgTradesPerDay: tradingDays > 0 ? tradesKept / tradingDays : 0,
	}
}

/**
 * Run the floor sweep. Returns the baseline (no governor) plus one row per
 * candidate floor, so the caller can render the expectancy-vs-drawdown tradeoff.
 */
const runGovernorSweep = ({
	trades,
	dailyTargetR,
	floors = DEFAULT_FLOORS,
}: {
	trades: SweepTrade[]
	dailyTargetR: number
	floors?: number[]
}): SweepResult => {
	const originalByDay = groupByDay(trades)

	// Baseline: no governor — every trade kept (identity truncation).
	const baseline = aggregate(null, originalByDay, originalByDay)

	const floorRows = floors.map((floorR) => {
		const keptByDay = new Map<string, SweepTrade[]>()
		for (const [dayKey, dayTrades] of originalByDay) {
			keptByDay.set(dayKey, truncateDay(dayTrades, dailyTargetR, floorR))
		}
		return aggregate(floorR, keptByDay, originalByDay)
	})

	return { baseline, floors: floorRows }
}

export { runGovernorSweep, DEFAULT_FLOORS }
export type { SweepTrade, FloorRow, SweepResult }
