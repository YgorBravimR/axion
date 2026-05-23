import type { SeedSql } from "./helpers/sql"
import type { SeededAccounts } from "./accounts"

export interface StrategyMap {
	personal: Map<string, string>
	prop: Map<string, string>
	demo: Map<string, string>
}

export const seedStrategies = async (
	sql: SeedSql,
	accounts: SeededAccounts
): Promise<StrategyMap> => {
	console.log("\n📦 Seeding strategies...")
	await sql`DELETE FROM strategies`

	await sql`
		INSERT INTO strategies (id, account_id, name, code, description, final_r, max_risk_percent, is_active) VALUES
			(gen_random_uuid(), ${accounts.personal.id}, 'Breakout', 'BREAKOUT', 'Trade breakouts from consolidation', 2.0, 1.0, true),
			(gen_random_uuid(), ${accounts.personal.id}, 'Trend Following', 'TREND', 'Follow established trends', 3.0, 2.0, true),
			(gen_random_uuid(), ${accounts.personal.id}, 'Mean Reversion', 'REVERSION', 'Fade extreme moves back to mean', 1.5, 0.5, true),
			(gen_random_uuid(), ${accounts.personal.id}, 'Support/Resistance', 'SR', 'Trade bounces from key levels', 2.0, 1.0, true)
	`

	await sql`
		INSERT INTO strategies (id, account_id, name, code, description, final_r, max_risk_percent, is_active) VALUES
			(gen_random_uuid(), ${accounts.prop.id}, 'Breakout', 'BREAKOUT', 'Trade breakouts from consolidation', 2.0, 0.5, true),
			(gen_random_uuid(), ${accounts.prop.id}, 'Trend Following', 'TREND', 'Follow established trends', 3.0, 1.0, true),
			(gen_random_uuid(), ${accounts.prop.id}, 'Scalping', 'SCALP', 'Quick in-and-out trades', 1.0, 0.25, true)
	`

	await sql`
		INSERT INTO strategies (id, account_id, name, code, description, final_r, max_risk_percent, is_active) VALUES
			(gen_random_uuid(), ${accounts.demo.id}, 'Test Strategy', 'TEST', 'For testing purposes', 1.0, 1.0, true)
	`
	console.log("✅ Strategies seeded (per account)")

	const rows = (await sql`
		SELECT id, account_id, code FROM strategies WHERE account_id IS NOT NULL
	`) as { id: string; account_id: string; code: string }[]

	const map: StrategyMap = {
		personal: new Map(),
		prop: new Map(),
		demo: new Map(),
	}
	for (const row of rows) {
		if (row.account_id === accounts.personal.id) {
			map.personal.set(row.code, row.id)
		} else if (row.account_id === accounts.prop.id) {
			map.prop.set(row.code, row.id)
		} else if (row.account_id === accounts.demo.id) {
			map.demo.set(row.code, row.id)
		}
	}
	return map
}
