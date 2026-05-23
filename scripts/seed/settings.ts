import type { SeedSql } from "./helpers/sql"

export const seedSettings = async (sql: SeedSql): Promise<void> => {
	console.log("\n📦 Seeding settings...")
	await sql`
		INSERT INTO settings (id, key, value, description) VALUES
			(gen_random_uuid(), 'default_risk_percent', '1.0', 'Default risk percentage per trade'),
			(gen_random_uuid(), 'default_currency', 'BRL', 'Default currency for P&L display'),
			(gen_random_uuid(), 'timezone', 'America/Sao_Paulo', 'User timezone')
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
	`
	console.log("✅ Settings seeded")
}
