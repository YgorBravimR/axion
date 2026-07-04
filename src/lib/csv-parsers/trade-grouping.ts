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
 * Convert execution timestamp to Date object.
 * Validates the parsed date to ensure it's not Invalid Date (from NaN).
 * Returns null if parsing fails; caller must handle null (skip the execution).
 */
const parseExecutionTime = (execution: RawExecution): Date | null => {
	// Format: "DD/MM/YYYY" and "HH:MM:SS"
	const dateParts = execution.date.split("/")
	const timeParts = execution.time.split(":")

	// Require exactly 3 date parts and at least 2 time parts (HH:MM minimum)
	if (dateParts.length !== 3 || timeParts.length < 2) {
		return null
	}

	const [day, month, year] = dateParts.map(Number)
	const [hour, minute, second] = timeParts.map(Number)

	// Validate parsed numbers are finite
	if (
		!Number.isFinite(day) ||
		!Number.isFinite(month) ||
		!Number.isFinite(year) ||
		!Number.isFinite(hour) ||
		!Number.isFinite(minute)
	) {
		return null
	}

	// Create date in BRT timezone (UTC-3)
	const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second || 0).padStart(2, "0")}-03:00`
	const date = new Date(dateString)

	// Validate the resulting date is not Invalid Date
	if (Number.isNaN(date.getTime())) {
		return null
	}

	return date
}

/**
 * Create a grouped executions object (one side of a trade).
 * Returns null if any execution has a null timestamp (unparseable date).
 */
const createGroupedExecutions = (
	executions: RawExecution[]
): GroupedExecutions | null => {
	const totalQuantity = executions.reduce(
		(sum, ex) => sum + (ex.quantity ?? 0),
		0
	)
	const totalCommission = executions.reduce((sum, ex) => sum + ex.commission, 0)

	const times = executions.map(parseExecutionTime)

	// If any execution has an unparseable date, reject the entire group
	if (times.some((t) => t === null)) {
		return null
	}

	const validTimes = times as Date[] // TypeScript guard after null check
	const firstExecutionTime = new Date(
		Math.min(...validTimes.map((t) => t.getTime()))
	)
	const lastExecutionTime = new Date(
		Math.max(...validTimes.map((t) => t.getTime()))
	)

	return {
		executions,
		totalQuantity,
		weightedAveragePrice: calculateWeightedAveragePrice(executions),
		totalCommission,
		firstExecutionTime,
		lastExecutionTime,
	}
}

interface GroupTradesResult {
	trades: GroupedTrade[]
	skippedExecutionCount: number
}

/**
 * Group executions by (asset, date) and split into trades
 * Algorithm:
 * 1. Group all executions by asset + date
 * 2. For each group, sort by time
 * 3. Identify entry side: first consecutive same-direction orders
 * 4. Identify exit side: remaining orders (opposite direction)
 * Returns count of executions skipped due to unparseable dates.
 */
export const groupExecutionsIntoTrades = (
	executions: RawExecution[]
): GroupTradesResult => {
	if (executions.length === 0) {
		return { trades: [], skippedExecutionCount: 0 }
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
	let skippedExecutionCount = 0

	// Process each asset-date group
	for (const [, groupExecutions] of assetDateGroups) {
		// Sort by time — executions with unparseable times stay unmoved (their parseExecutionTime returns null)
		const sorted = groupExecutions.sort((a, b) => {
			const timeA = parseExecutionTime(a)
			const timeB = parseExecutionTime(b)

			// Push unparseable executions to the end
			if (timeA === null && timeB === null) {
				return 0
			}
			if (timeA === null) {
				return 1
			}
			if (timeB === null) {
				return -1
			}

			return timeA.getTime() - timeB.getTime()
		})

		// Separate parseable from unparseable
		const parseableIndex = sorted.findIndex(
			(ex) => parseExecutionTime(ex) === null
		)
		const parseableExecutions =
			parseableIndex === -1 ? sorted : sorted.slice(0, parseableIndex)
		const unparseableExecutions =
			parseableIndex === -1 ? [] : sorted.slice(parseableIndex)

		skippedExecutionCount += unparseableExecutions.length

		// Determine entry and exit sides (from parseable only)
		const entryExecutions: RawExecution[] = []
		const exitExecutions: RawExecution[] = []

		// First execution determines direction
		if (parseableExecutions.length > 0) {
			const firstSide = parseableExecutions[0]!.side

			// Collect consecutive executions with same side as entry
			let i = 0
			while (
				i < parseableExecutions.length &&
				parseableExecutions[i]!.side === firstSide
			) {
				entryExecutions.push(parseableExecutions[i]!)
				i++
			}

			// Rest are exits (if any)
			while (i < parseableExecutions.length) {
				exitExecutions.push(parseableExecutions[i]!)
				i++
			}
		}

		// Skip if no entry
		if (entryExecutions.length === 0) {
			continue
		}

		// Skip if there are any unparseable executions in this trade group
		// (they got sorted to the end but represent missing date data)
		if (unparseableExecutions.length > 0) {
			continue
		}

		// Build trade
		const entryGroup = createGroupedExecutions(entryExecutions)
		const exitGroup =
			exitExecutions.length > 0 ? createGroupedExecutions(exitExecutions) : null

		// Skip trade if entry or exit group has unparseable dates
		if (
			entryGroup === null ||
			(exitExecutions.length > 0 && exitGroup === null)
		) {
			skippedExecutionCount += entryExecutions.length + exitExecutions.length
			continue
		}

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

	return { trades, skippedExecutionCount }
}

/**
 * Create import preview from grouped trades
 */
export const createImportPreview = (
	trades: GroupedTrade[],
	brokerName: string,
	executionCount: number,
	importId: string,
	skippedExecutionCount: number = 0,
	skippedRowNumbers: number[] = []
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

	if (skippedExecutionCount > 0) {
		const rowInfo =
			skippedRowNumbers.length > 0
				? ` (rows: ${skippedRowNumbers.slice(0, 10).join(", ")}${skippedRowNumbers.length > 10 ? "..." : ""})`
				: ""
		globalWarnings.push(
			`${skippedExecutionCount} executions skipped due to malformed dates${rowInfo}`
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
		skippedRowCount: skippedExecutionCount,
		skippedRowNumbers:
			skippedRowNumbers.length > 0 ? skippedRowNumbers.slice(0, 10) : undefined,
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

	const grossPnl = trade.grossPnl ?? 0

	// Risk is implicitly 1R (the realized gross P&L per contract)
	const realizedRMultiple = grossPnl > 0 ? 1 : -1

	return {
		plannedRiskAmount: trade.totalCommission, // Use commission as minimal risk metric
		plannedRMultiple: null, // Not available without SL/TP
		realizedRMultiple,
	}
}
