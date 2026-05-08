import type { Strategy, Tag, Timeframe } from "@/db/schema"
import type { CsvTradeInput } from "@/lib/csv-parser"

export interface ProcessedCsvTrade {
	id: string
	rowNumber: number
	status: "valid" | "warning" | "skipped"

	// Validation
	errors: Array<{ field: string; message: string }>
	warnings: Array<{ message: string }>
	skipReason?: string

	// Original data from CSV parser
	originalData: CsvTradeInput

	// Asset lookup result
	assetFound: boolean
	assetConfig?: {
		id: string
		symbol: string
		tickSize: number
		tickValue: number // cents
		commission: number // cents
		fees: number // cents
	}

	// Calculated P&L (in currency, not cents)
	grossPnl: number | null
	netPnl: number | null
	totalCosts: number | null
	ticksGained: number | null

	// User edits (applied on top of originalData)
	edits: {
		strategyId?: string
		timeframeId?: string
		tagIds?: string[]
		preTradeThoughts?: string
		postTradeReflection?: string
		lessonLearned?: string
		followedPlan?: boolean
		disciplineNotes?: string
		stopLoss?: number
		takeProfit?: number
	}
}

export interface CsvValidationResult {
	trades: ProcessedCsvTrade[]
	summary: {
		total: number
		valid: number
		warnings: number
		skipped: number
		duplicates: number
		grossPnl: number
		netPnl: number
		totalCosts: number
	}
	// Lookup data for the UI
	strategies: Strategy[]
	timeframes: Timeframe[]
	tags: Tag[]
	// Account type for replay trade detection
	accountType: "personal" | "prop" | "replay"
}

export interface CsvImportResult {
	success: number
	failed: number
	errors: Array<{ index: number; message: string }>
}
