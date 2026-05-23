import type { SeedSql } from "./helpers/sql"

// Deletes in FK-respecting order. Many of these are also covered by ON DELETE
// CASCADE from trades or trading_accounts, but explicit DELETEs keep the
// cleanup readable and survive partial reseeds.
//
// Tags with account_id IS NULL (global tags from satellite seeders like
// scripts/seed-analytical-tags.ts) deliberately survive.
export const cleanup = async (sql: SeedSql): Promise<void> => {
	console.log("🧹 Cleaning existing data...")
	// Trade-scoped sidecars (cascade from trades, listed for clarity).
	await sql`DELETE FROM trade_tags`
	await sql`DELETE FROM trade_executions`
	await sql`DELETE FROM trade_conditions`
	await sql`DELETE FROM trade_hawks_metadata`
	await sql`DELETE FROM trade_stop_audit_events`
	await sql`DELETE FROM trades`
	// Playbook scaffolding (strategy_versions / strategy_conditions /
	// strategy_scenarios cascade from strategies).
	await sql`DELETE FROM strategy_conditions`
	await sql`DELETE FROM strategy_scenarios`
	await sql`DELETE FROM strategy_versions`
	await sql`DELETE FROM strategies`
	await sql`DELETE FROM trading_conditions`
	await sql`DELETE FROM tags WHERE account_id IS NOT NULL`
	// Hawks Mode global + per-account sidecars.
	await sql`DELETE FROM hawks_weekly_oco`
	await sql`DELETE FROM daily_hawks_bias`
	await sql`DELETE FROM hawks_renko_sizes`
	await sql`DELETE FROM hawks_scenarios`
	await sql`DELETE FROM account_modes`
	// Account-scoped + session data.
	await sql`DELETE FROM account_assets`
	await sql`DELETE FROM account_timeframes`
	await sql`DELETE FROM sessions`
	await sql`DELETE FROM trading_accounts`
	await sql`DELETE FROM users`
	console.log("✅ Existing user data cleaned")
}
