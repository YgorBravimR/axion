import type {
	RawCandleRow,
	DetectedIndicator,
} from "@/lib/csv-parsers/candle-parser"

interface CandleValidationResult {
	assetId: string
	assetName: string
	timeframeId: string
	timeframeName: string
	rowCount: number
	dateRange: { from: Date; to: Date } | null
	detectedIndicators: DetectedIndicator[]
	registeredIndicators: DetectedIndicator[]
	skippedIndicators: DetectedIndicator[]
	errors: Array<{ row: number; field: string; message: string }>
	warnings: Array<{ row: number; message: string }>
	candles: RawCandleRow[]
}

interface CandleImportResult {
	totalRows: number
	newIndicators: string[]
	skippedIndicators: string[]
}

export type { CandleValidationResult, CandleImportResult }
