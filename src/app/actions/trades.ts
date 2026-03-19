"use server"

import { revalidatePath } from "next/cache"
import { getLocale } from "next-intl/server"
import { db } from "@/db/drizzle"
import {
	trades,
	tradeTags,
	tags,
	strategies,
	timeframes,
	tradeExecutions,
} from "@/db/schema"
import type { Trade, TradeExecution } from "@/db/schema"
import type {
	ActionResponse,
	PaginatedResponse,
	TradesByDay,
	DayTradeCompact,
	DaySummary,
} from "@/types"
import {
	createTradeSchema,
	updateTradeSchema,
	tradeFiltersSchema,
	paginationSchema,
	type CreateTradeInput,
	type UpdateTradeInput,
	type TradeFilters,
	type PaginationParams,
} from "@/lib/validations/trade"
import type { CsvTradeInput } from "@/lib/csv-parser"
import { eq, and, gte, lte, inArray, desc, asc, count, sql } from "drizzle-orm"
import {
	calculatePnL,
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import { getAssetBySymbol } from "./assets"
import { getAssetFees, getBreakevenTicks } from "./accounts"
import { fromCents, toCents, toNumericString } from "@/lib/money"
import {
	getStartOfDay,
	getEndOfDay,
	formatDateKey,
	APP_TIMEZONE,
} from "@/lib/dates"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import {
	getUserDek,
	encryptTradeFields,
	decryptTradeFields,
} from "@/lib/user-crypto"
import { computeTradeHash } from "@/lib/deduplication"

// Type for trade with relations
export interface TradeWithRelations extends Trade {
	strategy?: typeof strategies.$inferSelect | null
	timeframe?: typeof timeframes.$inferSelect | null
	tradeTags?: Array<{
		tag: typeof tags.$inferSelect
	}>
	executions?: TradeExecution[]
}

/**
 * Create a new trade
 */
export const createTrade = async (
	input: CreateTradeInput
): Promise<ActionResponse<Trade>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const validated = createTradeSchema.parse(input)
		const { tagIds, ...tradeData } = validated

		// Calculate derived fields if we have exit data
		let pnl = tradeData.pnl
		let outcome: "win" | "loss" | "breakeven" | undefined
		let realizedR = tradeData.realizedRMultiple

		// Calculate plannedRiskAmount: use manual riskAmount if provided, otherwise calculate from stopLoss
		let plannedRiskAmount: number | undefined
		let plannedRMultiple: number | undefined

		// Look up asset configuration early for risk calculation
		const assetConfigForRisk = await getAssetBySymbol(tradeData.asset)

		if (tradeData.riskAmount) {
			// Use manual risk amount if provided
			plannedRiskAmount = tradeData.riskAmount
		} else if (tradeData.stopLoss) {
			// Calculate from stop loss using asset-based or simple calculation
			const priceDiff = Math.abs(tradeData.entryPrice - tradeData.stopLoss)

			if (assetConfigForRisk) {
				const tickSize = parseFloat(assetConfigForRisk.tickSize)
				const tickValue = fromCents(assetConfigForRisk.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				plannedRiskAmount = ticksAtRisk * tickValue * tradeData.positionSize
			} else {
				plannedRiskAmount = priceDiff * tradeData.positionSize
			}
		}

		// Calculate plannedRMultiple from take profit (reward/risk ratio) - only if we have stopLoss
		if (tradeData.stopLoss && tradeData.takeProfit) {
			const riskPerUnit =
				tradeData.direction === "long"
					? tradeData.entryPrice - tradeData.stopLoss
					: tradeData.stopLoss - tradeData.entryPrice
			if (riskPerUnit !== 0) {
				const rewardPerUnit =
					tradeData.direction === "long"
						? tradeData.takeProfit - tradeData.entryPrice
						: tradeData.entryPrice - tradeData.takeProfit
				plannedRMultiple = Math.abs(rewardPerUnit / riskPerUnit)
			}
		}

		let ticksGained: number | null = null

		if (tradeData.exitPrice) {
			// Always recalculate P&L from prices — any provided pnl is unreliable
			const assetConfig = await getAssetBySymbol(tradeData.asset)

			if (assetConfig) {
				// Use asset-based calculation with tick size and tick value
				const result = calculateAssetPnL({
					entryPrice: tradeData.entryPrice,
					exitPrice: tradeData.exitPrice,
					positionSize: tradeData.positionSize,
					direction: tradeData.direction,
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: fromCents(assetConfig.tickValue),
					contractsExecuted:
						tradeData.contractsExecuted ?? tradeData.positionSize * 2,
				})
				pnl = result.netPnl
				ticksGained = result.ticksGained
			} else if (!pnl) {
				// Fallback to simple price-based calculation only when no pnl exists
				pnl = calculatePnL({
					direction: tradeData.direction,
					entryPrice: tradeData.entryPrice,
					exitPrice: tradeData.exitPrice,
					positionSize: tradeData.positionSize,
				})
			}
		}

		if (pnl !== undefined) {
			const breakevenTicks = await getBreakevenTicks(tradeData.asset, accountId)
			outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })
		}

		if (pnl !== undefined && plannedRiskAmount && plannedRiskAmount > 0) {
			realizedR = calculateRMultiple(pnl, plannedRiskAmount)
		}

		// Compute dedup hash from plaintext values before encryption
		const deduplicationHash = computeTradeHash({
			accountId,
			asset: tradeData.asset.toUpperCase(),
			direction: tradeData.direction,
			entryDate: tradeData.entryDate,
			entryPrice: tradeData.entryPrice,
			exitPrice: tradeData.exitPrice,
			positionSize: tradeData.positionSize,
		})

		// Insert trade - money fields (pnl, plannedRiskAmount) stored as cents in text columns
		const insertValues: Record<string, unknown> = {
			accountId,
			asset: tradeData.asset,
			direction: tradeData.direction,
			timeframeId: tradeData.timeframeId || null,
			entryDate: tradeData.entryDate,
			exitDate: tradeData.exitDate,
			entryPrice: toNumericString(tradeData.entryPrice),
			exitPrice: toNumericString(tradeData.exitPrice),
			positionSize: toNumericString(tradeData.positionSize),
			stopLoss: toNumericString(tradeData.stopLoss),
			takeProfit: toNumericString(tradeData.takeProfit),
			plannedRiskAmount:
				plannedRiskAmount !== undefined
					? toNumericString(toCents(plannedRiskAmount))
					: null,
			plannedRMultiple: toNumericString(plannedRMultiple),
			pnl: pnl !== undefined ? toNumericString(toCents(pnl)) : null,
			outcome,
			realizedRMultiple: toNumericString(realizedR),
			mfe: toNumericString(tradeData.mfe),
			mae: toNumericString(tradeData.mae),
			// contractsExecuted defaults to positionSize * 2 (entry + exit) if not provided
			contractsExecuted: toNumericString(
				tradeData.contractsExecuted ?? tradeData.positionSize * 2
			),
			deduplicationHash,
			followedPlan: tradeData.followedPlan,
			strategyId: tradeData.strategyId || null,
			preTradeThoughts: tradeData.preTradeThoughts,
			postTradeReflection: tradeData.postTradeReflection,
			lessonLearned: tradeData.lessonLearned,
			disciplineNotes: tradeData.disciplineNotes,
			setupRank: tradeData.setupRank || null,
			screenshotUrl: tradeData.screenshotUrl || null,
			screenshotS3Key: tradeData.screenshotS3Key || null,
		}

		// Encrypt sensitive fields if user has a DEK
		const dek = await getUserDek(userId)
		if (dek) {
			Object.assign(
				insertValues,
				encryptTradeFields(
					{
						pnl: pnl !== undefined ? toCents(pnl) : null,
						plannedRiskAmount:
							plannedRiskAmount !== undefined
								? toCents(plannedRiskAmount)
								: null,
						commission: undefined,
						fees: undefined,
						entryPrice: toNumericString(tradeData.entryPrice),
						exitPrice: toNumericString(tradeData.exitPrice),
						positionSize: toNumericString(tradeData.positionSize),
						stopLoss: toNumericString(tradeData.stopLoss),
						takeProfit: toNumericString(tradeData.takeProfit),
						plannedRMultiple: toNumericString(plannedRMultiple),
						preTradeThoughts: tradeData.preTradeThoughts,
						postTradeReflection: tradeData.postTradeReflection,
						lessonLearned: tradeData.lessonLearned,
						disciplineNotes: tradeData.disciplineNotes,
					},
					dek
				)
			)
		}

		const [trade] = await db
			.insert(trades)
			.values(insertValues as typeof trades.$inferInsert)
			.returning()

		// Insert tag associations
		if (tagIds?.length) {
			await db.insert(tradeTags).values(
				tagIds.map((tagId) => ({
					tradeId: trade.id,
					tagId,
				}))
			)
		}

		// Revalidate journal pages
		revalidatePath("/journal")

		return {
			status: "success",
			message: "Trade created successfully",
			data: trade,
		}
	} catch (error) {
		if (error instanceof Error && error.name === "ZodError") {
			return {
				status: "error",
				message: "Validation failed",
				errors: [{ code: "VALIDATION_ERROR", detail: error.message }],
			}
		}

		return {
			status: "error",
			message: "Failed to create trade",
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "createTrade"),
				},
			],
		}
	}
}

/**
 * Update an existing trade
 */
export const updateTrade = async (
	id: string,
	input: UpdateTradeInput
): Promise<ActionResponse<Trade>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const validated = updateTradeSchema.parse(input)
		const { tagIds, ...tradeData } = validated

		// Get existing trade to merge data (verify ownership)
		let existing = await db.query.trades.findFirst({
			where: and(eq(trades.id, id), eq(trades.accountId, accountId)),
		})

		if (!existing) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		// Decrypt existing trade fields before merging
		const dek = await getUserDek(userId)
		if (dek) {
			existing = decryptTradeFields(existing, dek)
		}

		// Merge existing data with updates
		const exitPrice =
			tradeData.exitPrice ??
			(existing.exitPrice ? Number(existing.exitPrice) : undefined)
		const entryPrice = tradeData.entryPrice ?? Number(existing.entryPrice)
		const positionSize = tradeData.positionSize ?? Number(existing.positionSize)
		const direction = tradeData.direction ?? existing.direction
		const stopLoss =
			tradeData.stopLoss ??
			(existing.stopLoss ? Number(existing.stopLoss) : undefined)
		const takeProfit =
			tradeData.takeProfit ??
			(existing.takeProfit ? Number(existing.takeProfit) : undefined)
		const riskAmount =
			tradeData.riskAmount ??
			(existing.plannedRiskAmount
				? Number(existing.plannedRiskAmount) / 100
				: undefined)

		// Calculate plannedRiskAmount: use manual riskAmount if provided, otherwise calculate from stopLoss
		let plannedRiskAmount: number | undefined
		let plannedRMultiple: number | undefined

		// Look up asset configuration for risk calculation
		const assetSymbol = tradeData.asset ?? existing.asset
		const assetConfigForRisk = await getAssetBySymbol(assetSymbol)

		if (riskAmount) {
			// Use manual risk amount if provided
			plannedRiskAmount = riskAmount
		} else if (stopLoss) {
			// Calculate from stop loss using asset-based or simple calculation
			const priceDiff = Math.abs(entryPrice - stopLoss)

			if (assetConfigForRisk) {
				const tickSize = parseFloat(assetConfigForRisk.tickSize)
				const tickValue = fromCents(assetConfigForRisk.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				plannedRiskAmount = ticksAtRisk * tickValue * positionSize
			} else {
				plannedRiskAmount = priceDiff * positionSize
			}
		}

		// Calculate plannedRMultiple from take profit (reward/risk ratio) - only if we have stopLoss
		if (stopLoss && takeProfit) {
			const riskPerUnit =
				direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice
			if (riskPerUnit !== 0) {
				const rewardPerUnit =
					direction === "long"
						? takeProfit - entryPrice
						: entryPrice - takeProfit
				plannedRMultiple = Math.abs(rewardPerUnit / riskPerUnit)
			}
		}

		// Always recalculate derived fields when we have exit data
		let pnl: number | undefined
		let outcome: "win" | "loss" | "breakeven" | null = null
		let realizedR: number | undefined

		if (exitPrice) {
			// Look up asset for tick-based calculation (reusing assetSymbol from above)
			const assetConfig = await getAssetBySymbol(assetSymbol)
			let ticksGained: number | null = null

			if (assetConfig) {
				// Use asset-based calculation with tick size and tick value
				const result = calculateAssetPnL({
					entryPrice,
					exitPrice,
					positionSize,
					direction,
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: fromCents(assetConfig.tickValue),
					contractsExecuted:
						tradeData.contractsExecuted ??
						(existing.contractsExecuted
							? Number(existing.contractsExecuted)
							: positionSize * 2),
				})
				pnl = result.netPnl
				ticksGained = result.ticksGained
			} else {
				// Fallback to simple price-based calculation
				pnl = calculatePnL({
					direction,
					entryPrice,
					exitPrice,
					positionSize,
				})
			}
			const breakevenTicks = await getBreakevenTicks(assetSymbol, accountId)
			outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })

			if (plannedRiskAmount && plannedRiskAmount > 0) {
				realizedR = calculateRMultiple(pnl, plannedRiskAmount)
			}
		}

		// Update trade - convert numeric fields to strings for Drizzle
		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		}

		// Only include fields that were provided
		if (tradeData.asset !== undefined) updateData.asset = tradeData.asset
		if (tradeData.direction !== undefined)
			updateData.direction = tradeData.direction
		if (tradeData.timeframeId !== undefined)
			updateData.timeframeId = tradeData.timeframeId || null
		if (tradeData.entryDate !== undefined)
			updateData.entryDate = tradeData.entryDate
		if (tradeData.exitDate !== undefined)
			updateData.exitDate = tradeData.exitDate
		if (tradeData.entryPrice !== undefined)
			updateData.entryPrice = toNumericString(tradeData.entryPrice)
		if (tradeData.exitPrice !== undefined)
			updateData.exitPrice = toNumericString(tradeData.exitPrice)
		if (tradeData.positionSize !== undefined)
			updateData.positionSize = toNumericString(tradeData.positionSize)
		if (tradeData.stopLoss !== undefined)
			updateData.stopLoss = toNumericString(tradeData.stopLoss)
		if (tradeData.takeProfit !== undefined)
			updateData.takeProfit = toNumericString(tradeData.takeProfit)
		// Always update calculated risk values (derived from SL/TP)
		if (plannedRiskAmount !== undefined)
			updateData.plannedRiskAmount = toNumericString(plannedRiskAmount)
		if (plannedRMultiple !== undefined)
			updateData.plannedRMultiple = toNumericString(plannedRMultiple)
		if (tradeData.mfe !== undefined)
			updateData.mfe = toNumericString(tradeData.mfe)
		if (tradeData.mae !== undefined)
			updateData.mae = toNumericString(tradeData.mae)
		if (tradeData.contractsExecuted !== undefined)
			updateData.contractsExecuted = toNumericString(
				tradeData.contractsExecuted
			)
		if (tradeData.followedPlan !== undefined)
			updateData.followedPlan = tradeData.followedPlan
		if (tradeData.strategyId !== undefined)
			updateData.strategyId = tradeData.strategyId
		if (tradeData.preTradeThoughts !== undefined)
			updateData.preTradeThoughts = tradeData.preTradeThoughts
		if (tradeData.postTradeReflection !== undefined)
			updateData.postTradeReflection = tradeData.postTradeReflection
		if (tradeData.lessonLearned !== undefined)
			updateData.lessonLearned = tradeData.lessonLearned
		if (tradeData.disciplineNotes !== undefined)
			updateData.disciplineNotes = tradeData.disciplineNotes
		if (tradeData.setupRank !== undefined)
			updateData.setupRank = tradeData.setupRank || null
		if (tradeData.screenshotUrl !== undefined)
			updateData.screenshotUrl = tradeData.screenshotUrl || null
		if (tradeData.screenshotS3Key !== undefined)
			updateData.screenshotS3Key = tradeData.screenshotS3Key || null

		// Always include calculated fields when we have exit data
		// Money fields (pnl, plannedRiskAmount) stored as cents in text columns
		if (exitPrice) {
			updateData.pnl = pnl !== undefined ? toNumericString(toCents(pnl)) : null
			updateData.outcome = outcome
			updateData.realizedRMultiple = toNumericString(realizedR) ?? null
		}
		if (plannedRiskAmount !== undefined) {
			updateData.plannedRiskAmount = toNumericString(toCents(plannedRiskAmount))
		}

		// Encrypt sensitive fields if user has a DEK
		if (dek) {
			const fieldsToEncrypt: Record<string, unknown> = {}
			if (updateData.pnl !== undefined)
				fieldsToEncrypt.pnl = pnl !== undefined ? toCents(pnl) : null
			if (updateData.plannedRiskAmount !== undefined)
				fieldsToEncrypt.plannedRiskAmount =
					plannedRiskAmount !== undefined ? toCents(plannedRiskAmount) : null
			if (updateData.entryPrice !== undefined)
				fieldsToEncrypt.entryPrice = updateData.entryPrice
			if (updateData.exitPrice !== undefined)
				fieldsToEncrypt.exitPrice = updateData.exitPrice
			if (updateData.positionSize !== undefined)
				fieldsToEncrypt.positionSize = updateData.positionSize
			if (updateData.stopLoss !== undefined)
				fieldsToEncrypt.stopLoss = updateData.stopLoss
			if (updateData.takeProfit !== undefined)
				fieldsToEncrypt.takeProfit = updateData.takeProfit
			if (updateData.plannedRMultiple !== undefined)
				fieldsToEncrypt.plannedRMultiple = updateData.plannedRMultiple
			if (updateData.preTradeThoughts !== undefined)
				fieldsToEncrypt.preTradeThoughts = updateData.preTradeThoughts
			if (updateData.postTradeReflection !== undefined)
				fieldsToEncrypt.postTradeReflection = updateData.postTradeReflection
			if (updateData.lessonLearned !== undefined)
				fieldsToEncrypt.lessonLearned = updateData.lessonLearned
			if (updateData.disciplineNotes !== undefined)
				fieldsToEncrypt.disciplineNotes = updateData.disciplineNotes
			Object.assign(
				updateData,
				encryptTradeFields(
					fieldsToEncrypt as Parameters<typeof encryptTradeFields>[0],
					dek
				)
			)
		}

		const [trade] = await db
			.update(trades)
			.set(updateData)
			.where(and(eq(trades.id, id), eq(trades.accountId, accountId)))
			.returning()

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or does not belong to this account",
					},
				],
			}
		}

		// Update tag associations if provided
		if (tagIds !== undefined) {
			// Remove existing tags
			await db.delete(tradeTags).where(eq(tradeTags.tradeId, id))

			// Insert new tags
			if (tagIds.length) {
				await db.insert(tradeTags).values(
					tagIds.map((tagId) => ({
						tradeId: id,
						tagId,
					}))
				)
			}
		}

		// Revalidate journal pages
		revalidatePath("/journal")
		revalidatePath(`/journal/${id}`)

		return {
			status: "success",
			message: "Trade updated successfully",
			data: trade,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to update trade",
			errors: [
				{
					code: "UPDATE_FAILED",
					detail: toSafeErrorMessage(error, "updateTrade"),
				},
			],
		}
	}
}

/**
 * Delete (archive) a trade
 */
export const deleteTrade = async (
	id: string
): Promise<ActionResponse<void>> => {
	try {
		const { accountId } = await requireAuth()
		const existing = await db.query.trades.findFirst({
			where: and(eq(trades.id, id), eq(trades.accountId, accountId)),
		})

		if (!existing) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		await db
			.update(trades)
			.set({ isArchived: true, updatedAt: new Date() })
			.where(and(eq(trades.id, id), eq(trades.accountId, accountId)))

		// Revalidate journal pages
		revalidatePath("/journal")

		return {
			status: "success",
			message: "Trade archived successfully",
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to archive trade",
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteTrade"),
				},
			],
		}
	}
}

/**
 * Get a single trade by ID with relations
 */
export const getTrade = async (
	id: string
): Promise<ActionResponse<TradeWithRelations>> => {
	try {
		const { accountId, userId } = await requireAuth()
		let trade = await db.query.trades.findFirst({
			where: and(
				eq(trades.id, id),
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false)
			),
			with: {
				strategy: true,
				timeframe: true,
				tradeTags: {
					with: {
						tag: true,
					},
				},
				executions: true,
			},
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		if (dek) {
			trade = decryptTradeFields(trade, dek)
		}

		return {
			status: "success",
			message: "Trade retrieved successfully",
			data: trade,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve trade",
			errors: [
				{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getTrade") },
			],
		}
	}
}

/**
 * Get paginated list of trades with filters
 */
export const getTrades = async (
	filters?: TradeFilters,
	pagination?: PaginationParams
): Promise<ActionResponse<PaginatedResponse<TradeWithRelations>>> => {
	try {
		const { accountId, userId, showAllAccounts, allAccountIds } =
			await requireAuth()
		const validatedFilters = filters ? tradeFiltersSchema.parse(filters) : {}
		const validatedPagination = pagination
			? paginationSchema.parse(pagination)
			: paginationSchema.parse({})

		const { limit, offset, sortBy, sortOrder } = validatedPagination

		// Build where conditions - filter by current account or all accounts based on setting
		const accountCondition = showAllAccounts
			? inArray(trades.accountId, allAccountIds)
			: eq(trades.accountId, accountId)
		const conditions = [accountCondition, eq(trades.isArchived, false)]

		if (validatedFilters.dateFrom) {
			conditions.push(gte(trades.entryDate, validatedFilters.dateFrom))
		}
		if (validatedFilters.dateTo) {
			conditions.push(lte(trades.entryDate, validatedFilters.dateTo))
		}
		if (validatedFilters.assets?.length) {
			conditions.push(inArray(trades.asset, validatedFilters.assets))
		}
		if (validatedFilters.directions?.length) {
			conditions.push(inArray(trades.direction, validatedFilters.directions))
		}
		if (validatedFilters.outcomes?.length) {
			conditions.push(inArray(trades.outcome, validatedFilters.outcomes))
		}
		if (validatedFilters.strategyIds?.length) {
			conditions.push(inArray(trades.strategyId, validatedFilters.strategyIds))
		}
		if (validatedFilters.timeframeIds?.length) {
			conditions.push(
				inArray(trades.timeframeId, validatedFilters.timeframeIds)
			)
		}

		// Handle tag filtering with subquery
		if (validatedFilters.tagIds?.length) {
			const tradesWithTags = db
				.select({ tradeId: tradeTags.tradeId })
				.from(tradeTags)
				.where(inArray(tradeTags.tagId, validatedFilters.tagIds))

			conditions.push(inArray(trades.id, tradesWithTags))
		}

		const whereClause = and(...conditions)

		// Get sort column
		const sortColumn = trades[sortBy]
		const orderFn = sortOrder === "desc" ? desc : asc

		// Execute queries
		const [result, countResult] = await Promise.all([
			db.query.trades.findMany({
				where: whereClause,
				with: {
					strategy: true,
					timeframe: true,
					tradeTags: {
						with: {
							tag: true,
						},
					},
				},
				orderBy: [orderFn(sortColumn)],
				limit,
				offset,
			}),
			db.select({ count: count() }).from(trades).where(whereClause),
		])

		const total = countResult[0]?.count ?? 0

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		const decryptedResult = dek
			? result.map((t) => decryptTradeFields(t, dek))
			: result

		return {
			status: "success",
			message: "Trades retrieved successfully",
			data: {
				items: decryptedResult,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + result.length < total,
				},
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve trades",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getTrades"),
				},
			],
		}
	}
}

/**
 * Get trades for a specific date (for calendar)
 */
export const getTradesForDate = async (
	date: Date
): Promise<ActionResponse<Trade[]>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const startOfDay = getStartOfDay(date)
		const endOfDay = getEndOfDay(date)

		const result = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				gte(trades.entryDate, startOfDay),
				lte(trades.entryDate, endOfDay)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		const decryptedResult = dek
			? result.map((t) => decryptTradeFields(t, dek))
			: result

		return {
			status: "success",
			message: "Trades retrieved successfully",
			data: decryptedResult,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve trades",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getTradesForDate"),
				},
			],
		}
	}
}

/**
 * Get unique assets from all trades (for filter dropdowns)
 */
export const getUniqueAssets = async (): Promise<ActionResponse<string[]>> => {
	try {
		const { accountId } = await requireAuth()
		const result = await db
			.selectDistinct({ asset: trades.asset })
			.from(trades)
			.where(and(eq(trades.accountId, accountId), eq(trades.isArchived, false)))
			.orderBy(asc(trades.asset))

		return {
			status: "success",
			message: "Assets retrieved successfully",
			data: result.map((r) => r.asset),
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve assets",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getUniqueAssets"),
				},
			],
		}
	}
}

/**
 * Bulk create trades from CSV import
 */
export interface BulkCreateResult {
	successCount: number
	failedCount: number
	errors: Array<{
		index: number
		message: string
	}>
}

export const bulkCreateTrades = async (
	inputs: CsvTradeInput[]
): Promise<ActionResponse<BulkCreateResult>> => {
	const result: BulkCreateResult = {
		successCount: 0,
		failedCount: 0,
		errors: [],
	}

	try {
		const { accountId, userId } = await requireAuth()
		// Collect all unique strategy codes from the inputs
		const strategyCodes = [
			...new Set(
				inputs
					.map((i) => i.strategyCode)
					.filter((code): code is string => !!code)
			),
		]

		// Look up strategies by code (scoped to current user)
		const strategyMap = new Map<string, string>()
		if (strategyCodes.length > 0) {
			const foundStrategies = await db.query.strategies.findMany({
				where: and(
					inArray(strategies.code, strategyCodes),
					eq(strategies.userId, userId)
				),
			})
			for (const strategy of foundStrategies) {
				strategyMap.set(strategy.code, strategy.id)
			}

			// Second pass: try matching unmatched codes by name (case-insensitive)
			const unmatchedCodes = strategyCodes.filter(
				(code) => !strategyMap.has(code)
			)
			if (unmatchedCodes.length > 0) {
				const allStrategies = await db.query.strategies.findMany({
					where: eq(strategies.userId, userId),
				})
				for (const strategy of allStrategies) {
					for (const code of unmatchedCodes) {
						if (
							strategy.name.toLowerCase() === code.toLowerCase() ||
							strategy.code.toLowerCase() === code.toLowerCase()
						) {
							strategyMap.set(code, strategy.id)
						}
					}
				}
			}
		}

		// Collect all unique timeframe codes from the inputs
		const timeframeCodes = [
			...new Set(
				inputs
					.map((i) => i.timeframeCode)
					.filter((code): code is string => !!code)
			),
		]

		// Look up timeframes by code or name (case-insensitive)
		const timeframeMap = new Map<string, string>()
		if (timeframeCodes.length > 0) {
			const allTimeframes = await db.query.timeframes.findMany()
			for (const tf of allTimeframes) {
				for (const code of timeframeCodes) {
					if (
						tf.code.toLowerCase() === code.toLowerCase() ||
						tf.name.toLowerCase() === code.toLowerCase()
					) {
						timeframeMap.set(code, tf.id)
					}
				}
			}
		}

		// Collect all unique tag names from CSV inputs and build lookup map
		const allTagNames = [
			...new Set(
				inputs
					.flatMap((i) => i.tagNames || [])
					.map((name) => name.toLowerCase())
			),
		]

		const tagNameMap = new Map<string, string>() // lowercase name → tag ID
		if (allTagNames.length > 0) {
			const userTags = await db.query.tags.findMany({
				where: eq(tags.userId, userId),
			})
			for (const tag of userTags) {
				if (allTagNames.includes(tag.name.toLowerCase())) {
					tagNameMap.set(tag.name.toLowerCase(), tag.id)
				}
			}
		}

		// Collect unique asset symbols and look them up (including fees and breakeven ticks)
		const assetSymbols = [...new Set(inputs.map((i) => i.asset.toUpperCase()))]
		const assetMap = new Map<
			string,
			{
				tickSize: string
				tickValue: number
				commission: number
				fees: number
				breakevenTicks: number
			}
		>()
		for (const symbol of assetSymbols) {
			const assetConfig = await getAssetBySymbol(symbol)
			if (assetConfig) {
				// Use the resolved symbol (e.g., "WINFUT") for fee lookup, not the input symbol ("WIN")
				const assetFees = await getAssetFees(assetConfig.symbol, accountId)
				const breakevenTicks = await getBreakevenTicks(
					assetConfig.symbol,
					accountId
				)
				assetMap.set(symbol, {
					tickSize: assetConfig.tickSize,
					tickValue: assetConfig.tickValue,
					commission: assetFees.commission,
					fees: assetFees.fees,
					breakevenTicks,
				})
			}
		}

		// Get DEK for encryption
		const dek = await getUserDek(userId)

		// Process trades in batches to avoid overwhelming the database
		const BATCH_SIZE = 50
		const batches: CsvTradeInput[][] = []

		for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
			batches.push(inputs.slice(i, i + BATCH_SIZE))
		}

		for (const batch of batches) {
			const tradeValues: Array<typeof trades.$inferInsert> = []
			const batchTagNames: Array<string[] | undefined> = [] // parallel array for tag names per trade

			for (let i = 0; i < batch.length; i++) {
				const input = batch[i]
				const globalIndex = inputs.indexOf(input)

				try {
					// Extract CSV-only fields before validation (not part of CreateTradeInput)
					const {
						strategyCode,
						timeframeCode,
						tagNames: inputTagNames,
						...tradeInput
					} = input
					// Sanitize SL/TP before validation: strip values that would fail
					// (negative/zero or on wrong side of entry) so the trade can still be imported
					const entryPriceNum = Number(tradeInput.entryPrice)
					const dir = tradeInput.direction
					if (tradeInput.takeProfit != null) {
						const tp = Number(tradeInput.takeProfit)
						if (
							!tp || tp <= 0 ||
							(dir === "long" && tp <= entryPriceNum) ||
							(dir === "short" && tp >= entryPriceNum)
						) {
							delete tradeInput.takeProfit
						}
					}
					if (tradeInput.stopLoss != null) {
						const sl = Number(tradeInput.stopLoss)
						if (
							!sl || sl <= 0 ||
							(dir === "long" && sl >= entryPriceNum) ||
							(dir === "short" && sl <= entryPriceNum)
						) {
							delete tradeInput.stopLoss
						}
					}

					const validated = createTradeSchema.parse(tradeInput)
					const { tagIds, ...tradeData } = validated

					// Look up strategy ID from code or name
					const strategyId = strategyCode
						? strategyMap.get(strategyCode) || null
						: null

					// Look up timeframe ID from code or name
					const timeframeId = timeframeCode
						? timeframeMap.get(timeframeCode) || null
						: null

					// Calculate derived fields
					let pnl = tradeData.pnl
					let outcome: "win" | "loss" | "breakeven" | undefined
					let realizedR = tradeData.realizedRMultiple

					// Get asset config early — needed for both risk and P&L calculation
					const assetConfig = assetMap.get(tradeData.asset.toUpperCase())

					// Calculate plannedRiskAmount and plannedRMultiple from SL/TP using tick-based conversion
					let plannedRiskAmount: number | undefined
					let plannedRMultiple: number | undefined
					if (tradeData.stopLoss) {
						const priceDiff = Math.abs(tradeData.entryPrice - tradeData.stopLoss)

						if (assetConfig) {
							const tickSize = parseFloat(assetConfig.tickSize)
							const tickValue = fromCents(assetConfig.tickValue)
							const ticksAtRisk = priceDiff / tickSize
							plannedRiskAmount = ticksAtRisk * tickValue * tradeData.positionSize
						} else {
							plannedRiskAmount = priceDiff * tradeData.positionSize
						}

						// Calculate plannedRMultiple from take profit (reward/risk ratio)
						if (tradeData.takeProfit && priceDiff > 0) {
							const rewardDiff = Math.abs(tradeData.takeProfit - tradeData.entryPrice)
							plannedRMultiple = rewardDiff / priceDiff
						}
					}
					let commission = 0
					let fees = 0

					if (assetConfig) {
						commission = assetConfig.commission
						fees = assetConfig.fees
					}

					let ticksGained: number | null = null

					if (tradeData.exitPrice) {
						if (assetConfig) {
							// Always recalculate P&L from prices — any CSV pnl is unreliable
							const contractsExecuted =
								tradeData.contractsExecuted ?? tradeData.positionSize * 2
							const pnlResult = calculateAssetPnL({
								entryPrice: tradeData.entryPrice,
								exitPrice: tradeData.exitPrice,
								positionSize: tradeData.positionSize,
								direction: tradeData.direction,
								tickSize: parseFloat(assetConfig.tickSize),
								tickValue: fromCents(assetConfig.tickValue),
								commission: fromCents(commission),
								fees: fromCents(fees),
								contractsExecuted,
							})
							pnl = pnlResult.netPnl
							ticksGained = pnlResult.ticksGained
						} else if (!pnl) {
							// Fallback to simple price-based calculation only when no pnl exists
							pnl = calculatePnL({
								direction: tradeData.direction,
								entryPrice: tradeData.entryPrice,
								exitPrice: tradeData.exitPrice,
								positionSize: tradeData.positionSize,
							})
						}
					}

					if (pnl !== undefined) {
						const breakevenTicks = assetConfig?.breakevenTicks ?? 0
						outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })
					}

					if (pnl !== undefined && plannedRiskAmount && plannedRiskAmount > 0) {
						realizedR = calculateRMultiple(pnl, plannedRiskAmount)
					}

					// Calculate total costs based on contracts executed
					const contractsExecuted =
						tradeData.contractsExecuted ?? tradeData.positionSize * 2
					const totalCommission = commission * contractsExecuted
					const totalFees = fees * contractsExecuted

					// Compute dedup hash from plaintext values before encryption
					const deduplicationHash = computeTradeHash({
						accountId,
						asset: tradeData.asset.toUpperCase(),
						direction: tradeData.direction,
						entryDate: tradeData.entryDate,
						entryPrice: tradeData.entryPrice,
						exitPrice: tradeData.exitPrice,
						positionSize: tradeData.positionSize,
					})

					const tradeInsertValues: Record<string, unknown> = {
						accountId,
						asset: tradeData.asset,
						direction: tradeData.direction,
						timeframeId: timeframeId || tradeData.timeframeId || null,
						entryDate: tradeData.entryDate,
						exitDate: tradeData.exitDate,
						entryPrice: toNumericString(tradeData.entryPrice),
						exitPrice: toNumericString(tradeData.exitPrice),
						positionSize: toNumericString(tradeData.positionSize),
						stopLoss: toNumericString(tradeData.stopLoss),
						takeProfit: toNumericString(tradeData.takeProfit),
						plannedRiskAmount:
							plannedRiskAmount !== undefined
								? toNumericString(toCents(plannedRiskAmount))
								: null,
						plannedRMultiple: toNumericString(plannedRMultiple),
						pnl: pnl !== undefined ? toNumericString(toCents(pnl)) : null,
						outcome,
						realizedRMultiple: toNumericString(realizedR),
						mfe: toNumericString(tradeData.mfe),
						mae: toNumericString(tradeData.mae),
						// Fees stored in cents (commission/fees are already in cents from getAssetFees)
						commission: toNumericString(totalCommission),
						fees: toNumericString(totalFees),
						// contractsExecuted defaults to positionSize * 2 (entry + exit)
						contractsExecuted: toNumericString(contractsExecuted),
						deduplicationHash,
						followedPlan: tradeData.followedPlan,
						strategyId: strategyId || tradeData.strategyId || null,
						preTradeThoughts: tradeData.preTradeThoughts,
						postTradeReflection: tradeData.postTradeReflection,
						lessonLearned: tradeData.lessonLearned,
						disciplineNotes: tradeData.disciplineNotes,
						setupRank: tradeData.setupRank || null,
						screenshotUrl: tradeData.screenshotUrl || null,
						screenshotS3Key: tradeData.screenshotS3Key || null,
					}

					// Encrypt sensitive fields if user has a DEK
					if (dek) {
						Object.assign(
							tradeInsertValues,
							encryptTradeFields(
								{
									pnl: pnl !== undefined ? toCents(pnl) : null,
									plannedRiskAmount:
										plannedRiskAmount !== undefined
											? toCents(plannedRiskAmount)
											: null,
									commission: totalCommission,
									fees: totalFees,
									entryPrice: toNumericString(tradeData.entryPrice),
									exitPrice: toNumericString(tradeData.exitPrice),
									positionSize: toNumericString(tradeData.positionSize),
									stopLoss: toNumericString(tradeData.stopLoss),
									takeProfit: toNumericString(tradeData.takeProfit),
									plannedRMultiple: toNumericString(plannedRMultiple),
									preTradeThoughts: tradeData.preTradeThoughts,
									postTradeReflection: tradeData.postTradeReflection,
									lessonLearned: tradeData.lessonLearned,
									disciplineNotes: tradeData.disciplineNotes,
								},
								dek
							)
						)
					}

					tradeValues.push(tradeInsertValues as typeof trades.$inferInsert)
					batchTagNames.push(inputTagNames)
				} catch (error) {
					result.failedCount++
					result.errors.push({
						index: globalIndex,
						message: toSafeErrorMessage(error, "bulkCreateTrades"),
					})
				}
			}

			// Bulk insert valid trades (use returning to get IDs for tag associations)
			if (tradeValues.length > 0) {
				const insertedTrades = await db
					.insert(trades)
					.values(tradeValues)
					.returning()
				result.successCount += insertedTrades.length

				// Insert tradeTags entries for matched tag names
				const tradeTagValues: Array<{ tradeId: string; tagId: string }> = []
				for (let j = 0; j < insertedTrades.length; j++) {
					const tagNamesForTrade = batchTagNames[j]
					if (tagNamesForTrade?.length) {
						for (const tagName of tagNamesForTrade) {
							const tagId = tagNameMap.get(tagName.toLowerCase())
							if (tagId) {
								tradeTagValues.push({ tradeId: insertedTrades[j].id, tagId })
							}
						}
					}
				}
				if (tradeTagValues.length > 0) {
					await db.insert(tradeTags).values(tradeTagValues)
				}
			}
		}

		// Revalidate journal pages
		revalidatePath("/journal")
		revalidatePath("/")

		return {
			status: result.failedCount === inputs.length ? "error" : "success",
			message:
				result.failedCount === 0
					? `Successfully imported ${result.successCount} trades`
					: `Imported ${result.successCount} trades, ${result.failedCount} failed`,
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to import trades",
			errors: [
				{
					code: "BULK_CREATE_FAILED",
					detail: toSafeErrorMessage(error, "bulkCreateTrades"),
				},
			],
		}
	}
}

/**
 * Input type for scaled trade creation with executions
 */
export interface CreateScaledTradeInput {
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
}

/**
 * Create a scaled trade with multiple executions
 */
export const createScaledTrade = async (
	input: CreateScaledTradeInput
): Promise<ActionResponse<Trade>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const { executions, tagIds, ...tradeData } = input

		if (!executions || executions.length === 0) {
			return {
				status: "error",
				message: "At least one execution is required",
				errors: [
					{ code: "VALIDATION_ERROR", detail: "No executions provided" },
				],
			}
		}

		// Separate entries and exits
		const entries = executions.filter((e) => e.executionType === "entry")
		const exits = executions.filter((e) => e.executionType === "exit")

		if (entries.length === 0) {
			return {
				status: "error",
				message: "At least one entry execution is required",
				errors: [
					{ code: "VALIDATION_ERROR", detail: "No entry executions provided" },
				],
			}
		}

		// Calculate aggregates from executions
		const totalEntryQty = entries.reduce((sum, e) => sum + e.quantity, 0)
		const totalExitQty = exits.reduce((sum, e) => sum + e.quantity, 0)

		const avgEntryPrice =
			totalEntryQty > 0
				? entries.reduce((sum, e) => sum + e.price * e.quantity, 0) /
					totalEntryQty
				: 0

		const avgExitPrice =
			totalExitQty > 0
				? exits.reduce((sum, e) => sum + e.price * e.quantity, 0) / totalExitQty
				: null

		// Find earliest entry date and latest exit date
		const entryDate = entries.reduce(
			(earliest, e) =>
				e.executionDate < earliest ? e.executionDate : earliest,
			entries[0].executionDate
		)

		const exitDate =
			exits.length > 0
				? exits.reduce(
						(latest, e) =>
							e.executionDate > latest ? e.executionDate : latest,
						exits[0].executionDate
					)
				: null

		// Calculate total contracts executed (for fee calculation)
		const contractsExecuted = executions.reduce((sum, e) => sum + e.quantity, 0)

		// Calculate P&L if we have exits
		let pnl: number | undefined
		let outcome: "win" | "loss" | "breakeven" | undefined

		if (avgExitPrice !== null && totalExitQty > 0) {
			// Look up asset for tick-based calculation
			const assetConfig = await getAssetBySymbol(tradeData.asset)

			// Use the smaller of entry/exit qty for closed P&L
			const closedQty = Math.min(totalEntryQty, totalExitQty)

			// Calculate total commissions and fees
			const totalCommissions = executions.reduce(
				(sum, e) => sum + (e.commission || 0) + (e.fees || 0),
				0
			)

			let ticksGained: number | null = null

			if (assetConfig) {
				// Use asset-based calculation with tick size and tick value
				const priceDiff =
					tradeData.direction === "long"
						? avgExitPrice - avgEntryPrice
						: avgEntryPrice - avgExitPrice
				const tickSize = parseFloat(assetConfig.tickSize)
				const tickValue = fromCents(assetConfig.tickValue)
				ticksGained = priceDiff / tickSize
				pnl = ticksGained * tickValue * closedQty - totalCommissions
			} else {
				// Fallback to simple price-based calculation
				const priceDiff =
					tradeData.direction === "long"
						? avgExitPrice - avgEntryPrice
						: avgEntryPrice - avgExitPrice
				pnl = priceDiff * closedQty - totalCommissions
			}

			const breakevenTicks = await getBreakevenTicks(tradeData.asset, accountId)
			outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })
		}

		// Calculate risk values
		let plannedRiskAmount: number | undefined
		let plannedRMultiple: number | undefined
		let realizedR: number | undefined

		// Re-fetch asset config if we didn't have exit price (for risk calculation)
		const assetConfigForRisk =
			avgExitPrice !== null
				? await getAssetBySymbol(tradeData.asset) // Already fetched above
				: await getAssetBySymbol(tradeData.asset)

		if (tradeData.riskAmount) {
			plannedRiskAmount = tradeData.riskAmount
		} else if (tradeData.stopLoss) {
			const priceDiff = Math.abs(avgEntryPrice - tradeData.stopLoss)

			if (assetConfigForRisk) {
				const tickSize = parseFloat(assetConfigForRisk.tickSize)
				const tickValue = fromCents(assetConfigForRisk.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				plannedRiskAmount = ticksAtRisk * tickValue * totalEntryQty
			} else {
				plannedRiskAmount = priceDiff * totalEntryQty
			}
		}

		if (tradeData.stopLoss && tradeData.takeProfit) {
			const riskPerUnit =
				tradeData.direction === "long"
					? avgEntryPrice - tradeData.stopLoss
					: tradeData.stopLoss - avgEntryPrice
			if (riskPerUnit !== 0) {
				const rewardPerUnit =
					tradeData.direction === "long"
						? tradeData.takeProfit - avgEntryPrice
						: avgEntryPrice - tradeData.takeProfit
				plannedRMultiple = Math.abs(rewardPerUnit / riskPerUnit)
			}
		}

		if (pnl !== undefined && plannedRiskAmount && plannedRiskAmount > 0) {
			realizedR = calculateRMultiple(pnl, plannedRiskAmount)
		}

		// Insert trade with execution_mode = 'scaled'
		const scaledInsertValues: Record<string, unknown> = {
			accountId,
			asset: tradeData.asset.toUpperCase(),
			direction: tradeData.direction,
			timeframeId: tradeData.timeframeId || null,
			entryDate,
			exitDate,
			entryPrice: toNumericString(avgEntryPrice),
			exitPrice: toNumericString(avgExitPrice),
			positionSize: toNumericString(totalEntryQty),
			stopLoss: toNumericString(tradeData.stopLoss),
			takeProfit: toNumericString(tradeData.takeProfit),
			plannedRiskAmount:
				plannedRiskAmount !== undefined
					? toNumericString(toCents(plannedRiskAmount))
					: null,
			plannedRMultiple: toNumericString(plannedRMultiple),
			pnl: pnl !== undefined ? toNumericString(toCents(pnl)) : null,
			outcome,
			realizedRMultiple: toNumericString(realizedR),
			contractsExecuted: toNumericString(contractsExecuted),
			executionMode: "scaled",
			followedPlan: tradeData.followedPlan,
			strategyId: tradeData.strategyId || null,
			preTradeThoughts: tradeData.preTradeThoughts,
			postTradeReflection: tradeData.postTradeReflection,
			lessonLearned: tradeData.lessonLearned,
			disciplineNotes: tradeData.disciplineNotes,
			setupRank: tradeData.setupRank || null,
			screenshotUrl: tradeData.screenshotUrl || null,
			screenshotS3Key: tradeData.screenshotS3Key || null,
		}

		// Encrypt sensitive fields if user has a DEK
		const dek = await getUserDek(userId)
		if (dek) {
			Object.assign(
				scaledInsertValues,
				encryptTradeFields(
					{
						pnl: pnl !== undefined ? toCents(pnl) : null,
						plannedRiskAmount:
							plannedRiskAmount !== undefined
								? toCents(plannedRiskAmount)
								: null,
						entryPrice: toNumericString(avgEntryPrice),
						exitPrice: toNumericString(avgExitPrice),
						positionSize: toNumericString(totalEntryQty),
						stopLoss: toNumericString(tradeData.stopLoss),
						takeProfit: toNumericString(tradeData.takeProfit),
						plannedRMultiple: toNumericString(plannedRMultiple),
						preTradeThoughts: tradeData.preTradeThoughts,
						postTradeReflection: tradeData.postTradeReflection,
						lessonLearned: tradeData.lessonLearned,
						disciplineNotes: tradeData.disciplineNotes,
					},
					dek
				)
			)
		}

		const [trade] = await db
			.insert(trades)
			.values(scaledInsertValues as typeof trades.$inferInsert)
			.returning()

		// Insert all executions
		if (executions.length > 0) {
			await db.insert(tradeExecutions).values(
				executions.map((exec) => ({
					tradeId: trade.id,
					executionType: exec.executionType,
					executionDate: exec.executionDate,
					price: toNumericString(exec.price)!,
					quantity: toNumericString(exec.quantity)!,
					commission: toNumericString(
						exec.commission ? toCents(exec.commission) : 0
					),
					fees: toNumericString(exec.fees ? toCents(exec.fees) : 0),
					notes: exec.notes,
					// executionValue is quantity * price in cents
					executionValue: toNumericString(toCents(exec.price * exec.quantity))!,
				}))
			)
		}

		// Insert tag associations
		if (tagIds?.length) {
			await db.insert(tradeTags).values(
				tagIds.map((tagId) => ({
					tradeId: trade.id,
					tagId,
				}))
			)
		}

		// Revalidate journal pages
		revalidatePath("/journal")

		return {
			status: "success",
			message: "Scaled trade created successfully",
			data: trade,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to create scaled trade",
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "createScaledTrade"),
				},
			],
		}
	}
}

/**
 * Get trades grouped by day with summaries
 * Returns trades within date range, grouped by date with per-day statistics
 */
export const getTradesGroupedByDay = async (
	dateFrom?: Date,
	dateTo?: Date
): Promise<ActionResponse<TradesByDay[]>> => {
	try {
		const { accountId, userId, showAllAccounts, allAccountIds } =
			await requireAuth()
		const locale = await getLocale()
		const bcp47Locale = locale === "pt-BR" ? "pt-BR" : "en-US"

		// Build where conditions
		const accountCondition = showAllAccounts
			? inArray(trades.accountId, allAccountIds)
			: eq(trades.accountId, accountId)
		const conditions = [accountCondition, eq(trades.isArchived, false)]

		if (dateFrom) {
			conditions.push(gte(trades.entryDate, dateFrom))
		}
		if (dateTo) {
			conditions.push(lte(trades.entryDate, dateTo))
		}

		const rawResult = await db.query.trades.findMany({
			where: and(...conditions),
			with: {
				strategy: true,
				timeframe: true,
			},
			orderBy: [desc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		if (result.length === 0) {
			return {
				status: "success",
				message: "No trades found",
				data: [],
			}
		}

		// Group trades by date (using BRT timezone for correct day boundaries)
		const groupedMap = new Map<
			string,
			{
				trades: typeof result
				netPnl: number
				totalFees: number
				wins: number
				losses: number
				breakevens: number
				totalR: number
				rCount: number
				grossProfit: number
				grossLoss: number
			}
		>()

		for (const trade of result) {
			// Get date key in YYYY-MM-DD format using BRT timezone
			const dateKey = formatDateKey(trade.entryDate)
			const existing = groupedMap.get(dateKey) || {
				trades: [],
				netPnl: 0,
				totalFees: 0,
				wins: 0,
				losses: 0,
				breakevens: 0,
				totalR: 0,
				rCount: 0,
				grossProfit: 0,
				grossLoss: 0,
			}

			// P&L is stored in cents, convert to dollars (fields are text, use fromCents for safe conversion)
			const pnl = fromCents(trade.pnl)
			const commission = fromCents(trade.commission)
			const fees = fromCents(trade.fees)

			existing.trades.push(trade)
			existing.netPnl += pnl
			existing.totalFees += commission + fees

			if (trade.outcome === "win") {
				existing.wins++
				existing.grossProfit += pnl
			} else if (trade.outcome === "loss") {
				existing.losses++
				existing.grossLoss += Math.abs(pnl)
			} else {
				existing.breakevens++
			}

			if (trade.realizedRMultiple) {
				existing.totalR += Number(trade.realizedRMultiple)
				existing.rCount++
			}

			groupedMap.set(dateKey, existing)
		}

		// Convert to TradesByDay array
		const tradesByDay: TradesByDay[] = Array.from(groupedMap.entries())
			.map(([dateKey, data]) => {
				// Format date for display (e.g., "Friday, Jan 31, 2026")
				const date = new Date(dateKey + "T12:00:00-03:00")
				const dateFormatted = new Intl.DateTimeFormat(bcp47Locale, {
					weekday: "long",
					month: "short",
					day: "numeric",
					year: "numeric",
					timeZone: APP_TIMEZONE,
				}).format(date)

				// Calculate summary stats
				const totalTrades = data.trades.length
				const winRate =
					data.wins + data.losses > 0
						? (data.wins / (data.wins + data.losses)) * 100
						: 0
				const avgR = data.rCount > 0 ? data.totalR / data.rCount : 0
				const profitFactor =
					data.grossLoss > 0
						? data.grossProfit / data.grossLoss
						: data.grossProfit > 0
							? Infinity
							: 0

				const summary: DaySummary = {
					date: dateKey,
					netPnl: data.netPnl,
					grossPnl: data.netPnl + data.totalFees,
					totalFees: data.totalFees,
					winRate,
					wins: data.wins,
					losses: data.losses,
					breakevens: data.breakevens,
					totalTrades,
					avgR,
					profitFactor: profitFactor === Infinity ? 999 : profitFactor,
				}

				// Map trades to compact format (using toSorted for immutability)
				const compactTrades: DayTradeCompact[] = data.trades
					.toSorted((a, b) => a.entryDate.getTime() - b.entryDate.getTime())
					.map((trade) => ({
						id: trade.id,
						time: new Intl.DateTimeFormat("en-GB", {
							hour: "2-digit",
							minute: "2-digit",
							hour12: false,
							timeZone: APP_TIMEZONE,
						}).format(trade.entryDate),
						asset: trade.asset,
						direction: trade.direction as "long" | "short",
						timeframeName: trade.timeframe?.name || null,
						strategyName: trade.strategy?.name || null,
						pnl: fromCents(trade.pnl),
						rMultiple: trade.realizedRMultiple
							? Number(trade.realizedRMultiple)
							: null,
						outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
					}))

				return {
					date: dateKey,
					dateFormatted,
					summary,
					trades: compactTrades,
				}
			})
			.toSorted((a, b) => b.date.localeCompare(a.date)) // Most recent first

		return {
			status: "success",
			message: "Trades grouped by day retrieved",
			data: tradesByDay,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve trades grouped by day",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getTradesGroupedByDay"),
				},
			],
		}
	}
}

/**
 * Recalculate R values for all trades that have stopLoss but no plannedRiskAmount
 * This is useful for fixing trades imported before R calculation was added
 */
export const recalculateRValues = async (): Promise<
	ActionResponse<{ updatedCount: number }>
> => {
	try {
		const { accountId, userId } = await requireAuth()
		const rawTrades = await db.query.trades.findMany({
			where: and(eq(trades.accountId, accountId), eq(trades.isArchived, false)),
		})

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		const allTrades = dek
			? rawTrades.map((t) => decryptTradeFields(t, dek))
			: rawTrades

		// Build asset config map upfront to avoid per-trade DB queries
		const uniqueAssets = [...new Set(allTrades.map((t) => t.asset))]
		const assetMap = new Map<string, { tickSize: number; tickValue: number }>()
		for (const symbol of uniqueAssets) {
			const assetConfig = await getAssetBySymbol(symbol)
			if (assetConfig) {
				assetMap.set(symbol, {
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: fromCents(assetConfig.tickValue),
				})
			}
		}

		let updatedCount = 0

		for (const trade of allTrades) {
			const stopLoss = trade.stopLoss ? Number(trade.stopLoss) : null
			const takeProfit = trade.takeProfit ? Number(trade.takeProfit) : null
			const entryPrice = Number(trade.entryPrice)
			const positionSize = Number(trade.positionSize)
			const pnl = trade.pnl !== null ? fromCents(trade.pnl) : null

			// Only process trades that have stopLoss and entry data
			if (!stopLoss || !entryPrice || !positionSize) continue

			// Calculate plannedRiskAmount using asset tick config when available
			const priceDiff = Math.abs(entryPrice - stopLoss)
			const assetConfig = assetMap.get(trade.asset.toUpperCase())
			let plannedRiskAmount: number

			if (assetConfig) {
				const ticksAtRisk = priceDiff / assetConfig.tickSize
				plannedRiskAmount = ticksAtRisk * assetConfig.tickValue * positionSize
			} else {
				plannedRiskAmount = priceDiff * positionSize
			}

			if (plannedRiskAmount <= 0) continue

			// Calculate plannedRMultiple from take profit (reward/risk ratio)
			let plannedRMultiple: number | null = null
			if (takeProfit) {
				const riskPerUnit = Math.abs(entryPrice - stopLoss)
				const rewardPerUnit = Math.abs(takeProfit - entryPrice)
				if (riskPerUnit > 0) {
					plannedRMultiple = rewardPerUnit / riskPerUnit
				}
			}

			// Calculate realizedR if we have pnl
			let realizedR: number | null = null
			if (pnl !== null) {
				realizedR = calculateRMultiple(pnl, plannedRiskAmount)
			}

			const recalcUpdateData: Record<string, unknown> = {
				plannedRiskAmount: toNumericString(toCents(plannedRiskAmount)),
				plannedRMultiple: toNumericString(plannedRMultiple),
				realizedRMultiple: toNumericString(realizedR),
			}

			if (dek) {
				Object.assign(
					recalcUpdateData,
					encryptTradeFields(
						{
							plannedRiskAmount: toCents(plannedRiskAmount),
							plannedRMultiple: toNumericString(plannedRMultiple),
						},
						dek
					)
				)
			}

			await db
				.update(trades)
				.set(recalcUpdateData)
				.where(eq(trades.id, trade.id))

			updatedCount++
		}

		revalidatePath("/")
		revalidatePath("/journal")
		revalidatePath("/analytics")

		return {
			status: "success",
			message: `Recalculated R values for ${updatedCount} trades`,
			data: { updatedCount },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to recalculate R values",
			errors: [
				{
					code: "RECALCULATE_FAILED",
					detail: toSafeErrorMessage(error, "recalculateRValues"),
				},
			],
		}
	}
}

/**
 * Recalculate P&L for all closed trades in the current account.
 * Uses asset tick configuration when available, falling back to simple price-based calculation.
 * This is useful for fixing trades imported before the asset-based P&L bug was fixed.
 */
export const recalculateAllTradesPnL = async (): Promise<
	ActionResponse<{ updatedCount: number }>
> => {
	try {
		const { accountId, userId } = await requireAuth()

		// Get all non-archived trades that have an exit price (closed trades)
		const rawTrades = await db.query.trades.findMany({
			where: and(eq(trades.accountId, accountId), eq(trades.isArchived, false)),
		})

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		const allTrades = dek
			? rawTrades.map((t) => decryptTradeFields(t, dek))
			: rawTrades

		const closedTrades = allTrades.filter((t) => t.exitPrice !== null)

		// Build asset config map upfront to avoid per-trade DB queries
		const uniqueAssets = [...new Set(closedTrades.map((t) => t.asset))]
		const assetMap = new Map<
			string,
			{
				tickSize: string
				tickValue: number
				commission: number
				fees: number
				breakevenTicks: number
			}
		>()

		for (const symbol of uniqueAssets) {
			const assetConfig = await getAssetBySymbol(symbol)
			if (assetConfig) {
				// Use the resolved symbol (e.g., "WINFUT") for fee lookup, not the trade's stored symbol ("WIN")
				const assetFees = await getAssetFees(assetConfig.symbol, accountId)
				const breakevenTicks = await getBreakevenTicks(
					assetConfig.symbol,
					accountId
				)
				assetMap.set(symbol, {
					tickSize: assetConfig.tickSize,
					tickValue: assetConfig.tickValue,
					commission: assetFees.commission,
					fees: assetFees.fees,
					breakevenTicks,
				})
			}
		}

		let updatedCount = 0

		for (const trade of closedTrades) {
			const entryPrice = Number(trade.entryPrice)
			const exitPrice = Number(trade.exitPrice)
			const positionSize = Number(trade.positionSize)
			const direction = trade.direction as "long" | "short"
			const contractsExecuted = trade.contractsExecuted
				? Number(trade.contractsExecuted)
				: positionSize * 2

			if (!entryPrice || !exitPrice || !positionSize) continue

			let pnl: number
			let ticksGained: number | null = null
			const assetConfig = assetMap.get(trade.asset.toUpperCase())

			// Track per-trade commission and fees (in dollars) for column update
			let tradeCommission = 0
			let tradeFees = 0

			if (assetConfig) {
				const perContractCommission = fromCents(assetConfig.commission)
				const perContractFees = fromCents(assetConfig.fees)

				const result = calculateAssetPnL({
					entryPrice,
					exitPrice,
					positionSize,
					direction,
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: fromCents(assetConfig.tickValue),
					commission: perContractCommission,
					fees: perContractFees,
					contractsExecuted,
				})
				pnl = result.netPnl
				ticksGained = result.ticksGained

				// Total commission/fees for this trade = per-contract rate * executions
				tradeCommission = perContractCommission * contractsExecuted
				tradeFees = perContractFees * contractsExecuted
			} else {
				pnl = calculatePnL({
					direction,
					entryPrice,
					exitPrice,
					positionSize,
				})
			}

			const breakevenTicks = assetConfig?.breakevenTicks ?? 0
			const outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })

			// Recalculate plannedRiskAmount from stop loss using current asset tick config
			let plannedRiskAmount: number | null = null
			const stopLoss = trade.stopLoss ? Number(trade.stopLoss) : null
			if (stopLoss && entryPrice) {
				const priceDiff = Math.abs(entryPrice - stopLoss)
				if (assetConfig) {
					const tickSize = parseFloat(assetConfig.tickSize)
					const tickValue = fromCents(assetConfig.tickValue)
					const ticksAtRisk = priceDiff / tickSize
					plannedRiskAmount = ticksAtRisk * tickValue * positionSize
				} else {
					plannedRiskAmount = priceDiff * positionSize
				}
			} else if (trade.plannedRiskAmount) {
				// Fallback to existing value if no stop loss to recalculate from
				plannedRiskAmount = fromCents(trade.plannedRiskAmount)
			}

			const realizedRMultiple =
				plannedRiskAmount && plannedRiskAmount > 0
					? calculateRMultiple(pnl, plannedRiskAmount)
					: null

			const pnlUpdateData: Record<string, unknown> = {
				pnl: toNumericString(toCents(pnl)),
				commission: toNumericString(toCents(tradeCommission)),
				fees: toNumericString(toCents(tradeFees)),
				outcome,
				plannedRiskAmount:
					plannedRiskAmount !== null
						? toNumericString(toCents(plannedRiskAmount))
						: trade.plannedRiskAmount,
				realizedRMultiple: toNumericString(realizedRMultiple),
			}

			if (dek) {
				Object.assign(
					pnlUpdateData,
					encryptTradeFields(
						{
							pnl: toCents(pnl),
							commission: toCents(tradeCommission),
							fees: toCents(tradeFees),
							plannedRiskAmount:
								plannedRiskAmount !== null ? toCents(plannedRiskAmount) : null,
						},
						dek
					)
				)
			}

			await db.update(trades).set(pnlUpdateData).where(eq(trades.id, trade.id))

			updatedCount++
		}

		revalidatePath("/")
		revalidatePath("/journal")
		revalidatePath("/analytics")

		return {
			status: "success",
			message: `Recalculated P&L for ${updatedCount} trades`,
			data: { updatedCount },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to recalculate P&L",
			errors: [
				{
					code: "RECALCULATE_PNL_FAILED",
					detail: toSafeErrorMessage(error, "recalculateAllTradesPnL"),
				},
			],
		}
	}
}
