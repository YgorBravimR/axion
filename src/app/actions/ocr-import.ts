"use server"

import { getTranslations } from "next-intl/server"
import { invalidateTradeData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions, assets } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type {
	ProcessedOcrTrade,
	OcrImportResult,
	BulkOcrImportResult,
} from "./ocr-import.types"
import { eq } from "drizzle-orm"
import { calculateAssetPnL, determineOutcome } from "@/lib/calculations"
import { fromCents, toCents, toNumericString } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getBreakevenTicks } from "@/app/actions/accounts"
import { getRegisteredAssetSymbols } from "@/app/actions/assets"
import { resolveTradeAsset } from "@/lib/asset-resolution"
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
	if (filtered.length === 0) {
		return 0
	}

	let totalValue = 0
	let totalQty = 0
	for (const ex of filtered) {
		totalValue += ex.price * ex.quantity
		totalQty += ex.quantity
	}

	return totalQty > 0 ? totalValue / totalQty : 0
}

/**
 * Find asset by symbol using centralized resolution, with fallback to original code.
 */
const findAsset = async (
	symbol: string,
	originalCode?: string,
	registeredSymbols?: Set<string>
) => {
	const symbols = registeredSymbols ?? (await getRegisteredAssetSymbols())
	const resolved = resolveTradeAsset(symbol, symbols)

	const asset = await db.query.assets.findFirst({
		where: eq(assets.symbol, resolved.symbol),
	})
	if (asset) {
		return asset
	}

	// Fallback: try original code if different from resolved symbol
	if (originalCode && originalCode.toUpperCase() !== resolved.symbol) {
		return (
			(await db.query.assets.findFirst({
				where: eq(assets.symbol, originalCode.toUpperCase()),
			})) ?? null
		)
	}

	return null
}

// ==========================================
// Shared Trade Processing
// ==========================================

/**
 * Processes a single validated OCR trade: resolves asset, calculates P&L, inserts into DB.
 * Shared between single and bulk import to eliminate duplication.
 */
const processOcrTrade = async (
	validated: z.output<typeof ocrImportSchema>,
	accountId: string,
	registeredSymbols: Set<string>
): Promise<ProcessedOcrTrade> => {
	// Resolve asset symbol to canonical form (e.g., WING26 -> WIN)
	const resolved = resolveTradeAsset(validated.asset, registeredSymbols)
	const assetSymbol = resolved.symbol

	// Look up asset configuration
	const assetConfig = await findAsset(
		assetSymbol,
		validated.originalContractCode,
		registeredSymbols
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
			new Date(a.executionDate).getTime() - new Date(b.executionDate).getTime()
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
			const priceDiff =
				validated.direction === "long"
					? avgExitPrice - avgEntryPrice
					: avgEntryPrice - avgExitPrice
			pnl = priceDiff * Math.min(totalEntryQuantity, totalExitQuantity)
		}

		const breakevenTicks = await getBreakevenTicks(assetSymbol)
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
			asset: assetSymbol.toUpperCase(),
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

	if (!trade) {
		throw new Error("Failed to insert trade")
	}

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
		executionValue: toNumericString(
			calculateExecutionValue(ex.price, ex.quantity)
		)!,
	}))

	const createdExecutions = await db
		.insert(tradeExecutions)
		.values(executionValues)
		.returning()

	return {
		trade,
		executions: createdExecutions,
		assetFound: !!assetConfig,
	}
}

// ==========================================
// Main Import Action
// ==========================================

/**
 * Create a trade from OCR-extracted data with multiple executions
 */
export const createTradeFromOcr = async (
	input: z.input<typeof ocrImportSchema>
): Promise<ActionResponse<OcrImportResult>> => {
	const tImports = await getTranslations("imports.messages")
	try {
		const { accountId, userId } = await requireAuth()
		const validated = ocrImportSchema.parse(input)

		const registeredSymbols = await getRegisteredAssetSymbols()
		const result = await processOcrTrade(
			validated,
			accountId,
			registeredSymbols
		)

		// Revalidate pages
		invalidateTradeData(undefined, userId, accountId)

		return {
			status: "success",
			message: tImports("tradeImportedWithExecutions", {
				count: result.executions.length,
			}),
			data: result,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: tImports("validationFailed"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: tImports("failedToImportTradeFromOcr"),
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

/**
 * Create multiple trades from OCR-extracted data
 */
export const bulkCreateTradesFromOcr = async (
	inputs: z.input<typeof ocrImportSchema>[]
): Promise<ActionResponse<BulkOcrImportResult>> => {
	const t = await getTranslations("imports.ocr")
	try {
		const { accountId, userId } = await requireAuth()

		const result: BulkOcrImportResult = {
			successCount: 0,
			failedCount: 0,
			trades: [],
			errors: [],
		}

		// Load registered symbols once for all trades
		const registeredSymbols = await getRegisteredAssetSymbols()

		for (const [i, inputItem] of inputs.entries()) {
			try {
				const validated = ocrImportSchema.parse(inputItem)
				// eslint-disable-next-line no-await-in-loop -- per-trade OCR import; sequential for per-trade error isolation in try/catch
				const processed = await processOcrTrade(
					validated,
					accountId,
					registeredSymbols
				)

				result.trades.push(processed)
				result.successCount++
			} catch (error) {
				result.failedCount++
				result.errors.push({
					index: i,
					asset: inputItem.asset,
					message: toSafeErrorMessage(error, "bulkCreateTradesFromOcr"),
				})
			}
		}

		// Revalidate pages
		invalidateTradeData(undefined, userId, accountId)

		const message =
			result.failedCount === 0
				? t("bulkSuccess", { count: result.successCount })
				: t("bulkPartial", {
						success: result.successCount,
						failed: result.failedCount,
					})

		return {
			status: result.failedCount === inputs.length ? "error" : "success",
			message,
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("bulkError"),
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
	const tImports = await getTranslations("imports.messages")
	try {
		await requireAuth()

		const asset = await db.query.assets.findFirst({
			where: eq(assets.symbol, symbol.toUpperCase()),
		})

		return {
			status: "success",
			message: asset ? tImports("assetFound") : tImports("assetNotFound"),
			data: {
				exists: !!asset,
				asset: asset ?? null,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: tImports("failedToValidateAsset"),
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
	const tImports = await getTranslations("imports.messages")
	const providers = getProvidersStatus()
	const hasAI = hasAIVisionProvider()

	return {
		status: "success",
		message: hasAI
			? tImports("aiVisionAvailable")
			: tImports("noAiVisionUsingTesseract"),
		data: { providers, hasAI },
	}
}

/**
 * Check if any AI Vision is available (legacy compatibility)
 */
export const checkVisionAvailability = async (): Promise<
	ActionResponse<{ available: boolean }>
> => {
	const tImports = await getTranslations("imports.messages")
	const hasAI = hasAIVisionProvider()
	return {
		status: "success",
		message: hasAI
			? tImports("aiVisionAvailable")
			: tImports("noAiVisionUsingTesseract"),
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
	const tImports = await getTranslations("imports.messages")
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
				message: tImports("aiExtractionFailedFallingBackToTesseract"),
				errors: [
					{ code: "AI_EXTRACTION_FAILED", detail: "All AI providers failed" },
				],
			}
		}

		const parseResult = cascadeResultToParseResult(result)

		return {
			status: "success",
			message: tImports("extractedTradesViaCascade", {
				count: result.trades.length,
				provider: result.provider,
				confidence: result.confidence.toFixed(0),
			}),
			data: { ...parseResult, provider: result.provider },
		}
	} catch (error) {
		return {
			status: "error",
			message: tImports("failedToExtractTradesFromImage"),
			errors: [
				{
					code: "VISION_FAILED",
					detail: toSafeErrorMessage(error, "extractTradesWithVision"),
				},
			],
		}
	}
}
