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
