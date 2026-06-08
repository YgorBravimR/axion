/**
 * seed-hawks-indicators.ts
 *
 * Idempotent seed for `indicator_groups` and `indicator_definitions` covering
 * every column shipped in the 2026-05-28 Hawks Renko CSV exports (5m, 15m, 60m).
 *
 * Each definition stores the EXACT CSV column header as `csv_header` so the
 * loader can be auto-derived from it later if we want; for now, the loaders
 * have the column indices hard-coded in their respective files.
 *
 * Run: `pnpm tsx scripts/seed-hawks-indicators.ts`
 */
import "dotenv/config"
import { neon } from "@neondatabase/serverless"

interface GroupSeed {
	key: string
	displayName: string
	description: string
	sortOrder: number
}

interface DefinitionSeed {
	key: string
	groupKey: string
	csvHeader: string
	displayName: string
	sortOrder: number
}

const GROUPS: GroupSeed[] = [
	{
		key: "moving_average",
		displayName: "Moving Averages",
		description:
			"Exponential moving averages over Renko bricks (MME 27 / MME 55) per timeframe.",
		sortOrder: 10,
	},
	{
		key: "vwap",
		displayName: "VWAP",
		description:
			"Volume-weighted average prices: daily (D), weekly (S — semanal), monthly (M — mensal).",
		sortOrder: 20,
	},
	{
		key: "pivot",
		displayName: "Topos e Fundos",
		description:
			"ProfitChart pivot detector. [1] confirms with 1 against-brick close; [2] confirms with 2.",
		sortOrder: 30,
	},
	{
		key: "keltner",
		displayName: "Keltner Channels",
		description:
			"Keltner bands at multipliers 12.50 and 16.50 — Superior (upper) and Inferior (lower).",
		sortOrder: 40,
	},
	{
		key: "momentum",
		displayName: "Momentum",
		description: "MACD line (DI − DIS).",
		sortOrder: 50,
	},
	{
		key: "volume",
		displayName: "Volume",
		description:
			"Per-brick total volume and aggression balance (delta of aggressive buys − sells).",
		sortOrder: 60,
	},
	{
		key: "settlement",
		displayName: "Settlement",
		description: "Day-1 settlement price (AJUSTE).",
		sortOrder: 70,
	},
	{
		key: "meta",
		displayName: "Meta",
		description:
			"Per-brick metadata (e.g., INDEX DO CANDLE — the brick counter).",
		sortOrder: 80,
	},
]

const DEFINITIONS: DefinitionSeed[] = [
	// --- Moving averages (timeframe-tagged keys) ---
	{
		key: "mme27_15m",
		groupKey: "moving_average",
		csvHeader: "MME27 15m",
		displayName: "EMA 27 (15m Renko)",
		sortOrder: 11,
	},
	{
		key: "mme55_15m",
		groupKey: "moving_average",
		csvHeader: "MME55 15m",
		displayName: "EMA 55 (15m Renko)",
		sortOrder: 12,
	},
	{
		key: "mme27_60m",
		groupKey: "moving_average",
		csvHeader: "MME27 60m",
		displayName: "EMA 27 (60m Renko)",
		sortOrder: 13,
	},
	{
		key: "mme55_60m",
		groupKey: "moving_average",
		csvHeader: "MME55 60m",
		displayName: "EMA 55 (60m Renko)",
		sortOrder: 14,
	},

	// --- VWAP ---
	{
		key: "vwap_d_5m",
		groupKey: "vwap",
		csvHeader: "VWAP D",
		displayName: "VWAP Diário",
		sortOrder: 21,
	},
	{
		key: "vwap_s_5m",
		groupKey: "vwap",
		csvHeader: "VWAP S",
		displayName: "VWAP Semanal",
		sortOrder: 22,
	},
	{
		key: "vwap_m_5m",
		groupKey: "vwap",
		csvHeader: "VWAP M",
		displayName: "VWAP Mensal",
		sortOrder: 23,
	},

	// --- Pivots ---
	{
		key: "topos_fundos",
		groupKey: "pivot",
		csvHeader: "TOPOS E FUNDOS [2]",
		displayName: "Topos e Fundos [2-brick]",
		sortOrder: 31,
	},
	{
		key: "topos_fundos_p1",
		groupKey: "pivot",
		csvHeader: "TOPOS E FUNDOS [1]",
		displayName: "Topos e Fundos [1-brick]",
		sortOrder: 32,
	},
	{
		key: "topos_fundos_p2",
		groupKey: "pivot",
		csvHeader: "TOPOS E FUNDOS [2]",
		displayName: "Topos e Fundos [2-brick] (HTF)",
		sortOrder: 33,
	},

	// --- Keltner ---
	{
		key: "keltner_sup_125",
		groupKey: "keltner",
		csvHeader: "KELTNER SUPERIOR [12.50]",
		displayName: "Keltner Superior (12.50)",
		sortOrder: 41,
	},
	{
		key: "keltner_inf_125",
		groupKey: "keltner",
		csvHeader: "KELTNER INFERIOR [12.50]",
		displayName: "Keltner Inferior (12.50)",
		sortOrder: 42,
	},
	{
		key: "keltner_sup_165",
		groupKey: "keltner",
		csvHeader: "KELTNER SUPERIOR [16.50]",
		displayName: "Keltner Superior (16.50)",
		sortOrder: 43,
	},
	{
		key: "keltner_inf_165",
		groupKey: "keltner",
		csvHeader: "KELTNER INFERIOR [16.50]",
		displayName: "Keltner Inferior (16.50)",
		sortOrder: 44,
	},

	// --- Momentum ---
	{
		key: "macd",
		groupKey: "momentum",
		csvHeader: "MACD",
		displayName: "MACD",
		sortOrder: 51,
	},

	// --- Volume ---
	{
		key: "volume",
		groupKey: "volume",
		csvHeader: "VOLUME",
		displayName: "Volume",
		sortOrder: 61,
	},
	{
		key: "aggression_balance",
		groupKey: "volume",
		csvHeader: "Agressão saldo",
		displayName: "Agressão Saldo",
		sortOrder: 62,
	},

	// --- Settlement ---
	{
		key: "ajuste_d1",
		groupKey: "settlement",
		csvHeader: "AJUSTE",
		displayName: "Ajuste D-1",
		sortOrder: 71,
	},

	// --- Meta ---
	{
		key: "index_do_candle",
		groupKey: "meta",
		csvHeader: "INDEX DO CANDLE",
		displayName: "Index do Candle (brick counter)",
		sortOrder: 81,
	},
]

const run = async () => {
	const sql = neon(process.env.DATABASE_URL!)

	// Groups upsert
	for (const g of GROUPS) {
		await sql`
			INSERT INTO indicator_groups (key, display_name, description, sort_order, is_active)
			VALUES (${g.key}, ${g.displayName}, ${g.description}, ${g.sortOrder}, true)
			ON CONFLICT (key) DO UPDATE
			SET display_name = EXCLUDED.display_name,
			    description  = EXCLUDED.description,
			    sort_order   = EXCLUDED.sort_order,
			    is_active    = true
		`
	}
	console.log(`✓ Upserted ${GROUPS.length} indicator groups`)

	// Resolve group keys → ids
	const groupRows = (await sql`
		SELECT id, key FROM indicator_groups
	`) as { id: string; key: string }[]
	const groupIdByKey = new Map(groupRows.map((r) => [r.key, r.id]))

	// Definitions upsert
	for (const d of DEFINITIONS) {
		const groupId = groupIdByKey.get(d.groupKey)
		if (!groupId) {
			throw new Error(`Group not found for definition ${d.key}: ${d.groupKey}`)
		}
		await sql`
			INSERT INTO indicator_definitions (key, group_id, csv_header, display_name, sort_order, is_active)
			VALUES (${d.key}, ${groupId}, ${d.csvHeader}, ${d.displayName}, ${d.sortOrder}, true)
			ON CONFLICT (key) DO UPDATE
			SET group_id     = EXCLUDED.group_id,
			    csv_header   = EXCLUDED.csv_header,
			    display_name = EXCLUDED.display_name,
			    sort_order   = EXCLUDED.sort_order,
			    is_active    = true
		`
	}
	console.log(`✓ Upserted ${DEFINITIONS.length} indicator definitions`)
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
