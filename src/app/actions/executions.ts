"use server"

import { invalidateTradeData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { tradeExecutions, trades } from "@/db/schema"
import type { TradeExecution } from "@/db/schema"
import type { ActionResponse, ExecutionSummary } from "@/types"
import {
	createExecutionSchema,
	updateExecutionSchema,
	type CreateExecutionInput,
	type UpdateExecutionInput,
} from "@/lib/validations/execution"
import { eq, asc, and } from "drizzle-orm"
import { toCents, fromCents } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { getUserDek, encryptExecutionFields, decryptExecutionFields } from "@/lib/user-crypto"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"
import { calculateAssetPnL, determineOutcome, calculateExecutionSummary } from "@/lib/calculations"
import { assets } from "@/db/schema"
import { getBreakevenTicks } from "@/app/actions/accounts"

/**
 * Calculate execution value (price * quantity) in cents
 */
const calculateExecutionValue = (price: number, quantity: number): number => {
	return toCents(price * quantity)
}

/**
 * Update trade aggregates from executions, including P&L recalculation.
 * Called after every create/update/delete on executions to keep trade in sync.
 */
export const updateTradeAggregates = async (tradeId: string, dek: string | null): Promise<void> => {
	const rawExecutions = await db.query.tradeExecutions.findMany({
		where: eq(tradeExecutions.tradeId, tradeId),
		orderBy: [asc(tradeExecutions.executionDate)],
	})

	// Decrypt execution fields if DEK is available
	const executions = dek
		? rawExecutions.map((ex) => decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution)
		: rawExecutions

	if (executions.length === 0) {
		// No executions, reset aggregates
		await db
			.update(trades)
			.set({
				totalEntryQuantity: null,
				totalExitQuantity: null,
				avgEntryPrice: null,
				avgExitPrice: null,
				remainingQuantity: "0",
				pnl: null,
				outcome: null,
				realizedRMultiple: null,
				updatedAt: new Date(),
			})
			.where(eq(trades.id, tradeId))
		return
	}

	const summary = calculateExecutionSummary(executions)

	// Get the trade for direction, asset, stop loss info
	const trade = await db.query.trades.findFirst({
		where: eq(trades.id, tradeId),
	})

	if (!trade) return

	// Sort executions by date for entry/exit date extraction
	const entries = executions.filter((e) => e.executionType === "entry")
	const exits = executions.filter((e) => e.executionType === "exit")

	const earliestEntryDate = entries.length > 0
		? entries.reduce((earliest, e) =>
			new Date(e.executionDate) < new Date(earliest.executionDate) ? e : earliest
		).executionDate
		: trade.entryDate

	const latestExitDate = exits.length > 0
		? exits.reduce((latest, e) =>
			new Date(e.executionDate) > new Date(latest.executionDate) ? e : latest
		).executionDate
		: null

	// Use pre-computed values from summary
	const { totalCommission, totalFees } = summary

	// Calculate P&L when we have exits
	let pnl: number | null = null
	let outcome: "win" | "loss" | "breakeven" | null = null
	let realizedRMultiple: string | null = null

	if (summary.totalExitQuantity > 0 && summary.avgExitPrice > 0) {
		// Try to get asset config for tick-based calculation
		const assetConfig = await db.query.assets.findFirst({
			where: eq(assets.symbol, trade.asset),
		})

		const contractsExecuted = summary.totalEntryQuantity + summary.totalExitQuantity
		let ticksGained: number | null = null

		if (assetConfig) {
			// Use asset-aware calculation (tick-based)
			const result = calculateAssetPnL({
				entryPrice: summary.avgEntryPrice,
				exitPrice: summary.avgExitPrice,
				positionSize: summary.totalEntryQuantity,
				direction: trade.direction,
				tickSize: Number(assetConfig.tickSize),
				tickValue: fromCents(assetConfig.tickValue),
				commission: fromCents(totalCommission),
				fees: fromCents(totalFees),
				contractsExecuted,
			})
			pnl = toCents(result.netPnl)
			ticksGained = result.ticksGained
		} else {
			// Fallback: simple P&L calculation
			const priceDiff = trade.direction === "long"
				? summary.avgExitPrice - summary.avgEntryPrice
				: summary.avgEntryPrice - summary.avgExitPrice
			const grossPnl = priceDiff * summary.totalEntryQuantity
			pnl = toCents(grossPnl) - totalCommission - totalFees
		}

		const breakevenTicks = await getBreakevenTicks(trade.asset)
		outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })

		// Calculate realized R-multiple if stop loss is set
		if (trade.stopLoss && summary.avgEntryPrice > 0) {
			const riskPerUnit = Math.abs(summary.avgEntryPrice - Number(trade.stopLoss))
			const riskAmount = riskPerUnit * summary.totalEntryQuantity
			if (riskAmount > 0) {
				const rMultiple = fromCents(pnl) / riskAmount
				realizedRMultiple = rMultiple.toFixed(2)
			}
		}
	}

	// Determine position status string for the positionStatus field
	const positionStatus = summary.positionStatus

	// Update trade with all aggregated data
	await db
		.update(trades)
		.set({
			totalEntryQuantity: summary.totalEntryQuantity.toString(),
			totalExitQuantity: summary.totalExitQuantity.toString(),
			avgEntryPrice: summary.avgEntryPrice.toString(),
			avgExitPrice: summary.avgExitPrice > 0 ? summary.avgExitPrice.toString() : null,
			remainingQuantity: summary.remainingQuantity.toString(),
			// Backwards-compatible fields
			entryPrice: summary.avgEntryPrice.toString(),
			exitPrice: summary.avgExitPrice > 0 ? summary.avgExitPrice.toString() : null,
			positionSize: summary.totalEntryQuantity.toString(),
			contractsExecuted: (summary.totalEntryQuantity + summary.totalExitQuantity).toString(),
			// P&L and outcome recalculation
			pnl: pnl != null ? String(pnl) : null,
			outcome,
			realizedRMultiple,
			// Aggregated costs from executions
			commission: String(totalCommission),
			fees: String(totalFees),
			// Dates from executions
			entryDate: earliestEntryDate,
			exitDate: latestExitDate,
			updatedAt: new Date(),
		})
		.where(eq(trades.id, tradeId))
}

/**
 * Create a new execution
 */
export const createExecution = async (
	input: CreateExecutionInput
): Promise<ActionResponse<TradeExecution>> => {
	const t = await getTranslations("journal")
	try {
		const { userId, accountId } = await requireAuth()
		const validated = createExecutionSchema.parse(input)

		// Verify trade exists and belongs to the current account
		const trade = await db.query.trades.findFirst({
			where: and(
				eq(trades.id, validated.tradeId),
				eq(trades.accountId, accountId)
			),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		// Get DEK for encryption/decryption
		const dek = await getUserDek(userId)

		// Validate exit quantity: total exits cannot exceed total entries
		if (validated.executionType === "exit") {
			const rawExistingExecutions = await db.query.tradeExecutions.findMany({
				where: eq(tradeExecutions.tradeId, validated.tradeId),
			})

			// Decrypt to get numeric quantity values
			const existingExecutions = dek
				? rawExistingExecutions.map((ex) => decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution)
				: rawExistingExecutions

			const totalEntryQty = existingExecutions
				.filter((e) => e.executionType === "entry")
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			const totalExitQty = existingExecutions
				.filter((e) => e.executionType === "exit")
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			if (totalExitQty + validated.quantity > totalEntryQty) {
				const remainingQty = totalEntryQty - totalExitQty
				return {
					status: "error",
					message: t("errors.exitQuantityExceeds", { qty: remainingQty }),
					errors: [{
						code: "EXIT_EXCEEDS_ENTRIES",
						detail: `Total exit quantity (${totalExitQty + validated.quantity}) would exceed total entry quantity (${totalEntryQty})`,
					}],
				}
			}
		}

		// Convert trade to scaled mode if not already
		if (trade.executionMode !== "scaled") {
			await db
				.update(trades)
				.set({ executionMode: "scaled", updatedAt: new Date() })
				.where(eq(trades.id, validated.tradeId))
		}

		// Calculate execution value
		const executionValue = calculateExecutionValue(
			validated.price,
			validated.quantity
		)
		const encryptedFields = dek
			? encryptExecutionFields({
				price: validated.price,
				quantity: validated.quantity,
				commission: validated.commission,
				fees: validated.fees,
				slippage: validated.slippage,
				executionValue,
			}, dek)
			: {}

		// Insert execution (convert numeric fields to text for DB storage)
		const [execution] = await db
			.insert(tradeExecutions)
			.values({
				tradeId: validated.tradeId,
				executionType: validated.executionType,
				executionDate: validated.executionDate,
				price: validated.price.toString(),
				quantity: validated.quantity.toString(),
				orderType: validated.orderType,
				notes: validated.notes,
				commission: validated.commission?.toString() ?? null,
				fees: validated.fees?.toString() ?? null,
				slippage: validated.slippage?.toString() ?? null,
				executionValue: executionValue.toString(),
				...encryptedFields,
			})
			.returning()

		// Update trade aggregates
		await updateTradeAggregates(validated.tradeId, dek)

		// Revalidate pages
		invalidateTradeData(validated.tradeId, userId, accountId)

		// Decrypt before returning
		const decryptedExecution = dek
			? decryptExecutionFields(execution as unknown as Record<string, unknown>, dek) as unknown as TradeExecution
			: execution

		return {
			status: "success",
			message: "Execution created successfully",
			data: decryptedExecution,
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
			message: "Failed to create execution",
			errors: [{ code: "CREATE_FAILED", detail: toSafeErrorMessage(error, "createExecution") }],
		}
	}
}

/**
 * Update an existing execution
 */
export const updateExecution = async (
	id: string,
	input: UpdateExecutionInput
): Promise<ActionResponse<TradeExecution>> => {
	const t = await getTranslations("journal")
	try {
		const { userId, accountId } = await requireAuth()
		const validated = updateExecutionSchema.parse(input)

		// Get DEK for encryption/decryption
		const dek = await getUserDek(userId)

		// Get existing execution with trade verification
		const rawExisting = await db.query.tradeExecutions.findFirst({
			where: eq(tradeExecutions.id, id),
			with: { trade: true },
		})

		if (!rawExisting || rawExisting.trade?.accountId !== accountId) {
			return {
				status: "error",
				message: "Execution not found",
				errors: [{ code: "NOT_FOUND", detail: "Execution does not exist" }],
			}
		}

		// Decrypt existing execution fields to get numeric values for calculation
		const existing = dek
			? { ...decryptExecutionFields(rawExisting as unknown as Record<string, unknown>, dek) as unknown as typeof rawExisting, trade: rawExisting.trade }
			: rawExisting

		// Validate exit quantity if the result would be an exit execution
		const resultType = validated.executionType ?? existing.executionType
		const resultQuantity = validated.quantity ?? Number(existing.quantity)

		if (resultType === "exit") {
			const rawAllExecutions = await db.query.tradeExecutions.findMany({
				where: eq(tradeExecutions.tradeId, existing.tradeId),
			})

			// Decrypt all executions for quantity calculations
			const allExecutions = dek
				? rawAllExecutions.map((ex) => decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution)
				: rawAllExecutions

			const totalEntryQty = allExecutions
				.filter((e) => e.executionType === "entry")
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			// Calculate exit total excluding the current execution being updated
			const otherExitQty = allExecutions
				.filter((e) => e.executionType === "exit" && e.id !== id)
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			if (otherExitQty + resultQuantity > totalEntryQty) {
				const remainingQty = totalEntryQty - otherExitQty
				return {
					status: "error",
					message: t("errors.exitQuantityExceeds", { qty: remainingQty }),
					errors: [{
						code: "EXIT_EXCEEDS_ENTRIES",
						detail: `Total exit quantity (${otherExitQty + resultQuantity}) would exceed total entry quantity (${totalEntryQty})`,
					}],
				}
			}
		}

		// Calculate new execution value if price or quantity changed
		const price = validated.price ?? Number(existing.price)
		const quantity = validated.quantity ?? Number(existing.quantity)
		const executionValue = calculateExecutionValue(price, quantity)

		// Build update data (convert numeric fields to text for DB storage)
		const updateData: Record<string, unknown> = {
			executionValue: executionValue.toString(),
			updatedAt: new Date(),
		}

		if (validated.executionType !== undefined)
			updateData.executionType = validated.executionType
		if (validated.executionDate !== undefined)
			updateData.executionDate = validated.executionDate
		if (validated.price !== undefined)
			updateData.price = validated.price.toString()
		if (validated.quantity !== undefined)
			updateData.quantity = validated.quantity.toString()
		if (validated.orderType !== undefined)
			updateData.orderType = validated.orderType
		if (validated.notes !== undefined) updateData.notes = validated.notes
		if (validated.commission !== undefined)
			updateData.commission = validated.commission?.toString() ?? null
		if (validated.fees !== undefined) updateData.fees = validated.fees?.toString() ?? null
		if (validated.slippage !== undefined)
			updateData.slippage = validated.slippage?.toString() ?? null

		// Encrypt financial fields if DEK is available
		const encryptedFields = dek
			? encryptExecutionFields({
				price: validated.price,
				quantity: validated.quantity,
				commission: validated.commission,
				fees: validated.fees,
				slippage: validated.slippage,
				executionValue,
			}, dek)
			: {}

		const [execution] = await db
			.update(tradeExecutions)
			.set({ ...updateData, ...encryptedFields })
			.where(eq(tradeExecutions.id, id))
			.returning()

		// Update trade aggregates
		await updateTradeAggregates(existing.tradeId, dek)

		// Revalidate pages
		invalidateTradeData(existing.tradeId, userId, accountId)

		// Decrypt before returning
		const decryptedExecution = dek
			? decryptExecutionFields(execution as unknown as Record<string, unknown>, dek) as unknown as TradeExecution
			: execution

		return {
			status: "success",
			message: "Execution updated successfully",
			data: decryptedExecution,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to update execution",
			errors: [{ code: "UPDATE_FAILED", detail: toSafeErrorMessage(error, "updateExecution") }],
		}
	}
}

/**
 * Delete an execution
 */
export const deleteExecution = async (
	id: string
): Promise<ActionResponse<void>> => {
	try {
		const { userId, accountId } = await requireAuth()

		// Get existing execution with trade verification
		const existing = await db.query.tradeExecutions.findFirst({
			where: eq(tradeExecutions.id, id),
			with: { trade: true },
		})

		if (!existing || existing.trade?.accountId !== accountId) {
			return {
				status: "error",
				message: "Execution not found",
				errors: [{ code: "NOT_FOUND", detail: "Execution does not exist" }],
			}
		}

		const tradeId = existing.tradeId

		// Delete the execution
		await db.delete(tradeExecutions).where(eq(tradeExecutions.id, id))

		// Update trade aggregates
		const dek = await getUserDek(userId)
		await updateTradeAggregates(tradeId, dek)

		// Check if there are any executions left
		const remainingExecutions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
		})

		// If no executions left, convert trade back to simple mode
		if (remainingExecutions.length === 0) {
			await db
				.update(trades)
				.set({ executionMode: "simple", updatedAt: new Date() })
				.where(eq(trades.id, tradeId))
		}

		// Revalidate pages
		invalidateTradeData(tradeId, userId, accountId)

		return {
			status: "success",
			message: "Execution deleted successfully",
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to delete execution",
			errors: [{ code: "DELETE_FAILED", detail: toSafeErrorMessage(error, "deleteExecution") }],
		}
	}
}

/**
 * Get all executions for a trade
 */
export const getExecutions = async (
	tradeId: string
): Promise<ActionResponse<TradeExecution[]>> => {
	try {
		const { userId, accountId } = await requireAuth()

		// Verify trade ownership
		const trade = await db.query.trades.findFirst({
			where: and(eq(trades.id, tradeId), eq(trades.accountId, accountId)),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		const rawExecutions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
			orderBy: [asc(tradeExecutions.executionDate)],
		})

		// Decrypt execution fields if DEK is available
		const dek = await getUserDek(userId)
		const executions = dek
			? rawExecutions.map((ex) => decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution)
			: rawExecutions

		return {
			status: "success",
			message: "Executions retrieved successfully",
			data: executions,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve executions",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getExecutions") }],
		}
	}
}

/**
 * Get execution summary for a trade
 */
export const getExecutionSummary = async (
	tradeId: string
): Promise<ActionResponse<ExecutionSummary>> => {
	try {
		const { userId, accountId } = await requireAuth()

		// Verify trade ownership
		const trade = await db.query.trades.findFirst({
			where: and(eq(trades.id, tradeId), eq(trades.accountId, accountId)),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		const rawExecutions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
			orderBy: [asc(tradeExecutions.executionDate)],
		})

		// Decrypt execution fields if DEK is available
		const dek = await getUserDek(userId)
		const executions = dek
			? rawExecutions.map((ex) => decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution)
			: rawExecutions

		const summary = calculateExecutionSummary(executions)

		return {
			status: "success",
			message: "Execution summary calculated successfully",
			data: summary,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to calculate execution summary",
			errors: [{ code: "CALCULATION_FAILED", detail: toSafeErrorMessage(error, "getExecutionSummary") }],
		}
	}
}

/**
 * Convert a simple trade to scaled mode by creating executions from existing data
 */
export const convertToScaledMode = async (
	tradeId: string
): Promise<ActionResponse<TradeExecution[]>> => {
	const t = await getTranslations("journal")
	try {
		const { userId, accountId } = await requireAuth()

		const trade = await db.query.trades.findFirst({
			where: and(eq(trades.id, tradeId), eq(trades.accountId, accountId)),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		if (trade.executionMode === "scaled") {
			return {
				status: "error",
				message: t("errors.alreadyScaledMode"),
				errors: [
					{ code: "ALREADY_SCALED", detail: t("errors.alreadyScaledMode") },
				],
			}
		}

		const createdExecutions: TradeExecution[] = []
		const dek = await getUserDek(userId)

		// Create entry execution from existing trade data
		const entryPrice = Number(trade.entryPrice)
		const positionSize = Number(trade.positionSize)

		const entryValue = calculateExecutionValue(entryPrice, positionSize)

		const entryCommission = trade.commission ? Number(trade.commission) : 0
		const entryFees = trade.fees ? Number(trade.fees) : 0

		const entryInsertValues = {
			tradeId,
			executionType: "entry" as const,
			executionDate: trade.entryDate,
			price: trade.entryPrice,
			quantity: trade.positionSize,
			orderType: "market" as const,
			commission: String(entryCommission),
			fees: String(entryFees),
			slippage: "0",
			executionValue: String(entryValue),
		}

		// Encrypt financial fields if DEK is available
		const entryEncryptedFields = dek
			? encryptExecutionFields({
				price: entryPrice,
				quantity: positionSize,
				commission: entryCommission,
				fees: entryFees,
				slippage: 0,
				executionValue: entryValue,
			}, dek)
			: {}

		const [entryExecution] = await db
			.insert(tradeExecutions)
			.values({ ...entryInsertValues, ...entryEncryptedFields })
			.returning()

		createdExecutions.push(entryExecution)

		// Create exit execution if trade has exit data
		if (trade.exitPrice && trade.exitDate) {
			const exitPrice = Number(trade.exitPrice)
			const exitValue = calculateExecutionValue(exitPrice, positionSize)

			const exitInsertValues = {
				tradeId,
				executionType: "exit" as const,
				executionDate: trade.exitDate,
				price: trade.exitPrice,
				quantity: trade.positionSize,
				orderType: "market" as const,
				commission: "0",
				fees: "0",
				slippage: "0",
				executionValue: String(exitValue),
			}

			const exitEncryptedFields = dek
				? encryptExecutionFields({
					price: exitPrice,
					quantity: positionSize,
					commission: 0,
					fees: 0,
					slippage: 0,
					executionValue: exitValue,
				}, dek)
				: {}

			const [exitExecution] = await db
				.insert(tradeExecutions)
				.values({ ...exitInsertValues, ...exitEncryptedFields })
				.returning()

			createdExecutions.push(exitExecution)
		}

		// Update trade to scaled mode
		await db
			.update(trades)
			.set({ executionMode: "scaled", updatedAt: new Date() })
			.where(eq(trades.id, tradeId))

		// Update aggregates
		await updateTradeAggregates(tradeId, dek)

		// Revalidate pages
		invalidateTradeData(tradeId, userId, accountId)

		return {
			status: "success",
			message: "Trade converted to scaled mode successfully",
			data: createdExecutions,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to convert trade to scaled mode",
			errors: [{ code: "CONVERT_FAILED", detail: toSafeErrorMessage(error, "convertToScaledMode") }],
		}
	}
}

/**
 * Recalculate trade aggregates from executions
 * Useful for fixing data integrity issues
 */
export const recalculateTradeFromExecutions = async (
	tradeId: string
): Promise<ActionResponse<ExecutionSummary>> => {
	const t = await getTranslations("journal")
	try {
		const { userId, accountId } = await requireAuth()

		const trade = await db.query.trades.findFirst({
			where: and(eq(trades.id, tradeId), eq(trades.accountId, accountId)),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		if (trade.executionMode !== "scaled") {
			return {
				status: "error",
				message: t("errors.notScaledMode"),
				errors: [
					{
						code: "NOT_SCALED",
						detail: t("errors.notScaledMode"),
					},
				],
			}
		}

		const dek = await getUserDek(userId)
		await updateTradeAggregates(tradeId, dek)

		const rawExecutions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
		})

		// Decrypt execution fields if DEK is available
		const executions = dek
			? rawExecutions.map((ex) => decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution)
			: rawExecutions

		const summary = calculateExecutionSummary(executions)

		// Revalidate pages
		invalidateTradeData(tradeId, userId, accountId)
		return {
			status: "success",
			message: "Trade recalculated from executions successfully",
			data: summary,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to recalculate trade from executions",
			errors: [{ code: "RECALCULATE_FAILED", detail: toSafeErrorMessage(error, "recalculateTradeFromExecutions") }],
		}
	}
}
