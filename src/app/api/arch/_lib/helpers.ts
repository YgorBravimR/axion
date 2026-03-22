import { NextResponse } from "next/server"
import { fromCents } from "@/lib/money"

interface ArchSuccessResponse {
	status: "success"
	message: string
	data?: unknown
}

interface ArchErrorDetail {
	code: string
	detail: string
}

interface ArchErrorResponse {
	status: "error"
	message: string
	errors?: ArchErrorDetail[]
}

interface TradeRelationStrategy {
	name: string
}

interface TradeRelationTimeframe {
	name: string
}

interface TradeRelationTag {
	tag: { id: string; name: string }
}

interface TradeRecord {
	pnl?: string | number | null
	plannedRiskAmount?: string | number | null
	commission?: string | number | null
	fees?: string | number | null
	entryPrice?: string | null
	exitPrice?: string | null
	positionSize?: string | null
	stopLoss?: string | null
	takeProfit?: string | null
	strategy?: TradeRelationStrategy | null
	timeframe?: TradeRelationTimeframe | null
	tradeTags?: TradeRelationTag[]
	[key: string]: unknown
}

interface ExecutionRecord {
	price?: string | null
	quantity?: string | null
	commission?: string | number | null
	fees?: string | number | null
	slippage?: string | number | null
	executionValue?: string | number | null
	[key: string]: unknown
}

interface FormattedTrade {
	pnl: number
	plannedRiskAmount: number
	commission: number
	fees: number
	entryPrice: number | null
	exitPrice: number | null
	positionSize: number | null
	stopLoss: number | null
	takeProfit: number | null
	strategyName: string | null
	timeframeName: string | null
	tagNames: string[]
	[key: string]: unknown
}

interface FormattedExecution {
	price: number | null
	quantity: number | null
	commission: number
	fees: number
	slippage: number
	executionValue: number
	[key: string]: unknown
}

/**
 * Parses a string to a number, returning null if the value is null/undefined/empty.
 *
 * @param value - The string value to parse
 * @returns The parsed number, or null
 */
const parseNumericField = (value: string | null | undefined): number | null => {
	if (value === null || value === undefined || value === "") return null
	const parsed = Number(value)
	return Number.isNaN(parsed) ? null : parsed
}

/**
 * Builds a success response for Arch API endpoints.
 *
 * @param message - Human-readable success message
 * @param data - Optional response data payload
 * @returns NextResponse with standard success format
 */
const archSuccess = (
	message: string,
	data?: unknown
): NextResponse<ArchSuccessResponse> =>
	NextResponse.json({ status: "success", message, data })

/**
 * Builds an error response for Arch API endpoints.
 *
 * @param message - Human-readable error message
 * @param errors - Optional array of structured error details
 * @param statusCode - HTTP status code (defaults to 400)
 * @returns NextResponse with standard error format
 */
const archError = (
	message: string,
	errors?: ArchErrorDetail[],
	statusCode?: number
): NextResponse<ArchErrorResponse> =>
	NextResponse.json(
		{ status: "error", message, errors },
		{ status: statusCode ?? 400 }
	)

/**
 * Converts a trade record to an Arch-friendly format.
 * - Converts cents fields (pnl, plannedRiskAmount, commission, fees) to dollars via fromCents()
 * - Parses numeric string fields (entryPrice, exitPrice, positionSize, stopLoss, takeProfit)
 * - Attaches human-readable names from relations (strategy, timeframe, tradeTags)
 *
 * @param trade - The raw trade record with relations
 * @returns A clean object with numeric values and human-readable relation names
 */
const formatTradeForArch = (trade: TradeRecord): FormattedTrade => {
	const {
		pnl,
		plannedRiskAmount,
		commission,
		fees,
		entryPrice,
		exitPrice,
		positionSize,
		stopLoss,
		takeProfit,
		strategy,
		timeframe,
		tradeTags,
		...rest
	} = trade

	const tagNames = (tradeTags ?? [])
		.map((tradeTag) => tradeTag.tag?.name)
		.filter((name): name is string => Boolean(name))

	return {
		...rest,
		pnl: fromCents(pnl),
		plannedRiskAmount: fromCents(plannedRiskAmount),
		commission: fromCents(commission),
		fees: fromCents(fees),
		entryPrice: parseNumericField(entryPrice),
		exitPrice: parseNumericField(exitPrice),
		positionSize: parseNumericField(positionSize),
		stopLoss: parseNumericField(stopLoss),
		takeProfit: parseNumericField(takeProfit),
		strategyName: strategy?.name ?? null,
		timeframeName: timeframe?.name ?? null,
		tagNames,
	}
}

/**
 * Converts an execution record to an Arch-friendly format.
 * - Parses price and quantity to numbers
 * - Converts cents fields (commission, fees, slippage, executionValue) via fromCents()
 *
 * @param execution - The raw execution record
 * @returns A clean object with numeric values
 */
const formatExecutionForArch = (
	execution: ExecutionRecord
): FormattedExecution => {
	const {
		price,
		quantity,
		commission,
		fees,
		slippage,
		executionValue,
		...rest
	} = execution

	return {
		...rest,
		price: parseNumericField(price),
		quantity: parseNumericField(quantity),
		commission: fromCents(commission),
		fees: fromCents(fees),
		slippage: fromCents(slippage),
		executionValue: fromCents(executionValue),
	}
}

export { archSuccess, archError, formatTradeForArch, formatExecutionForArch }
export type {
	ArchSuccessResponse,
	ArchErrorDetail,
	ArchErrorResponse,
	TradeRecord,
	ExecutionRecord,
	FormattedTrade,
	FormattedExecution,
}
