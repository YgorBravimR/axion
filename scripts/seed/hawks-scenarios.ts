import { buildScenarioSeedRows } from "@/lib/hawks/seed-data"
import type { SeedSql } from "./helpers/sql"

// Seeds the canonical 24 Hawks scenarios (HWK_S01..HWK_S24) from the single
// source of truth at src/lib/hawks/seed-data.ts. Global table — one row per
// scenario code; the same library is shared across all accounts on Hawks mode.
export const seedHawksScenarios = async (sql: SeedSql): Promise<void> => {
	console.log("\n📦 Seeding Hawks scenarios (24 canonical setups)...")
	const rows = buildScenarioSeedRows()
	for (const row of rows) {
		await sql`
			INSERT INTO hawks_scenarios (
				id, code, name_en, name_pt, description_pt, direction,
				screen_confirmation, scenario_type
			) VALUES (
				gen_random_uuid(), ${row.code}, ${row.nameEn}, ${row.namePt},
				${row.descriptionPt}, ${row.direction},
				${JSON.stringify(row.screenConfirmation)}::jsonb,
				${row.scenarioType}
			)
			ON CONFLICT (code) DO UPDATE SET
				name_en = EXCLUDED.name_en,
				name_pt = EXCLUDED.name_pt,
				description_pt = EXCLUDED.description_pt,
				direction = EXCLUDED.direction,
				screen_confirmation = EXCLUDED.screen_confirmation,
				scenario_type = EXCLUDED.scenario_type
		`
	}
	console.log(`✅ ${rows.length} Hawks scenarios seeded`)
}
