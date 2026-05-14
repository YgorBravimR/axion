interface CandleValidationResult {
	assetId: string
	assetName: string
	timeframeId: string
	timeframeName: string
	rowCount: number
	dateFrom: string | null
	dateTo: string | null
	registeredIndicatorCount: number
	skippedIndicatorCount: number
}

interface CandleImportResult {
	totalRows: number
	newIndicators: string[]
	skippedIndicators: string[]
}

export type { CandleValidationResult, CandleImportResult }
