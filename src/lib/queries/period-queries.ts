// src/lib/queries/period-queries.ts

import { db } from "@/db/drizzle"
import { trades, tradingAccounts, accountMonthlyAggregate, accountWeeklyAggregate } from "@/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { rollupTrades } from "@/lib/aggregation/period-rollup"
import type { TradeFact } from "@/lib/aggregation/period-rollup"
import { centsToPoints } from "@/lib/contracts/point-values"
import type { PeriodResult } from "@/types/integration"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Looks up the userId that owns a given trading account.
 * Required because getUserDek() takes a userId, not an accountId.
 */
const getAccountUserId = async (accountId: string): Promise<string | null> => {
	const row = await db.query.tradingAccounts.findFirst({
		where: eq(tradingAccounts.id, accountId),
		columns: { userId: true },
	})
	return row?.userId ?? null
}

/**
 * Loads raw trades for a date range and decrypts the monetary fields.
 * Returns TradeFact objects ready for rollupTrades.
 *
 * Encryption is currently disabled (getUserDek always returns null), so dek
 * will be null and pnl/commission/fees/positionSize are already plaintext
 * string-encoded integers. The fallback path parses them directly.
 */
const loadTradesForRange = async (
	accountId: string,
	rangeStart: Date,
	rangeEnd: Date,
): Promise<TradeFact[]> => {
	// No row limit: a single account/period is bounded by trading frequency
	// (heavy day-trader ≈ 1k/day → ≤30k/month). Silent truncation would corrupt
	// aggregates; if memory becomes an issue, switch to cursored streaming here.
	const rawRows = await db
		.select()
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, rangeStart),
				lte(trades.entryDate, rangeEnd),
				eq(trades.isArchived, false),
			),
		)

	const userId = await getAccountUserId(accountId)
	const dek = userId ? await getUserDek(userId) : null

	// Match the analytics.ts pattern: batch-decrypt once, then map
	const decryptedRows = dek ? rawRows.map((t) => decryptTradeFields(t, dek)) : rawRows

	return decryptedRows.map((t) => {
		// dek non-null → decryptTradeFields returns numbers; dek null → raw strings.
		// Fail loudly on NaN: a corrupted ciphertext silently propagating into the
		// aggregate would poison every dependent reading in the system.
		const pnlCents = Number(t.pnl ?? 0)
		const commissionCents = Number(t.commission ?? 0)
		const feesCents = Number(t.fees ?? 0)
		if (Number.isNaN(pnlCents) || Number.isNaN(commissionCents) || Number.isNaN(feesCents)) {
			throw new Error(`period-queries: non-numeric monetary field on trade ${t.id}`)
		}

		const contracts = Number(t.positionSize ?? 1) || 1
		const points = centsToPoints(pnlCents, t.asset, contracts)

		return {
			id: t.id,
			asset: t.asset,
			pnlCents,
			commissionCents,
			feesCents,
			points,
			entryDate: t.entryDate,
		} satisfies TradeFact
	})
}

/**
 * Converts a stored aggregate row into a PeriodResult (points is a numeric string).
 */
const rowToPeriodResult = (row: {
	grossCents: number
	netCents: number
	points: unknown
	tradingDays: number
	gainDays: number
	lossDays: number
}): PeriodResult => ({
	grossCents: row.grossCents,
	netCents: row.netCents,
	points: parseFloat(String(row.points)),
	tradingDays: row.tradingDays,
	gainDays: row.gainDays,
	lossDays: row.lossDays,
})

/**
 * Upserts a fresh PeriodResult into the monthly aggregate table and marks it clean.
 */
const upsertMonthAggregate = async (
	accountId: string,
	year: number,
	month: number,
	result: PeriodResult,
): Promise<void> => {
	await db
		.insert(accountMonthlyAggregate)
		.values({
			accountId,
			year,
			month,
			grossCents: result.grossCents,
			netCents: result.netCents,
			points: result.points.toString(),
			tradingDays: result.tradingDays,
			gainDays: result.gainDays,
			lossDays: result.lossDays,
			isDirty: false,
			computedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [accountMonthlyAggregate.accountId, accountMonthlyAggregate.year, accountMonthlyAggregate.month],
			set: {
				grossCents: result.grossCents,
				netCents: result.netCents,
				points: result.points.toString(),
				tradingDays: result.tradingDays,
				gainDays: result.gainDays,
				lossDays: result.lossDays,
				isDirty: false,
				computedAt: new Date(),
			},
		})
}

/**
 * Upserts a fresh PeriodResult into the weekly aggregate table and marks it clean.
 */
const upsertWeekAggregate = async (
	accountId: string,
	isoYear: number,
	isoWeek: number,
	result: PeriodResult,
): Promise<void> => {
	await db
		.insert(accountWeeklyAggregate)
		.values({
			accountId,
			isoYear,
			isoWeek,
			grossCents: result.grossCents,
			netCents: result.netCents,
			points: result.points.toString(),
			tradingDays: result.tradingDays,
			gainDays: result.gainDays,
			lossDays: result.lossDays,
			isDirty: false,
			computedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [accountWeeklyAggregate.accountId, accountWeeklyAggregate.isoYear, accountWeeklyAggregate.isoWeek],
			set: {
				grossCents: result.grossCents,
				netCents: result.netCents,
				points: result.points.toString(),
				tradingDays: result.tradingDays,
				gainDays: result.gainDays,
				lossDays: result.lossDays,
				isDirty: false,
				computedAt: new Date(),
			},
		})
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the rolled-up PeriodResult for a calendar month.
 *
 * Reads from the materialized aggregate row when it exists and is clean.
 * Falls back to recomputing from raw trades (then persists the result)
 * when the row is missing or marked dirty.
 */
const getMonthAggregate = async (
	accountId: string,
	year: number,
	month: number,
): Promise<PeriodResult> => {
	const rows = await db
		.select()
		.from(accountMonthlyAggregate)
		.where(
			and(
				eq(accountMonthlyAggregate.accountId, accountId),
				eq(accountMonthlyAggregate.year, year),
				eq(accountMonthlyAggregate.month, month),
			),
		)
		.limit(1)

	const row = rows[0]
	if (row && !row.isDirty) {
		return rowToPeriodResult(row)
	}

	// Row is missing or dirty — recompute from raw trades.
	// UTC-anchored boundaries: trades.entryDate is timestamptz. Local-midnight
	// boundaries (date-fns startOfMonth/endOfMonth) would drop trades placed in
	// the last hour of the month on non-UTC servers.
	const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
	const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

	const facts = await loadTradesForRange(accountId, monthStart, monthEnd)
	const result = rollupTrades(facts, { year, month })

	await upsertMonthAggregate(accountId, year, month, result)

	return result
}

/**
 * Returns the rolled-up PeriodResult for an ISO 8601 week.
 *
 * Uses setISOWeek/setISOWeekYear from date-fns to build a Monday anchor for
 * the requested ISO year+week, then derives the full Mon–Sun range via the
 * iso-week helpers. This correctly handles boundary weeks (e.g. week 1/2026
 * starts Mon 2025-12-29, which lives in calendar year 2025).
 */
const getWeekAggregate = async (
	accountId: string,
	isoYear: number,
	isoWeek: number,
): Promise<PeriodResult> => {
	const rows = await db
		.select()
		.from(accountWeeklyAggregate)
		.where(
			and(
				eq(accountWeeklyAggregate.accountId, accountId),
				eq(accountWeeklyAggregate.isoYear, isoYear),
				eq(accountWeeklyAggregate.isoWeek, isoWeek),
			),
		)
		.limit(1)

	const row = rows[0]
	if (row && !row.isDirty) {
		return rowToPeriodResult(row)
	}

	// Canonical ISO-week anchor: Jan 4 is ALWAYS in ISO week 1 of the
	// week-year. Walk forward (isoWeek - 1) weeks to land somewhere in the
	// target week, then snap to that week's Monday in UTC. UTC anchoring
	// matches trades.entryDate (timestamptz) — local-tz boundaries would
	// drop late-Sunday trades on non-UTC servers.
	const jan4Utc = new Date(Date.UTC(isoYear, 0, 4))
	const someDayInWeekUtc = new Date(jan4Utc)
	someDayInWeekUtc.setUTCDate(jan4Utc.getUTCDate() + (isoWeek - 1) * 7)
	// ISO week starts Monday. getUTCDay: Sun=0..Sat=6 → Mon offset = (day+6)%7
	const dayOfWeek = someDayInWeekUtc.getUTCDay()
	const mondayOffset = (dayOfWeek + 6) % 7
	const wStart = new Date(someDayInWeekUtc)
	wStart.setUTCDate(someDayInWeekUtc.getUTCDate() - mondayOffset)
	wStart.setUTCHours(0, 0, 0, 0)
	const wEnd = new Date(wStart)
	wEnd.setUTCDate(wStart.getUTCDate() + 6)
	wEnd.setUTCHours(23, 59, 59, 999)

	const facts = await loadTradesForRange(accountId, wStart, wEnd)
	const result = rollupTrades(facts, { year: isoYear, isoWeek })

	await upsertWeekAggregate(accountId, isoYear, isoWeek, result)

	return result
}

/**
 * Returns the rolled-up PeriodResult for a full calendar year.
 *
 * Sums all 12 monthly aggregates, recomputing any dirty or missing months.
 * Months run concurrently — this is safe because each month's upsert is
 * independent, and the yearly total is never persisted (always derived live).
 */
const getYearAggregate = async (accountId: string, year: number): Promise<PeriodResult> => {
	const monthNumbers = Array.from({ length: 12 }, (_, i) => i + 1)
	const monthResults = await Promise.all(
		monthNumbers.map((month) => getMonthAggregate(accountId, year, month)),
	)

	return monthResults.reduce<PeriodResult>(
		(acc, m) => ({
			grossCents: acc.grossCents + m.grossCents,
			netCents: acc.netCents + m.netCents,
			points: acc.points + m.points,
			tradingDays: acc.tradingDays + m.tradingDays,
			gainDays: acc.gainDays + m.gainDays,
			lossDays: acc.lossDays + m.lossDays,
		}),
		{ grossCents: 0, netCents: 0, points: 0, tradingDays: 0, gainDays: 0, lossDays: 0 },
	)
}

export { getMonthAggregate, getWeekAggregate, getYearAggregate }
