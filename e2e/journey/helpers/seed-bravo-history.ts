/**
 * Multi-month trade-history seeder for the Bravo persona.
 *
 * Runs between Stage 4 (Bravo logs her first trade via the UI) and Stage 5
 * (Weekly Reflection). Inserts ~25 prior-month trades spanning the four
 * months before the current one, so that downstream stages can assert on
 * non-trivial aggregates:
 *
 *   • Stage 6 DARF section: at least one loss month → non-zero carryover
 *     balance that the next profit month consumes (exercises the lazy
 *     `getMonthlyDarf` recompute path with real carryover data, not just
 *     a single-trade fast path).
 *   • Stage 7 annual rollup: ≥4 months of trades → meaningful annual
 *     summary numbers instead of "one trade in the current month".
 *   • Stage 7 quarter cockpit: spans Q1 + Q2 of the current year → the
 *     quarter navigation surfaces non-empty content for both halves.
 *
 * What this seeder does NOT cover:
 *   • Quarter narrative (#quarter-narrative is gated on a seeded
 *     quarterlyPlan DB row, which is a separate fractal-plan concern).
 *   • Encryption. Field-level encryption is disabled in this project
 *     (`src/lib/user-crypto.ts:getUserDek` returns null). Trades store
 *     plain decimal strings for prices, sizes, and PnL.
 *
 * Idempotency: trades are tagged with `lesson_learned = "JOURNEY_SEED"`
 * and the seeder deletes prior tagged rows for the same account before
 * inserting. Safe to re-run within a chain without producing duplicates.
 */

import { drizzle } from "drizzle-orm/neon-http"
import { sql } from "drizzle-orm"
import { recomputeAccountMonth } from "@/lib/tax/recompute-month"

const SEED_MARKER = "JOURNEY_SEED"
const BRAVO_ASSET_SYMBOL = "BRVE2E"

interface BravoIds {
	userId: string
	accountId: string
}

interface SeedResult {
	inserted: number
	monthsSeeded: ReadonlyArray<{ year: number; month: number; count: number }>
	ledgerRowsComputed: number
	carryoverOutCentsByMonth: ReadonlyArray<{
		year: number
		month: number
		carryoverOutCents: number
	}>
}

interface IdRow extends Record<string, unknown> {
	id: string
}

interface CountRow extends Record<string, unknown> {
	count: string
}

const requireDatabaseUrl = (): string => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error(
			"[seed-bravo-history] DATABASE_URL is not set. The seeder needs DB access — set it in .env or pass it through your shell."
		)
	}
	return url
}

const buildDb = () => drizzle(requireDatabaseUrl())

const resolveBravoIds = async (email: string): Promise<BravoIds> => {
	const db = buildDb()
	const userRows = await db.execute<IdRow>(sql`
		SELECT id FROM users WHERE email = ${email} LIMIT 1
	`)
	if (userRows.rows.length === 0) {
		throw new Error(
			`[seed-bravo-history] Bravo user with email ${email} not found. Run Stage 0 first.`
		)
	}
	const userId = userRows.rows[0].id

	const accountRows = await db.execute<IdRow>(sql`
		SELECT id FROM trading_accounts
		WHERE user_id = ${userId}
		ORDER BY created_at ASC
		LIMIT 1
	`)
	if (accountRows.rows.length === 0) {
		throw new Error(
			`[seed-bravo-history] Bravo has no trading account yet. Run Stage 1 first.`
		)
	}

	return { userId, accountId: accountRows.rows[0].id }
}

/**
 * Returns { year, month } for the N most-recent months strictly BEFORE the
 * current month. monthOffset=1 → previous month, monthOffset=2 → 2 months
 * ago, etc.
 */
const priorMonth = (
	monthOffset: number
): { year: number; month: number; daysInMonth: number } => {
	const now = new Date()
	const target = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, 1)
	)
	const year = target.getUTCFullYear()
	const month = target.getUTCMonth() + 1
	// Day 0 of next month = last day of target month.
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
	return { year, month, daysInMonth }
}

interface PlannedTrade {
	year: number
	month: number
	day: number
	hour: number
	direction: "long" | "short"
	pnlCents: number
	outcome: "win" | "loss" | "breakeven"
	rOutcome: number
}

/**
 * Build the trade plan: 4 months × varied density.
 *
 * The shape is designed to exercise DARF carryover:
 *   Month -4 (oldest): mildly profitable, small numbers.
 *   Month -3: net LOSS (large enough to create a carryover balance).
 *   Month -2: net PROFIT (consumes part of the carryover from -3).
 *   Month -1 (most recent prior): mixed, net slightly positive.
 *
 * Day-of-month is bounded by each month's actual length so Feb / 30-day
 * months don't produce invalid dates.
 */
const buildPlan = (): PlannedTrade[] => {
	const m4 = priorMonth(4)
	const m3 = priorMonth(3)
	const m2 = priorMonth(2)
	const m1 = priorMonth(1)

	const clampDay = (target: { daysInMonth: number }, day: number): number =>
		Math.min(day, target.daysInMonth)

	const plan: PlannedTrade[] = [
		// Month -4: 5 trades, net +R$2,500.
		{
			year: m4.year,
			month: m4.month,
			day: clampDay(m4, 3),
			hour: 10,
			direction: "long",
			pnlCents: 80000,
			outcome: "win",
			rOutcome: 1.6,
		},
		{
			year: m4.year,
			month: m4.month,
			day: clampDay(m4, 7),
			hour: 11,
			direction: "short",
			pnlCents: -30000,
			outcome: "loss",
			rOutcome: -1.0,
		},
		{
			year: m4.year,
			month: m4.month,
			day: clampDay(m4, 12),
			hour: 9,
			direction: "long",
			pnlCents: 60000,
			outcome: "win",
			rOutcome: 1.2,
		},
		{
			year: m4.year,
			month: m4.month,
			day: clampDay(m4, 18),
			hour: 14,
			direction: "long",
			pnlCents: 90000,
			outcome: "win",
			rOutcome: 1.8,
		},
		{
			year: m4.year,
			month: m4.month,
			day: clampDay(m4, 24),
			hour: 10,
			direction: "short",
			pnlCents: 50000,
			outcome: "win",
			rOutcome: 1.0,
		},

		// Month -3: 7 trades, NET LOSS (-R$3,000). Creates DARF carryover.
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 2),
			hour: 9,
			direction: "long",
			pnlCents: -75000,
			outcome: "loss",
			rOutcome: -1.5,
		},
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 5),
			hour: 11,
			direction: "short",
			pnlCents: -50000,
			outcome: "loss",
			rOutcome: -1.0,
		},
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 9),
			hour: 10,
			direction: "long",
			pnlCents: 40000,
			outcome: "win",
			rOutcome: 0.8,
		},
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 14),
			hour: 13,
			direction: "long",
			pnlCents: -60000,
			outcome: "loss",
			rOutcome: -1.2,
		},
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 19),
			hour: 9,
			direction: "short",
			pnlCents: 35000,
			outcome: "win",
			rOutcome: 0.7,
		},
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 23),
			hour: 11,
			direction: "long",
			pnlCents: -55000,
			outcome: "loss",
			rOutcome: -1.1,
		},
		{
			year: m3.year,
			month: m3.month,
			day: clampDay(m3, 27),
			hour: 14,
			direction: "short",
			pnlCents: -35000,
			outcome: "loss",
			rOutcome: -0.7,
		},

		// Month -2: 7 trades, NET PROFIT (+R$4,200). Consumes carryover from m3.
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 3),
			hour: 9,
			direction: "long",
			pnlCents: 70000,
			outcome: "win",
			rOutcome: 1.4,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 6),
			hour: 10,
			direction: "long",
			pnlCents: 85000,
			outcome: "win",
			rOutcome: 1.7,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 10),
			hour: 11,
			direction: "short",
			pnlCents: -25000,
			outcome: "loss",
			rOutcome: -0.5,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 15),
			hour: 14,
			direction: "long",
			pnlCents: 95000,
			outcome: "win",
			rOutcome: 1.9,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 19),
			hour: 9,
			direction: "long",
			pnlCents: 65000,
			outcome: "win",
			rOutcome: 1.3,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 23),
			hour: 13,
			direction: "short",
			pnlCents: 80000,
			outcome: "win",
			rOutcome: 1.6,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clampDay(m2, 27),
			hour: 10,
			direction: "long",
			pnlCents: 50000,
			outcome: "win",
			rOutcome: 1.0,
		},

		// Month -1: 6 trades, slight net positive (+R$1,200).
		{
			year: m1.year,
			month: m1.month,
			day: clampDay(m1, 4),
			hour: 9,
			direction: "long",
			pnlCents: 45000,
			outcome: "win",
			rOutcome: 0.9,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clampDay(m1, 8),
			hour: 11,
			direction: "short",
			pnlCents: -40000,
			outcome: "loss",
			rOutcome: -0.8,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clampDay(m1, 13),
			hour: 10,
			direction: "long",
			pnlCents: 55000,
			outcome: "win",
			rOutcome: 1.1,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clampDay(m1, 17),
			hour: 14,
			direction: "short",
			pnlCents: -30000,
			outcome: "loss",
			rOutcome: -0.6,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clampDay(m1, 22),
			hour: 9,
			direction: "long",
			pnlCents: 60000,
			outcome: "win",
			rOutcome: 1.2,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clampDay(m1, 26),
			hour: 11,
			direction: "long",
			pnlCents: 30000,
			outcome: "win",
			rOutcome: 0.6,
		},
	]

	return plan
}

const ONE_R_SNAPSHOT_CENTS = 50000 // 5 mini-WIN contracts × 100 pts × R$1/pt = R$500
const POSITION_SIZE_CONTRACTS = 5

/**
 * Approximate WIN futures (mini) index level for each prior month.
 * WIN point value: R$1 per contract per point.
 * Prices reflect a gradual uptrend toward the current ~190k level.
 */
const buildMonthPriceMap = (): Map<string, number> => {
	const bases: Array<[monthOffset: number, basePrice: number]> = [
		[4, 185500],
		[3, 187000],
		[2, 189000],
		[1, 190500],
	]
	const map = new Map<string, number>()
	for (const [offset, base] of bases) {
		const { year, month } = priorMonth(offset)
		map.set(`${year}-${month}`, base)
	}
	return map
}

const insertPlan = async (
	accountId: string,
	plan: ReadonlyArray<PlannedTrade>
): Promise<number> => {
	const db = buildDb()
	const monthPrices = buildMonthPriceMap()
	let inserted = 0

	for (const trade of plan) {
		const entryDate = new Date(
			Date.UTC(trade.year, trade.month - 1, trade.day, trade.hour, 5, 0)
		)
		const exitDate = new Date(entryDate)
		exitDate.setUTCMinutes(entryDate.getUTCMinutes() + 30)

		const monthBase = monthPrices.get(`${trade.year}-${trade.month}`) ?? 190000
		const entryPts = monthBase + (trade.day % 5) * 100
		const pnlPoints = Math.round(trade.pnlCents / 100 / POSITION_SIZE_CONTRACTS)
		const entryPrice = String(entryPts)
		const exitPrice = String(entryPts + pnlPoints)
		const positionSize = String(POSITION_SIZE_CONTRACTS)

		await db.execute(sql`
			INSERT INTO trades (
				account_id,
				asset,
				direction,
				entry_date,
				exit_date,
				entry_price,
				exit_price,
				position_size,
				pnl,
				outcome,
				one_r_snapshot_cents,
				r_outcome,
				lesson_learned,
				is_archived,
				execution_mode
			) VALUES (
				${accountId},
				${BRAVO_ASSET_SYMBOL},
				${trade.direction},
				${entryDate.toISOString()},
				${exitDate.toISOString()},
				${entryPrice},
				${exitPrice},
				${positionSize},
				${String(trade.pnlCents)},
				${trade.outcome},
				${ONE_R_SNAPSHOT_CENTS},
				${String(trade.rOutcome)},
				${SEED_MARKER},
				false,
				'simple'
			)
		`)
		inserted += 1
	}

	return inserted
}

const deletePriorSeed = async (accountId: string): Promise<number> => {
	const db = buildDb()
	const result = await db.execute<CountRow>(sql`
		WITH deleted AS (
			DELETE FROM trades
			WHERE account_id = ${accountId}
			  AND lesson_learned = ${SEED_MARKER}
			RETURNING id
		)
		SELECT COUNT(*)::text AS count FROM deleted
	`)
	return Number(result.rows[0]?.count ?? 0)
}

interface MonthlyRecomputeOutcome {
	year: number
	month: number
	carryoverOutCents: number
}

/**
 * Walk seeded months chronologically and trigger `recomputeAccountMonth`
 * so monthly_tax_ledger rows are populated. Without this, the carryover
 * ledger (`CarryoverLedger` in `reports-content.tsx`) is empty in Stage 6
 * even though the seeded loss month should produce a non-zero balance.
 *
 * `carryoverIn` is threaded: month N's carryoverOut becomes month N+1's
 * carryoverIn. This mirrors what `getMonthlyDarf` does at request time
 * when it walks back to seed missing months.
 *
 * Note: `recompute-month.ts` is a protected path per CLAUDE.md (single
 * source of truth for tax recomputation). We only INVOKE the exported
 * function — we do not modify it.
 */
const recomputeSeededMonths = async (
	userId: string,
	accountId: string,
	plan: ReadonlyArray<PlannedTrade>
): Promise<ReadonlyArray<MonthlyRecomputeOutcome>> => {
	const ordered = summarize(plan)
	const outcomes: MonthlyRecomputeOutcome[] = []
	let carryoverIn = 0
	for (const { year, month } of ordered) {
		const result = await recomputeAccountMonth({
			accountId,
			year,
			month,
			carryoverInCents: carryoverIn,
			userId,
		})
		outcomes.push({
			year,
			month,
			carryoverOutCents: result.carryoverOutCents,
		})
		carryoverIn = result.carryoverOutCents
	}
	return outcomes
}

const summarize = (
	plan: ReadonlyArray<PlannedTrade>
): ReadonlyArray<{ year: number; month: number; count: number }> => {
	const byMonth = new Map<
		string,
		{ year: number; month: number; count: number }
	>()
	for (const trade of plan) {
		const key = `${trade.year}-${trade.month}`
		const existing = byMonth.get(key)
		if (existing) {
			existing.count += 1
		} else {
			byMonth.set(key, { year: trade.year, month: trade.month, count: 1 })
		}
	}
	return Array.from(byMonth.values()).sort((a, b) => {
		if (a.year !== b.year) {
			return a.year - b.year
		}
		return a.month - b.month
	})
}

/**
 * Seed Bravo's prior-month trade history.
 *
 * Looks up Bravo via her email (from `getBravo()` in fixtures), resolves
 * her primary trading account, wipes any prior seed-marked trades on that
 * account, then inserts the multi-month plan. After inserts, triggers
 * `recomputeAccountMonth` for each seeded month in chronological order so
 * the monthly_tax_ledger rows are populated and the carryover ledger in
 * Stage 6 has real data to render.
 */
export const seedBravoHistory = async (
	bravoEmail: string
): Promise<SeedResult> => {
	const { userId, accountId } = await resolveBravoIds(bravoEmail)
	await deletePriorSeed(accountId)
	const plan = buildPlan()
	const inserted = await insertPlan(accountId, plan)
	const recomputed = await recomputeSeededMonths(userId, accountId, plan)
	return {
		inserted,
		monthsSeeded: summarize(plan),
		ledgerRowsComputed: recomputed.length,
		carryoverOutCentsByMonth: recomputed,
	}
}
