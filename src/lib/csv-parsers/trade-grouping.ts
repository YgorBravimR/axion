/**
 * Trade Grouping Engine
 * Groups raw executions into complete trades (entry + exit sides)
 * with weighted average calculations and validation
 */

import type {
	RawExecution,
	GroupedExecutions,
	GroupedTrade,
	ImportPreview,
} from "./types"

/**
 * Calculate weighted average price from multiple executions
 * Formula: sum(qty * price) / sum(qty)
 */
const calculateWeightedAveragePrice = (executions: RawExecution[]): number => {
	if (executions.length === 0) {
		return 0
	}

	const totalValue = executions.reduce(
		(sum, ex) => sum + ex.quantity * ex.price,
		0
	)
	const totalQty = executions.reduce((sum, ex) => sum + ex.quantity, 0)

	return totalQty > 0 ? totalValue / totalQty : 0
}

/**
 * Convert execution timestamp to Date object
 */
const parseExecutionTime = (execution: RawExecution): Date => {
	// Format: "DD/MM/YYYY" and "HH:MM:SS"
	const dateParts = execution.date.split("/")
	const timeParts = execution.time.split(":")

	if (dateParts.length !== 3 || timeParts.length < 2) {
		return new Date()
	}

	const [day, month, year] = dateParts.map(Number)
	const [hour, minute, second] = timeParts.map(Number)

	// Create date in BRT timezone (UTC-3)
	const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second || 0).padStart(2, "0")}-03:00`
	return new Date(dateString)
}

/**
 * Create a grouped executions object (one side of a trade)
 */
const createGroupedExecutions = (
	executions: RawExecution[]
): GroupedExecutions => {
	const totalQuantity = executions.reduce((sum, ex) => sum + ex.quantity, 0)
	const totalCommission = executions.reduce((sum, ex) => sum + ex.commission, 0)

	const times = executions.map(parseExecutionTime)
	const firstExecutionTime = new Date(
		Math.min(...times.map((t) => t.getTime()))
	)
	const lastExecutionTime = new Date(Math.max(...times.map((t) => t.getTime())))

	return {
		executions,
		totalQuantity,
		weightedAveragePrice: calculateWeightedAveragePrice(executions),
		totalCommission,
		firstExecutionTime,
		lastExecutionTime,
	}
}

/**
 * Group executions by (asset, date) and split into trades
 * Algorithm:
 * 1. Group all executions by asset + date
 * 2. For each group, sort by time
 * 3. Identify entry side: first consecutive same-direction orders
 * 4. Identify exit side: remaining orders (opposite direction)
 */
export const groupExecutionsIntoTrades = (
	executions: RawExecution[]
): GroupedTrade[] => {
	if (executions.length === 0) {
		return []
	}

	// Group by (asset, date)
	const assetDateGroups: Map<string, RawExecution[]> = new Map()

	for (const execution of executions) {
		const key = `${execution.asset}_${execution.date}`
		if (!assetDateGroups.has(key)) {
			assetDateGroups.set(key, [])
		}
		assetDateGroups.get(key)!.push(execution)
	}

	const trades: GroupedTrade[] = []

	// Process each asset-date group
	for (const [, groupExecutions] of assetDateGroups) {
		// Sort by time
		const sorted = groupExecutions.sort((a, b) => {
			const timeA = parseExecutionTime(a).getTime()
			const timeB = parseExecutionTime(b).getTime()
			return timeA - timeB
		})

		// Determine entry and exit sides
		const entryExecutions: RawExecution[] = []
		const exitExecutions: RawExecution[] = []

		// First execution determines direction
		if (sorted.length > 0) {
			const firstSide = sorted[0]!.side

			// Collect consecutive executions with same side as entry
			let i = 0
			while (i < sorted.length && sorted[i]!.side === firstSide) {
				entryExecutions.push(sorted[i]!)
				i++
			}

			// Rest are exits (if any)
			while (i < sorted.length) {
				exitExecutions.push(sorted[i]!)
				i++
			}
		}

		// Skip if no entry
		if (entryExecutions.length === 0) {
			continue
		}

		// Build trade
		const entryGroup = createGroupedExecutions(entryExecutions)
		const exitGroup =
			exitExecutions.length > 0 ? createGroupedExecutions(exitExecutions) : null

		// Determine direction based on first execution
		const direction: "long" | "short" =
			entryExecutions[0]!.side === "BUY" ? "long" : "short"

		// Calculate P&L
		const entryPrice = entryGroup.weightedAveragePrice
		const exitPrice = exitGroup?.weightedAveragePrice ?? null

		let grossPnl: number | null = null
		if (exitPrice !== null) {
			const tradedQuantity = Math.min(
				entryGroup.totalQuantity,
				exitGroup!.totalQuantity
			)
			if (direction === "long") {
				grossPnl = (exitPrice - entryPrice) * tradedQuantity
			} else {
				grossPnl = (entryPrice - exitPrice) * tradedQuantity
			}
		}

		const totalCommission =
			entryGroup.totalCommission + (exitGroup?.totalCommission ?? 0)
		const netPnl = grossPnl !== null ? grossPnl - totalCommission : null

		// Generate warnings
		const warnings: string[] = []

		if (exitGroup && entryGroup.totalQuantity !== exitGroup.totalQuantity) {
			const diff = Math.abs(entryGroup.totalQuantity - exitGroup.totalQuantity)
			if (entryGroup.totalQuantity > exitGroup.totalQuantity) {
				warnings.push(
					`Partial exit: entered ${entryGroup.totalQuantity} contracts, exited ${exitGroup.totalQuantity} (${diff} remain open)`
				)
			} else {
				warnings.push(
					`Over-exit: entered ${entryGroup.totalQuantity} contracts, but exited ${exitGroup.totalQuantity}`
				)
			}
		}

		if (!exitGroup) {
			warnings.push("Position still open (no exit found)")
		}

		trades.push({
			asset: groupExecutions[0]!.asset,
			date: groupExecutions[0]!.date,
			entryGroup,
			exitGroup,
			grossPnl,
			netPnl,
			direction,
			entryPrice,
			exitPrice,
			entryQuantity: entryGroup.totalQuantity,
			exitQuantity: exitGroup?.totalQuantity ?? null,
			totalCommission,
			status: exitGroup ? "closed" : "open",
			warnings,
		})
	}

	return trades
}

/**
 * Create import preview from grouped trades
 */
export const createImportPreview = (
	trades: GroupedTrade[],
	brokerName: string,
	executionCount: number,
	importId: string
): ImportPreview => {
	const successfulTrades = trades.filter((t) => t.warnings.length === 0).length
	const warningTrades = trades.filter((t) => t.warnings.length > 0).length

	const totalGrossPnl = trades.reduce((sum, t) => sum + (t.grossPnl ?? 0), 0)
	const totalNetPnl = trades.reduce((sum, t) => sum + (t.netPnl ?? 0), 0)

	const globalWarnings: string[] = []
	if (warningTrades > 0) {
		globalWarnings.push(
			`${warningTrades} trades have warnings (partial exits or open positions)`
		)
	}

	return {
		importId,
		brokerName,
		detectdExecutionCount: executionCount,
		detectedTradeCount: trades.length,
		trades,
		warnings: globalWarnings,
		totalGrossPnl,
		totalNetPnl,
		successfulTrades,
		warningTrades,
	}
}

/**
 * Calculate R-multiple metrics from trade data
 * planRiskAmount: the actual risk taken (entry - SL) * position size
 * planRMultiple: (TP - entry) / (entry - SL)
 * realizedRMultiple: netPnl / planRiskAmount
 */
export const calculateRMetrics = (trade: GroupedTrade) => {
	// For automatic trade grouping without SL/TP,
	// we can derive risk from the realized P&L
	// realizedRMultiple = netPnl / (entry - exit) * qty

	if (trade.netPnl === null || trade.netPnl === 0) {
		return {
			plannedRiskAmount: null,
			plannedRMultiple: null,
			realizedRMultiple: null,
		}
	}

	// Derive risk amount from actual result
	// netPnl = (exit - entry) * qty - commission
	// realizedR = netPnl / ((exit - entry) * qty)

	const direction = trade.direction
	const grossPnl = trade.grossPnl ?? 0

	// Risk is implicitly 1R (the realized gross P&L per contract)
	const realizedRMultiple = grossPnl > 0 ? 1 : -1

	return {
		plannedRiskAmount: trade.totalCommission, // Use commission as minimal risk metric
		plannedRMultiple: null, // Not available without SL/TP
		realizedRMultiple,
	}
}
