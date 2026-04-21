"use server"

import { invalidatePlaybookData } from "@/lib/cache/invalidate"
import { getTranslations } from "next-intl/server"
import { db } from "@/db/drizzle"
import { strategyScenarios, scenarioImages, strategies } from "@/db/schema"
import type { StrategyScenario, ScenarioImage } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, asc } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { deleteFile } from "@/lib/storage"
import {
	createScenarioSchema,
	updateScenarioSchema,
	type CreateScenarioInput,
	type UpdateScenarioInput,
} from "@/lib/validations/scenario"

interface ScenarioWithImages extends StrategyScenario {
	images: ScenarioImage[]
}

/**
 * Create a new scenario for a strategy
 */
const createScenario = async (
	input: CreateScenarioInput
): Promise<ActionResponse<StrategyScenario>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()
		const validated = createScenarioSchema.parse(input)

		// Verify strategy ownership
		const strategy = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, validated.strategyId), eq(strategies.userId, userId)),
		})

		if (!strategy) {
			return {
				status: "error",
				message: t("actions.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		const [scenario] = await db
			.insert(strategyScenarios)
			.values({
				strategyId: validated.strategyId,
				name: validated.name,
				description: validated.description || null,
				sortOrder: validated.sortOrder,
			})
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: t("actions.scenarioCreated"),
			data: scenario,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationFailed"),
				errors: [{ code: "VALIDATION_ERROR", detail: error.message }],
			}
		}

		return {
			status: "error",
			message: t("actions.scenarioCreateFailed"),
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "createScenario"),
				},
			],
		}
	}
}

/**
 * Update an existing scenario
 */
const updateScenario = async (
	id: string,
	input: UpdateScenarioInput
): Promise<ActionResponse<StrategyScenario>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()
		const validated = updateScenarioSchema.parse(input)

		// Verify ownership chain: scenario → strategy → user
		const existing = await db.query.strategyScenarios.findFirst({
			where: eq(strategyScenarios.id, id),
			with: { strategy: true },
		})

		if (!existing || existing.strategy.userId !== userId) {
			return {
				status: "error",
				message: t("actions.scenarioNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Scenario does not exist" }],
			}
		}

		const [scenario] = await db
			.update(strategyScenarios)
			.set({
				...(validated.name !== undefined && { name: validated.name }),
				...(validated.description !== undefined && {
					description: validated.description || null,
				}),
				...(validated.sortOrder !== undefined && { sortOrder: validated.sortOrder }),
				updatedAt: new Date(),
			})
			.where(eq(strategyScenarios.id, id))
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: t("actions.scenarioUpdated"),
			data: scenario,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.scenarioUpdateFailed"),
			errors: [
				{
					code: "UPDATE_FAILED",
					detail: toSafeErrorMessage(error, "updateScenario"),
				},
			],
		}
	}
}

/**
 * Delete a scenario and clean up its S3 images
 */
const deleteScenario = async (id: string): Promise<ActionResponse<void>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		// Verify ownership chain
		const existing = await db.query.strategyScenarios.findFirst({
			where: eq(strategyScenarios.id, id),
			with: { strategy: true, images: true },
		})

		if (!existing || existing.strategy.userId !== userId) {
			return {
				status: "error",
				message: t("actions.scenarioNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Scenario does not exist" }],
			}
		}

		// Delete S3 images before DB cascade
		for (const image of existing.images) {
			await deleteFile(image.s3Key).catch(() => {
				// Log but don't fail — image may already be deleted from S3
			})
		}

		await db.delete(strategyScenarios).where(eq(strategyScenarios.id, id))

		invalidatePlaybookData()

		return {
			status: "success",
			message: t("actions.scenarioDeleted"),
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.scenarioDeleteFailed"),
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteScenario"),
				},
			],
		}
	}
}

/**
 * Get all scenarios for a strategy, with images
 */
const getScenariosByStrategy = async (
	strategyId: string
): Promise<ActionResponse<ScenarioWithImages[]>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		// Verify strategy ownership
		const strategy = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
		})

		if (!strategy) {
			return {
				status: "error",
				message: t("actions.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		const scenarios = await db.query.strategyScenarios.findMany({
			where: eq(strategyScenarios.strategyId, strategyId),
			with: { images: { orderBy: [asc(scenarioImages.sortOrder)] } },
			orderBy: [asc(strategyScenarios.sortOrder)],
		})

		return {
			status: "success",
			message: t("actions.scenariosRetrieved"),
			data: scenarios,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.scenariosFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getScenariosByStrategy"),
				},
			],
		}
	}
}

/**
 * Add an image to a scenario
 */
const addScenarioImage = async (
	scenarioId: string,
	url: string,
	s3Key: string,
	sortOrder = 0
): Promise<ActionResponse<ScenarioImage>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		// Verify ownership chain
		const scenario = await db.query.strategyScenarios.findFirst({
			where: eq(strategyScenarios.id, scenarioId),
			with: { strategy: true, images: true },
		})

		if (!scenario || scenario.strategy.userId !== userId) {
			return {
				status: "error",
				message: t("actions.scenarioNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Scenario does not exist" }],
			}
		}

		// Enforce max 3 images per scenario
		if (scenario.images.length >= 3) {
			return {
				status: "error",
				message: t("actions.scenarioImageLimitExceeded"),
				errors: [{ code: "LIMIT_EXCEEDED", detail: "Cannot add more than 3 images" }],
			}
		}

		const [image] = await db
			.insert(scenarioImages)
			.values({ scenarioId, url, s3Key, sortOrder })
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: t("actions.scenarioImageAdded"),
			data: image,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.scenarioImageAddFailed"),
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "addScenarioImage"),
				},
			],
		}
	}
}

/**
 * Remove an image from a scenario
 */
const removeScenarioImage = async (imageId: string): Promise<ActionResponse<void>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		const image = await db.query.scenarioImages.findFirst({
			where: eq(scenarioImages.id, imageId),
			with: { scenario: { with: { strategy: true } } },
		})

		if (!image || image.scenario.strategy.userId !== userId) {
			return {
				status: "error",
				message: t("actions.scenarioImageNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Image does not exist" }],
			}
		}

		// Delete from S3
		await deleteFile(image.s3Key).catch(() => {})

		await db.delete(scenarioImages).where(eq(scenarioImages.id, imageId))

		invalidatePlaybookData()

		return {
			status: "success",
			message: t("actions.scenarioImageRemoved"),
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.scenarioImageRemoveFailed"),
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "removeScenarioImage"),
				},
			],
		}
	}
}

export {
	createScenario,
	updateScenario,
	deleteScenario,
	getScenariosByStrategy,
	addScenarioImage,
	removeScenarioImage,
	type ScenarioWithImages,
}
