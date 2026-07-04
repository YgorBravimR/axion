/**
 * Phase 2: Detailed Trade Import - Execution and Trade Types
 * This module defines the core types for broker-statement based trade imports.
 * Each broker execution (partial fill) is tracked individually,
 * then auto-grouped into trades with weighted average calculations.
 */

/**
 * Raw execution as parsed directly from broker statement CSV.
 * One execution = one order fill (which may be partial).
 */
export interface RawExecution {
	date: string // ISO date string or DD/MM/YYYY
	time: string // HH:MM:SS
	asset: string // e.g., "WIN", "WDO", "PETR4"
	side: "BUY" | "SELL"
	quantity: number // Exact number of contracts
	price: number // Exact price per contract
	commission: number // Exact brokerage fee
	broker: "CLEAR" | "XP" | "GENIAL"
	// Raw original values (for debugging)
	rawDate?: string
	rawTime?: string
}

/**
 * Grouped executions representing one side (entry or exit) of a trade.
 * Multiple partial fills are grouped into one side.
 */
export interface GroupedExecutions {
	executions: RawExecution[]
	totalQuantity: number
	weightedAveragePrice: number // Calculated: sum(qty*price) / sum(qty)
	totalCommission: number
	firstExecutionTime: Date
	lastExecutionTime: Date
}

/**
 * Complete grouped trade with both entry and exit sides.
 * Ready for storage in database.
 */
export interface GroupedTrade {
	asset: string
	date: string // Trade date (date of first entry)
	entryGroup: GroupedExecutions
	exitGroup: GroupedExecutions | null // null if position still open
	grossPnl: number | null // (exitPrice - entryPrice) * min(entryQty, exitQty)
	netPnl: number | null // grossPnl - totalCommission
	direction: "long" | "short"
	entryPrice: number
	exitPrice: number | null
	entryQuantity: number
	exitQuantity: number | null
	totalCommission: number // entry + exit commissions
	status: "open" | "closed" // open if no exit, closed if exit exists
	warnings: string[] // e.g., ["Partial exit: entered 100, exited 50"]
}

/**
 * Preview data shown to user before confirming import.
 * Allows review of detected trades and warnings.
 */
export interface ImportPreview {
	importId: string // Cache key for confirmation step
	brokerName: string
	detectdExecutionCount: number
	detectedTradeCount: number
	trades: GroupedTrade[]
	warnings: string[] // Global warnings
	totalGrossPnl: number
	totalNetPnl: number
	successfulTrades: number
	warningTrades: number
	skippedRowCount: number // Rows that failed parsing
	skippedRowNumbers?: number[] // First N row numbers (up to 10) that were skipped
}

/**
 * Result of import confirmation - trades committed to database.
 */
export interface ImportResult {
	success: boolean
	importId: string
	importedTradesCount: number
	skippedRowCount?: number
	duplicates?: number
	failedCount?: number
	errors?: Array<{
		trade: string
		message: string
	}>
}
