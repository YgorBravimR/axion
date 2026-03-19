/**
 * Scene definitions with real timestamps from the recorded video.
 * Source video: video/public/profitjournal-demo.webm (313s / 5:13)
 *
 * All sourceStartSec/sourceEndSec refer to the ORIGINAL video.
 * Remotion skips gaps between scenes (cuts) and adds title cards.
 */

import type { SceneDefinition } from "./types"

const scenes: SceneDefinition[] = [
	// ── LOGIN (00:00 → 00:14) ──────────────────────────────────────────
	{
		id: "login",
		label: "Login e Seleção de Conta",
		sourceStartSec: 0,
		sourceEndSec: 14,
		titleCard: false,
		narration: [
			{
				offsetSec: 2,
				durationSec: 5,
				text: "ProfitJournal suporta múltiplas contas de trading — pessoal, prop firm e replay.",
			},
			{
				offsetSec: 8,
				durationSec: 5,
				text: "Selecione a conta que deseja utilizar e comece a operar.",
			},
		],
		zoom: [],
	},

	// ── CSV IMPORT part 1: upload + drop zone (00:14 → 00:25) ──────────
	{
		id: "csv-import-upload",
		label: "Importação de Trades",
		sourceStartSec: 14,
		sourceEndSec: 25,
		titleCard: true,
		narration: [
			{
				offsetSec: 2,
				durationSec: 7,
				text: "Importe seus trades via CSV. O ProfitJournal valida cada operação contra seus ativos configurados.",
			},
		],
		zoom: [],
	},

	// ── CSV IMPORT part 2: validation visible, scrolling trades (00:37 → 00:42)
	// CUT: 00:25 → 00:37 (waiting for file drop + overlay)
	// CUT: 00:42 → 00:48 (import processing overlay)
	{
		id: "csv-import-validated",
		label: "",
		sourceStartSec: 37,
		sourceEndSec: 42,
		titleCard: false,
		narration: [
			{
				offsetSec: 0,
				durationSec: 4,
				text: "331 trades validados instantaneamente — com preços, stop loss, take profit e P&L já calculados.",
			},
		],
		zoom: [],
	},

	// ── JOURNAL (00:48 → 01:06) ────────────────────────────────────────
	{
		id: "journal",
		label: "Diário de Trades",
		sourceStartSec: 48,
		sourceEndSec: 66,
		titleCard: true,
		narration: [
			{
				offsetSec: 2,
				durationSec: 7,
				text: "Seu diário organiza trades por dia. Cada dia mostra P&L líquido, vitórias/derrotas e taxa de acerto.",
			},
			{
				offsetSec: 11,
				durationSec: 5,
				text: "Clique em qualquer trade para ver o breakdown completo: preços, tamanho da posição e risco.",
			},
		],
		zoom: [],
	},

	// ── TRADE DETAIL (01:06 → 01:18) ───────────────────────────────────
	{
		id: "trade-detail",
		label: "",
		sourceStartSec: 66,
		sourceEndSec: 78,
		titleCard: false,
		narration: [
			{
				offsetSec: 0,
				durationSec: 6,
				text: "R-múltiplo, MFE, MAE e a barra de risco/retorno revelam a qualidade da sua execução.",
			},
		],
		zoom: [
			{ offsetSec: 4, durationSec: 4, scale: 1.3, originX: 0.5, originY: 0.55 },
		],
	},

	// ── DASHBOARD (01:21 → 01:31) ──────────────────────────────────────
	{
		id: "dashboard",
		label: "Dashboard",
		sourceStartSec: 81,
		sourceEndSec: 91,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 6,
				text: "O dashboard mostra tudo de relance: P&L, taxa de acerto, fator de lucro, R médio e disciplina.",
			},
			{
				offsetSec: 7,
				durationSec: 3,
				text: "O calendário mostra sua performance dia a dia.",
			},
		],
		zoom: [
			{ offsetSec: 0, durationSec: 4, scale: 1.3, originX: 0.5, originY: 0.15 },
		],
	},

	// ── PAGE GUIDE (01:31 → 01:53) ─────────────────────────────────────
	{
		id: "page-guide",
		label: "Guia Interativo",
		sourceStartSec: 91,
		sourceEndSec: 113,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 7,
				text: "Cada página tem um guia interativo. Clique na lâmpada para percorrer cada seção com explicações detalhadas.",
			},
			{
				offsetSec: 12,
				durationSec: 7,
				text: "Exemplos concretos em R$ ajudam a entender cada métrica e como ela afeta sua análise.",
			},
		],
		zoom: [],
	},

	// ── COMMAND CENTER (02:00 → 02:30) ─────────────────────────────────
	{
		id: "command-center",
		label: "Central de Comando",
		sourceStartSec: 120,
		sourceEndSec: 150,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 6,
				text: "A Central de Comando é seu cockpit diário. O circuit breaker monitora seu resultado em tempo real.",
			},
			{
				offsetSec: 10,
				durationSec: 5,
				text: "A calculadora mostra quantos contratos operar baseado na distância do stop.",
			},
			{
				offsetSec: 16,
				durationSec: 7,
				text: "Navegue para dias anteriores e revise o status ao vivo — cada trade com risco, P&L e modo de recuperação.",
			},
		],
		zoom: [
			{ offsetSec: 10, durationSec: 4, scale: 1.3, originX: 0.5, originY: 0.55 },
		],
	},

	// ── ANALYTICS (02:33 → 02:43) ──────────────────────────────────────
	{
		id: "analytics",
		label: "Análises Avançadas",
		sourceStartSec: 153,
		sourceEndSec: 163,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 5,
				text: "Analytics profundo. O valor esperado revela seu edge por trade.",
			},
			{
				offsetSec: 5,
				durationSec: 5,
				text: "O mapa de calor mostra seus horários mais e menos lucrativos.",
			},
		],
		zoom: [
			{ offsetSec: 5, durationSec: 4, scale: 1.2, originX: 0.5, originY: 0.4 },
		],
		// Freeze at edge expectancy zoom for 2s, and at heatmap for 2s
		freeze: [
			{ offsetSec: 6, holdSec: 2 },
			{ offsetSec: 9, holdSec: 2 },
		],
	},

	// ── MONTE CARLO (02:46 → 03:20) ────────────────────────────────────
	{
		id: "monte-carlo",
		label: "Simulação Monte Carlo",
		sourceStartSec: 166,
		sourceEndSec: 200,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 7,
				text: "A simulação Monte Carlo testa se seu edge se sustenta estatisticamente.",
			},
			{
				offsetSec: 11,
				durationSec: 5,
				text: "Use suas estatísticas reais para alimentar a simulação automaticamente.",
			},
			{
				offsetSec: 19,
				durationSec: 4,
				text: "Milhares de sequências revelam a distribuição de resultados possíveis.",
			},
			{
				offsetSec: 27,
				durationSec: 5,
				text: "Seus números comparados com teorias comprovadas do mercado.",
			},
		],
		zoom: [
			// Kelly zoom: starts at scene offset ~25s, holds 3s at max, then releases
			{ offsetSec: 25, durationSec: 7, scale: 1.3, originX: 0.5, originY: 0.6, holdSec: 3 },
		],
	},

	// ── RISK SIMULATION (03:24 → 03:58) ────────────────────────────────
	{
		id: "risk-simulation",
		label: "Simulador de Risco",
		sourceStartSec: 204,
		sourceEndSec: 238,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 7,
				text: "O Simulador de Risco replica seus trades com regras personalizadas de gerenciamento.",
			},
			{
				offsetSec: 22,
				durationSec: 5,
				text: "Compare a curva de capital original contra a simulada.",
			},
			{
				offsetSec: 30,
				durationSec: 6,
				text: "O rastreio de decisões mostra cada trade — executado, ignorado ou ajustado — e por quê.",
			},
		],
		zoom: [
			// Zoom on equity curve at ~22s into scene (source ~226s = 03:46 original)
			{ offsetSec: 22, durationSec: 5, scale: 1.2, originX: 0.5, originY: 0.4 },
		],
		// Freeze on the decision trace view for 2s
		freeze: [
			{ offsetSec: 30, holdSec: 2 },
		],
	},

	// ── REPORTS (04:01 → 04:18) ────────────────────────────────────────
	{
		id: "reports",
		label: "Relatórios",
		sourceStartSec: 241,
		sourceEndSec: 258,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 7,
				text: "Relatórios semanais e mensais com detalhamento por dia e por ativo.",
			},
			{
				offsetSec: 8,
				durationSec: 7,
				text: "A análise de custo dos erros mostra exatamente quanto FOMO, overtrading ou operar pelo celular estão custando.",
			},
		],
		zoom: [
			{ offsetSec: 12, durationSec: 4, scale: 1.3, originX: 0.5, originY: 0.5 },
		],
	},

	// ── MONTHLY (04:21 → 04:32) ────────────────────────────────────────
	{
		id: "monthly",
		label: "Plano Mensal",
		sourceStartSec: 261,
		sourceEndSec: 272,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 6,
				text: "Acompanhe sua performance mensal. Para contas prop firm, veja sua participação após o split e impostos.",
			},
			{
				offsetSec: 8,
				durationSec: 3,
				text: "Detalhamento semanal do mês.",
			},
		],
		zoom: [],
	},

	// ── PLAYBOOK (04:35 → 04:48) ───────────────────────────────────────
	{
		id: "playbook",
		label: "Playbook de Estratégias",
		sourceStartSec: 275,
		sourceEndSec: 288,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 7,
				text: "O Playbook rastreia conformidade em todas as suas estratégias — trades, P&L, taxa de acerto e R médio.",
			},
			{
				offsetSec: 8,
				durationSec: 4,
				text: "O score de conformidade mostra com que frequência você segue suas próprias regras.",
			},
		],
		zoom: [
			{ offsetSec: 0, durationSec: 4, scale: 1.2, originX: 0.5, originY: 0.15 },
		],
	},

	// ── SETTINGS (04:52 → 05:05) ───────────────────────────────────────
	{
		id: "settings",
		label: "Configurações",
		sourceStartSec: 292,
		sourceEndSec: 305,
		titleCard: true,
		narration: [
			{
				offsetSec: 0,
				durationSec: 7,
				text: "Configure taxas por conta, sobrescritas por ativo, tags e condições que alimentam o score de disciplina.",
			},
		],
		zoom: [],
	},

	// ── END (05:08 → 05:13) ────────────────────────────────────────────
	{
		id: "end",
		label: "",
		sourceStartSec: 308,
		sourceEndSec: 313,
		titleCard: false,
		narration: [
			{
				offsetSec: 0,
				durationSec: 5,
				text: "ProfitJournal — Transforme sua disciplina em retorno financeiro.",
			},
		],
		zoom: [],
	},
]

export { scenes }
