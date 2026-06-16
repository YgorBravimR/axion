import type { Trade } from "@/db/schema"
import type { ProfitChartOperation } from "@/lib/csv-parser"
import type { CandleRow } from "@/types/candle"
import type {
	HawksIndicatorSnapshot,
	HawksTripleScreenConfig,
} from "@/types/backtest"

type EnrichmentSource =
	| "ops-csv"
	| "candle-math"
	| "indicator-readout"
	| "deterministic-sl"

type EnrichmentConfidence = "high" | "medium" | "low"

interface EnrichmentField<T = unknown> {
	value: T
	source: EnrichmentSource
	confidence: EnrichmentConfidence
	conflictsWithCurrent: boolean
	derivation?: string
}

type EnrichmentDelta = {
	tradeId: string
	source: EnrichmentSource
	fields: Record<string, EnrichmentField>
	passStatus: "succeeded" | "skipped" | "failed"
	skipReason?: string
	errorMessage?: string
}

interface EnrichmentContext {
	candles: CandleRow[] | null
	profitOperation: ProfitChartOperation | null
	hawksConfig: HawksTripleScreenConfig | null
	brickSize5mPoints: number | null
	pointValue: number
}

type EnrichmentPass = (trade: Trade, ctx: EnrichmentContext) => EnrichmentDelta

interface DryRunPasses {
	operations: EnrichmentDelta
	candleMath: EnrichmentDelta
	indicatorReadout: EnrichmentDelta
	deterministicSlTarget: EnrichmentDelta
}

interface MergedEnrichmentField extends EnrichmentField {
	winningPass: EnrichmentSource
}

interface DryRunResult {
	trade: Trade
	passes: DryRunPasses
	mergedFields: Record<string, MergedEnrichmentField>
	indicatorReadout: HawksIndicatorSnapshot | null
	computedStatus: "ready-to-commit" | "partial" | "no-changes"
}

export type {
	EnrichmentSource,
	EnrichmentConfidence,
	EnrichmentField,
	EnrichmentDelta,
	EnrichmentContext,
	EnrichmentPass,
	DryRunPasses,
	MergedEnrichmentField,
	DryRunResult,
}
