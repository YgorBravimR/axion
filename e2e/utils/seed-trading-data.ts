/**
 * E2E test data seeder for the Live Trading Status panel.
 *
 * Inserts trades, monthly plans, and risk profiles directly into the database
 * to set up deterministic scenarios for Playwright tests. Encryption is
 * intentionally skipped because `getUserDek()` always returns null in this
 * project (field-level encryption is disabled — see src/lib/user-crypto.ts).
 *
 * Numeric fields that the server reads with `Number(trade.pnl)` work correctly
 * when stored as plain decimal strings, so we pass cents as plain text.
 *
 * @see src/lib/user-crypto.ts — getUserDek always returns null (encryption off)
 * @see src/app/actions/live-trading-status.ts — reads pnl via Number(trade.pnl)
 */

import { sql } from "drizzle-orm"
import { createDb } from "./create-db"

// ---------------------------------------------------------------------------
// Inline schema constants — avoids importing from src/ which pulls in
// Next.js-only modules (next/cache, next/headers, etc.) that crash in Node.
// We use raw SQL for all seeder operations.
// ---------------------------------------------------------------------------

interface AdminContext {
	userId: string
	accountId: string
}

interface TradeInput {
	outcome: "win" | "loss" | "breakeven"
	pnlCents: number
	direction?: "long" | "short"
	plannedRiskAmountCents?: number | null
	asset?: string
	entryOffsetMinutes?: number
}

/** Row shape returned from RETURNING id queries — must extend Record<string, unknown> for Drizzle's generic constraint */
interface InsertedTradeId extends Record<string, unknown> {
	id: string
}

/** Row shape returned from user/account SELECT queries */
interface IdRow extends Record<string, unknown> {
	id: string
}

interface SeedResult {
	tradeIds: string[]
	monthlyPlanId: string
	riskProfileId: string
	createdPlan: boolean
	createdProfile: boolean
}

// Bravo Risk Management decision tree — R-multiples format, matches src/db/seed-risk-profiles.ts
// adaptDecisionTree() multiplies riskR × oneRCents at runtime; never use riskCents/lossCents here.
const BRAVO_DECISION_TREE = {
	baseTrade: {
		riskR: 1,
		maxContracts: 20,
		minStopPoints: 100,
	},
	lossRecovery: {
		sequence: [
			{
				riskCalculation: { type: "percentOfBase", percent: 50 },
				maxContractsOverride: null,
			},
			{
				riskCalculation: { type: "percentOfBase", percent: 25 },
				maxContractsOverride: null,
			},
			{
				riskCalculation: { type: "percentOfBase", percent: 25 },
				maxContractsOverride: null,
			},
		],
		executeAllRegardless: false,
		stopAfterSequence: true,
	},
	gainMode: {
		type: "gainSequence",
		sequence: [
			{
				riskCalculation: { type: "percentOfBase", percent: 100 },
				maxContractsOverride: null,
			},
			{
				riskCalculation: { type: "percentOfBase", percent: 50 },
				maxContractsOverride: null,
			},
			{
				riskCalculation: { type: "percentOfBase", percent: 25 },
				maxContractsOverride: null,
			},
		],
		repeatLastStep: true,
		stopOnFirstLoss: true,
		dailyTargetR: 3,
	},
	cascadingLimits: {
		weeklyLossR: 4,
		weeklyAction: "stopTrading",
		monthlyLossR: 15,
		monthlyAction: "stopTrading",
	},
	executionConstraints: {
		minStopPoints: 100,
		maxContracts: 20,
		operatingHoursStart: "09:01",
		operatingHoursEnd: "17:00",
	},
	riskSizing: { type: "percentOfBalance", riskPercent: 1.25 },
	limitMode: "percentOfInitial",
	limitsPercent: { daily: 2.5, weekly: 5, monthly: 15 },
}

/**
 * Bravo profile constants used for the monthly plan.
 *
 * The monthly plan overrides the profile's static fallback amounts.
 * These values match the seed profile at a R$40k reference balance:
 *   baseRisk   = 50000  (R$500,  1.25% of R$40k)
 *   dailyLoss  = 100000 (R$1000, 2.5%  of R$40k)
 *   dailyTarget= 150000 (R$1500, 3.75% of R$40k)
 */
const BRAVO_PLAN = {
	accountBalance: "4000000", // R$40,000 in cents
	riskPerTradePercent: "1.25",
	dailyLossPercent: "2.50",
	monthlyLossPercent: "15.00",
	riskPerTradeCents: "50000", // plain text cents (no encryption)
	dailyLossCents: "100000", // plain text cents
	monthlyLossCents: "600000", // plain text cents
	dailyProfitTargetCents: 150000, // integer column — stored directly
	derivedMaxDailyTrades: null, // No cap — decision tree manages trade progression
} as const

/**
 * Resolve the database URL from the environment.
 * Throws clearly if DATABASE_URL is missing so tests fail fast.
 */
const requireDatabaseUrl = (): string => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error(
			"[seed-trading-data] DATABASE_URL environment variable is not set. " +
				"Ensure your .env.local is loaded before running Playwright."
		)
	}
	return dbUrl
}

/**
 * Build a raw Drizzle client. Driver is selected automatically: neon-http for
 * Neon URLs (production/staging), postgres-js for local postgres (dev worktrees).
 * Called per-seeder invocation so the connection is only opened when needed.
 */
const buildDb = () => {
	const dbUrl = requireDatabaseUrl()
	return createDb(dbUrl)
}

// ---------------------------------------------------------------------------
// ADMIN CONTEXT
// ---------------------------------------------------------------------------

/**
 * Fetch the admin user's ID and their default trading account ID.
 * The admin user is seeded via `src/db/seed.ts` with email `admin@axion.com`.
 */
const getAdminContext = async (): Promise<AdminContext> => {
	const db = buildDb()

	const userRows = await db.execute<IdRow>(sql`
    SELECT id FROM users
    WHERE email = 'admin@axion.com'
    LIMIT 1
  `)

	if (!userRows.rows.length) {
		throw new Error(
			"[seed-trading-data] Admin user (admin@axion.com) not found. " +
				"Run the database seed first."
		)
	}

	const userId = userRows.rows[0].id

	// Find the default (or first active) account for this user
	const accountRows = await db.execute<IdRow>(sql`
    SELECT id FROM trading_accounts
    WHERE user_id = ${userId}
      AND is_active = true
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
  `)

	if (!accountRows.rows.length) {
		throw new Error(
			"[seed-trading-data] No active trading account found for admin user. " +
				"Ensure the seed data includes a trading account."
		)
	}

	return {
		userId,
		accountId: accountRows.rows[0].id,
	}
}

// ---------------------------------------------------------------------------
// RISK PROFILE
// ---------------------------------------------------------------------------

/**
 * Ensure the Bravo Risk Management profile exists in the database.
 * Returns the profile ID and whether the profile was newly created.
 */
const ensureBravoRiskProfile = async (
	userId: string
): Promise<{ profileId: string; created: boolean }> => {
	const db = buildDb()

	const existing = await db.execute<IdRow>(sql`
    SELECT id FROM risk_management_profiles
    WHERE name = 'Bravo Risk Management'
      AND is_active = true
    LIMIT 1
  `)

	if (existing.rows.length) {
		// Update the decision tree to match E2E expectations exactly.
		// Phase 4b: risk limits are now managed by the fractal cascade (yearlyPlans),
		// so we only update the decision_tree JSON.
		await db.execute(sql`
      UPDATE risk_management_profiles SET
        decision_tree = ${JSON.stringify(BRAVO_DECISION_TREE)},
        updated_at    = NOW()
      WHERE id = ${existing.rows[0].id}
    `)
		return { profileId: existing.rows[0].id, created: false }
	}

	// Insert the Bravo profile — mirrors seed-risk-profiles.ts
	// Phase 4b: only name, description, user, active status, and decision_tree.
	const inserted = await db.execute<InsertedTradeId>(sql`
    INSERT INTO risk_management_profiles (
      name,
      description,
      created_by_user_id,
      is_active,
      decision_tree
    ) VALUES (
      'Bravo Risk Management',
      'E2E test: Percentage-based risk 1.25% per trade, anti-martingale recovery, gain sequence.',
      ${userId},
      true,
      ${JSON.stringify(BRAVO_DECISION_TREE)}
    )
    RETURNING id
  `)

	return { profileId: inserted.rows[0].id, created: true }
}

// ---------------------------------------------------------------------------
// FRACTAL CASCADE (YEARLY, QUARTERLY, MONTHLY PLANS)
// ---------------------------------------------------------------------------

/**
 * Ensure a fractal cascade exists for the given account/year.
 *
 * Phase 4b: `resolveDay` in the live-trading-status action requires:
 *   1. A yearly_plan row for the account + year
 *   2. A quarterly_plan row for that year + quarter
 *   3. A monthly_plan row for that quarter + month
 *
 * This function idempotently creates (or updates) the full cascade.
 * Returns the monthly plan ID and whether it was newly created at the top level.
 *
 * Capital ladder: single tier with oneRCents = 50000 (matching Bravo base risk).
 * R defaults: dailyLoss=3, dailyTarget=2, weeklyLoss=6, monthlyLoss=10 (fallback values).
 */
const ensureBravoFractalCascade = async (
	accountId: string,
	profileId: string,
	year: number,
	month: number
): Promise<{ planId: string; created: boolean }> => {
	const db = buildDb()

	const quarter = Math.ceil(month / 3)
	const accountBalance = parseInt(BRAVO_PLAN.accountBalance) // 4,000,000 cents

	// Ladder: single tier (40k+) with oneRCents = 50,000 (base risk)
	const ladderRules = JSON.stringify([
		{ minCapitalCents: 0, maxCapitalCents: 9999999999, oneRCents: 50000 },
	])

	// ─────────────────────────────────────────────────────────────────────────────
	// YEARLY PLAN
	// ─────────────────────────────────────────────────────────────────────────────

	const yearlyCheck = await db.execute<IdRow>(sql`
    SELECT id FROM yearly_plans
    WHERE account_id = ${accountId} AND year = ${year}
    LIMIT 1
  `)

	let yearlyPlanId: string
	if (yearlyCheck.rows.length) {
		yearlyPlanId = yearlyCheck.rows[0].id
		// Update to link Bravo profile and re-seed R defaults in case they were wrong.
		// Both thresholds are 3R (3 × $500 = $1500):
		//   daily_loss_r = 3 → maxTrades = floor(150000/50000) = 3 (allows full recovery sequence)
		//   daily_win_r  = 3 → dailyTargetCents = 150000 (= gain sequence target)
		await db.execute(sql`
      UPDATE yearly_plans SET
        default_risk_profile_id = ${profileId},
        default_daily_loss_r    = 3.00,
        default_daily_win_r     = 3.00,
        updated_at = NOW()
      WHERE id = ${yearlyPlanId}
    `)
	} else {
		// Create yearly plan with standard defaults
		const yearlyInsert = await db.execute<IdRow>(sql`
      INSERT INTO yearly_plans (
        account_id,
        year,
        initial_capital_cents,
        ir_tax_rate,
        trading_days_per_week,
        ladder_rules,
        start_week,
        default_daily_loss_r,
        default_daily_win_r,
        default_weekly_loss_r,
        default_weekly_win_r,
        default_monthly_loss_r,
        default_monthly_win_r,
        default_risk_profile_id,
        notes
      ) VALUES (
        ${accountId},
        ${year},
        ${accountBalance},
        30.00,
        5,
        ${ladderRules}::jsonb,
        1,
        3.00,
        3.00,
        6.00,
        4.00,
        10.00,
        8.00,
        ${profileId},
        'E2E: Bravo automated fractal cascade for live-trading-status tests'
      )
      RETURNING id
    `)
		yearlyPlanId = yearlyInsert.rows[0].id
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// QUARTERLY PLAN
	// ─────────────────────────────────────────────────────────────────────────────

	const quarterlyCheck = await db.execute<IdRow>(sql`
    SELECT id FROM quarterly_plan
    WHERE yearly_plan_id = ${yearlyPlanId} AND quarter = ${quarter}
    LIMIT 1
  `)

	let quarterlyPlanId: string
	if (quarterlyCheck.rows.length) {
		quarterlyPlanId = quarterlyCheck.rows[0].id
	} else {
		const quarterlyInsert = await db.execute<IdRow>(sql`
      INSERT INTO quarterly_plan (
        yearly_plan_id,
        quarter,
        goal_cents
      ) VALUES (
        ${yearlyPlanId},
        ${quarter},
        1500000
      )
      RETURNING id
    `)
		quarterlyPlanId = quarterlyInsert.rows[0].id
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// MONTHLY PLAN
	// ─────────────────────────────────────────────────────────────────────────────

	const monthlyCheck = await db.execute<IdRow>(sql`
    SELECT id FROM monthly_plan
    WHERE quarterly_plan_id = ${quarterlyPlanId} AND month = ${month}
    LIMIT 1
  `)

	let monthlyPlanId: string
	let createdMonthly = false

	if (monthlyCheck.rows.length) {
		monthlyPlanId = monthlyCheck.rows[0].id
		// Update profile AND re-seed snapshot fields — without this the resolver
		// returns oneRCents = 0 because snapshotOneRCents is NULL on existing rows.
		await db.execute(sql`
      UPDATE monthly_plan SET
        snapshot_capital_cents = ${accountBalance},
        snapshot_one_r_cents = 50000,
        snapshot_tier_index = 0,
        snapshot_computed_at = NOW(),
        snapshot_reason = 'manual',
        override_risk_profile_id = ${profileId},
        updated_at = NOW()
      WHERE id = ${monthlyPlanId}
    `)
	} else {
		// Create monthly plan with snapshot (required fields)
		const monthlyInsert = await db.execute<IdRow>(sql`
      INSERT INTO monthly_plan (
        quarterly_plan_id,
        year,
        month,
        snapshot_capital_cents,
        snapshot_one_r_cents,
        snapshot_tier_index,
        snapshot_computed_at,
        snapshot_reason,
        override_risk_profile_id,
        monthly_goal_cents
      ) VALUES (
        ${quarterlyPlanId},
        ${year},
        ${month},
        ${accountBalance},
        50000,
        0,
        NOW(),
        'manual',
        ${profileId},
        500000
      )
      RETURNING id
    `)
		monthlyPlanId = monthlyInsert.rows[0].id
		createdMonthly = true
	}

	return { planId: monthlyPlanId, created: createdMonthly }
}

// ---------------------------------------------------------------------------
// TRADES
// ---------------------------------------------------------------------------

/**
 * Insert a batch of test trades for today's date into the given account.
 *
 * Each trade is given a unique entry_date spaced 1 minute apart starting
 * from 09:05 today (within market hours). `entryOffsetMinutes` overrides
 * the auto-incremented offset.
 *
 * P&L is stored as plain text cents — the server reads it via `Number(trade.pnl)`
 * and encryption is disabled in this environment.
 *
 * Returns the list of inserted trade UUIDs.
 */
const insertTestTrades = async (
	accountId: string,
	trades: TradeInput[],
	baseDate: Date = new Date()
): Promise<string[]> => {
	const db = buildDb()

	const insertedIds: string[] = []

	for (let index = 0; index < trades.length; index++) {
		const trade = trades[index]
		const offsetMinutes = trade.entryOffsetMinutes ?? index
		const entryDate = new Date(baseDate)
		entryDate.setHours(9, 5 + offsetMinutes, 0, 0)
		const exitDate = new Date(entryDate)
		exitDate.setMinutes(entryDate.getMinutes() + 1)

		const direction = trade.direction ?? (index % 2 === 0 ? "long" : "short")
		const asset = trade.asset ?? "WIN"
		const positionSize = "5" // 5 contracts — realistic but arbitrary
		const entryPrice = "130000" // arbitrary index value
		const exitPrice = trade.pnlCents >= 0 ? "130200" : "129800"

		// plannedRiskAmount is optional — null when not supplied
		const plannedRiskAmount =
			trade.plannedRiskAmountCents !== null
				? String(trade.plannedRiskAmountCents)
				: null

		const result = await db.execute<InsertedTradeId>(sql`
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
        planned_risk_amount,
        is_archived,
        execution_mode
      ) VALUES (
        ${accountId},
        ${asset},
        ${direction},
        ${entryDate.toISOString()},
        ${exitDate.toISOString()},
        ${entryPrice},
        ${exitPrice},
        ${positionSize},
        ${String(trade.pnlCents)},
        ${trade.outcome},
        ${plannedRiskAmount},
        false,
        'simple'
      )
      RETURNING id
    `)

		insertedIds.push(result.rows[0].id)
	}

	return insertedIds
}

// ---------------------------------------------------------------------------
// CLEANUP
// ---------------------------------------------------------------------------

/**
 * Delete all trades inserted by this seeder, identified by their UUIDs.
 * Safe to call even if some IDs were already deleted.
 */
const cleanupTrades = async (tradeIds: string[]): Promise<void> => {
	if (!tradeIds.length) {
		return
	}
	const db = buildDb()

	// Build a parameterised ANY() query
	const idList = tradeIds.join("','")
	await db.execute(sql`
    DELETE FROM trades
    WHERE id = ANY(ARRAY[${sql.raw(`'${idList}'`)}]::uuid[])
  `)
}

/**
 * Clean up a monthly plan created by the fractal cascade seeder.
 *
 * Phase 4b: monthly plans are part of the fractal cascade (quarterly_plan → monthly_plan).
 * When `deletePlan` is true, delete the plan entirely (cascade will handle child rows).
 * When false, detach the Bravo profile override and clear custom values.
 */
const cleanupMonthlyPlan = async (
	planId: string,
	deletePlan: boolean
): Promise<void> => {
	const db = buildDb()

	if (deletePlan) {
		// Delete the monthly plan (cascade will handle any child rows like weekly/daily plans)
		await db.execute(sql`DELETE FROM monthly_plan WHERE id = ${planId}`)
		return
	}

	// Detach the risk profile override and reset custom caps
	await db.execute(sql`
    UPDATE monthly_plan SET
      override_risk_profile_id = NULL,
      override_daily_loss_r = NULL,
      override_weekly_loss_r = NULL,
      override_monthly_loss_r = NULL,
      override_daily_target_r = NULL,
      updated_at = NOW()
    WHERE id = ${planId}
  `)
}

/**
 * Delete a risk profile created by the seeder (only when `deleteProfile` is true).
 */
const cleanupRiskProfile = async (
	profileId: string,
	deleteProfile: boolean
): Promise<void> => {
	if (!deleteProfile) {
		return
	}
	const db = buildDb()
	await db.execute(sql`
    DELETE FROM risk_management_profiles WHERE id = ${profileId}
  `)
}

// ---------------------------------------------------------------------------
// HIGH-LEVEL API
// ---------------------------------------------------------------------------

/**
 * Seed a complete scenario for the Live Trading Status panel:
 * 1. Look up (or create) the Bravo Risk Management profile
 * 2. Ensure a monthly plan for the current month that links to Bravo
 * 3. Insert the supplied trades for today
 *
 * Returns a `SeedResult` that callers must pass to `teardownScenario` in
 * their afterEach/afterAll block to restore the database to a clean state.
 *
 * @param trades  - Array of trade inputs to insert for today
 * @param baseDate - The "today" to use when setting trade entry times (defaults to real now)
 */
const seedScenario = async (
	trades: TradeInput[],
	baseDate: Date = new Date()
): Promise<SeedResult> => {
	const { userId, accountId } = await getAdminContext()

	const year = baseDate.getFullYear()
	const month = baseDate.getMonth() + 1

	// Defensive cleanup: prior run may have crashed before its afterAll fired,
	// leaving recognizable seed trades in the DB. Wipe them before inserting new ones.
	await cleanupTodayTrades(baseDate)

	const { profileId, created: createdProfile } =
		await ensureBravoRiskProfile(userId)
	const { planId, created: createdPlan } = await ensureBravoFractalCascade(
		accountId,
		profileId,
		year,
		month
	)
	const tradeIds = await insertTestTrades(accountId, trades, baseDate)

	return {
		tradeIds,
		monthlyPlanId: planId,
		riskProfileId: profileId,
		createdPlan,
		createdProfile,
	}
}

/**
 * Tear down a scenario seeded by `seedScenario`.
 * - Always deletes the trades
 * - Deletes the monthly plan only if the seeder created it fresh
 * - Deletes the risk profile only if the seeder created it fresh
 */
const teardownScenario = async (result: SeedResult): Promise<void> => {
	await cleanupTrades(result.tradeIds)
	await cleanupMonthlyPlan(result.monthlyPlanId, result.createdPlan)
	await cleanupRiskProfile(result.riskProfileId, result.createdProfile)
}

/**
 * Delete all trades from today for the admin user's account.
 * Used as a broad cleanup when multiple scenario seeds may have left orphans.
 */
const cleanupTodayTrades = async (
	baseDate: Date = new Date()
): Promise<void> => {
	const { accountId } = await getAdminContext()
	const db = buildDb()

	const dayStart = new Date(baseDate)
	dayStart.setHours(0, 0, 0, 0)
	const dayEnd = new Date(baseDate)
	dayEnd.setHours(23, 59, 59, 999)

	// Wipe ALL trades for today on the admin account. The admin account is
	// dedicated to e2e tests (see e2e/global.setup.ts), so there is no real
	// data to preserve. A narrower fingerprint filter would leak journal-phase
	// trades into live-trading-status scenarios (different asset/price than
	// the seeder uses), corrupting trade-count and P&L assertions.
	await db.execute(sql`
    DELETE FROM trades
    WHERE account_id  = ${accountId}
      AND entry_date >= ${dayStart.toISOString()}
      AND entry_date <= ${dayEnd.toISOString()}
  `)
}

export type { TradeInput, SeedResult, AdminContext }
export {
	getAdminContext,
	ensureBravoRiskProfile,
	ensureBravoFractalCascade,
	insertTestTrades,
	seedScenario,
	teardownScenario,
	cleanupTrades,
	cleanupTodayTrades,
	cleanupMonthlyPlan,
	cleanupRiskProfile,
	BRAVO_DECISION_TREE,
	BRAVO_PLAN,
}
