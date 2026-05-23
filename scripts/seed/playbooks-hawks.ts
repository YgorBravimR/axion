import type { SeedSql } from "./helpers/sql"
import type { ConditionMap } from "./conditions"

interface PlaybookSpec {
	code: string
	name: string
	description: string
	entryCriteria: string
	exitCriteria: string
	riskRules: string
	stopR: string
	finalR: string
	mandatory: string[]
	tier2: string[]
	tier3: string[]
}

// Hawks playbooks synthesized from /Users/ygorbravim/vault/wiki/hawks/playbook.md
// (sections 1–6: setup técnico, triple screen, viés do dia, calibração semanal,
// matriz de entrada, CT/MMA). Each maps a distinct branch of the entry matrix.
const HAWKS_PLAYBOOKS: PlaybookSpec[] = [
	{
		code: "HWK_TENDENCIA_CLARA",
		name: "Hawks · Tendência Clara (MMA)",
		description:
			"Mercado em tendência clara no 60min, MMA alinhada, entrada por pullback no 5min. " +
			"O setup principal da metodologia — Pedro 3x. NUNCA entra em rompimento.",
		entryCriteria:
			"60min com viés definido (renkoClose, MACD slope, EMA stack, VWAP, ajuste). " +
			"Espera pullback no 5min na EMA 27 ou 55. MMA alinhada nas três telas. " +
			"Triple-screen confirmado. Entra na rejeição do pullback.",
		exitCriteria:
			"Alvo fixo +3R (Pedro pattern). Stop a -1R do entry. Move stop a zero (BE) " +
			"quando +1R favor. Não move stop contra a operação.",
		riskRules:
			"1R = valor do tier corrente (resolveOneR). Stop = 1R, alvo = 3R. Sem parcial. " +
			"Trail box-a-box opcional após +3R (override Ygor): trail 2 boxes behind.",
		stopR: "1.00",
		finalR: "3.00",
		mandatory: [
			"MMA alinhada",
			"VWAP respeitado",
			"Ajuste respeitado",
			"NÃO entra em rompimento",
		],
		tier2: [
			"MACD slope up (5min)",
			"MACD slope up (15min)",
			"MACD slope up (60min)",
		],
		tier3: [
			"Higher high 60min",
			"Cláudia (cloud) válida",
			"Renko close > EMA 27",
		],
	},
	{
		code: "HWK_PULLBACK_5M",
		name: "Hawks · Pullback no 5min",
		description:
			"Variação do tendência clara focada no gatilho 5min: pullback na EMA 27 (raso) " +
			"ou na EMA 55 (mais profundo) com rejeição clara. Triple-screen confirma na entrada.",
		entryCriteria:
			"Triple-screen alinhado (5/15/60min Renko). Aguarda pullback no 5min até EMA 27 " +
			"(setup raso) ou EMA 55 (setup profundo). Entra apenas após candle de rejeição " +
			"(doji / pin bar) no MMA. Confirma Cláudia (cloud).",
		exitCriteria:
			"Alvo +3R. Stop a -1R do entry (atrás do pavio do candle de rejeição se mais conservador). " +
			"BE quando +1R favor.",
		riskRules:
			"1R fixo do tier. Em mercados de alta volatilidade (Renko semanal recalibrado " +
			"intra-semana), reduzir contratos pela metade.",
		stopR: "1.00",
		finalR: "3.00",
		mandatory: [
			"MMA alinhada",
			"VWAP respeitado",
			"Pullback no EMA 27",
			"NÃO entra em rompimento",
		],
		tier2: ["MACD slope up (5min)", "MACD slope up (15min)"],
		tier3: ["Renko close > EMA 27", "Cláudia (cloud) válida"],
	},
	{
		code: "HWK_LATERAL_REVERSAO",
		name: "Hawks · Lateralização + Reversão",
		description:
			"60min sem renovação de topo nem fundo — mercado lateral. Fade nos extremos da " +
			"range com reversão confirmada (doji no MMA, divergência MACD). Alvo menor (+2R) " +
			"porque a estrutura não suporta 3R.",
		entryCriteria:
			"60min lateral (sem higher high nem lower low recentes). Preço nos extremos da " +
			"range. Doji ou reversão no MMA. VWAP atuando como mean reversion. NÃO opera " +
			"rompimento da lateral — só rejeições.",
		exitCriteria:
			"Alvo +2R (não 3R — range não comporta). Stop a -1R. BE quando +1R favor. " +
			"Cancela operação se range é rompida no caminho.",
		riskRules:
			"1R fixo do tier. Tamanho de posição reduzido (~70% do tendência clara) por " +
			"natureza do trade ser counter-trend dentro da range.",
		stopR: "1.00",
		finalR: "2.00",
		mandatory: ["VWAP respeitado", "Doji at MMA", "NÃO entra em rompimento"],
		tier2: ["Ajuste respeitado", "MACD slope up (15min)"],
		tier3: ["Pullback no EMA 27", "Pullback no EMA 55"],
	},
	{
		code: "HWK_VIRADA_60M",
		name: "Hawks · Dia de Virada do 60min",
		description:
			"Avançado. 60min vira direção intra-dia (renkoClose flip + MACD slope flip). " +
			"Espera confirmação por 2 candles do 60min antes de qualquer trade na nova direção. " +
			"Não opera no momento da virada — só após estabilização.",
		entryCriteria:
			"60min flip confirmado (renko close + MACD slope ambos na nova direção). " +
			"Aguarda pelo menos 2 candles do 60min na nova direção. Pullback no 5min na " +
			"nova EMA. Renko semanal calibrado (não opera em semana com Renko incerto).",
		exitCriteria:
			"Alvo +3R. Stop -1R (apertado — virada é frágil até consolidar). BE em +1R favor.",
		riskRules:
			"1R fixo do tier, MAS reduzir contratos pela metade no primeiro trade pós-virada. " +
			"Voltar à tamanho normal apenas se o segundo trade na nova direção também ganhar.",
		stopR: "1.00",
		finalR: "3.00",
		mandatory: [
			"MMA alinhada",
			"NÃO entra em rompimento",
			"Renko semanal calibrado",
		],
		tier2: ["MACD slope up (60min)", "VWAP respeitado", "Ajuste respeitado"],
		tier3: ["Higher high 60min", "Lower low 60min"],
	},
]

const insertStrategy = async (
	sql: SeedSql,
	userId: string,
	spec: PlaybookSpec
): Promise<string> => {
	const rows = (await sql`
		INSERT INTO strategies (
			id, user_id, code, name, description, methodology,
			entry_criteria, exit_criteria, risk_rules,
			stop_r, final_r, is_active,
			current_version, next_version_number
		) VALUES (
			gen_random_uuid(), ${userId}, ${spec.code}, ${spec.name}, ${spec.description},
			'hawks',
			${spec.entryCriteria}, ${spec.exitCriteria}, ${spec.riskRules},
			${spec.stopR}, ${spec.finalR}, true,
			1, 2
		)
		RETURNING id
	`) as { id: string }[]
	const row = rows[0]
	if (!row) {
		throw new Error(`Failed to insert strategy: ${spec.code}`)
	}
	return row.id
}

const insertStrategyVersion = async (
	sql: SeedSql,
	strategyId: string,
	spec: PlaybookSpec
): Promise<string> => {
	const rows = (await sql`
		INSERT INTO strategy_versions (
			id, strategy_id, version, name, description,
			entry_criteria, exit_criteria, risk_rules,
			stop_r, final_r, label
		) VALUES (
			gen_random_uuid(), ${strategyId}, 1, ${spec.name}, ${spec.description},
			${spec.entryCriteria}, ${spec.exitCriteria}, ${spec.riskRules},
			${spec.stopR}, ${spec.finalR}, 'v1 (seed)'
		)
		RETURNING id
	`) as { id: string }[]
	const row = rows[0]
	if (!row) {
		throw new Error(`Failed to insert strategy_version: ${spec.code} v1`)
	}
	return row.id
}

const insertConditionLinks = async (
	sql: SeedSql,
	strategyId: string,
	versionId: string,
	conditionMap: ConditionMap,
	tier: "mandatory" | "tier_2" | "tier_3",
	names: string[],
	sortOffset: number
): Promise<void> => {
	let sortOrder = sortOffset
	for (const name of names) {
		const conditionId = conditionMap.get(name)
		if (!conditionId) {
			throw new Error(`Unknown condition: "${name}" (check conditions.ts)`)
		}
		await sql`
			INSERT INTO strategy_conditions (
				id, strategy_id, strategy_version_id, condition_id, tier, sort_order
			) VALUES (
				gen_random_uuid(), ${strategyId}, ${versionId}, ${conditionId},
				${tier}, ${sortOrder}
			)
		`
		sortOrder++
	}
}

export interface HawksPlaybookMap {
	[code: string]: { strategyId: string; versionId: string }
}

export const seedHawksPlaybooks = async (
	sql: SeedSql,
	adminUserId: string,
	conditionMap: ConditionMap
): Promise<HawksPlaybookMap> => {
	console.log(
		"\n📦 Seeding Hawks playbooks (4 strategies, tiered conditions)..."
	)

	const result: HawksPlaybookMap = {}
	for (const spec of HAWKS_PLAYBOOKS) {
		const strategyId = await insertStrategy(sql, adminUserId, spec)
		const versionId = await insertStrategyVersion(sql, strategyId, spec)
		await insertConditionLinks(
			sql,
			strategyId,
			versionId,
			conditionMap,
			"mandatory",
			spec.mandatory,
			0
		)
		await insertConditionLinks(
			sql,
			strategyId,
			versionId,
			conditionMap,
			"tier_2",
			spec.tier2,
			100
		)
		await insertConditionLinks(
			sql,
			strategyId,
			versionId,
			conditionMap,
			"tier_3",
			spec.tier3,
			200
		)
		result[spec.code] = { strategyId, versionId }
		console.log(
			`   ✅ ${spec.name} (${spec.mandatory.length}m / ${spec.tier2.length}t2 / ${spec.tier3.length}t3)`
		)
	}
	return result
}
