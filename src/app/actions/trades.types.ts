import type {
	Trade,
	TradeExecution,
	strategies,
	timeframes,
	tags,
} from "@/db/schema"

export interface TradeWithRelations extends Trade {
	strategy?: typeof strategies.$inferSelect | null
	timeframe?: typeof timeframes.$inferSelect | null
	tradeTags?: Array<{
		tag: typeof tags.$inferSelect
	}>
	executions?: TradeExecution[]
}

interface BulkCreateResult {
	successCount: number
	failedCount: number
	errors: Array<{
		index: number
		message: string
	}>
}

interface CreateScaledTradeInput {
	asset: string
	direction: "long" | "short"
	timeframeId?: string
	strategyId?: string
	stopLoss?: number
	takeProfit?: number
	riskAmount?: number
	preTradeThoughts?: string
	postTradeReflection?: string
	lessonLearned?: string
	followedPlan?: boolean
	disciplineNotes?: string
	setupRank?: "A" | "AA" | "AAA" | null
	rating?: "A" | "B" | "C" | "D" | "F" | null
	screenshotUrl?: string
	screenshotS3Key?: string
	tagIds?: string[]
	executions: Array<{
		executionType: "entry" | "exit"
		executionDate: Date
		price: number
		quantity: number
		commission?: number
		fees?: number
		notes?: string
	}>
	conditionsMet?: Array<{ conditionId: string; met: boolean }>
}

interface ExtendedTradeFilters {
	// SQL-filterable
	rating?: Array<"A" | "B" | "C" | "D" | "F">
	followedPlan?: boolean
	outcomes?: Array<"win" | "loss" | "breakeven">
	directions?: Array<"long" | "short">
	assets?: string[]
	// Post-query (require decrypted data or timezone)
	hourFrom?: number
	hourTo?: number
	pnlMin?: number
	pnlMax?: number
}

export type { BulkCreateResult, CreateScaledTradeInput, ExtendedTradeFilters }
