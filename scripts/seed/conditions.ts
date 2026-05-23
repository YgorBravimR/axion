import type { SeedSql } from "./helpers/sql"

type ConditionCategory =
	| "indicator"
	| "price_action"
	| "market_context"
	| "custom"

interface ConditionSpec {
	name: string
	category: ConditionCategory
	description: string
}

// Canonical Hawks (Pedro Palmezani) checklist. Synthesized from
// /Users/ygorbravim/vault/wiki/hawks/playbook.md sections 1–6:
// triple-screen Renko 5/15/60min + MACD calibrado + EMAs 27/55 + VWAP + ajuste,
// with MMA (Médias e MACDs Alinhados) as entry pre-condition and a strict
// pullback-not-rompimento rule.
const HAWKS_CONDITIONS: ConditionSpec[] = [
	// indicator
	{
		name: "MACD slope up (5min)",
		category: "indicator",
		description: "MACD line + histogram slope up on the 5min screen",
	},
	{
		name: "MACD slope up (15min)",
		category: "indicator",
		description: "MACD line + histogram slope up on the 15min screen",
	},
	{
		name: "MACD slope up (60min)",
		category: "indicator",
		description: "MACD line + histogram slope up on the 60min screen",
	},
	{
		name: "Cláudia (cloud) válida",
		category: "indicator",
		description:
			"MACD cloud structure forming Cláudia — directional cloud thickening",
	},
	{
		name: "Renko close > EMA 27",
		category: "indicator",
		description: "Renko brick closes on the right side of the 27-period EMA",
	},
	{
		name: "Renko close > EMA 55",
		category: "indicator",
		description: "Renko brick closes on the right side of the 55-period EMA",
	},
	// price_action
	{
		name: "Pullback no EMA 27",
		category: "price_action",
		description: "Price pulls back to EMA 27 and rejects — entry trigger",
	},
	{
		name: "Pullback no EMA 55",
		category: "price_action",
		description:
			"Price pulls back to EMA 55 and rejects — deeper retrace entry",
	},
	{
		name: "Higher high 60min",
		category: "price_action",
		description:
			"60min printed a higher high than the prior swing — bullish structure",
	},
	{
		name: "Lower low 60min",
		category: "price_action",
		description:
			"60min printed a lower low than the prior swing — bearish structure",
	},
	{
		name: "NÃO entra em rompimento",
		category: "price_action",
		description:
			"Hard rule: never enter on the rompimento (break of high/low) — pullback only",
	},
	{
		name: "Doji at MMA",
		category: "price_action",
		description: "Doji / reversal candle right at the MMA confluence zone",
	},
	// market_context
	{
		name: "VWAP respeitado",
		category: "market_context",
		description: "VWAP holding as dynamic support/resistance for the direction",
	},
	{
		name: "Ajuste respeitado",
		category: "market_context",
		description:
			"Previous day's ajuste (settlement) holding — confirms continuation",
	},
	{
		name: "MMA alinhada",
		category: "market_context",
		description:
			"MMA — Médias e MACDs Alinhados — all three timeframes pointing same way",
	},
	{
		name: "Pre-market sem evento",
		category: "market_context",
		description: "No FOMC, COPOM, payroll, or other macro event blocking entry",
	},
	// custom
	{
		name: "Renko semanal calibrado",
		category: "custom",
		description:
			"Renko brick size matches this week's calibration (Monday Telegram)",
	},
	{
		name: "Sem trigger emocional",
		category: "custom",
		description: "Trader not in FOMO / revenge / fatigue state — clear mind",
	},
]

export type ConditionMap = Map<string, string>

export const seedTradingConditions = async (
	sql: SeedSql,
	adminUserId: string
): Promise<ConditionMap> => {
	console.log("\n📦 Seeding trading conditions (Hawks checklist)...")

	const map: ConditionMap = new Map()
	for (const spec of HAWKS_CONDITIONS) {
		const rows = (await sql`
			INSERT INTO trading_conditions (
				id, user_id, name, description, category, is_active
			) VALUES (
				gen_random_uuid(), ${adminUserId}, ${spec.name}, ${spec.description},
				${spec.category}, true
			)
			RETURNING id
		`) as { id: string }[]
		const row = rows[0]
		if (!row) {
			throw new Error(`Failed to insert condition: ${spec.name}`)
		}
		map.set(spec.name, row.id)
	}
	console.log(`✅ ${HAWKS_CONDITIONS.length} trading conditions seeded`)
	return map
}
