import type { Trade, TradeExecution } from "@/db/schema"

interface ProcessedOcrTrade {
	trade: Trade
	executions: TradeExecution[]
	assetFound: boolean
}

interface OcrImportResult {
	trade: Trade
	executions: TradeExecution[]
	assetFound: boolean
}

interface BulkOcrImportResult {
	successCount: number
	failedCount: number
	trades: Array<{
		trade: Trade
		executions: TradeExecution[]
		assetFound: boolean
	}>
	errors: Array<{
		index: number
		asset: string
		message: string
	}>
}

export type { ProcessedOcrTrade, OcrImportResult, BulkOcrImportResult }
