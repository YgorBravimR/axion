import type { SeedSql } from "./helpers/sql"

type ConditionCategory =
	"indicator" | "price_action" | "market_context" | "custom"

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
		// C2 FIX (2026-09-01). This used to read "Cláudia (cloud) válida —
		// MACD cloud structure forming Cláudia". Two errors in one row.
		//
		// 1. Cláudia is NOT the MACD cloud. "Cláudia" is how the transcripts
		//    render the English word "clouds", and the clouds are the Hawks
		//    Cloud: a Keltner-channel exhaustion envelope plotted OVER PRICE.
		//    The decisive proof is a preposition — Pedro says price is "acima
		//    das Cláudias", and price cannot be above a subpanel indicator.
		// 2. It was framed as a positive condition. Doctrine makes it an
		//    absolute NEGATIVE filter: touching the band without expansion
		//    means stay out.
		name: "Cláudia livre (banda da Hawks Cloud)",
		category: "indicator",
		description:
			"Preço NÃO está encostado na banda da Hawks Cloud sem expansão. A Hawks Cloud é o envelope de exaustão em canal de Keltner plotado SOBRE O PREÇO, não a nuvem do MACD. Filtro negativo absoluto: encostou sem romper = fora. Peso 60min > 15min > 5min.",
	},
	// Hawks mean periods are per-chart and the previous set only carried
	// 27/55, which is the 15min-and-above pair. The 5min's OWN pair is 17/34,
	// and the 5min is where entries execute and where the stop is always
	// placed (§18.1), so those were the most important two and were missing.
	// The 27/55 pair also appears projected onto the 5min as the red lines.
	{
		name: "Renko fechou do lado certo da média 17 (5min)",
		category: "indicator",
		description:
			"Box do 5min fechou do lado correto da primeira média própria do 5min (17). Este é o gráfico de execução.",
	},
	{
		name: "Renko fechou do lado certo da média 34 (5min)",
		category: "indicator",
		description:
			"Box do 5min fechou do lado correto da segunda média própria do 5min (34).",
	},
	{
		name: "Renko fechou do lado certo da média 27",
		category: "indicator",
		description:
			"Primeira média do 15min e acima (27). Projetada no 5min aparece como linha vermelha.",
	},
	{
		name: "Renko fechou do lado certo da média 55",
		category: "indicator",
		description:
			"Segunda média do 15min e acima (55). Projetada no 5min aparece como linha vermelha.",
	},
	// price_action
	{
		name: "Pullback na média 17 (5min)",
		category: "price_action",
		description:
			"Preço retornou à primeira média própria do 5min e rejeitou. Código RM1 / VBRM1.",
	},
	{
		name: "Pullback na média 34 (5min)",
		category: "price_action",
		description:
			"Preço retornou à segunda média própria do 5min e rejeitou. Código RM2 / VBRM2.",
	},
	{
		name: "Pullback na média 27",
		category: "price_action",
		description:
			"Preço retornou à primeira média do 15min ou 60min. Risco 4 ou 8 na matriz, porque o stop continua sendo do 5min (§18.1).",
	},
	{
		name: "Pullback na média 55",
		category: "price_action",
		description:
			"Preço retornou à segunda média do 15min ou 60min. Risco 5 ou 10 na matriz, a região mais cara (§18.1).",
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
			"Box do Renko usa a calibragem desta semana. Índice: ATR do período dividido por 10. Dólar: pontos arredondado, sem divisor. Série medida em hawks_renko_sizes.",
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
