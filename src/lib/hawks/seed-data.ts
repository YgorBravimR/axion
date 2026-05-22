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
			code: "HWK_S07",
			namePt: "Pullback EMA9",
			nameEn: "EMA9 pullback",
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
			code: "HWK_S08",
			namePt: "Pullback EMA21",
			nameEn: "EMA21 pullback",
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
			code: "HWK_S09",
			namePt: "Pullback EMA50",
			nameEn: "EMA50 pullback",
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
			code: "HWK_S15",
			namePt: "Fib 76.4 retração",
			nameEn: "Fib 76.4 retracement",
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
