import type {
	DisciplineSummary,
	HawksKpis,
	ScenarioPerformance,
} from "@/lib/hawks/analytics"
import type { CoachInsight } from "@/lib/hawks/coach-detectors"

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
	HawksAnalyticsBundle,
	MentorInsightInput,
	MentorInsightRow,
	HawksCohortStats,
}
