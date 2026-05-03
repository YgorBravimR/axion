/**
 * Hawks learning content — 4-week cronograma + key concepts + glossary.
 *
 * Sourced from Pedro's vault (`study/hawks/cronograma-4-semanas.md`,
 * `concepts/*.md`, `Hawks_Master_Playbook_Pratico.md`). Kept as a static
 * seed in v1 because the content is pt-BR-first and stable; an admin
 * editor for it can come in a follow-up.
 *
 * @see docs/hawks-mode-research.md § 8 Phase 6
 */

interface CronogramaWeek {
	key: string
	weekNumber: 1 | 2 | 3 | 4
	title: string
	dateRange: string
	objective: string
	focus: string[]
	assignments: string[]
}

const HAWKS_CRONOGRAMA: CronogramaWeek[] = [
	{
		key: "week-1-fundacao",
		weekNumber: 1,
		title: "Semana 1 — FUNDAÇÃO",
		dateRange: "20–26 abr",
		objective:
			"Ver o mercado com os olhos do Hawks. Sem clicar, sem entrada. Identificar o viés do dia em menos de 15 min.",
		focus: [
			"Calibração inicial do Renko 5/60min (Hawks Project)",
			"Leitura de contexto 60min: tendência, MACD, médias 27/55",
			"Marcação visual de VWAP e ajuste do dia",
		],
		assignments: [
			"Pré-sessão: definir viés (alta/baixa/lateral) e anotar.",
			"Ao vivo: apenas observar. Sem clicar.",
			"Estudo: replay 1 sessão e mapear estrutura.",
		],
	},
	{
		key: "week-2-reconhecimento",
		weekNumber: 2,
		title: "Semana 2 — RECONHECIMENTO",
		dateRange: "27 abr–3 mai",
		objective:
			"Marcar entradas sem clicar. Paper trade mental. Estabelecer reflexo de identificar Onda 2 + pullback ao EMA zone.",
		focus: [
			"Reconhecer pullback Fib (38.2 / 50 / 61.8 / 76.4)",
			"Confirmação MACD 5min (21/89/42)",
			"Topos e fundos no detector",
		],
		assignments: [
			"Marcar 3 entradas/dia mentalmente, anotar viés + nível Fib.",
			"Estudo: revisar 5 trades reais do Pedro e mapear cenário 1–24.",
		],
	},
	{
		key: "week-3-simulador",
		weekNumber: 3,
		title: "Semana 3 — SIMULADOR",
		dateRange: "4–10 mai",
		objective:
			"Entrar em todas as operações válidas no simulador. Stop fixo. Sem condução, sem trailing.",
		focus: [
			"Execução por limit order, nunca a mercado",
			"Risco fixo por trade = capital ÷ 20 ÷ 3",
			"Máximo 3 trades/dia. Para tudo no 5º dia ruim.",
		],
		assignments: [
			"Logar todo trade no Axion com cenário, viés, pullback level.",
			"Pós-sessão: anotar 1 erro e 1 acerto.",
		],
	},
	{
		key: "week-4-simulador-real",
		weekNumber: 4,
		title: "Semana 4 — SIMULADOR COMO REAL",
		dateRange: "11–17 mai",
		objective:
			"Ritual completo: pré-mercado, condução de stop Method 3, alvos Fib expansão, regra dos 10 dias.",
		focus: [
			"Stop nunca anda contra a posição",
			"BE quando flutuante ≈ risco inicial",
			"Trailing 2 boxes só após 76.4 % de expansão",
			"Alvos: 76.4 / 100 / 161.8",
		],
		assignments: [
			"Cumprir o ritual pré + pós sessão todos os dias.",
			"Revisar disciplina semanal no /hawks/analytics.",
			"Sem mover stop contra. Audit é checado.",
		],
	},
]

interface HawksConcept {
	key: string
	title: string
	summary: string
	bullets: string[]
}

const HAWKS_CONCEPTS: HawksConcept[] = [
	{
		key: "renko",
		title: "Renko triple-screen",
		summary:
			"Renko ignora tempo e plota apenas movimento de preço. Hawks usa 5min (entrada), 15min (confirmação) e 60min (juiz do viés).",
		bullets: [
			"Box-size recalibrado toda segunda-feira a partir do ATR semanal.",
			"60min decide o viés do dia inteiro — alta, baixa, lateral.",
			"5min é o gatilho; 15min é o filtro de confluência.",
		],
	},
	{
		key: "macd",
		title: "MACD calibrado",
		summary:
			"Padrão 12/26/9 nunca é usado. Hawks roda 21/89/42 no 5min e 27/117/55 no 15/60min.",
		bullets: [
			"Histograma muda de cor → indicador Hawks pinta a caixa Renko.",
			"Cruzamento das linhas serve como confirmação no 5min.",
			"Reversão antes do zero é mais forte do que cruzamento depois.",
		],
	},
	{
		key: "emas",
		title: "EMAs 27 / 55 + zona 60min",
		summary:
			"EMAs 27 e 55 acompanham todo timeframe. Duas EMAs vermelhas extras no 5min projetam a zona da 60min.",
		bullets: [
			"Pullback ideal toca o EMA 55 do 5min ≈ 61.8 % Fib.",
			"Quando 27 e 55 cruzam contra o viés → fica de fora.",
			"Distância entre EMA e preço mede o esticamento do movimento.",
		],
	},
	{
		key: "vwap-ajuste",
		title: "VWAP + ajuste do dia",
		summary:
			"VWAP diário, mensal e ajuste do dia anterior são suportes/resistências de referência.",
		bullets: [
			"Acima do ajuste = compradora dominou ontem.",
			"Romper VWAP no horário de almoço costuma travar até a 2ª onda.",
			"Operar contra o ajuste exige confirmação dupla (MACD + Renko 60).",
		],
	},
	{
		key: "fibonacci",
		title: "Fibonacci retracement + expansion",
		summary:
			"Pullback Fib (38.2 / 50 / 61.8 / 76.4) marca onde a Onda 2 termina. Expansion Fib (76.4 / 100 / 161.8) marca alvos.",
		bullets: [
			"Pullback nunca traçado no 5min — sempre 15 ou 60min.",
			"61.8 e 76.4 são as zonas mais quentes para entrada.",
			"Stop atrás do 100 % do retracement (perda da estrutura).",
		],
	},
	{
		key: "stop-method-3",
		title: "Condução de stop — Method 3",
		summary:
			"Stop técnico inicial atrás da última caixa. Move para BE quando flutuante ≈ risco inicial. Trailing 2 caixas só após 76.4 % de expansão.",
		bullets: [
			"Nunca move contra a posição — está auditado em /hawks/analytics.",
			"BE primeiro, trailing depois.",
			"Stop inicial calculado em pontos, não em R$.",
		],
	},
	{
		key: "elliott-24",
		title: "Elliott + 24 cenários",
		summary:
			"Pedro reduz a análise a 24 cenários combinando onda Elliott (1–5, A–C), nível Fib de pullback e direção do viés.",
		bullets: [
			"Onda 2 e Onda 4 são as entradas; Onda 3 é o impulso.",
			"Cenários AAA = mandatório + tier 2 + tier 3 alinhados.",
			"Sem cenário tagueado = trade descalibrado.",
		],
	},
	{
		key: "regras-duras",
		title: "Regras duras",
		summary:
			"Hawks tem rules constitucionais que travam mesmo o melhor setup.",
		bullets: [
			"Daily stop = capital ÷ 20.",
			"Máximo 3 trades por sessão.",
			"5 dias vermelhos seguidos → 50 % de tamanho. 10 dias → zerado pelo mês.",
			"Sem janela no-trade rompida (Copom, FOMC, CPI, PEU).",
		],
	},
]

interface HawksGlossaryEntry {
	term: string
	definition: string
}

const HAWKS_GLOSSARY: HawksGlossaryEntry[] = [
	{ term: "Ajuste", definition: "Preço de fechamento de ajuste do pregão anterior — referência de viés." },
	{ term: "Cabeça do pivô", definition: "Topo ou fundo intermediário entre a Onda 2 e o alvo Fib expansão." },
	{ term: "Cláudia", definition: "Nuvem de EMAs projetada do 60min no 5min, marcando a zona de pullback ideal." },
	{ term: "Confluência", definition: "Soma de razões para a entrada — Fib + EMA + topo/fundo + MACD + ajuste." },
	{ term: "Hawks Project", definition: "Indicador proprietário que pinta o Renko pelo sinal do MACD." },
	{ term: "Operacional", definition: "Trader que executa o método sem mais aprender — quem fez 4 trades virou operacional." },
	{ term: "Onda 2", definition: "Pullback após a impulsiva (Onda 1) — entrada principal do método Hawks." },
	{ term: "Regra dos 10 dias", definition: "Cascata: 5 dias vermelhos → 50 % de tamanho; 10 dias → zerado pelo mês." },
	{ term: "Renko 5/60", definition: "Renko de 5 e 60 minutos — janelas de tempo dos boxes, não do mercado." },
	{ term: "Topos e fundos", definition: "Detector visual de pivô (Profit Pro) — confirma reversões para Hawks." },
]

export {
	HAWKS_CRONOGRAMA,
	HAWKS_CONCEPTS,
	HAWKS_GLOSSARY,
}
export type { CronogramaWeek, HawksConcept, HawksGlossaryEntry }
