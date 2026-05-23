import type { SeedSql } from "./helpers/sql"
import type { SeededAccounts } from "./accounts"

// 22 ISO weeks of 2026 (week 1 starts Mon 2025-12-29 per ISO 8601).
// Renko brick sizes calibrated weekly from Pedro's Monday Telegram drops.
// 5m/15m/60m sizes are in ticks (WIN: 1 tick = 5 pts).
// W19 (2026-05-04) and W20 (2026-05-11) anchored to the vault OCO docs at
// /Users/ygorbravim/vault/wiki/hawks/oco/; other weeks modeled around Pedro's
// typical 18–22 ticks/box 5m range.
interface RenkoWeek {
	week: number
	effectiveDate: string
	size5m: number
	size15m: number
	size60m: number
}

const RENKO_2026: RenkoWeek[] = [
	{
		week: 1,
		effectiveDate: "2025-12-29",
		size5m: 17,
		size15m: 33,
		size60m: 72,
	},
	{
		week: 2,
		effectiveDate: "2026-01-05",
		size5m: 18,
		size15m: 34,
		size60m: 74,
	},
	{
		week: 3,
		effectiveDate: "2026-01-12",
		size5m: 18,
		size15m: 35,
		size60m: 76,
	},
	{
		week: 4,
		effectiveDate: "2026-01-19",
		size5m: 19,
		size15m: 36,
		size60m: 78,
	},
	{
		week: 5,
		effectiveDate: "2026-01-26",
		size5m: 19,
		size15m: 36,
		size60m: 78,
	},
	{
		week: 6,
		effectiveDate: "2026-02-02",
		size5m: 19,
		size15m: 37,
		size60m: 80,
	},
	{
		week: 7,
		effectiveDate: "2026-02-09",
		size5m: 20,
		size15m: 37,
		size60m: 80,
	},
	{
		week: 8,
		effectiveDate: "2026-02-16",
		size5m: 20,
		size15m: 38,
		size60m: 82,
	},
	{
		week: 9,
		effectiveDate: "2026-02-23",
		size5m: 20,
		size15m: 38,
		size60m: 82,
	},
	{
		week: 10,
		effectiveDate: "2026-03-02",
		size5m: 19,
		size15m: 36,
		size60m: 78,
	},
	{
		week: 11,
		effectiveDate: "2026-03-09",
		size5m: 19,
		size15m: 36,
		size60m: 78,
	},
	{
		week: 12,
		effectiveDate: "2026-03-16",
		size5m: 20,
		size15m: 37,
		size60m: 80,
	},
	{
		week: 13,
		effectiveDate: "2026-03-23",
		size5m: 21,
		size15m: 38,
		size60m: 82,
	},
	{
		week: 14,
		effectiveDate: "2026-03-30",
		size5m: 21,
		size15m: 38,
		size60m: 82,
	},
	{
		week: 15,
		effectiveDate: "2026-04-06",
		size5m: 21,
		size15m: 39,
		size60m: 84,
	},
	{
		week: 16,
		effectiveDate: "2026-04-13",
		size5m: 22,
		size15m: 40,
		size60m: 86,
	},
	{
		week: 17,
		effectiveDate: "2026-04-20",
		size5m: 22,
		size15m: 40,
		size60m: 86,
	},
	{
		week: 18,
		effectiveDate: "2026-04-27",
		size5m: 21,
		size15m: 39,
		size60m: 84,
	},
	{
		week: 19,
		effectiveDate: "2026-05-04",
		size5m: 20,
		size15m: 38,
		size60m: 80,
	},
	{
		week: 20,
		effectiveDate: "2026-05-11",
		size5m: 21,
		size15m: 39,
		size60m: 84,
	},
	{
		week: 21,
		effectiveDate: "2026-05-18",
		size5m: 21,
		size15m: 39,
		size60m: 84,
	},
	{
		week: 22,
		effectiveDate: "2026-05-25",
		size5m: 21,
		size15m: 39,
		size60m: 84,
	},
]

const TRAIL_CONFIG = {
	mode: "box_trail" as const,
	boxesBehind: 2,
	triggerAtR: 3,
}

interface OcoRow {
	asset: "WIN" | "WDO"
	stopTicks: number
	targetTicks: number
	beTriggerTicks: number
	notes: string
}

// Pedro pattern: stop = 1R = ~2x the 5m brick, target = 3R (3x stop), BE at +1R.
// WIN derives ticks from the week's renko 5m size (e.g. W20 size5m=21 →
// stop=42, target=126, be=42 — matches vault exactly).
// WDO holds at 8/24/8 ticks: WDO's smaller scale doesn't track renko 5m
// proportionally in Pedro's playbook.
const buildOcoRowsForWeek = (week: RenkoWeek): OcoRow[] => [
	{
		asset: "WIN",
		stopTicks: week.size5m * 2,
		targetTicks: week.size5m * 6,
		beTriggerTicks: week.size5m * 2,
		notes: `Stop=1R (${week.size5m * 2}t / ${week.size5m * 10}pts), alvo=3R, BE@+1R, trail 2-box após +3R.`,
	},
	{
		asset: "WDO",
		stopTicks: 8,
		targetTicks: 24,
		beTriggerTicks: 8,
		notes: "Stop=1R (8t / 4pts), alvo=3R (24t / 12pts), BE@+1R.",
	},
]

const seedRenkoSizes = async (sql: SeedSql): Promise<void> => {
	console.log("\n📦 Seeding Hawks Renko weekly sizes (22 weeks of 2026)...")
	for (const week of RENKO_2026) {
		await sql`
			INSERT INTO hawks_renko_sizes (
				id, effective_date, week_number, size_5m, size_15m, size_60m
			) VALUES (
				gen_random_uuid(), ${week.effectiveDate}, ${week.week},
				${week.size5m}, ${week.size15m}, ${week.size60m}
			)
			ON CONFLICT (effective_date) DO UPDATE SET
				week_number = EXCLUDED.week_number,
				size_5m = EXCLUDED.size_5m,
				size_15m = EXCLUDED.size_15m,
				size_60m = EXCLUDED.size_60m
		`
	}
	console.log(`✅ ${RENKO_2026.length} Renko weeks seeded (W01–W22 2026)`)
}

const seedWeeklyOco = async (
	sql: SeedSql,
	hawksProAccountId: string
): Promise<void> => {
	console.log(
		"\n📦 Seeding Hawks weekly OCO configs for Hawks Pro (44 rows: 22 weeks × 2 assets)..."
	)
	let rowCount = 0
	for (const week of RENKO_2026) {
		for (const row of buildOcoRowsForWeek(week)) {
			await sql`
				INSERT INTO hawks_weekly_oco (
					id, account_id, effective_date, week_number, asset,
					stop_ticks, target_ticks, breakeven_trigger_ticks,
					trail_config, notes
				) VALUES (
					gen_random_uuid(), ${hawksProAccountId}, ${week.effectiveDate},
					${week.week}, ${row.asset},
					${row.stopTicks}, ${row.targetTicks}, ${row.beTriggerTicks},
					${JSON.stringify(TRAIL_CONFIG)}::jsonb, ${row.notes}
				)
			`
			rowCount++
		}
	}
	console.log(`✅ ${rowCount} Hawks weekly OCO rows seeded`)
}

export const seedHawksRenkoAndOco = async (
	sql: SeedSql,
	accounts: SeededAccounts
): Promise<void> => {
	await seedRenkoSizes(sql)
	await seedWeeklyOco(sql, accounts.hawksPro.id)
}
