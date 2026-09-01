import { ACTIVE_CODES, HAWKS_CODES } from "./data/hawks-codes"
import type { SeedSql } from "./helpers/sql"

// Tag axes carry what `strategies` does not.
//
// B1 (2026-09-01): axes are encoded as a NAME PREFIX, no migration. `tags` has
// only a `type` enum (setup/mistake/general) and no dimension column, so the
// prefix is the axis. Nothing in the database enforces it, so this seeder owns
// the vocabulary — a typo would create a silent fifth axis.
//
// Four axes:
//   exec:   how the entry was executed
//   nivel:  the level entered
//   tf:     the timeframe the level belongs to
//   risco:  the risk cell from the §05-07 pressure matrix
//
// `exec:` and `nivel:` are DERIVED from the active code set below, so the
// vocabulary cannot drift away from the overlay. Change §18.10 and the tags
// follow automatically.
//
// The `risco:` axis collapses to exactly six values because B3 fixes the stop
// at the 5min for every strategy. Risk is then a function of the level's
// timeframe and the execution alone:
//     level 5min  → virada 1, teste 2
//     level 15min → virada 4, teste 5
//     level 60min → virada 8, teste 10
// This is what turns "is risk 8 worth it?" from a doctrine argument into a
// query. See playbook.md §18.1.

const AXIS_COLOR = {
	exec: "#2f7d63",
	nivel: "#3b6ea8",
	tf: "#6b6f8a",
	risco: "#9a6415",
	mistake: "#a33b32",
} as const

interface TagSpec {
	name: string
	type: "setup" | "mistake" | "general"
	color: string
	description: string
}

const EXEC_LABEL: Record<string, string> = {
	teste:
		"Entrada no teste do nível — ordem pendurada, só permitida no 61,8% e nos pontos de 15/60min",
	virada: "Entrada na virada de box — não antecipa, espera o box fechar",
	rompimento: "Entrada no rompimento do nível",
	leilao: "Entrada em leilão de abertura ou pré-leilão de fechamento",
}

const NIVEL_LABEL: Record<string, string> = {
	"media-1": "Primeira média móvel do gráfico de referência",
	"media-2": "Segunda média móvel do gráfico de referência",
	"medias": "Região das médias, sem distinguir qual das duas",
	"fib-61": "Retração de 61,8% — o único nível de retração no overlay (§18.10)",
	"vwap": "VWAP",
	"ajuste": "Preço de ajuste",
	"lta": "Linha de tendência de alta",
	"ltb": "Linha de tendência de baixa",
	"suporte-resistencia": "Suporte ou resistência de price action",
	"leilao-abertura": "Leilão de abertura",
	"leilao-fechamento": "Pré-leilão de fechamento",
}

// Risk cells from the §05-07 matrix, given the stop is always the 5min (B3).
const RISCO: readonly { n: number; label: string }[] = [
	{ n: 1, label: "virada de box em nível do 5min — a melhor célula da matriz" },
	{ n: 2, label: "teste em nível do 5min" },
	{ n: 4, label: "virada de box em nível do 15min" },
	{ n: 5, label: "teste em nível do 15min" },
	{
		n: 8,
		label:
			"virada de box em nível do 60min — célula ruim, aceita conscientemente (§18.1)",
	},
	{
		n: 10,
		label:
			"teste em nível do 60min — a PIOR célula da matriz, aceita conscientemente (§18.1)",
	},
]

const MISTAKES: readonly { name: string; description: string }[] = [
	{
		name: "erro:parcial",
		description:
			'Fez parcial em vez de mão cheia até o alvo. "Parcial é massagem do ego, mata 50% do potencial" (§13 erro 9). Impossível com 1 contrato.',
	},
	{
		name: "erro:antecipou-box",
		description:
			"Entrou antes do box fechar. Viola a regra de esperar box completo (§10).",
	},
	{
		name: "erro:preco-medio",
		description:
			"Fez preço médio. Cláusula pétrea, nunca (system-core §5, caso Peru de Natal).",
	},
	{
		name: "erro:recusou-stop",
		description:
			'Não aceitou o stop. Inclui o SDVB, que é martingale e não é estratégia Hawks. Pedro: "eu não faço de jeito nenhum".',
	},
	{
		name: "erro:operou-tarde",
		description: "Operou no período da tarde. Tarde é fora.",
	},
	{
		name: "erro:contra-60min",
		description:
			'Comprou abaixo do 60min ou vendeu acima. "Minha religião não permite."',
	},
	{
		name: "erro:excedeu-perdas",
		description:
			"Passou do teto de perdas do dia, que é 3 no índice e cai para 2 ou 1 em semanas de R alto (§18.9).",
	},
	{
		name: "erro:misturou-ativos",
		description:
			"Operou índice e dólar no mesmo dia sem somar os stops contra a cota única do dia. O dólar consome quase o dobro por perda (§18.9).",
	},
]

const buildTags = (): TagSpec[] => {
	const tags: TagSpec[] = []

	const execs = [...new Set(ACTIVE_CODES.map((c) => c.exec))].sort()
	for (const e of execs) {
		const label = EXEC_LABEL[e]
		if (!label) {
			throw new Error(
				`No label for exec axis value "${e}" — add it to EXEC_LABEL`
			)
		}
		const slug = e === "virada" ? "virada-de-box" : e
		tags.push({
			name: `exec:${slug}`,
			type: "setup",
			color: AXIS_COLOR.exec,
			description: label,
		})
	}

	const niveis = [
		...new Set(
			ACTIVE_CODES.map((c) => c.nivel).filter((n): n is string => n !== null)
		),
	].sort()
	for (const n of niveis) {
		const label = NIVEL_LABEL[n]
		if (!label) {
			throw new Error(
				`No label for nivel axis value "${n}" — add it to NIVEL_LABEL`
			)
		}
		tags.push({
			name: `nivel:${n}`,
			type: "setup",
			color: AXIS_COLOR.nivel,
			description: label,
		})
	}

	for (const tf of ["5min", "15min", "60min"]) {
		tags.push({
			name: `tf:${tf}`,
			type: "setup",
			color: AXIS_COLOR.tf,
			description: `Nível entrado pertence ao gráfico de ${tf}. O stop é sempre do 5min, independente disto (§18.1).`,
		})
	}

	for (const r of RISCO) {
		tags.push({
			name: `risco:${r.n}`,
			type: "setup",
			color: AXIS_COLOR.risco,
			description: `Risco ${r.n} na matriz de zona de pressão: ${r.label}`,
		})
	}

	for (const m of MISTAKES) {
		tags.push({
			name: m.name,
			type: "mistake",
			color: AXIS_COLOR.mistake,
			description: m.description,
		})
	}

	return tags
}

export const seedTags = async (sql: SeedSql, userId: string): Promise<void> => {
	console.log("\n📦 Seeding Hawks tag axes...")
	const tags = buildTags()

	const tooLong = tags.filter((t) => t.name.length > 50)
	if (tooLong.length > 0) {
		throw new Error(
			`Tag names exceed varchar(50): ${tooLong.map((t) => t.name).join(", ")}`
		)
	}
	const dupes = tags.filter(
		(t, i) => tags.findIndex((o) => o.name === t.name) !== i
	)
	if (dupes.length > 0) {
		throw new Error(
			`Duplicate tag names: ${dupes.map((t) => t.name).join(", ")}`
		)
	}

	for (const t of tags) {
		await sql`
			INSERT INTO tags (id, user_id, name, type, color, description)
			VALUES (gen_random_uuid(), ${userId}, ${t.name}, ${t.type}, ${t.color}, ${t.description})
		`
	}

	const byAxis = (p: string) => tags.filter((t) => t.name.startsWith(p)).length
	console.log(
		`✅ ${tags.length} tags seeded — exec ${byAxis("exec:")}, nivel ${byAxis("nivel:")}, tf ${byAxis("tf:")}, risco ${byAxis("risco:")}, erro ${byAxis("erro:")}`
	)
	console.log(
		`   vocabulary derived from ${ACTIVE_CODES.length} active codes of ${HAWKS_CODES.length}`
	)
}
