/**
 * Hawks Mode — strategy and tag seed data.
 *
 * When a user activates Hawks Mode, these rows are upserted into the user's
 * existing `strategies` and `tags` tables so the entire system (playbook,
 * journal tagging, settings) reflects Pedro Palmezani's framework without
 * spawning parallel routes.
 *
 * Codes use `HWK_` prefix; tag names use `Hawks ` prefix. Both serve as
 * markers so {@link deactivateHawksMode} can remove only seed-managed rows
 * and leave user-authored playbook entries untouched.
 *
 * @see docs/hawks-mode-research.md § 4 (24 scenarios) § 6 (Method 3 stop)
 */

interface HawksSeedStrategy {
	code: string
	name: string
	description: string
	entryCriteria: string
	exitCriteria: string
	riskRules: string
	maxRiskPercent: string
}

interface HawksSeedTag {
	name: string
	type: "setup" | "mistake"
	color: string
	description: string
}

const HAWKS_STRATEGIES: HawksSeedStrategy[] = [
	{
		code: "HWK_ONDA2",
		name: "Onda 2 — Renko 60min",
		description: "Entrada na correção da segunda onda confirmada por Renko 60min com MACD e EMA stack alinhados.",
		entryCriteria: "Renko 60min em tendência. MACD 60min cruzou. EMA 9/21/50 empilhadas. VWAP a favor. Ajuste respeitado.",
		exitCriteria: "Stop Method 3 (não move contra). Alvos Fib 76.4 / 100 / 161.8. Saída parcial em cada nível.",
		riskRules: "Risco fixo: capital ÷ 20 por operação. Cap diário: 3 trades. Stop diário: 5R / 10R cascata.",
		maxRiskPercent: "5.00",
	},
	{
		code: "HWK_M3STOP",
		name: "Method 3 — Stop trailing",
		description: "Disciplina de stop: nunca move contra a posição. Atualiza só a favor após confirmação de estrutura.",
		entryCriteria: "Aplicável a qualquer setup Hawks após entrada confirmada.",
		exitCriteria: "Trail somente após novo pivô a favor. Violação registra hawksStopAudit.violation = true.",
		riskRules: "Stop nunca recua. Mover stop contra posição = violação de método.",
		maxRiskPercent: "5.00",
	},
	{
		code: "HWK_FIBEXP",
		name: "Fib Expansion — 76.4 / 100 / 161.8",
		description: "Alvos de Fibonacci expansion da onda 1 projetados sobre onda 2.",
		entryCriteria: "Estrutura Onda 1 → Onda 2 confirmada. Projeção desenhada do início da onda 1 ao topo, retracted ao pivô da onda 2.",
		exitCriteria: "Saídas parciais: 33% em 76.4, 33% em 100, 34% em 161.8.",
		riskRules: "Não estende alvo além de 161.8 sem confirmação de continuidade.",
		maxRiskPercent: "5.00",
	},
	{
		code: "HWK_VWAP",
		name: "VWAP Hawks — Reversão à média",
		description: "Operações de retorno à VWAP em contexto de exaustão de movimento.",
		entryCriteria: "Preço afastado >2σ da VWAP intradiária. Renko 60min confirma exaustão. MACD divergente.",
		exitCriteria: "Alvo: VWAP. Stop: máxima/mínima do candle de exaustão.",
		riskRules: "Setup contraria tendência: operar somente com bias diário lateral.",
		maxRiskPercent: "5.00",
	},
	{
		code: "HWK_AJUSTE",
		name: "Respeito ao Ajuste",
		description: "Operações ancoradas no preço de ajuste do dia anterior como suporte/resistência principal.",
		entryCriteria: "Preço se aproxima do ajuste D-1 com volume crescente. Confirma rejeição ou rompimento.",
		exitCriteria: "Alvo: próximo ajuste relevante (semanal/mensal). Stop: ajuste violado.",
		riskRules: "Não opera contra ajuste sem confirmação 60min.",
		maxRiskPercent: "5.00",
	},
]

const SCENARIO_NAMES: readonly string[] = [
	"Romp. topo D-1",
	"Rej. topo D-1",
	"Romp. fundo D-1",
	"Rej. fundo D-1",
	"Romp. ajuste",
	"Rej. ajuste",
	"Pullback EMA9",
	"Pullback EMA21",
	"Pullback EMA50",
	"VWAP — toque",
	"VWAP — rompimento",
	"Onda 2 alta",
	"Onda 2 baixa",
	"Fib 61.8 retração",
	"Fib 76.4 retração",
	"Continuação tendência",
	"Reversão exaustão",
	"Squeeze breakout",
	"Inside bar setup",
	"Outside bar reversão",
	"Volume climático",
	"Divergência MACD",
	"Macro release reação",
	"Abertura — gap fade",
] as const

const HAWKS_TAGS: HawksSeedTag[] = [
	...SCENARIO_NAMES.map((name, idx): HawksSeedTag => ({
		name: `Hawks Cenário ${String(idx + 1).padStart(2, "0")} — ${name}`,
		type: "setup",
		color: "#C9A961",
		description: `Cenário Hawks #${idx + 1}: ${name}.`,
	})),
	{
		name: "Hawks Mistake — Stop violado",
		type: "mistake",
		color: "#EF4444",
		description: "Stop foi movido contra a posição — violação direta do Method 3.",
	},
	{
		name: "Hawks Mistake — Cap diário excedido",
		type: "mistake",
		color: "#F59E0B",
		description: "Excedeu o limite de 3 operações no dia.",
	},
	{
		name: "Hawks Mistake — Fora do setup",
		type: "mistake",
		color: "#8B5CF6",
		description: "Entrou sem confirmação de Renko 60min, MACD ou EMA stack.",
	},
	{
		name: "Hawks Mistake — Ajuste ignorado",
		type: "mistake",
		color: "#06B6D4",
		description: "Operou contra preço de ajuste sem confirmação.",
	},
	{
		name: "Hawks Mistake — Cascata 5/10 quebrada",
		type: "mistake",
		color: "#DC2626",
		description: "Continuou operando após gatilho de stop diário 5R / 10R.",
	},
]

const HAWKS_STRATEGY_CODES: readonly string[] = HAWKS_STRATEGIES.map((s) => s.code)
const HAWKS_TAG_NAMES: readonly string[] = HAWKS_TAGS.map((t) => t.name)

const HAWKS_CHECKLIST_NAME = "Hawks — Viés diário (60min)"
const HAWKS_DAILY_TRADE_CAP = 3

interface HawksChecklistItemSeed {
	id: string
	label: string
	order: number
}

const HAWKS_CHECKLIST_ITEMS: HawksChecklistItemSeed[] = [
	{
		id: "hwk-renko-60min-direction",
		label: "Renko de 60 min fechou na direção do viés",
		order: 0,
	},
	{
		id: "hwk-macd-aligned",
		label: "Histograma MACD 27/117/55 alinhado",
		order: 1,
	},
	{
		id: "hwk-ema-stack",
		label: "Pilha das EMAs 27/55 confirma a direção",
		order: 2,
	},
	{
		id: "hwk-vwap-respected",
		label: "Preço respeita VWAP diária/mensal",
		order: 3,
	},
	{
		id: "hwk-prev-settle",
		label: "Ajuste do dia anterior respeitado",
		order: 4,
	},
]

export {
	HAWKS_STRATEGIES,
	HAWKS_TAGS,
	HAWKS_STRATEGY_CODES,
	HAWKS_TAG_NAMES,
	HAWKS_CHECKLIST_NAME,
	HAWKS_CHECKLIST_ITEMS,
	HAWKS_DAILY_TRADE_CAP,
}
export type { HawksSeedStrategy, HawksSeedTag, HawksChecklistItemSeed }
