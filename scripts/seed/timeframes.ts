import type { SeedSql } from "./helpers/sql"

// The Hawks method is a triple-screen system: 5min for execution and the stop,
// 15min and 60min for direction and level quality, with 1min for the fast read
// and 1d for context. The previous seed inserted only `1m` and `1d`, so the
// three timeframes the entire methodology runs on were missing. The gap was
// visible in the sort_order it used (1 and 7, with 2 through 6 unfilled).
//
// sort_order keeps 1d at 7 so existing references stay put; the Hawks ladder
// fills 1, 2, 3 and 5.
export const seedTimeframes = async (sql: SeedSql): Promise<void> => {
	console.log("\n📦 Seeding timeframes...")
	await sql`
		INSERT INTO timeframes (id, code, name, type, value, unit, sort_order, is_active) VALUES
			(gen_random_uuid(), '1m',  '1 Minute',   'time_based', 1,  'minutes', 1, true),
			(gen_random_uuid(), '5m',  '5 Minutes',  'time_based', 5,  'minutes', 2, true),
			(gen_random_uuid(), '15m', '15 Minutes', 'time_based', 15, 'minutes', 3, true),
			(gen_random_uuid(), '60m', '60 Minutes', 'time_based', 60, 'minutes', 5, true),
			(gen_random_uuid(), '1d',  'Daily',      'time_based', 1,  'days',    7, true)
		ON CONFLICT (code) DO UPDATE SET
			name = EXCLUDED.name,
			value = EXCLUDED.value,
			unit = EXCLUDED.unit,
			sort_order = EXCLUDED.sort_order,
			is_active = EXCLUDED.is_active
	`
	console.log("✅ 5 timeframes seeded (1m, 5m, 15m, 60m, 1d)")
}
