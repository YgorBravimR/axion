"use server"

import { invalidatePlaybookData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { tradingConditions } from "@/db/schema"
import type { TradingCondition } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type { ConditionCategory } from "@/types/trading-condition"
import { eq, and, asc } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import {
	createConditionSchema,
	type CreateConditionInput,
} from "@/lib/validations/trading-condition"

/**
 * Create a new trading condition (user-level, shared across all strategies)
 */
const createCondition = async (
	input: CreateConditionInput
): Promise<ActionResponse<TradingCondition>> => {
	try {
		const { userId } = await requireAuth()
		const validated = createConditionSchema.parse(input)

		const [condition] = await db
			.insert(tradingConditions)
			.values({
				userId,
				name: validated.name,
				description: validated.description || null,
				category: validated.category,
			})
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: "Condition created successfully",
			data: condition,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: [{ code: "VALIDATION_ERROR", detail: error.message }],
			}
		}

		if (error instanceof Error && error.message.includes("unique")) {
			return {
				status: "error",
				message: "A condition with this name already exists",
				errors: [{ code: "DUPLICATE_CONDITION", detail: "Condition name must be unique" }],
			}
		}

		return {
			status: "error",
			message: "Failed to create condition",
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "createCondition"),
				},
			],
		}
	}
}

/**
 * Update an existing trading condition
 */
const updateCondition = async (
	id: string,
	input: Partial<CreateConditionInput>
): Promise<ActionResponse<TradingCondition>> => {
	try {
		const { userId } = await requireAuth()

		const existing = await db.query.tradingConditions.findFirst({
			where: and(eq(tradingConditions.id, id), eq(tradingConditions.userId, userId)),
		})

		if (!existing) {
			return {
				status: "error",
				message: "Condition not found",
				errors: [{ code: "NOT_FOUND", detail: "Condition does not exist" }],
			}
		}

		const [condition] = await db
			.update(tradingConditions)
			.set({
				...(input.name !== undefined && { name: input.name }),
				...(input.category !== undefined && { category: input.category }),
				...(input.description !== undefined && {
					description: input.description || null,
				}),
				updatedAt: new Date(),
			})
			.where(and(eq(tradingConditions.id, id), eq(tradingConditions.userId, userId)))
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: "Condition updated successfully",
			data: condition,
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("unique")) {
			return {
				status: "error",
				message: "A condition with this name already exists",
				errors: [{ code: "DUPLICATE_CONDITION", detail: "Condition name must be unique" }],
			}
		}

		return {
			status: "error",
			message: "Failed to update condition",
			errors: [
				{
					code: "UPDATE_FAILED",
					detail: toSafeErrorMessage(error, "updateCondition"),
				},
			],
		}
	}
}

/**
 * Get all trading conditions for the current user, optionally filtered by category.
 */
const getConditions = async (
	category?: ConditionCategory
): Promise<ActionResponse<TradingCondition[]>> => {
	try {
		const { userId } = await requireAuth()

		const conditions = category
			? and(
					eq(tradingConditions.userId, userId),
					eq(tradingConditions.category, category),
					eq(tradingConditions.isActive, true)
				)
			: and(eq(tradingConditions.userId, userId), eq(tradingConditions.isActive, true))

		const result = await db.query.tradingConditions.findMany({
			where: conditions,
			orderBy: [asc(tradingConditions.category), asc(tradingConditions.name)],
		})

		return {
			status: "success",
			message: "Conditions retrieved successfully",
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve conditions",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getConditions"),
				},
			],
		}
	}
}

/**
 * Delete a trading condition (cascades to strategy_conditions junction)
 */
const deleteCondition = async (id: string): Promise<ActionResponse<void>> => {
	try {
		const { userId } = await requireAuth()

		const existing = await db.query.tradingConditions.findFirst({
			where: and(eq(tradingConditions.id, id), eq(tradingConditions.userId, userId)),
		})

		if (!existing) {
			return {
				status: "error",
				message: "Condition not found",
				errors: [{ code: "NOT_FOUND", detail: "Condition does not exist" }],
			}
		}

		// Delete will cascade to strategy_conditions due to onDelete: "cascade"
		await db
			.delete(tradingConditions)
			.where(and(eq(tradingConditions.id, id), eq(tradingConditions.userId, userId)))

		invalidatePlaybookData()

		return {
			status: "success",
			message: "Condition deleted successfully",
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to delete condition",
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteCondition"),
				},
			],
		}
	}
}

export { createCondition, updateCondition, getConditions, deleteCondition }
