/**
 * Playwright global teardown — cleans up data created by E2E tests.
 *
 * Runs after ALL Playwright test projects complete. Deletes records
 * that match known E2E test patterns to prevent data accumulation.
 *
 * E2E tests run against the admin user's account, so cleanup targets:
 * - Trades created with E2E-recognizable patterns (entry price 100, position size 10)
 * - Assets with code "TSTE2E"
 * - Timeframes with code "5M" (if created by tests, not seed data)
 * - Strategies with names containing "E2E" or "Test Strategy"
 * - Tags named "E2E Test Tag"
 * - Accounts named "E2E Test Account"
 * - Checklist items from command-center tests
 * - Daily notes from E2E sessions
 */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"

const teardown = async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		console.warn("[E2E Teardown] DATABASE_URL not set, skipping cleanup.")
		return
	}

	const db = drizzle(dbUrl)

	console.log("[E2E Teardown] Cleaning up E2E test data...")

	// Delete in reverse dependency order (children first)

	// 1. Trade tags for E2E trades
	await db.execute(sql`
		DELETE FROM trade_tags
		WHERE trade_id IN (
			SELECT id FROM trades
			WHERE entry_price IN ('100', '10000')
			  AND position_size IN ('10', '1000')
		)
	`).catch(logError("trade_tags"))

	// 2. Trade executions for E2E trades
	await db.execute(sql`
		DELETE FROM trade_executions
		WHERE trade_id IN (
			SELECT id FROM trades
			WHERE entry_price IN ('100', '10000')
			  AND position_size IN ('10', '1000')
		)
	`).catch(logError("trade_executions"))

	// 3. Trades created by E2E (recognizable by entry_price=100, position_size=10)
	const deletedTrades = await db.execute(sql`
		DELETE FROM trades
		WHERE entry_price IN ('100', '10000')
		  AND position_size IN ('10', '1000')
		RETURNING id
	`).catch(logError("trades"))
	if (deletedTrades?.rows?.length) {
		console.log(`  Deleted ${deletedTrades.rows.length} E2E trade(s)`)
	}

	// 4. Strategies created by E2E (name contains "E2E" or "Test Strategy")
	const deletedStrategies = await db.execute(sql`
		DELETE FROM strategies
		WHERE name ILIKE '%e2e%'
		   OR name ILIKE '%test strategy%'
		RETURNING id
	`).catch(logError("strategies"))
	if (deletedStrategies?.rows?.length) {
		console.log(`  Deleted ${deletedStrategies.rows.length} E2E strategy(ies)`)
	}

	// 5. Tags created by E2E
	const deletedTags = await db.execute(sql`
		DELETE FROM tags
		WHERE name ILIKE '%e2e%'
		   OR name ILIKE '%test tag%'
		RETURNING id
	`).catch(logError("tags"))
	if (deletedTags?.rows?.length) {
		console.log(`  Deleted ${deletedTags.rows.length} E2E tag(s)`)
	}

	// 6. Assets created by E2E (symbol = TSTE2E)
	// First remove account_assets references
	await db.execute(sql`
		DELETE FROM account_assets
		WHERE asset_id IN (
			SELECT id FROM assets WHERE symbol = 'TSTE2E'
		)
	`).catch(logError("account_assets for TSTE2E"))

	const deletedAssets = await db.execute(sql`
		DELETE FROM assets
		WHERE symbol = 'TSTE2E'
		RETURNING id
	`).catch(logError("assets"))
	if (deletedAssets?.rows?.length) {
		console.log(`  Deleted ${deletedAssets.rows.length} E2E asset(s)`)
	}

	// 7. Trading accounts created by E2E
	// First clean up child records
	await db.execute(sql`
		DELETE FROM account_assets
		WHERE account_id IN (
			SELECT id FROM trading_accounts WHERE name ILIKE '%e2e%'
		)
	`).catch(logError("account_assets for E2E accounts"))

	await db.execute(sql`
		DELETE FROM account_timeframes
		WHERE account_id IN (
			SELECT id FROM trading_accounts WHERE name ILIKE '%e2e%'
		)
	`).catch(logError("account_timeframes for E2E accounts"))

	const deletedAccounts = await db.execute(sql`
		DELETE FROM trading_accounts
		WHERE name ILIKE '%e2e%'
		RETURNING id
	`).catch(logError("trading_accounts"))
	if (deletedAccounts?.rows?.length) {
		console.log(`  Deleted ${deletedAccounts.rows.length} E2E trading account(s)`)
	}

	// 8. Users created by registration tests. All child rows cascade via FK
	// onDelete: "cascade". Patterns cover: auth.spec NEW_USER (test-<ts>@example.com),
	// auth-security.spec (e2e-reg-*, e2e-resend-*, e2e-unverified-*).
	const deletedUsers = await db.execute(sql`
		DELETE FROM users
		WHERE email ~ '^test-[0-9]+@example\.(com|org|net)$'
		   OR email LIKE 'e2e-reg-%@example.com'
		   OR email LIKE 'e2e-resend-%@example.com'
		   OR email LIKE 'e2e-unverified-%@example.com'
		   OR email = 'existing-unverified@example.com'
		   OR email = 'test-display@example.com'
		RETURNING id
	`).catch(logError("users"))
	if (deletedUsers?.rows?.length) {
		console.log(`  Deleted ${deletedUsers.rows.length} E2E user(s)`)
	}

	console.log("[E2E Teardown] Cleanup complete.")
}

/** Logs an error for a specific table but doesn't throw (best-effort cleanup) */
const logError = (table: string) => (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	console.warn(`  [E2E Teardown] Failed to clean ${table}: ${message}`)
	return { rows: [] }
}

export default teardown
