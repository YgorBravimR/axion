/**
 * Aggregate invalidation write hook.
 *
 * Marks the monthly and weekly aggregate rows dirty whenever a trade or
 * capital event mutates data for a given account + date. The next read
 * through period-queries will recompute those rows from raw trades.
 *
 * @see src/lib/queries/period-queries.ts — UTC-anchored read layer that
 *   consumes isDirty and recomputes on demand.
 */
import { db } from "@/db/drizzle"
import { accountMonthlyAggregate, accountWeeklyAggregate } from "@/db/schema"
import { getWeekNumber, getWeekYear } from "@/lib/calendar/iso-week"

/**
 * Marks the monthly and weekly aggregate rows dirty for the period that
 * contains `date`.
 *
 * UTC extractors are used for year/month so that the invalidator agrees with
 * the UTC-anchored boundaries in period-queries (trades.entryDate is
 * timestamptz — local-tz extractors would mark the wrong month dirty on
 * non-UTC servers near month boundaries).
 *
 * ISO week/year extraction uses a UTC-local shim: date-fns getISOWeek and
 * getISOWeekYear are local-tz functions. We construct a date that has the
 * same calendar day in local-tz as the input had in UTC, so the ISO week
 * computation aligns with the UTC calendar date (e.g. Dec 29 2025 UTC →
 * ISO week 1/2026 regardless of the server's local timezone).
 *
 * @param accountId - The trading account UUID
 * @param date - The date of the mutated trade/event (timestamptz-sourced)
 */
const invalidateAggregates = async (accountId: string, date: Date): Promise<void> => {
	// --- Calendar month (UTC) ---
	// getUTCFullYear/getUTCMonth match the UTC-anchored month boundaries used
	// in period-queries (monthStart = Date.UTC(year, month-1, 1, ...)).
	const year = date.getUTCFullYear()
	const month = date.getUTCMonth() + 1 // getUTCMonth is 0-based

	// --- ISO week/year (UTC-shim for local-tz date-fns helpers) ---
	// date-fns getISOWeek / getISOWeekYear operate in local-tz. Constructing a
	// local date with the same year/month/day as the UTC calendar date means
	// the ISO week number is computed against the UTC calendar day, not the
	// local one — keeping parity with the UTC week boundaries in period-queries.
	const localShim = new Date(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate(),
	)
	const isoWeek = getWeekNumber(localShim)
	const isoYear = getWeekYear(localShim)

	// Parallel upserts — independent rows on independent tables. Sequential
	// awaits would double the latency of every trade mutation (this runs in
	// the request path of createTrade / updateTrade / deleteTrade).
	await Promise.all([
		db
			.insert(accountMonthlyAggregate)
			.values({ accountId, year, month, isDirty: true })
			.onConflictDoUpdate({
				target: [
					accountMonthlyAggregate.accountId,
					accountMonthlyAggregate.year,
					accountMonthlyAggregate.month,
				],
				set: { isDirty: true },
			}),
		db
			.insert(accountWeeklyAggregate)
			.values({ accountId, isoYear, isoWeek, isDirty: true })
			.onConflictDoUpdate({
				target: [
					accountWeeklyAggregate.accountId,
					accountWeeklyAggregate.isoYear,
					accountWeeklyAggregate.isoWeek,
				],
				set: { isDirty: true },
			}),
	])
}

export { invalidateAggregates }
