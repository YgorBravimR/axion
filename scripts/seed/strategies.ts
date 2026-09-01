import { HAWKS_CODES, type Family } from "./data/hawks-codes"
import type { SeedSql } from "./helpers/sql"

// `strategies` holds FAMILIES, not the 47 codes.
//
// A code is the cross product of an execution and a level: `VBRM` IS
// `exec:virada` + `nivel:medias`. Storing 47 rows makes analysis impossible,
// because each code would carry two or three trades and no question about
// teste-versus-virada could be answered across the sample. Eight family rows
// plus tag axes answer it across everything. See docs/hawks-reset/plan.html §D.
//
// R template, all from doctrine and NOT invented:
//   stopR       = 1  — the stop IS 1R by definition (2 boxes of the 5min, §7)
//   protectionR = 1  — break-even when gain ≈ risk, playbook.md §7 Método 3 L657
//   partialR    = null — doctrine forbids partials in four places, including
//                        §13 mistake #9: "parcial é massagem do ego". With one
//                        contract (§18.9) it is arithmetically impossible anyway.
//   finalR      = 3  — ⚠️ NOT doctrine. It is the far leg an OCO bracket needs
//                        and the point where the 2-box trail arms. The real
//                        doctrinal trigger is the 76,4% Fibonacci EXPANSION of
//                        the move, which depends on the move and cannot be
//                        derived from the box size. 3R is a placement proxy.

interface FamilySpec {
	family: Family
	code: string
	name: string
	description: string
	active: boolean
}

const FAMILIES: readonly FamilySpec[] = [
	{
		family: "media",
		code: "HAWKS_MEDIA",
		name: "Retorno às médias",
		description:
			"Entrada na região das médias móveis do gráfico de referência. Códigos: RM1, RM2, VBRM, VBRM1, VBRM2.",
		active: true,
	},
	{
		family: "price-action",
		code: "HAWKS_PRICE_ACTION",
		name: "Price action",
		description:
			"Suporte, resistência, LTA e LTB. Códigos: PA, TPA, VBPA, TLTA, VBLTA, TLTB, VBLTB.",
		active: true,
	},
	{
		family: "fibonacci",
		code: "HAWKS_FIBONACCI",
		name: "Retração de Fibonacci",
		description:
			"Retração de 61,8% apenas (overlay §18.10). Códigos ativos: RF61, VBRF61.",
		active: true,
	},
	{
		family: "vwap",
		code: "HAWKS_VWAP",
		name: "VWAP",
		description: "Entrada na VWAP. Códigos: VWAP, VBVWAP.",
		active: true,
	},
	{
		family: "ajuste",
		code: "HAWKS_AJUSTE",
		name: "Ajuste",
		description: "Entrada no preço de ajuste. Códigos: AJUSTE, VBAJUSTE.",
		active: true,
	},
	{
		family: "virada-de-box",
		code: "HAWKS_VIRADA_BOX",
		name: "Virada de box",
		description:
			"Continuação de movimento na virada de box, sem nível de referência. Código: VB.",
		active: true,
	},
	{
		family: "leilao",
		code: "HAWKS_LEILAO",
		name: "Leilões",
		description:
			"Leilão de abertura e pré-leilão de fechamento. Códigos: LEILAOA, LEILAOF.",
		active: true,
	},
	{
		family: "figura",
		code: "HAWKS_FIGURA",
		name: "Figuras gráficas",
		description:
			"Triângulos, bandeira, flâmula, ombro-cabeça-ombro. INATIVA: overlay §18.3 lê preço por pivôs, não por figuras. Mantida para preservar a doutrina.",
		active: false,
	},
]

export interface StrategyMap {
	byFamily: Map<Family, string>
}

export const seedStrategies = async (
	sql: SeedSql,
	userId: string
): Promise<StrategyMap> => {
	console.log("\n📦 Seeding Hawks strategy families...")

	for (const f of FAMILIES) {
		const codes = HAWKS_CODES.filter((c) => c.family === f.family)
		const activeCodes = codes.filter((c) => c.active).map((c) => c.code)
		const notes = [
			`Códigos do grupo (${codes.length}): ${codes.map((c) => c.code).join(", ")}.`,
			activeCodes.length > 0
				? `Ativos (${activeCodes.length}): ${activeCodes.join(", ")}.`
				: "Nenhum código ativo.",
			"finalR=3 é proxy de colocação para a zona de 76,4%, não é doutrina.",
		].join(" ")

		await sql`
			INSERT INTO strategies (
				id, user_id, code, name, description, methodology,
				stop_r, protection_r, final_r, notes, is_active
			) VALUES (
				gen_random_uuid(), ${userId}, ${f.code}, ${f.name}, ${f.description}, 'hawks',
				1, 1, 3, ${notes}, ${f.active}
			)
		`
	}

	const rows = (await sql`
		SELECT id, code FROM strategies WHERE user_id = ${userId}
	`) as { id: string; code: string }[]

	const byCode = new Map(rows.map((r) => [r.code, r.id]))
	const byFamily = new Map<Family, string>()
	for (const f of FAMILIES) {
		const id = byCode.get(f.code)
		if (!id) {
			throw new Error(`Strategy family not persisted: ${f.code}`)
		}
		byFamily.set(f.family, id)
	}

	const activeCount = FAMILIES.filter((f) => f.active).length
	console.log(
		`✅ ${FAMILIES.length} strategy families seeded (${activeCount} active, ${FAMILIES.length - activeCount} inactive) covering all ${HAWKS_CODES.length} codes`
	)
	return { byFamily }
}
