"use server"

import { getTranslations } from "next-intl/server"
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
export const createCondition = async (
	input: CreateConditionInput
): Promise<ActionResponse<TradingCondition>> => {
	const t = await getTranslations("playbook.conditionErrors")
	const tMsg = await getTranslations("playbook.messages")
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
			message: tMsg("conditionCreatedSuccessfully"),
			data: condition,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("validationFailed"),
				errors: [{ code: "VALIDATION_ERROR", detail: error.message }],
			}
		}

		if (error instanceof Error && error.message.includes("unique")) {
			return {
				status: "error",
				message: t("duplicateName"),
				errors: [
					{
						code: "DUPLICATE_CONDITION",
						detail: "Condition name must be unique",
					},
				],
			}
		}

		return {
			status: "error",
			message: t("createFailed"),
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
export const updateCondition = async (
	id: string,
	input: Partial<CreateConditionInput>
): Promise<ActionResponse<TradingCondition>> => {
	const t = await getTranslations("playbook.conditionErrors")
	const tMsg = await getTranslations("playbook.messages")
	try {
		const { userId } = await requireAuth()

		const existing = await db.query.tradingConditions.findFirst({
			where: and(
				eq(tradingConditions.id, id),
				eq(tradingConditions.userId, userId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("notFound"),
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
			.where(
				and(eq(tradingConditions.id, id), eq(tradingConditions.userId, userId))
			)
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: tMsg("conditionUpdatedSuccessfully"),
			data: condition,
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("unique")) {
			return {
				status: "error",
				message: t("duplicateName"),
				errors: [
					{
						code: "DUPLICATE_CONDITION",
						detail: "Condition name must be unique",
					},
				],
			}
		}

		return {
			status: "error",
			message: t("updateFailed"),
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
export const getConditions = async (
	category?: ConditionCategory
): Promise<ActionResponse<TradingCondition[]>> => {
	const t = await getTranslations("playbook.conditionErrors")
	const tMsg = await getTranslations("playbook.messages")
	try {
		const { userId } = await requireAuth()

		const conditions = category
			? and(
					eq(tradingConditions.userId, userId),
					eq(tradingConditions.category, category),
					eq(tradingConditions.isActive, true)
				)
			: and(
					eq(tradingConditions.userId, userId),
					eq(tradingConditions.isActive, true)
				)

		const result = await db.query.tradingConditions.findMany({
			where: conditions,
			orderBy: [asc(tradingConditions.category), asc(tradingConditions.name)],
		})

		return {
			status: "success",
			message: tMsg("conditionsRetrievedSuccessfully"),
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("fetchFailed"),
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
 * Soft-delete a trading condition by flipping isActive=false. Preserves the
 * row so historical trade_conditions rows keep their referential anchor —
 * deleting a condition that any trade evaluated would rewrite history.
 * The read path (getConditions) already filters isActive=true, so users
 * no longer see soft-deleted conditions in pickers.
 */
export const deleteCondition = async (
	id: string
): Promise<ActionResponse<void>> => {
	const t = await getTranslations("playbook.conditionErrors")
	const tMsg = await getTranslations("playbook.messages")
	try {
		const { userId } = await requireAuth()

		const existing = await db.query.tradingConditions.findFirst({
			where: and(
				eq(tradingConditions.id, id),
				eq(tradingConditions.userId, userId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("notFound"),
				errors: [{ code: "NOT_FOUND", detail: "Condition does not exist" }],
			}
		}

		await db
			.update(tradingConditions)
			.set({ isActive: false, updatedAt: new Date() })
			.where(
				and(eq(tradingConditions.id, id), eq(tradingConditions.userId, userId))
			)

		invalidatePlaybookData()

		return {
			status: "success",
			message: tMsg("conditionDeletedSuccessfully"),
		}
	} catch (error) {
		return {
			status: "error",
			message: t("deleteFailed"),
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteCondition"),
				},
			],
		}
	}
}
