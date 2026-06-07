import type { SeedSql } from "./helpers/sql"

export const seedTimeframes = async (sql: SeedSql): Promise<void> => {
	console.log("\n📦 Seeding timeframes...")
	await sql`
		INSERT INTO timeframes (id, code, name, type, value, unit, sort_order, is_active) VALUES
			(gen_random_uuid(), '1m', '1 Minute', 'time_based', 1, 'minutes', 1, true),
			(gen_random_uuid(), '1d', 'Daily', 'time_based', 1, 'days', 7, true)
		ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
	`
	console.log("✅ Timeframes seeded")
}
