"use server"

import { invalidateTradeData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions, assets } from "@/db/schema"
import type { Trade, TradeExecution } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq } from "drizzle-orm"
import {
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import { fromCents, toCents, toNumericString } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getBreakevenTicks } from "@/app/actions/accounts"
import { z } from "zod"

// ==========================================
// Validation Schema
// ==========================================

const ocrExecutionSchema = z.object({
	executionType: z.enum(["entry", "exit"]),
	executionDate: z.coerce.date(),
	price: z.coerce.number().positive(),
	quantity: z.coerce.number().positive(),
})

const ocrImportSchema = z.object({
	asset: z.string().min(1).max(20),
	originalContractCode: z.string().optional(),
	direction: z.enum(["long", "short"]),
	entryDate: z.coerce.date(),
	exitDate: z.coerce.date().optional(),
	executions: z
		.array(ocrExecutionSchema)
		.min(1, "At least one execution is required"),
	strategyId: z.string().uuid().optional(),
	timeframeId: z.string().uuid().optional(),
	preTradeThoughts: z.string().max(2000).optional(),
})

export type OcrImportInput = z.input<typeof ocrImportSchema>

// ==========================================
// Helper Functions
// ==========================================

/**
 * Calculate execution value (price * quantity) in cents
 */
const calculateExecutionValue = (price: number, quantity: number): number => {
	return toCents(price * quantity)
}

/**
 * Calculate weighted average price from executions of a given type
 */
const calculateAvgPrice = (
	type: "entry" | "exit",
	allExecutions: Array<{
		executionType: string
		price: number
		quantity: number
	}>
): number => {
	const filtered = allExecutions.filter((e) => e.executionType === type)
	if (filtered.length === 0) return 0

	let totalValue = 0
	let totalQty = 0
	for (const ex of filtered) {
		totalValue += ex.price * ex.quantity
		totalQty += ex.quantity
	}

	return totalQty > 0 ? totalValue / totalQty : 0
}

/**
 * Find asset by symbol (normalized or original)
 */
const findAsset = async (symbol: string, originalCode?: string) => {
	// Try exact match first
	let asset = await db.query.assets.findFirst({
		where: eq(assets.symbol, symbol.toUpperCase()),
	})

	// If not found and we have original code, try that
	if (!asset && originalCode && originalCode !== symbol) {
		asset = await db.query.assets.findFirst({
			where: eq(assets.symbol, originalCode.toUpperCase()),
		})
	}

	return asset
}

// ==========================================
// Main Import Action
// ==========================================

export interface OcrImportResult {
	trade: Trade
	executions: TradeExecution[]
	assetFound: boolean
}

/**
 * Create a trade from OCR-extracted data with multiple executions
 */
export const createTradeFromOcr = async (
	input: OcrImportInput
): Promise<ActionResponse<OcrImportResult>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const validated = ocrImportSchema.parse(input)

		// Look up asset configuration
		const assetConfig = await findAsset(
			validated.asset,
			validated.originalContractCode
		)

		// Calculate aggregates from executions
		const entries = validated.executions.filter(
			(e) => e.executionType === "entry"
		)
		const exits = validated.executions.filter((e) => e.executionType === "exit")

		const totalEntryQuantity = entries.reduce((sum, e) => sum + e.quantity, 0)
		const totalExitQuantity = exits.reduce((sum, e) => sum + e.quantity, 0)

		const avgEntryPrice = calculateAvgPrice("entry", validated.executions)
		const avgExitPrice =
			exits.length > 0 ? calculateAvgPrice("exit", validated.executions) : null

		// Sort executions by date to get first entry and last exit dates
		const sortedExecutions = [...validated.executions].sort(
			(a, b) =>
				new Date(a.executionDate).getTime() -
				new Date(b.executionDate).getTime()
		)

		const firstEntry = sortedExecutions.find((e) => e.executionType === "entry")
		const lastExit = [...sortedExecutions]
			.reverse()
			.find((e) => e.executionType === "exit")

		const entryDate = firstEntry
			? new Date(firstEntry.executionDate)
			: validated.entryDate
		const exitDate = lastExit
			? new Date(lastExit.executionDate)
			: validated.exitDate

		// Calculate PnL if we have exits
		let pnl: number | undefined
		let outcome: "win" | "loss" | "breakeven" | undefined

		if (avgExitPrice && totalExitQuantity > 0) {
			let ticksGained: number | null = null
			if (assetConfig) {
				// Use asset-based calculation
				const tickSize = parseFloat(assetConfig.tickSize)
				const tickValue = fromCents(assetConfig.tickValue)

				const result = calculateAssetPnL({
					entryPrice: avgEntryPrice,
					exitPrice: avgExitPrice,
					positionSize: Math.min(totalEntryQuantity, totalExitQuantity),
					direction: validated.direction,
					tickSize,
					tickValue,
					contractsExecuted: totalEntryQuantity + totalExitQuantity,
				})
				pnl = result.netPnl
				ticksGained = result.ticksGained
			} else {
				// Simple calculation
				const priceDiff =
					validated.direction === "long"
						? avgExitPrice - avgEntryPrice
						: avgEntryPrice - avgExitPrice
				pnl = priceDiff * Math.min(totalEntryQuantity, totalExitQuantity)
			}

			const breakevenTicks = await getBreakevenTicks(validated.asset)
			outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })
		}

		// Build pre-trade thoughts with import note
		const importNote = validated.originalContractCode
			? `[Imported from ProfitChart screenshot. Original contract: ${validated.originalContractCode}]`
			: "[Imported from ProfitChart screenshot]"

		const preTradeThoughts = validated.preTradeThoughts
			? `${importNote}\n\n${validated.preTradeThoughts}`
			: importNote

		// Create trade with scaled execution mode
		const [trade] = await db
			.insert(trades)
			.values({
				accountId,
				asset: validated.asset.toUpperCase(),
				direction: validated.direction,
				timeframeId: validated.timeframeId ?? null,
				strategyId: validated.strategyId ?? null,
				entryDate,
				exitDate,
				entryPrice: toNumericString(avgEntryPrice)!,
				exitPrice: toNumericString(avgExitPrice),
				positionSize: toNumericString(totalEntryQuantity)!,
				pnl: pnl !== undefined ? toNumericString(toCents(pnl)) : null,
				outcome,
				preTradeThoughts,
				// Scaled trade fields
				executionMode: "scaled",
				totalEntryQuantity: toNumericString(totalEntryQuantity)!,
				totalExitQuantity: toNumericString(totalExitQuantity)!,
				avgEntryPrice: toNumericString(avgEntryPrice)!,
				avgExitPrice: toNumericString(avgExitPrice),
				remainingQuantity: toNumericString(totalEntryQuantity - totalExitQuantity)!,
				contractsExecuted: toNumericString(totalEntryQuantity + totalExitQuantity)!,
			})
			.returning()

		// Insert all executions
		const executionValues = validated.executions.map((ex) => ({
			tradeId: trade.id,
			executionType: ex.executionType as "entry" | "exit",
			executionDate: new Date(ex.executionDate),
			price: toNumericString(ex.price)!,
			quantity: toNumericString(ex.quantity)!,
			orderType: "market" as const,
			commission: "0",
			fees: "0",
			slippage: "0",
			executionValue: toNumericString(calculateExecutionValue(ex.price, ex.quantity))!,
		}))

		const createdExecutions = await db
			.insert(tradeExecutions)
			.values(executionValues)
			.returning()

		// Revalidate pages
		invalidateTradeData(undefined, userId, accountId)

		return {
			status: "success",
			message: `Trade imported successfully with ${createdExecutions.length} executions`,
			data: {
				trade,
				executions: createdExecutions,
				assetFound: !!assetConfig,
			},
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to import trade from OCR data",
			errors: [
				{
					code: "IMPORT_FAILED",
					detail: toSafeErrorMessage(error, "createTradeFromOcr"),
				},
			],
		}
	}
}

// ==========================================
// Bulk Import (Multiple Trades)
// ==========================================

export interface BulkOcrImportResult {
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

/**
 * Create multiple trades from OCR-extracted data
 */
export const bulkCreateTradesFromOcr = async (
	inputs: OcrImportInput[]
): Promise<ActionResponse<BulkOcrImportResult>> => {
	try {
		const { accountId, userId } = await requireAuth()

		const result: BulkOcrImportResult = {
			successCount: 0,
			failedCount: 0,
			trades: [],
			errors: [],
		}

		// Process each trade
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]

			try {
				const validated = ocrImportSchema.parse(input)

				// Look up asset configuration
				const assetConfig = await findAsset(
					validated.asset,
					validated.originalContractCode
				)

				// Calculate aggregates from executions
				const entries = validated.executions.filter(
					(e) => e.executionType === "entry"
				)
				const exits = validated.executions.filter(
					(e) => e.executionType === "exit"
				)

				const totalEntryQuantity = entries.reduce(
					(sum, e) => sum + e.quantity,
					0
				)
				const totalExitQuantity = exits.reduce((sum, e) => sum + e.quantity, 0)

				const avgEntryPrice = calculateAvgPrice("entry", validated.executions)
				const avgExitPrice =
					exits.length > 0
						? calculateAvgPrice("exit", validated.executions)
						: null

				// Sort executions by date
				const sortedExecutions = [...validated.executions].sort(
					(a, b) =>
						new Date(a.executionDate).getTime() -
						new Date(b.executionDate).getTime()
				)

				const firstEntry = sortedExecutions.find(
					(e) => e.executionType === "entry"
				)
				const lastExit = [...sortedExecutions]
					.reverse()
					.find((e) => e.executionType === "exit")

				const entryDate = firstEntry
					? new Date(firstEntry.executionDate)
					: validated.entryDate
				const exitDate = lastExit
					? new Date(lastExit.executionDate)
					: validated.exitDate

				// Calculate PnL if we have exits
				let pnl: number | undefined
				let outcome: "win" | "loss" | "breakeven" | undefined

				if (avgExitPrice && totalExitQuantity > 0) {
					let ticksGained: number | null = null
					if (assetConfig) {
						const tickSize = parseFloat(assetConfig.tickSize)
						const tickValue = fromCents(assetConfig.tickValue)

						const calcResult = calculateAssetPnL({
							entryPrice: avgEntryPrice,
							exitPrice: avgExitPrice,
							positionSize: Math.min(totalEntryQuantity, totalExitQuantity),
							direction: validated.direction,
							tickSize,
							tickValue,
							contractsExecuted: totalEntryQuantity + totalExitQuantity,
						})
						pnl = calcResult.netPnl
						ticksGained = calcResult.ticksGained
					} else {
						const priceDiff =
							validated.direction === "long"
								? avgExitPrice - avgEntryPrice
								: avgEntryPrice - avgExitPrice
						pnl = priceDiff * Math.min(totalEntryQuantity, totalExitQuantity)
					}

					const breakevenTicks = await getBreakevenTicks(validated.asset)
					outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })
				}

				// Build pre-trade thoughts with import note
				const importNote = validated.originalContractCode
					? `[Imported from ProfitChart screenshot. Original contract: ${validated.originalContractCode}]`
					: "[Imported from ProfitChart screenshot]"

				const preTradeThoughts = validated.preTradeThoughts
					? `${importNote}\n\n${validated.preTradeThoughts}`
					: importNote

				// Create trade
				const [trade] = await db
					.insert(trades)
					.values({
						accountId,
						asset: validated.asset.toUpperCase(),
						direction: validated.direction,
						timeframeId: validated.timeframeId ?? null,
						strategyId: validated.strategyId ?? null,
						entryDate,
						exitDate,
						entryPrice: toNumericString(avgEntryPrice)!,
						exitPrice: toNumericString(avgExitPrice),
						positionSize: toNumericString(totalEntryQuantity)!,
						pnl: pnl !== undefined ? toNumericString(toCents(pnl)) : null,
						outcome,
						preTradeThoughts,
						executionMode: "scaled",
						totalEntryQuantity: toNumericString(totalEntryQuantity)!,
						totalExitQuantity: toNumericString(totalExitQuantity)!,
						avgEntryPrice: toNumericString(avgEntryPrice)!,
						avgExitPrice: toNumericString(avgExitPrice),
						remainingQuantity: toNumericString(
							totalEntryQuantity - totalExitQuantity
						)!,
						contractsExecuted: toNumericString(
							totalEntryQuantity + totalExitQuantity
						)!,
					})
					.returning()

				// Insert executions
				const executionValues = validated.executions.map((ex) => ({
					tradeId: trade.id,
					executionType: ex.executionType as "entry" | "exit",
					executionDate: new Date(ex.executionDate),
					price: toNumericString(ex.price)!,
					quantity: toNumericString(ex.quantity)!,
					orderType: "market" as const,
					commission: "0",
					fees: "0",
					slippage: "0",
					executionValue: toNumericString(calculateExecutionValue(
						ex.price,
						ex.quantity
					))!,
				}))

				const createdExecutions = await db
					.insert(tradeExecutions)
					.values(executionValues)
					.returning()

				result.trades.push({
					trade,
					executions: createdExecutions,
					assetFound: !!assetConfig,
				})
				result.successCount++
			} catch (error) {
				result.failedCount++
				result.errors.push({
					index: i,
					asset: input.asset,
					message: toSafeErrorMessage(error, "bulkCreateTradesFromOcr"),
				})
			}
		}

		// Revalidate pages
		invalidateTradeData(undefined, userId, accountId)

		const message =
			result.failedCount === 0
				? `Successfully imported ${result.successCount} trade(s)`
				: `Imported ${result.successCount} trade(s), ${result.failedCount} failed`

		return {
			status: result.failedCount === inputs.length ? "error" : "success",
			message,
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to import trades from OCR data",
			errors: [
				{
					code: "IMPORT_FAILED",
					detail: toSafeErrorMessage(error, "bulkCreateTradesFromOcr"),
				},
			],
		}
	}
}

/**
 * Validate asset exists in database
 */
export const validateAsset = async (
	symbol: string
): Promise<
	ActionResponse<{ exists: boolean; asset: typeof assets.$inferSelect | null }>
> => {
	try {
		await requireAuth()

		const asset = await db.query.assets.findFirst({
			where: eq(assets.symbol, symbol.toUpperCase()),
		})

		return {
			status: "success",
			message: asset ? "Asset found" : "Asset not found",
			data: {
				exists: !!asset,
				asset: asset ?? null,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to validate asset",
			errors: [
				{
					code: "VALIDATION_FAILED",
					detail: toSafeErrorMessage(error, "validateAsset"),
				},
			],
		}
	}
}

// ==========================================
// Vision OCR (Server-side) - Cascade Handler
// ==========================================

import {
	extractTradesWithCascade,
	getProvidersStatus,
	hasAIVisionProvider,
	type ProviderStatus,
	type TradeExtractionResult,
} from "@/lib/vision"
import { normalizeB3Asset, parseProfitChartOcr } from "@/lib/ocr"
import type {
	OcrParseResult,
	OcrRawResult,
	ParsedTrade,
	ProfitChartSummary,
	ProfitChartExecution,
} from "@/lib/ocr"

/**
 * Get status of all vision providers
 */
export const getVisionProvidersStatus = async (): Promise<
	ActionResponse<{ providers: ProviderStatus[]; hasAI: boolean }>
> => {
	const providers = getProvidersStatus()
	const hasAI = hasAIVisionProvider()

	return {
		status: "success",
		message: hasAI
			? "AI Vision available"
			: "No AI Vision configured - using Tesseract",
		data: { providers, hasAI },
	}
}

/**
 * Check if any AI Vision is available (legacy compatibility)
 */
export const checkVisionAvailability = async (): Promise<
	ActionResponse<{ available: boolean }>
> => {
	const hasAI = hasAIVisionProvider()
	return {
		status: "success",
		message: hasAI
			? "AI Vision available"
			: "No AI Vision - will use Tesseract",
		data: { available: hasAI },
	}
}

/**
 * Convert cascade result to OcrParseResult format
 */
const cascadeResultToParseResult = (
	result: TradeExtractionResult
): OcrParseResult => {
	// If Google Vision returned raw text (no trades), parse it with the OCR parser
	if (
		result.provider === "google" &&
		result.trades.length === 0 &&
		result.rawText
	) {
		const lines = result.rawText.split("\n").filter((l) => l.trim())

		const ocrRawResult: OcrRawResult = {
			text: result.rawText,
			confidence: result.confidence,
			lines,
		}
		const parsed = parseProfitChartOcr(ocrRawResult)
		return parsed
	}

	const trades: ParsedTrade[] = result.trades.map((trade, index) => {
		const assetInfo = normalizeB3Asset(trade.asset)

		const summary: ProfitChartSummary = {
			asset: assetInfo.normalizedSymbol,
			originalContractCode: assetInfo.originalCode,
			openingTime: trade.openingTime,
			closingTime: trade.closingTime,
			totalQuantity: trade.executions.reduce((sum, e) => sum + e.quantity, 0),
			avgBuyPrice: trade.avgBuyPrice,
			avgSellPrice: trade.avgSellPrice,
			direction: null,
		}

		// Determine direction
		const entries = trade.executions.filter((e) => e.type === "entry")
		summary.direction = entries.length > 0 ? "long" : "short"

		const executions: ProfitChartExecution[] = trade.executions.map((e, i) => ({
			time: e.time,
			quantity: e.quantity,
			price: e.price,
			type: e.type,
			rowIndex: i + 1,
		}))

		return {
			id: `trade-${result.provider}-${index}`,
			summary,
			executions,
		}
	})

	const firstTrade = trades[0]

	return {
		success: trades.length > 0,
		summary: firstTrade?.summary ?? null,
		executions: firstTrade?.executions ?? [],
		trades,
		rawText: result.rawText,
		confidence: result.confidence,
		columnDetection: {
			columns: [],
			missingRequired: [],
			hasAllRequired: true,
		},
		errors: [],
		warnings: [],
	}
}

/**
 * Extract trade data from image using cascade (OpenAI → Google → Claude → Groq → Tesseract)
 */
export const extractTradesWithVision = async (
	imageBase64: string,
	mimeType: string = "image/png"
): Promise<ActionResponse<OcrParseResult & { provider: string }>> => {
	try {
		await requireAuth()

		if (!hasAIVisionProvider()) {
			return {
				status: "error",
				message:
					"No AI Vision provider configured. Add API keys to .env (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY)",
				errors: [
					{
						code: "NO_VISION_PROVIDER",
						detail: "Configure at least one AI vision provider",
					},
				],
			}
		}

		const result = await extractTradesWithCascade(imageBase64, mimeType)

		if (result.trades.length === 0 && result.provider === "tesseract") {
			return {
				status: "error",
				message: "AI extraction failed, falling back to Tesseract",
				errors: [
					{ code: "AI_EXTRACTION_FAILED", detail: "All AI providers failed" },
				],
			}
		}

		const parseResult = cascadeResultToParseResult(result)

		return {
			status: "success",
			message: `Extracted ${result.trades.length} trade(s) via ${result.provider} with ${result.confidence.toFixed(0)}% confidence`,
			data: { ...parseResult, provider: result.provider },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to extract trades from image",
			errors: [
				{
					code: "VISION_FAILED",
					detail: toSafeErrorMessage(error, "extractTradesWithVision"),
				},
			],
		}
	}
}
