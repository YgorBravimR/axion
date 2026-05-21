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

// Bravo Risk Management decision tree — matches seed-risk-profiles.ts exactly
const BRAVO_DECISION_TREE = {
	baseTrade: {
		riskCents: 50000,
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
		dailyTargetCents: 150000,
	},
	cascadingLimits: {
		weeklyLossCents: 200000,
		weeklyAction: "stopTrading",
		monthlyLossCents: 750000,
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
		// Update the decision tree + limits to match E2E expectations exactly.
		// The production seed may use a different gain mode (e.g., compounding),
		// so we enforce the test's gainSequence config on every run.
		await db.execute(sql`
      UPDATE risk_management_profiles SET
        decision_tree            = ${JSON.stringify(BRAVO_DECISION_TREE)},
        base_risk_cents          = 50000,
        daily_loss_cents         = 100000,
        weekly_loss_cents        = 200000,
        monthly_loss_cents       = 750000,
        daily_profit_target_cents = 150000,
        updated_at               = NOW()
      WHERE id = ${existing.rows[0].id}
    `)
		return { profileId: existing.rows[0].id, created: false }
	}

	// Insert the Bravo profile — mirrors seed-risk-profiles.ts
	const inserted = await db.execute<InsertedTradeId>(sql`
    INSERT INTO risk_management_profiles (
      name,
      description,
      created_by_user_id,
      is_active,
      base_risk_cents,
      daily_loss_cents,
      weekly_loss_cents,
      monthly_loss_cents,
      daily_profit_target_cents,
      decision_tree
    ) VALUES (
      'Bravo Risk Management',
      'E2E test: Percentage-based risk 1.25% per trade, anti-martingale recovery, gain sequence.',
      ${userId},
      true,
      50000,
      100000,
      200000,
      750000,
      150000,
      ${JSON.stringify(BRAVO_DECISION_TREE)}
    )
    RETURNING id
  `)

	return { profileId: inserted.rows[0].id, created: true }
}

// ---------------------------------------------------------------------------
// MONTHLY PLAN
// ---------------------------------------------------------------------------

/**
 * Ensure a monthly plan exists for the current month that links to the Bravo
 * risk profile. If a plan already exists for this account/year/month, it will
 * be updated to link the Bravo profile and set the correct limits.
 *
 * Returns the plan ID and whether it was newly created.
 */
const ensureBravoMonthlyPlan = async (
	accountId: string,
	profileId: string,
	year: number,
	month: number
): Promise<{ planId: string; created: boolean }> => {
	const db = buildDb()

	const existing = await db.execute<IdRow>(sql`
    SELECT id FROM monthly_plans
    WHERE account_id = ${accountId}
      AND year = ${year}
      AND month = ${month}
    LIMIT 1
  `)

	if (existing.rows.length) {
		// Update the existing plan to link Bravo and set correct limits.
		// Explicitly NULL out both max-trade columns so the decision tree
		// controls trade progression without a circuit-breaker override.
		await db.execute(sql`
      UPDATE monthly_plans SET
        risk_profile_id             = ${profileId},
        risk_per_trade_cents        = ${BRAVO_PLAN.riskPerTradeCents},
        daily_loss_cents            = ${BRAVO_PLAN.dailyLossCents},
        monthly_loss_cents          = ${BRAVO_PLAN.monthlyLossCents},
        daily_profit_target_cents   = ${BRAVO_PLAN.dailyProfitTargetCents},
        max_daily_trades            = NULL,
        derived_max_daily_trades    = NULL,
        updated_at                  = NOW()
      WHERE id = ${existing.rows[0].id}
    `)
		return { planId: existing.rows[0].id, created: false }
	}

	// Insert a new plan for this month
	const inserted = await db.execute<InsertedTradeId>(sql`
    INSERT INTO monthly_plans (
      account_id,
      year,
      month,
      account_balance,
      risk_per_trade_percent,
      daily_loss_percent,
      monthly_loss_percent,
      risk_profile_id,
      risk_per_trade_cents,
      daily_loss_cents,
      monthly_loss_cents,
      daily_profit_target_cents,
      derived_max_daily_trades
    ) VALUES (
      ${accountId},
      ${year},
      ${month},
      ${BRAVO_PLAN.accountBalance},
      ${BRAVO_PLAN.riskPerTradePercent},
      ${BRAVO_PLAN.dailyLossPercent},
      ${BRAVO_PLAN.monthlyLossPercent},
      ${profileId},
      ${BRAVO_PLAN.riskPerTradeCents},
      ${BRAVO_PLAN.dailyLossCents},
      ${BRAVO_PLAN.monthlyLossCents},
      ${BRAVO_PLAN.dailyProfitTargetCents},
      ${BRAVO_PLAN.derivedMaxDailyTrades}
    )
    RETURNING id
  `)

	return { planId: inserted.rows[0].id, created: true }
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
 * Revert a monthly plan back to its pre-test state (remove risk_profile_id link
 * and reset the amounts that were written by the seeder).
 * Only removes the plan entirely when `deletePlan` is true.
 */
const cleanupMonthlyPlan = async (
	planId: string,
	deletePlan: boolean
): Promise<void> => {
	const db = buildDb()

	if (deletePlan) {
		await db.execute(sql`DELETE FROM monthly_plans WHERE id = ${planId}`)
		return
	}

	// Detach the risk profile link and nullify the seeder-injected values
	await db.execute(sql`
    UPDATE monthly_plans SET
      risk_profile_id           = NULL,
      risk_per_trade_cents      = '0',
      daily_loss_cents          = '0',
      monthly_loss_cents        = '0',
      daily_profit_target_cents = NULL,
      derived_max_daily_trades  = NULL,
      updated_at                = NOW()
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
	const { planId, created: createdPlan } = await ensureBravoMonthlyPlan(
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
	ensureBravoMonthlyPlan,
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
