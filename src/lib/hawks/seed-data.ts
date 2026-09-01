import type { NewHawksScenario } from "@/db/schema"

interface ScreenConfirmation {
	renko60: boolean
	macd: boolean
	emaStack: boolean
	vwap: boolean
	ajuste: boolean
}

interface ScenarioSeed {
	code: string
	nameEn: string
	namePt: string
	descriptionPt: string
	direction: "long" | "short" | "either"
	screenConfirmation: ScreenConfirmation
	scenarioType: "setup" | "mistake"
}

const FULL_CONFIRMATION: ScreenConfirmation = {
	renko60: true,
	macd: true,
	emaStack: true,
	vwap: true,
	ajuste: true,
}

const VWAP_ONLY: ScreenConfirmation = {
	renko60: false,
	macd: false,
	emaStack: false,
	vwap: true,
	ajuste: false,
}

const AJUSTE_ONLY: ScreenConfirmation = {
	renko60: false,
	macd: false,
	emaStack: false,
	vwap: false,
	ajuste: true,
}

type ScenarioSeedBase = Omit<ScenarioSeed, "descriptionPt" | "scenarioType">

const HAWKS_SCENARIOS: readonly ScenarioSeed[] = (
	[
		{
			code: "HWK_S01",
			namePt: "Romp. topo D-1",
			nameEn: "D-1 high breakout",
			direction: "long",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S02",
			namePt: "Rej. topo D-1",
			nameEn: "D-1 high rejection",
			direction: "short",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S03",
			namePt: "Romp. fundo D-1",
			nameEn: "D-1 low breakout",
			direction: "short",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S04",
			namePt: "Rej. fundo D-1",
			nameEn: "D-1 low rejection",
			direction: "long",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S05",
			namePt: "Romp. ajuste",
			nameEn: "Ajuste breakout",
			direction: "either",
			screenConfirmation: AJUSTE_ONLY,
		},
		{
			code: "HWK_S06",
			namePt: "Rej. ajuste",
			nameEn: "Ajuste rejection",
			direction: "either",
			screenConfirmation: AJUSTE_ONLY,
		},
		{
			// C3 FIX (2026-09-01): was "Pullback EMA9". EMA9 is not a Hawks
			// period at all — it is the scalper mean, and overlay §18.6 excludes
			// scalping outright. The 5min carries its OWN pair, 17/34, and the
			// 5min is the execution chart. Codes RM1 / VBRM1.
			code: "HWK_S07",
			namePt: "Pullback média 17 (5min)",
			nameEn: "5min first mean (17) pullback",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: true,
				vwap: false,
				ajuste: false,
			},
		},
		{
			// C3 FIX: was "Pullback EMA21" with no timeframe. 21 is the 1min's
			// first mean (1min pair is 21/42), so the number existed but the
			// label was ambiguous and read as a generic EMA. This is now the
			// 5min's second own mean. Codes RM2 / VBRM2.
			code: "HWK_S08",
			namePt: "Pullback média 34 (5min)",
			nameEn: "5min second mean (34) pullback",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: true,
				vwap: false,
				ajuste: false,
			},
		},
		{
			// C3 FIX: was "Pullback EMA50". 50 is not a Hawks period on any
			// chart. The 15min and above carry 27/55, which also appear
			// projected onto the 5min as the red lines. Entering here pays
			// risk 4/5 (15min level) or 8/10 (60min level), because the stop
			// stays on the 5min (§18.1).
			code: "HWK_S09",
			namePt: "Pullback médias 27/55 (15/60min)",
			nameEn: "Higher-timeframe means (27/55) pullback",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: false,
				emaStack: true,
				vwap: false,
				ajuste: false,
			},
		},
		{
			code: "HWK_S10",
			namePt: "VWAP — toque",
			nameEn: "VWAP touch",
			direction: "either",
			screenConfirmation: VWAP_ONLY,
		},
		{
			code: "HWK_S11",
			namePt: "VWAP — rompimento",
			nameEn: "VWAP breakout",
			direction: "either",
			screenConfirmation: VWAP_ONLY,
		},
		{
			code: "HWK_S12",
			namePt: "Onda 2 alta",
			nameEn: "Wave 2 long",
			direction: "long",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S13",
			namePt: "Onda 2 baixa",
			nameEn: "Wave 2 short",
			direction: "short",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S14",
			namePt: "Fib 61.8 retração",
			nameEn: "Fib 61.8 retracement",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: false,
				vwap: false,
				ajuste: false,
			},
		},
		{
			// C4 FIX (2026-09-01): was "Fib 76.4 retração", which conflated the
			// two opposite ends of the trade. 76,4% is the EXPANSION target,
			// the zona de satisfação where the 2-box trail arms. Retracement
			// levels are 38,2 / 50 / 61,8, and overlay §18.10 leaves only
			// 61,8% in play. Codes RF61 / VBRF61.
			code: "HWK_S15",
			namePt: "Retração Fib 61,8%",
			nameEn: "Fib 61.8% retracement",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: false,
				vwap: false,
				ajuste: false,
			},
		},
		{
			code: "HWK_S16",
			namePt: "Continuação tendência",
			nameEn: "Trend continuation",
			direction: "either",
			screenConfirmation: FULL_CONFIRMATION,
		},
		{
			code: "HWK_S17",
			namePt: "Reversão exaustão",
			nameEn: "Exhaustion reversal",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: false,
				vwap: true,
				ajuste: false,
			},
		},
		{
			code: "HWK_S18",
			namePt: "Squeeze breakout",
			nameEn: "Squeeze breakout",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: false,
				vwap: false,
				ajuste: false,
			},
		},
		{
			code: "HWK_S19",
			namePt: "Inside bar setup",
			nameEn: "Inside bar setup",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: false,
				emaStack: false,
				vwap: false,
				ajuste: false,
			},
		},
		{
			code: "HWK_S20",
			namePt: "Outside bar reversão",
			nameEn: "Outside bar reversal",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: false,
				emaStack: false,
				vwap: true,
				ajuste: false,
			},
		},
		{
			code: "HWK_S21",
			namePt: "Volume climático",
			nameEn: "Climactic volume",
			direction: "either",
			screenConfirmation: {
				renko60: false,
				macd: false,
				emaStack: false,
				vwap: true,
				ajuste: false,
			},
		},
		{
			code: "HWK_S22",
			namePt: "Divergência MACD",
			nameEn: "MACD divergence",
			direction: "either",
			screenConfirmation: {
				renko60: true,
				macd: true,
				emaStack: false,
				vwap: false,
				ajuste: false,
			},
		},
		{
			code: "HWK_S23",
			namePt: "Macro release reação",
			nameEn: "Macro release reaction",
			direction: "either",
			screenConfirmation: {
				renko60: false,
				macd: false,
				emaStack: false,
				vwap: false,
				ajuste: true,
			},
		},
		{
			code: "HWK_S24",
			namePt: "Abertura — gap fade",
			nameEn: "Opening gap fade",
			direction: "either",
			screenConfirmation: {
				renko60: false,
				macd: false,
				emaStack: false,
				vwap: true,
				ajuste: true,
			},
		},
	] satisfies readonly ScenarioSeedBase[]
).map((s) => ({
	...s,
	descriptionPt: `Cenário Hawks #${s.code.slice(-2)}: ${s.namePt}.`,
	scenarioType: "setup" as const,
}))

const buildScenarioSeedRows = (): NewHawksScenario[] =>
	HAWKS_SCENARIOS.map((s) => ({
		code: s.code,
		nameEn: s.nameEn,
		namePt: s.namePt,
		descriptionPt: s.descriptionPt,
		direction: s.direction,
		screenConfirmation: s.screenConfirmation,
		scenarioType: s.scenarioType,
	}))

export { HAWKS_SCENARIOS, buildScenarioSeedRows }
export type { ScenarioSeed, ScreenConfirmation }
