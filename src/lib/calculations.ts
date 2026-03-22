import type { TradeExecution } from "@/db/schema"
import type { ExecutionSummary, PositionStatus } from "@/types"

/**
 * Calculate win rate percentage
 */
export const calculateWinRate = (wins: number, total: number): number => {
	if (total === 0) return 0
	return (wins / total) * 100
}

/**
 * Calculate profit factor (gross profit / gross loss)
 */
export const calculateProfitFactor = (
	grossProfit: number,
	grossLoss: number
): number => {
	if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0
	return grossProfit / Math.abs(grossLoss)
}

/**
 * Calculate expected value per trade
 * EV = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
 */
export const calculateExpectedValue = (
	winRate: number,
	avgWin: number,
	avgLoss: number
): number => {
	const lossRate = 100 - winRate
	return (winRate / 100) * avgWin - (lossRate / 100) * Math.abs(avgLoss)
}

/**
 * Calculate drawdown percentage from peak
 */
export const calculateDrawdown = (equity: number, peak: number): number => {
	if (peak <= 0) return 0
	return ((peak - equity) / peak) * 100
}

/**
 * Calculate R-Multiple (profit/loss divided by risk amount)
 */
export const calculateRMultiple = (pnl: number, riskAmount: number): number => {
	if (riskAmount === 0) return 0
	return pnl / riskAmount
}

/**
 * Calculate position size based on risk parameters
 */
export const calculatePositionSize = ({
	accountBalance,
	riskPercent,
	entryPrice,
	stopLoss,
}: {
	accountBalance: number
	riskPercent: number
	entryPrice: number
	stopLoss: number
}): number => {
	const riskAmount = accountBalance * (riskPercent / 100)
	const riskPerShare = Math.abs(entryPrice - stopLoss)
	if (riskPerShare === 0) return 0
	return riskAmount / riskPerShare
}

/**
 * Calculate P&L for a trade
 */
export const calculatePnL = ({
	direction,
	entryPrice,
	exitPrice,
	positionSize,
	commission = 0,
	fees = 0,
}: {
	direction: "long" | "short"
	entryPrice: number
	exitPrice: number
	positionSize: number
	commission?: number
	fees?: number
}): number => {
	const priceDiff =
		direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
	const grossPnL = priceDiff * positionSize
	return grossPnL - commission - fees
}

/**
 * Determine trade outcome based on tick movement or P&L.
 *
 * When both ticksGained and breakevenTicks are available, trades exiting
 * within ±breakevenTicks of entry are classified as breakeven ("scratch"
 * trades). This uses absolute ticks (bidirectional) because both small
 * wins and small losses within the threshold are effectively scratches.
 *
 * Falls back to pure P&L classification when tick data is unavailable
 * or breakevenTicks is 0.
 */
export const determineOutcome = ({
	pnl,
	ticksGained,
	breakevenTicks = 0,
}: {
	pnl: number
	ticksGained?: number | null
	breakevenTicks?: number
}): "win" | "loss" | "breakeven" => {
	// Tick-based classification when both values are available
	if (ticksGained != null && breakevenTicks > 0) {
		if (Math.abs(ticksGained) <= breakevenTicks) return "breakeven"
		return ticksGained > 0 ? "win" : "loss"
	}
	// Fallback: P&L-based (non-asset trades or breakevenTicks=0)
	if (pnl > 0) return "win"
	if (pnl < 0) return "loss"
	return "breakeven"
}

/**
 * Format currency value (expects value in dollars, not cents)
 */
export const formatCurrency = (value: number, currency = "USD"): string => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value)
}

/**
 * Format cents as currency string
 */
export const formatCurrencyFromCents = (cents: number, currency = "USD"): string => {
	return formatCurrency(cents / 100, currency)
}

/**
 * Format percentage value
 */
export const formatPercent = (value: number, decimals = 1): string => {
	return `${value.toFixed(decimals)}%`
}

/**
 * Format R-Multiple value
 */
export const formatRMultiple = (value: number): string => {
	const sign = value >= 0 ? "+" : ""
	return `${sign}${value.toFixed(2)}R`
}

/**
 * P&L calculation input for asset-based calculation
 */
export interface AssetPnLInput {
	entryPrice: number
	exitPrice: number
	positionSize: number
	direction: "long" | "short"
	tickSize: number
	tickValue: number
	commission?: number // per contract execution
	fees?: number // per contract execution
	contractsExecuted?: number // total contract executions (default: positionSize * 2 for entry + exit)
}

/**
 * P&L calculation result for asset-based calculation
 */
export interface AssetPnLResult {
	ticksGained: number
	grossPnl: number
	netPnl: number
	totalCosts: number
}

/**
 * Calculate P&L for a trade using asset configuration (tick size, tick value)
 * tickValue = value per tick (one minimum price fluctuation), NOT per point
 *
 * Example: WINFUT with tickSize=5, tickValue=1.00 (R$0.20/pt × 5 pts/tick)
 * Entry: 128000, Exit: 128050, Size: 2 contracts
 * Ticks gained: (128050 - 128000) / 5 = 10 ticks
 * Gross P&L: 10 * 1.00 * 2 = R$20.00
 *
 * Costs calculation:
 * - Each trade has at least 2 executions per contract (entry + exit)
 * - If scaling in/out, more executions occur
 * - contractsExecuted = total number of contract executions
 * - Default: positionSize * 2 (1 entry + 1 exit per contract)
 */
export const calculateAssetPnL = (input: AssetPnLInput): AssetPnLResult => {
	const {
		entryPrice,
		exitPrice,
		positionSize,
		direction,
		tickSize,
		tickValue,
		commission = 0,
		fees = 0,
		contractsExecuted,
	} = input

	const priceDiff =
		direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice

	const ticksGained = priceDiff / tickSize
	const grossPnl = ticksGained * tickValue * positionSize

	// Use contractsExecuted if provided, otherwise default to positionSize * 2 (entry + exit)
	const totalExecutions = contractsExecuted ?? positionSize * 2
	const totalCosts = (commission + fees) * totalExecutions
	const netPnl = grossPnl - totalCosts

	return {
		ticksGained,
		grossPnl,
		netPnl,
		totalCosts,
	}
}

/**
 * Execution data for FIFO P&L calculation
 */
export interface ExecutionForPnL {
	executionType: "entry" | "exit"
	executionDate: Date
	price: number
	quantity: number
	commission?: number
	fees?: number
}

/**
 * Result of FIFO P&L calculation
 */
export interface FifoPnLResult {
	realizedPnl: number
	unrealizedPnl: number
	totalCommission: number
	totalFees: number
	matchedQuantity: number
	remainingQuantity: number
}

/**
 * Calculate P&L for scaled positions using FIFO (First In, First Out) method
 *
 * This function matches exit executions against entry executions in chronological order.
 * For each matched pair, it calculates the P&L based on the price difference.
 *
 * @param executions - Array of executions sorted by date
 * @param direction - Trade direction ('long' or 'short')
 * @param asset - Optional asset config for tick-based calculation
 */
export const calculateFifoPnL = (
	executions: ExecutionForPnL[],
	direction: "long" | "short",
	asset?: { tickSize: number; tickValue: number }
): FifoPnLResult => {
	// Sort entries by date (FIFO) - using toSorted for immutability
	const entries = executions
		.filter((e) => e.executionType === "entry")
		.toSorted((a, b) => new Date(a.executionDate).getTime() - new Date(b.executionDate).getTime())

	const exits = executions
		.filter((e) => e.executionType === "exit")
		.toSorted((a, b) => new Date(a.executionDate).getTime() - new Date(b.executionDate).getTime())

	if (entries.length === 0) {
		return {
			realizedPnl: 0,
			unrealizedPnl: 0,
			totalCommission: 0,
			totalFees: 0,
			matchedQuantity: 0,
			remainingQuantity: 0,
		}
	}

	let realizedPnl = 0
	let entryIndex = 0
	let remainingEntryQty = entries[0]?.quantity || 0
	let matchedQuantity = 0
	let totalCommission = 0
	let totalFees = 0

	// Accumulate all commissions and fees
	for (const ex of executions) {
		totalCommission += ex.commission ?? 0
		totalFees += ex.fees ?? 0
	}

	// Match exits against entries (FIFO)
	for (const exit of exits) {
		let exitQtyRemaining = exit.quantity

		while (exitQtyRemaining > 0 && entryIndex < entries.length) {
			const matchQty = Math.min(exitQtyRemaining, remainingEntryQty)
			const entryPrice = entries[entryIndex].price
			const exitPrice = exit.price

			// Calculate P&L for this matched quantity
			let pnlForMatch: number
			if (asset) {
				// Tick-based calculation
				const priceDiff =
					direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
				const ticksGained = priceDiff / asset.tickSize
				pnlForMatch = ticksGained * asset.tickValue * matchQty
			} else {
				// Simple price-based calculation
				const priceDiff =
					direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
				pnlForMatch = priceDiff * matchQty
			}

			realizedPnl += pnlForMatch
			matchedQuantity += matchQty
			exitQtyRemaining -= matchQty
			remainingEntryQty -= matchQty

			if (remainingEntryQty <= 0) {
				entryIndex++
				remainingEntryQty = entries[entryIndex]?.quantity || 0
			}
		}
	}

	// Calculate remaining quantity (unmatched entries)
	let totalEntryQty = 0
	for (const entry of entries) {
		totalEntryQty += entry.quantity
	}
	let totalExitQty = 0
	for (const exit of exits) {
		totalExitQty += exit.quantity
	}
	const remainingQuantity = totalEntryQty - totalExitQty

	// Net P&L after costs
	const netRealizedPnl = realizedPnl - totalCommission - totalFees

	return {
		realizedPnl: netRealizedPnl,
		unrealizedPnl: 0, // Would need current market price to calculate
		totalCommission,
		totalFees,
		matchedQuantity,
		remainingQuantity: Math.max(0, remainingQuantity),
	}
}

/**
 * Calculate weighted average price for executions of a specific type
 */
export const calculateWeightedAvgPrice = (
	executions: ExecutionForPnL[],
	type: "entry" | "exit"
): number => {
	const filtered = executions.filter((e) => e.executionType === type)
	if (filtered.length === 0) return 0

	let totalValue = 0
	let totalQty = 0
	for (const ex of filtered) {
		totalValue += ex.price * ex.quantity
		totalQty += ex.quantity
	}

	return totalQty > 0 ? totalValue / totalQty : 0
}

// ==========================================
// TICK-BASED POSITION SIZING (for risk simulation)
// ==========================================

/**
 * Input for tick-based position sizing.
 * Uses risk budget in cents and SL distance to determine contract count.
 */
export interface TickBasedPositionSizeInput {
	riskBudgetCents: number
	entryPrice: number
	stopLoss: number
	tickSize: number
	tickValue: number // cents per tick per contract
	maxContracts?: number | null
}

export interface TickBasedPositionSizeResult {
	contracts: number
	ticksAtRisk: number
	riskPerContractCents: number
	actualRiskCents: number
}

/**
 * Calculates the number of contracts based on risk budget and SL distance.
 *
 * Formula: floor(riskBudget / (ticksAtRisk × tickValue))
 * Enforces minimum 1 contract, optional maxContracts cap.
 *
 * @example
 * // WINFUT: tickSize=5, tickValue=100 (cents per tick)
 * // Entry: 128000, SL: 127950 → 10 ticks at risk
 * // Risk budget: 5000 cents (R$50) → floor(5000 / (10 × 100)) = 5 contracts
 */
export const calculateTickBasedPositionSize = (
	input: TickBasedPositionSizeInput
): TickBasedPositionSizeResult => {
	const { riskBudgetCents, entryPrice, stopLoss, tickSize, tickValue, maxContracts } = input

	const priceDiff = Math.abs(entryPrice - stopLoss)
	const ticksAtRisk = priceDiff / tickSize

	// SL at entry price (0 ticks) — cannot size
	if (ticksAtRisk <= 0 || tickValue <= 0) {
		return { contracts: 0, ticksAtRisk: 0, riskPerContractCents: 0, actualRiskCents: 0 }
	}

	const riskPerContractCents = ticksAtRisk * tickValue
	let contracts = Math.floor(riskBudgetCents / riskPerContractCents)

	// Minimum 1 contract when there's any risk budget
	if (contracts < 1 && riskBudgetCents > 0) {
		contracts = 1
	}

	// Apply max contracts cap if specified
	if (maxContracts && maxContracts > 0) {
		contracts = Math.min(contracts, maxContracts)
	}

	const actualRiskCents = contracts * riskPerContractCents

	return { contracts, ticksAtRisk, riskPerContractCents, actualRiskCents }
}

/**
 * Get position status based on entry/exit quantities
 */
const getPositionStatus = (
	totalEntryQty: number,
	totalExitQty: number
): PositionStatus => {
	if (totalExitQty === 0) return "open"
	if (totalExitQty < totalEntryQty) return "partial"
	if (totalExitQty === totalEntryQty) return "closed"
	return "over_exit"
}

/**
 * Calculate weighted average price for entry or exit executions
 */
const calculateAvgPrice = (
	executions: TradeExecution[],
	type: "entry" | "exit"
): number => {
	const filtered = executions.filter((e) => e.executionType === type)
	if (filtered.length === 0) return 0

	let totalValue = 0
	let totalQty = 0
	for (const ex of filtered) {
		const price = Number(ex.price)
		const qty = Number(ex.quantity)
		totalValue += price * qty
		totalQty += qty
	}

	return totalQty > 0 ? totalValue / totalQty : 0
}

/**
 * Calculate execution summary from a list of executions.
 * Pure utility — no server/DB dependency.
 */
const calculateExecutionSummary = (
	executions: TradeExecution[]
): ExecutionSummary => {
	const entries = executions.filter((e) => e.executionType === "entry")
	const exits = executions.filter((e) => e.executionType === "exit")

	const totalEntryQuantity = entries.reduce(
		(sum, e) => sum + Number(e.quantity),
		0
	)
	const totalExitQuantity = exits.reduce(
		(sum, e) => sum + Number(e.quantity),
		0
	)

	const avgEntryPrice = calculateAvgPrice(executions, "entry")
	const avgExitPrice = calculateAvgPrice(executions, "exit")

	const totalCommission = executions.reduce(
		(sum, e) => sum + (Number(e.commission) || 0),
		0
	)
	const totalFees = executions.reduce((sum, e) => sum + (Number(e.fees) || 0), 0)

	return {
		totalEntryQuantity,
		totalExitQuantity,
		avgEntryPrice,
		avgExitPrice,
		remainingQuantity: totalEntryQuantity - totalExitQuantity,
		positionStatus: getPositionStatus(totalEntryQuantity, totalExitQuantity),
		entryCount: entries.length,
		exitCount: exits.length,
		totalCommission,
		totalFees,
	}
}

export { calculateExecutionSummary }
