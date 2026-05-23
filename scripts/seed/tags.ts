import type { SeedSql } from "./helpers/sql"
import type { SeededAccounts } from "./accounts"

export const seedTags = async (
	sql: SeedSql,
	accounts: SeededAccounts
): Promise<void> => {
	console.log("\n📦 Seeding tags...")
	await sql`DELETE FROM tags`

	await sql`
		INSERT INTO tags (id, account_id, name, type, color, description) VALUES
			(gen_random_uuid(), ${accounts.personal.id}, 'Breakout', 'setup', '#22c55e', 'Price breaking out of consolidation'),
			(gen_random_uuid(), ${accounts.personal.id}, 'Pullback', 'setup', '#3b82f6', 'Entry on pullback in trend'),
			(gen_random_uuid(), ${accounts.personal.id}, 'Reversal', 'setup', '#8b5cf6', 'Counter-trend reversal trade'),
			(gen_random_uuid(), ${accounts.personal.id}, 'Momentum', 'setup', '#f59e0b', 'Trading strong momentum moves'),
			(gen_random_uuid(), ${accounts.personal.id}, 'FOMO', 'mistake', '#ef4444', 'Entered due to fear of missing out'),
			(gen_random_uuid(), ${accounts.personal.id}, 'Revenge Trade', 'mistake', '#991b1b', 'Traded to recover losses'),
			(gen_random_uuid(), ${accounts.personal.id}, 'No Plan', 'mistake', '#b91c1c', 'Entered without clear plan'),
			(gen_random_uuid(), ${accounts.personal.id}, 'Overtrading', 'mistake', '#f97316', 'Took too many trades')
	`

	await sql`
		INSERT INTO tags (id, account_id, name, type, color, description) VALUES
			(gen_random_uuid(), ${accounts.prop.id}, 'A+ Setup', 'setup', '#22c55e', 'Perfect textbook setup'),
			(gen_random_uuid(), ${accounts.prop.id}, 'B Setup', 'setup', '#3b82f6', 'Good setup, minor flaws'),
			(gen_random_uuid(), ${accounts.prop.id}, 'Scalp', 'setup', '#8b5cf6', 'Quick scalping trade'),
			(gen_random_uuid(), ${accounts.prop.id}, 'Risk Violation', 'mistake', '#ef4444', 'Violated risk rules'),
			(gen_random_uuid(), ${accounts.prop.id}, 'Early Exit', 'mistake', '#f97316', 'Exited too early')
	`

	await sql`
		INSERT INTO tags (id, account_id, name, type, color, description) VALUES
			(gen_random_uuid(), ${accounts.demo.id}, 'Test Tag', 'general', '#6b7280', 'For testing')
	`
	console.log("✅ Tags seeded (per account)")
}
