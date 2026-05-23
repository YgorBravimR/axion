import type { SeedSql } from "./helpers/sql"

// Deletes in FK-respecting order. Global (account_id IS NULL) strategies and
// tags survive — those are owned by satellite seeders (e.g.
// scripts/seed-analytical-tags.ts, scripts/seed-playbooks-tags.ts).
export const cleanup = async (sql: SeedSql): Promise<void> => {
	console.log("🧹 Cleaning existing data...")
	await sql`DELETE FROM trade_tags`
	await sql`DELETE FROM trade_executions`
	await sql`DELETE FROM trades`
	await sql`DELETE FROM strategies WHERE account_id IS NOT NULL`
	await sql`DELETE FROM tags WHERE account_id IS NOT NULL`
	await sql`DELETE FROM account_assets`
	await sql`DELETE FROM account_timeframes`
	await sql`DELETE FROM sessions`
	await sql`DELETE FROM trading_accounts`
	await sql`DELETE FROM users`
	console.log("✅ Existing user data cleaned")
}
