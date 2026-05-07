/**
 * One-time cleanup script to remove E2E test data that has accumulated in the database.
 *
 * Run with: npx tsx scripts/cleanup-e2e-data.ts
 *
 * This script targets data created by Playwright E2E tests that previously
 * had no teardown mechanism. After running, the globalTeardown in
 * e2e/global.teardown.ts will prevent future accumulation.
 *
 * DRY RUN by default — set EXECUTE=true to actually delete:
 *   EXECUTE=true npx tsx scripts/cleanup-e2e-data.ts
 */

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"

const isDryRun = process.env.EXECUTE !== "true"

const run = async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		console.error("DATABASE_URL is not set.")
		process.exit(1)
	}

	const db = drizzle(dbUrl)

	console.log(
		isDryRun
			? "=== DRY RUN MODE (set EXECUTE=true to delete) ==="
			: "=== EXECUTING DELETIONS ==="
	)
	console.log("")

	// 1. Count E2E trades (entry_price = 100, position_size = 10 — from journal.spec.ts)
	const e2eTrades = await db.execute(sql`
		SELECT id, entry_price, exit_price, position_size, outcome, created_at
		FROM trades
		WHERE entry_price IN ('100', '10000')
		  AND position_size IN ('10', '1000')
		ORDER BY created_at DESC
	`)
	console.log(`Found ${e2eTrades.rows.length} E2E trade(s):`)
	for (const row of e2eTrades.rows.slice(0, 10)) {
		const r = row as Record<string, unknown>
		console.log(
			`  - ID: ${r.id}, entry: ${r.entry_price}, pos: ${r.position_size}, outcome: ${r.outcome}, created: ${r.created_at}`
		)
	}
	if (e2eTrades.rows.length > 10) {
		console.log(`  ... and ${e2eTrades.rows.length - 10} more`)
	}
	console.log("")

	// 2. Count E2E strategies (name contains "E2E" or "Test Strategy")
	const e2eStrategies = await db.execute(sql`
		SELECT id, code, name, created_at
		FROM strategies
		WHERE name ILIKE '%e2e%'
		   OR name ILIKE '%test strategy%'
		ORDER BY created_at DESC
	`)
	console.log(`Found ${e2eStrategies.rows.length} E2E strategy(ies):`)
	for (const row of e2eStrategies.rows) {
		const r = row as Record<string, unknown>
		console.log(
			`  - ID: ${r.id}, code: ${r.code}, name: ${r.name}, created: ${r.created_at}`
		)
	}
	console.log("")

	// 3. Count E2E tags
	const e2eTags = await db.execute(sql`
		SELECT id, name, created_at
		FROM tags
		WHERE name ILIKE '%e2e%'
		   OR name ILIKE '%test tag%'
		ORDER BY created_at DESC
	`)
	console.log(`Found ${e2eTags.rows.length} E2E tag(s):`)
	for (const row of e2eTags.rows) {
		const r = row as Record<string, unknown>
		console.log(`  - ID: ${r.id}, name: ${r.name}, created: ${r.created_at}`)
	}
	console.log("")

	// 4. Count E2E assets (symbol = TSTE2E)
	const e2eAssets = await db.execute(sql`
		SELECT id, symbol, name, created_at
		FROM assets
		WHERE symbol = 'TSTE2E'
		ORDER BY created_at DESC
	`)
	console.log(`Found ${e2eAssets.rows.length} E2E asset(s):`)
	for (const row of e2eAssets.rows) {
		const r = row as Record<string, unknown>
		console.log(
			`  - ID: ${r.id}, symbol: ${r.symbol}, name: ${r.name}, created: ${r.created_at}`
		)
	}
	console.log("")

	// 5. Count E2E trading accounts
	const e2eAccounts = await db.execute(sql`
		SELECT id, name, created_at
		FROM trading_accounts
		WHERE name ILIKE '%e2e%'
		ORDER BY created_at DESC
	`)
	console.log(`Found ${e2eAccounts.rows.length} E2E trading account(s):`)
	for (const row of e2eAccounts.rows) {
		const r = row as Record<string, unknown>
		console.log(`  - ID: ${r.id}, name: ${r.name}, created: ${r.created_at}`)
	}
	console.log("")

	const totalFound =
		e2eTrades.rows.length +
		e2eStrategies.rows.length +
		e2eTags.rows.length +
		e2eAssets.rows.length +
		e2eAccounts.rows.length

	if (totalFound === 0) {
		console.log("No E2E test data found. Database is clean.")
		return
	}

	console.log(`Total E2E records found: ${totalFound}`)
	console.log("")

	if (isDryRun) {
		console.log("To delete these records, run:")
		console.log("  EXECUTE=true npx tsx scripts/cleanup-e2e-data.ts")
		return
	}

	// Execute deletions in dependency order
	console.log("Deleting E2E data...")

	// Trade children first
	const deletedTradeTags = await db.execute(sql`
		DELETE FROM trade_tags
		WHERE trade_id IN (
			SELECT id FROM trades
			WHERE entry_price IN ('100', '10000')
			  AND position_size IN ('10', '1000')
		)
		RETURNING trade_id
	`)
	console.log(`  Deleted ${deletedTradeTags.rows.length} trade_tags`)

	const deletedExecs = await db.execute(sql`
		DELETE FROM trade_executions
		WHERE trade_id IN (
			SELECT id FROM trades
			WHERE entry_price IN ('100', '10000')
			  AND position_size IN ('10', '1000')
		)
		RETURNING id
	`)
	console.log(`  Deleted ${deletedExecs.rows.length} trade_executions`)

	// Trades
	const deletedTrades = await db.execute(sql`
		DELETE FROM trades
		WHERE entry_price IN ('100', '10000')
		  AND position_size IN ('10', '1000')
		RETURNING id
	`)
	console.log(`  Deleted ${deletedTrades.rows.length} trades`)

	// Strategies
	const deletedStrats = await db.execute(sql`
		DELETE FROM strategies
		WHERE name ILIKE '%e2e%'
		   OR name ILIKE '%test strategy%'
		RETURNING id
	`)
	console.log(`  Deleted ${deletedStrats.rows.length} strategies`)

	// Tags
	const deletedTagsResult = await db.execute(sql`
		DELETE FROM tags
		WHERE name ILIKE '%e2e%'
		   OR name ILIKE '%test tag%'
		RETURNING id
	`)
	console.log(`  Deleted ${deletedTagsResult.rows.length} tags`)

	// Asset children → Assets
	await db.execute(sql`
		DELETE FROM account_assets
		WHERE asset_id IN (
			SELECT id FROM assets WHERE symbol = 'TSTE2E'
		)
	`)
	const deletedAssetsResult = await db.execute(sql`
		DELETE FROM assets
		WHERE symbol = 'TSTE2E'
		RETURNING id
	`)
	console.log(`  Deleted ${deletedAssetsResult.rows.length} assets`)

	// Account children → Accounts
	await db.execute(sql`
		DELETE FROM account_assets
		WHERE account_id IN (
			SELECT id FROM trading_accounts WHERE name ILIKE '%e2e%'
		)
	`)
	await db.execute(sql`
		DELETE FROM account_timeframes
		WHERE account_id IN (
			SELECT id FROM trading_accounts WHERE name ILIKE '%e2e%'
		)
	`)
	const deletedAccountsResult = await db.execute(sql`
		DELETE FROM trading_accounts
		WHERE name ILIKE '%e2e%'
		RETURNING id
	`)
	console.log(`  Deleted ${deletedAccountsResult.rows.length} trading accounts`)

	console.log("")
	console.log("Cleanup complete.")
}

run().catch((error) => {
	console.error("Cleanup failed:", error)
	process.exit(1)
})
