/**
 * Quarterly plan row seeder for the Bravo persona.
 *
 * Stage 2 seeds Bravo's yearly_plan row but does NOT cascade into
 * quarterly_plan rows (see `createYearlyPlanV2` in
 * `src/app/actions/fractal-plan/yearly.ts` — no quarterly insert).
 * Stage 7 navigates to `/en/plan/{YEAR}/{Q}` and the cockpit gates
 * `#quarter-narrative` on `quarterRow.reflectionNotes ||
 * quarterRow.postMortemNotes` (see
 * `src/components/fractal-plan/cockpit/quarter-report.tsx:353`).
 *
 * This seeder inserts a quarterly_plan row for the current quarter of
 * the plan year, populating both narrative fields so Stage 7 can
 * tighten its assertion from "navigation landmark visible" to
 * "narrative section visible".
 *
 * Idempotent: upserts into quarterly_plan on (yearly_plan_id, quarter),
 * preserving the existing row id so cascade monthly/weekly rows survive re-runs.
 */

import { drizzle } from "drizzle-orm/neon-http"
import { sql } from "drizzle-orm"

interface QuarterlyIds {
	userId: string
	accountId: string
	yearlyPlanId: string
}

export interface QuarterlyPlanSeedResult {
	yearlyPlanId: string
	quarterlyPlanId: string
	year: number
	quarter: number
}

interface IdRow extends Record<string, unknown> {
	id: string
}

const requireDatabaseUrl = (): string => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("[seed-bravo-quarterly-plan] DATABASE_URL is not set.")
	}
	return url
}

const buildDb = () => drizzle(requireDatabaseUrl())

const resolveIds = async (
	email: string,
	year: number
): Promise<QuarterlyIds> => {
	const db = buildDb()

	const userRows = await db.execute<IdRow>(sql`
		SELECT id FROM users WHERE email = ${email} LIMIT 1
	`)
	if (userRows.rows.length === 0) {
		throw new Error(
			`[seed-bravo-quarterly-plan] Bravo user ${email} not found. Run Stage 0 first.`
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
			`[seed-bravo-quarterly-plan] Bravo has no trading account. Run Stage 1 first.`
		)
	}
	const accountId = accountRows.rows[0].id

	const yearRows = await db.execute<IdRow>(sql`
		SELECT id FROM yearly_plans
		WHERE account_id = ${accountId} AND year = ${year}
		LIMIT 1
	`)
	if (yearRows.rows.length === 0) {
		throw new Error(
			`[seed-bravo-quarterly-plan] No yearly_plans row for account=${accountId} year=${year}. Run Stage 2 first.`
		)
	}

	return { userId, accountId, yearlyPlanId: yearRows.rows[0].id }
}

const REFLECTION_NOTES =
	"Carryover from prior quarter consumed; risk profile held flat. " +
	"Top edge: morning trend continuations on BRVE2E. " +
	"Watch: chop sessions still over-traded."

const POST_MORTEM_NOTES =
	"Hit goal but two avoidable losses on the third Friday — " +
	"add a 'no Friday entries after 11h' rule for next quarter."

const GOAL_CENTS = 1_500_000 // R$15,000 stretch goal for the quarter

/**
 * Seed (or refresh) Bravo's quarterly_plan row for the given (year, quarter).
 *
 * Defaults to the current quarter of `year` (May 2026 → Q2 etc.) but allows
 * the caller to override for tests that pin a specific quarter.
 */
export const seedBravoQuarterlyPlan = async (
	bravoEmail: string,
	year: number,
	quarter?: number
): Promise<QuarterlyPlanSeedResult> => {
	const db = buildDb()
	const { yearlyPlanId } = await resolveIds(bravoEmail, year)

	const targetQuarter = quarter ?? Math.ceil((new Date().getUTCMonth() + 1) / 3)

	const inserted = await db.execute<IdRow>(sql`
		INSERT INTO quarterly_plan (
			yearly_plan_id,
			quarter,
			goal_cents,
			reflection_notes,
			post_mortem_notes
		) VALUES (
			${yearlyPlanId},
			${targetQuarter},
			${GOAL_CENTS},
			${REFLECTION_NOTES},
			${POST_MORTEM_NOTES}
		)
		ON CONFLICT (yearly_plan_id, quarter) DO UPDATE SET
			goal_cents        = EXCLUDED.goal_cents,
			reflection_notes  = EXCLUDED.reflection_notes,
			post_mortem_notes = EXCLUDED.post_mortem_notes
		RETURNING id
	`)

	return {
		yearlyPlanId,
		quarterlyPlanId: inserted.rows[0].id,
		year,
		quarter: targetQuarter,
	}
}
