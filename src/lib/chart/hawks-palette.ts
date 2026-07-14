/**
 * Hawks chart palette — single source of truth.
 *
 * Mapped from /Users/ygorbravim/personal/projects/nelogica/PALETA_CORES.md.
 * If a hawks-chart-related file imports a raw `rgb(...)` literal for an
 * indicator/marker color, this module needs the token instead. Adding new
 * indicator colors? Add a new PALETA group first; do not invent hues.
 *
 * Convention from the master palette:
 *   - Tom 1 = darkest, Tom 3 = base (canonical), Tom 5 = lightest.
 *   - Each directional group is a UP/DOWN pair plus a central cool-band line.
 *   - Trade layer + candle layer are SPECIAL — they do not follow the pair+central
 *     pattern; they sit in saturated blues and a steel-blue/gray pair respectively.
 */

// ─── Candle layer (special) ──────────────────────────────────────────────
const CANDLE = {
	up: "rgb(110,151,183)", // azul aço
	down: "rgb(219,224,227)", // cinza claro
} as const

// ─── Trade outcome layer (exit-marker semantics) ─────────────────────────
// Entry markers/lines are colored by DIRECTION (TRADE.buy / TRADE.sell).
// Exit markers/lines are colored by OUTCOME — what the trade did:
//   win        → light green (clearly positive)
//   loss       → light red (clearly negative)
//   breakeven  → yellow (neutral / no-conviction outcome)
// Greens/reds chosen to match the "upLight"/"downLight" variants of
// GREEN_CORAL — declared inline here because GREEN_CORAL is defined below
// (declaration-order constraint).
const OUTCOME = {
	win: "rgb(186,222,204)", // verde claro = GREEN_CORAL.upLight
	loss: "rgb(227,187,181)", // vermelho claro = GREEN_CORAL.downLight
	breakeven: "rgb(245,222,90)", // amarelo
} as const

// ─── Trade execution layer (special) ─────────────────────────────────────
// Saturated primaries — propositalmente mais vivos que os grupos direcionais.
// `base` = Tom 3 (use for the marker arrow itself); `action` (Tom 4) reads as
// a lighter, action-mode badge.
const TRADE = {
	buy: "rgb(0,0,191)", // azul puro Tom 3
	buyDeep: "rgb(0,0,112)", // Tom 1
	buyAction: "rgb(95,95,221)", // Tom 4
	buyFaint: "rgb(168,168,230)", // Tom 5
	sell: "rgb(191,0,0)", // vermelho puro Tom 3
	sellDeep: "rgb(112,0,0)",
	sellAction: "rgb(221,95,95)",
	sellFaint: "rgb(230,168,168)",
} as const

// ─── Verde × Coral (UP × DOWN) ───────────────────────────────────────────
const GREEN_CORAL = {
	up: "rgb(83,172,128)",
	upDark: "rgb(50,103,77)",
	upLight: "rgb(186,222,204)",
	down: "rgb(185,85,70)",
	downDark: "rgb(111,51,42)",
	downLight: "rgb(227,187,181)",
	center: "rgb(0,200,220)", // ciano
} as const

// ─── Laranja × Roxo ──────────────────────────────────────────────────────
const ORANGE_PURPLE = {
	up: "rgb(240,140,40)",
	upDark: "rgb(170,85,10)",
	upLight: "rgb(255,190,110)",
	down: "rgb(120,30,176)",
	downDark: "rgb(65,20,100)",
	downLight: "rgb(180,140,230)",
	center: "rgb(0,150,150)", // teal/petróleo
} as const

// ─── Dourado × Magenta ───────────────────────────────────────────────────
const GOLD_MAGENTA = {
	up: "rgb(218,170,35)",
	upDark: "rgb(140,100,10)",
	upLight: "rgb(245,225,160)",
	down: "rgb(200,60,140)",
	downDark: "rgb(120,20,80)",
	downLight: "rgb(238,180,212)",
	center: "rgb(70,170,235)", // azul-céu
} as const

// ─── Lima × Framboesa ────────────────────────────────────────────────────
const LIME_RASPBERRY = {
	up: "rgb(130,180,40)",
	upDark: "rgb(70,100,15)",
	upLight: "rgb(210,230,160)",
	down: "rgb(190,45,90)",
	downDark: "rgb(110,20,50)",
	downLight: "rgb(235,180,200)",
	center: "rgb(30,200,160)", // turquesa
} as const

// ─── Indicador → cor canônica (do PALETA "Indicadores e cores em uso") ──
const VWAP = {
	d: "rgb(90,239,144)", // verde claro
	w: "rgb(0,170,85)", // verde médio
	m: "rgb(1,105,53)", // verde escuro
} as const

const VWAP_ANCHORED = {
	v1: LIME_RASPBERRY.down, // framboesa
	v2: ORANGE_PURPLE.up, // laranja
	v3: ORANGE_PURPLE.center, // teal
	v4: LIME_RASPBERRY.up, // lima
} as const

const EMA = {
	// 60m EMA painted in laranja (ORANGE_PURPLE.up) — overrides the
	// palette doc's "oliva/mostarda" which collided with the Ajuste D-1
	// step line (also yellow-ish) on the 5m pane. User-corrected
	// 2026-06-30 from live Profitchart reference.
	tf60m: "rgb(240,140,40)", // laranja — Médias do 60m
	tf15m: "rgb(255,255,168)", // amarelo claro — Médias do 15m
	cloudUp: "rgb(25,90,210)", // Nuvem (rápida/lenta) — alta
	cloudDown: "rgb(210,30,30)", // Nuvem — baixa
} as const

const TRAVA = {
	axisCenter: GREEN_CORAL.center, // ciano — linha do ajuste
	ajusteLine: "rgb(130,225,245)",
	positiveLevels: ORANGE_PURPLE.up, // ±% positivos laranja
	negativeLevels: ORANGE_PURPLE.down, // negativos roxo
} as const

const VOLUME = {
	up: GREEN_CORAL.up,
	upDark: GREEN_CORAL.upDark,
	upLight: GREEN_CORAL.upLight,
	down: GREEN_CORAL.down,
	downDark: GREEN_CORAL.downDark,
	downLight: GREEN_CORAL.downLight,
} as const

const AGGRESSION = {
	up: LIME_RASPBERRY.up,
	upDark: LIME_RASPBERRY.upDark,
	upLight: LIME_RASPBERRY.upLight,
	down: LIME_RASPBERRY.down,
	downDark: LIME_RASPBERRY.downDark,
	downLight: LIME_RASPBERRY.downLight,
} as const

const KELTNER = {
	// Keltner de exaustão lives in the Dourado family per PALETA.
	kc1: GOLD_MAGENTA.up,
	kc2Faint: "rgba(218,170,35,0.45)",
	exhaustion: GOLD_MAGENTA.upDark,
} as const

const MACD = {
	// Histogram follows the buy/sell (blue/red) trade semantics, not the
	// green/coral directional family: a positive (bullish) bar reads as
	// buy-blue, a negative (bearish) bar as sell-red — matching the
	// Profitchart reference the user trades from.
	histPos: TRADE.buy, // azul puro — bullish momentum
	histNeg: TRADE.sell, // vermelho puro — bearish momentum
	signal: GREEN_CORAL.center,
} as const

// ─── Session boundary markers (day / week vertical lines) ────────────────
// Background context lines, drawn under indicators + trades. Day = a faint,
// low-emphasis gray dotted line; week = a stronger cool accent so it clearly
// out-reads the day lines (thin-dotted-gray vs bold-solid-cyan).
const BOUNDARY = {
	day: "rgba(150,160,170,0.35)", // faint gray — trading-day open
	week: GREEN_CORAL.center, // ciano — week open (bold)
} as const

const SWING = {
	// Dow theory pivot tape — continuation = trending, break = roll-over.
	continuation: GREEN_CORAL.up,
	break: GREEN_CORAL.down,
	neutral: GREEN_CORAL.center,
	tape: GOLD_MAGENTA.center, // azul-céu — the connecting tape line
} as const

// ─── Drawing colors (user-applied) ───────────────────────────────────────
// Each user-drawing tool gets a default color picked so the same hue is rare
// elsewhere on the chart. The user can override per-drawing in the toolbar.
const DRAWING = {
	hline: GOLD_MAGENTA.up, // dourado base
	trendline: GOLD_MAGENTA.center, // azul-céu
	vline: ORANGE_PURPLE.upLight, // laranja claro — vertical event markers
	fibo: ORANGE_PURPLE.down, // roxo
	positionLong: GREEN_CORAL.up, // long position default
	positionShort: GREEN_CORAL.down, // short position default
	positionStop: GREEN_CORAL.down, // stop leg = red/coral
	positionTarget: GREEN_CORAL.up, // target leg = green
	positionStopFill: "rgba(185,85,70,0.18)", // coral with low alpha
	positionTargetFill: "rgba(83,172,128,0.18)", // green with low alpha
} as const

const HAWKS_PALETTE = {
	candle: CANDLE,
	trade: TRADE,
	outcome: OUTCOME,
	vwap: VWAP,
	vwapAnchored: VWAP_ANCHORED,
	ema: EMA,
	trava: TRAVA,
	volume: VOLUME,
	aggression: AGGRESSION,
	keltner: KELTNER,
	macd: MACD,
	boundary: BOUNDARY,
	swing: SWING,
	drawing: DRAWING,
	groups: {
		greenCoral: GREEN_CORAL,
		orangePurple: ORANGE_PURPLE,
		goldMagenta: GOLD_MAGENTA,
		limeRaspberry: LIME_RASPBERRY,
	},
} as const

type HawksPalette = typeof HAWKS_PALETTE

export { HAWKS_PALETTE, type HawksPalette }
