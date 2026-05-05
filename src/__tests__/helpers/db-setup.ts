/**
 * Integration test database helpers.
 *
 * Provides a separate Drizzle instance for tests and a TRUNCATE utility
 * that clears all tables between tests.
 *
 * Uses neon-http (same driver as production) so integration tests match
 * real behavior. Since neon-http doesn't support transactions, we use
 * TRUNCATE ... CASCADE instead of transaction rollback.
 *
 * @example
 * ```ts
 * import { getTestDb, truncateAllTables } from "../helpers/db-setup"
 *
 * const db = getTestDb()
 *
 * afterEach(async () => {
 *   await truncateAllTables(db)
 * })
 * ```
 */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "@/db/schema"

type TestDb = ReturnType<typeof drizzle<typeof schema>>

/**
 * Creates a Drizzle instance pointing at the test database.
 * Throws if TEST_DATABASE_URL is not set — prevents accidental runs against production.
 */
const getTestDb = (): TestDb => {
	const testDbUrl = process.env.TEST_DATABASE_URL
	if (!testDbUrl) {
		throw new Error(
			"TEST_DATABASE_URL is not set. Integration tests require a dedicated test database.\n" +
			"Set it in your .env file or pass it as an environment variable:\n" +
			"  TEST_DATABASE_URL='postgresql://...' pnpm test:integration"
		)
	}

	return drizzle(testDbUrl, { schema })
}

/**
 * Tables in reverse dependency order (children before parents).
 * TRUNCATE CASCADE handles FK constraints, but ordering makes intent clear.
 */
const ALL_TABLES = [
	"trade_tags",
	"trade_executions",
	"trades",
	"strategies",
	"daily_journals",
	"daily_targets",
	"daily_account_notes",
	"daily_asset_settings",
	"account_asset_settings",
	"checklist_completions",
	"daily_checklists",
	"monthly_risk_config",
	"nota_imports",
	"risk_management_profiles",
	"account_assets",
	"account_timeframes",
	"tags",
	"trading_accounts",
	"user_settings",
	"sessions",
	"oauth_accounts",
	"verification_tokens",
	"users",
] as const

/**
 * Truncates all application tables, resetting sequences to 1.
 * Uses CASCADE to handle foreign key constraints automatically.
 *
 * Safe to call in afterEach — idempotent on empty tables.
 */
const truncateAllTables = async (db: TestDb): Promise<void> => {
	const tableList = ALL_TABLES.map(t => `"${t}"`).join(", ")
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`))
}

/**
 * Truncates only user-data tables, preserving system-level data
 * (assets, asset_types, timeframes, settings).
 *
 * Useful when you seed reference data once in beforeAll and only
 * want to clean user-generated data between tests.
 */
const truncateUserTables = async (db: TestDb): Promise<void> => {
	const userTables = [
		"trade_tags",
		"trade_executions",
		"trades",
		"strategies",
		"daily_journals",
		"daily_targets",
		"daily_account_notes",
		"daily_asset_settings",
		"account_asset_settings",
		"checklist_completions",
		"daily_checklists",
		"monthly_risk_config",
		"nota_imports",
		"risk_management_profiles",
		"account_assets",
		"account_timeframes",
		"tags",
		"trading_accounts",
		"user_settings",
		"sessions",
		"oauth_accounts",
		"verification_tokens",
		"users",
	]
	const tableList = userTables.map(t => `"${t}"`).join(", ")
	await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`))
}

export { getTestDb, truncateAllTables, truncateUserTables, ALL_TABLES }
export type { TestDb }
