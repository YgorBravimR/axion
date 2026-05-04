type BiasValue = "comprador" | "vendedor" | "lateral"

interface DailyBiasRecord {
	id: string
	accountId: string
	date: string
	assetSymbol: string
	bias: BiasValue
	checklist: Record<string, boolean>
	notes: string | null
}

interface UpsertBiasInput {
	date: string
	assetSymbol: string
	bias: BiasValue
	checklist: Record<string, boolean>
	notes?: string | null
}

interface ScenarioRecord {
	id: string
	tradeId: string
	scenarioCode: number | null
	elliottWave: string | null
	pullbackLevel: string | null
	confluencia: string[]
	mmaAligned: string | null
}

interface UpsertScenarioInput {
	tradeId: string
	scenarioCode: number | null
	elliottWave?: string | null
	pullbackLevel?: string | null
	confluencia?: string[]
	mmaAligned?: string | null
}

interface CalibrationRecord {
	id: string
	accountId: string
	weekStart: string
	assetSymbol: string
	timeframeMinutes: number
	rValue: number
	source: string
	notes: string | null
}

interface UpsertCalibrationInput {
	weekStart?: string
	assetSymbol: string
	timeframeMinutes: number
	rValue: number
	source?: string
	notes?: string | null
}

interface LearningProgressRecord {
	sectionKey: string
	completedAt: string | null
	notes: string | null
}

interface MentorInsightRecord {
	id: string
	date: string
	assetSymbol: string | null
	biasCalled: string | null
	setupCalled: string | null
	outcome: string | null
	bodyMarkdown: string
}

interface HawksKpis {
	tradeCount: number
	winCount: number
	lossCount: number
	winRate: number
	profitFactor: number | null
	expectancyR: number
	avgWinR: number
	avgLossR: number
	mfeCapture: number | null
}

interface ScenarioPerformance {
	scenarioCode: number
	tradeCount: number
	winRate: number
	expectancyR: number
	totalR: number
}

interface DisciplineSummary {
	stopChanges: number
	stopViolations: number
	stopDiscipline: number
	overCapDays: number
	totalSessionDays: number
	avgMfeCapture: number | null
}

type CoachKind =
	| "bias_mismatch"
	| "lateral_traded"
	| "over_cap"
	| "stop_against"
	| "low_mfe_capture"
	| "missing_scenario"
	| "missing_pullback"
	| "mma_misaligned"
	| "checklist_skipped"

interface CoachInsight {
	kind: CoachKind
	tradeId: string | null
	tradeDate: string
	asset: string | null
	context: Record<string, string | number | null>
}

interface HawksAnalyticsBundle {
	range: { from: string; to: string }
	kpis: HawksKpis
	scenarioPerformance: ScenarioPerformance[]
	discipline: DisciplineSummary
	insights: CoachInsight[]
}

interface MentorInsightInput {
	id?: string
	date: string
	assetSymbol?: string | null
	biasCalled?: string | null
	setupCalled?: string | null
	outcome?: string | null
	bodyMarkdown: string
	sourcePath?: string | null
}

interface MentorInsightRow {
	id: string
	date: string
	assetSymbol: string | null
	biasCalled: string | null
	setupCalled: string | null
	outcome: string | null
	bodyMarkdown: string
	sourcePath: string | null
}

interface HawksCohortStats {
	hawksAccounts: number
	tradesLast90: number
	avgWinRate: number
	avgProfitFactor: number | null
	avgExpectancyR: number
}

export type {
	BiasValue,
	DailyBiasRecord,
	UpsertBiasInput,
	ScenarioRecord,
	UpsertScenarioInput,
	CalibrationRecord,
	UpsertCalibrationInput,
	LearningProgressRecord,
	MentorInsightRecord,
	HawksKpis,
	ScenarioPerformance,
	DisciplineSummary,
	CoachKind,
	CoachInsight,
	HawksAnalyticsBundle,
	MentorInsightInput,
	MentorInsightRow,
	HawksCohortStats,
}
