/**
 * Prior-month Hawks history seeder for the Bravo persona.
 *
 * Runs before Stage 9 (Hawks Daily Loop). Inserts:
 *   • An active account_modes row (mode = 'hawks') for Bravo's account.
 *   • 2 prior months of Hawks trades with trade_hawks_metadata rows.
 *   • Matching daily_hawks_bias rows for each seeded trading day.
 *
 * The data is shaped to produce a meaningful scorecard in Stage 9:
 *   Month -2: 6 trades, all triple-screen confirmed, all bias-aligned → high score.
 *   Month -1: 6 trades, 4 triple-screen confirmed, 3 bias-aligned → moderate score.
 *
 * Idempotency: trades tagged with `lesson_learned = "HAWKS_JOURNEY_SEED"` are
 * deleted before inserting. The account_modes row uses INSERT … ON CONFLICT DO
 * NOTHING so activation is safe to re-run.
 */

import { drizzle } from "drizzle-orm/neon-http"
import { sql } from "drizzle-orm"

const SEED_MARKER = "HAWKS_JOURNEY_SEED"
const HAWKS_ASSET_SYMBOL = "BRVE2E"
const ONE_R_SNAPSHOT_CENTS = 50000
const POSITION_SIZE_CONTRACTS = 5

interface HawksIds {
	userId: string
	accountId: string
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
		throw new Error("[seed-hawks-history] DATABASE_URL is not set.")
	}
	return url
}

const buildDb = () => drizzle(requireDatabaseUrl())

const resolveHawksIds = async (email: string): Promise<HawksIds> => {
	const db = buildDb()
	const userRows = await db.execute<IdRow>(sql`
		SELECT id FROM users WHERE email = ${email} LIMIT 1
	`)
	if (userRows.rows.length === 0) {
		throw new Error(
			`[seed-hawks-history] User ${email} not found. Run Stage 0 first.`
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
			`[seed-hawks-history] No trading account found for ${email}.`
		)
	}

	return { userId, accountId: accountRows.rows[0].id }
}

const priorMonth = (
	monthOffset: number
): { year: number; month: number; daysInMonth: number } => {
	const now = new Date()
	const target = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, 1)
	)
	const year = target.getUTCFullYear()
	const month = target.getUTCMonth() + 1
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
	return { year, month, daysInMonth }
}

type HawksBias = "long" | "short" | "neutral"

interface HawksTradePlan {
	year: number
	month: number
	day: number
	hour: number
	direction: "long" | "short"
	pnlCents: number
	outcome: "win" | "loss" | "breakeven"
	rOutcome: number
	ordinal: number
	bias: HawksBias
	biasAtEntry: HawksBias
	tripleScreenConfirmed: boolean
}

const buildHawksPlan = (): HawksTradePlan[] => {
	const m2 = priorMonth(2)
	const m1 = priorMonth(1)
	const clamp = (target: { daysInMonth: number }, day: number) =>
		Math.min(day, target.daysInMonth)

	return [
		// Month -2: 6 trades across 3 days (2 per day), all conforming
		{
			year: m2.year,
			month: m2.month,
			day: clamp(m2, 5),
			hour: 9,
			direction: "long",
			pnlCents: 70000,
			outcome: "win",
			rOutcome: 1.4,
			ordinal: 1,
			bias: "long",
			biasAtEntry: "long",
			tripleScreenConfirmed: true,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clamp(m2, 5),
			hour: 11,
			direction: "long",
			pnlCents: 50000,
			outcome: "win",
			rOutcome: 1.0,
			ordinal: 2,
			bias: "long",
			biasAtEntry: "long",
			tripleScreenConfirmed: true,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clamp(m2, 12),
			hour: 10,
			direction: "short",
			pnlCents: -30000,
			outcome: "loss",
			rOutcome: -0.6,
			ordinal: 1,
			bias: "short",
			biasAtEntry: "short",
			tripleScreenConfirmed: true,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clamp(m2, 12),
			hour: 13,
			direction: "short",
			pnlCents: 80000,
			outcome: "win",
			rOutcome: 1.6,
			ordinal: 2,
			bias: "short",
			biasAtEntry: "short",
			tripleScreenConfirmed: true,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clamp(m2, 20),
			hour: 9,
			direction: "long",
			pnlCents: 90000,
			outcome: "win",
			rOutcome: 1.8,
			ordinal: 1,
			bias: "long",
			biasAtEntry: "long",
			tripleScreenConfirmed: true,
		},
		{
			year: m2.year,
			month: m2.month,
			day: clamp(m2, 20),
			hour: 11,
			direction: "long",
			pnlCents: 60000,
			outcome: "win",
			rOutcome: 1.2,
			ordinal: 2,
			bias: "long",
			biasAtEntry: "long",
			tripleScreenConfirmed: true,
		},

		// Month -1: 6 trades across 3 days — 4 of 6 triple-screen, 3 of 6 bias-aligned
		{
			year: m1.year,
			month: m1.month,
			day: clamp(m1, 6),
			hour: 9,
			direction: "long",
			pnlCents: 55000,
			outcome: "win",
			rOutcome: 1.1,
			ordinal: 1,
			bias: "long",
			biasAtEntry: "long",
			tripleScreenConfirmed: true,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clamp(m1, 6),
			hour: 11,
			direction: "short",
			pnlCents: -25000,
			outcome: "loss",
			rOutcome: -0.5,
			ordinal: 2,
			bias: "long",
			biasAtEntry: "short",
			tripleScreenConfirmed: false,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clamp(m1, 14),
			hour: 10,
			direction: "long",
			pnlCents: 65000,
			outcome: "win",
			rOutcome: 1.3,
			ordinal: 1,
			bias: "long",
			biasAtEntry: "long",
			tripleScreenConfirmed: true,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clamp(m1, 14),
			hour: 13,
			direction: "long",
			pnlCents: -40000,
			outcome: "loss",
			rOutcome: -0.8,
			ordinal: 2,
			bias: "long",
			biasAtEntry: "short",
			tripleScreenConfirmed: false,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clamp(m1, 21),
			hour: 9,
			direction: "short",
			pnlCents: 75000,
			outcome: "win",
			rOutcome: 1.5,
			ordinal: 1,
			bias: "short",
			biasAtEntry: "short",
			tripleScreenConfirmed: true,
		},
		{
			year: m1.year,
			month: m1.month,
			day: clamp(m1, 21),
			hour: 11,
			direction: "short",
			pnlCents: 45000,
			outcome: "win",
			rOutcome: 0.9,
			ordinal: 2,
			bias: "short",
			biasAtEntry: "short",
			tripleScreenConfirmed: true,
		},
	]
}

const activateHawksMode = async (
	userId: string,
	accountId: string
): Promise<void> => {
	const db = buildDb()
	// Deactivate any existing mode first
	await db.execute(sql`
		UPDATE account_modes
		SET deactivated_at = now(), updated_at = now()
		WHERE account_id = ${accountId}
		  AND deactivated_at IS NULL
	`)
	// Insert active Hawks mode row
	await db.execute(sql`
		INSERT INTO account_modes (account_id, user_id, mode, activated_at)
		VALUES (${accountId}, ${userId}, 'hawks', now())
		ON CONFLICT DO NOTHING
	`)
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

const insertHawksPlan = async (
	accountId: string,
	plan: ReadonlyArray<HawksTradePlan>
): Promise<number> => {
	const db = buildDb()
	let inserted = 0

	for (const trade of plan) {
		const entryDate = new Date(
			Date.UTC(trade.year, trade.month - 1, trade.day, trade.hour, 5, 0)
		)
		const exitDate = new Date(entryDate)
		exitDate.setUTCMinutes(exitDate.getUTCMinutes() + 25)

		const basePrice = 190000 + (trade.day % 5) * 100
		const pnlPoints = Math.round(trade.pnlCents / 100 / POSITION_SIZE_CONTRACTS)
		const entryPrice = String(basePrice)
		const exitPrice = String(basePrice + pnlPoints)

		// Insert parent trade row
		const tradeRows = await db.execute<IdRow>(sql`
			INSERT INTO trades (
				account_id, asset, direction, entry_date, exit_date,
				entry_price, exit_price, position_size, pnl, outcome,
				one_r_snapshot_cents, r_outcome, lesson_learned,
				is_archived, execution_mode
			) VALUES (
				${accountId}, ${HAWKS_ASSET_SYMBOL}, ${trade.direction},
				${entryDate.toISOString()}, ${exitDate.toISOString()},
				${entryPrice}, ${exitPrice}, ${String(POSITION_SIZE_CONTRACTS)},
				${String(trade.pnlCents)}, ${trade.outcome},
				${ONE_R_SNAPSHOT_CENTS}, ${String(trade.rOutcome)},
				${SEED_MARKER}, false, 'simple'
			)
			RETURNING id
		`)
		const tradeId = tradeRows.rows[0]?.id
		if (!tradeId) {
			continue
		}

		// Insert hawks metadata sidecar
		await db.execute(sql`
			INSERT INTO trade_hawks_metadata (
				trade_id, bias_at_entry, vwap_respected, ajuste_respected,
				triple_screen_confirmed, daily_trade_ordinal, entered_at
			) VALUES (
				${tradeId}, ${trade.biasAtEntry}, true, true,
				${trade.tripleScreenConfirmed}, ${trade.ordinal},
				${entryDate.toISOString()}
			)
			ON CONFLICT (trade_id) DO NOTHING
		`)

		inserted += 1
	}

	return inserted
}

const insertDailyBiases = async (
	accountId: string,
	plan: ReadonlyArray<HawksTradePlan>
): Promise<number> => {
	const db = buildDb()
	// Deduplicate by (year, month, day) — one bias per trading day
	const seen = new Set<string>()
	let inserted = 0

	for (const trade of plan) {
		const key = `${trade.year}-${trade.month}-${trade.day}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)

		const dayStr = `${trade.year}-${String(trade.month).padStart(2, "0")}-${String(trade.day).padStart(2, "0")}`
		const isBullishBias = trade.bias === "long"

		await db.execute(sql`
			INSERT INTO daily_hawks_bias (
				account_id, trading_day, bias,
				renko_close_above_60min, macd_slope_up, ema_stack_bullish,
				vwap_above, ajuste_respected, confirmed_at
			) VALUES (
				${accountId}, ${dayStr}, ${trade.bias},
				${isBullishBias}, ${isBullishBias}, ${isBullishBias},
				true, true,
				${new Date(trade.year, trade.month - 1, trade.day, trade.hour - 1).toISOString()}
			)
			ON CONFLICT (account_id, trading_day) DO NOTHING
		`)

		inserted += 1
	}

	return inserted
}

interface SeedResult {
	deleted: number
	tradesInserted: number
	biasesInserted: number
}

export const seedHawksHistory = async (
	bravoEmail: string
): Promise<SeedResult> => {
	const { userId, accountId } = await resolveHawksIds(bravoEmail)
	await activateHawksMode(userId, accountId)
	const deleted = await deletePriorSeed(accountId)
	const plan = buildHawksPlan()
	const tradesInserted = await insertHawksPlan(accountId, plan)
	const biasesInserted = await insertDailyBiases(accountId, plan)
	return { deleted, tradesInserted, biasesInserted }
}
