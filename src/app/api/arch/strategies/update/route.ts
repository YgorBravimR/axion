import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { strategies, strategyConditions } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { updateStrategySchema } from "@/lib/validations/strategy"

interface ArchUpdateStrategyBody {
	id: string
	code?: string
	name?: string
	description?: string
	entryCriteria?: string
	exitCriteria?: string
	riskRules?: string
	targetRMultiple?: number
	maxRiskPercent?: number
	screenshotUrl?: string
	screenshotS3Key?: string
	notes?: string
	isActive?: boolean
	conditions?: Array<{
		conditionId: string
		tier: "mandatory" | "tier_2" | "tier_3"
		sortOrder?: number
	}>
}

/**
 * POST /api/arch/strategies/update
 *
 * Updates an existing strategy. Validates with Zod partial schema.
 * If conditions are provided, replaces existing conditions entirely.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as ArchUpdateStrategyBody

		if (!body.id) {
			return archError(
				"Missing required field: id",
				[{ code: "MISSING_FIELDS", detail: "Required: id (UUID)" }]
			)
		}

		const existing = await db.query.strategies.findFirst({
			where: and(
				eq(strategies.id, body.id),
				eq(strategies.userId, auth.userId)
			),
		})

		if (!existing) {
			return archError(
				"Strategy not found",
				[{ code: "NOT_FOUND", detail: "Strategy does not exist or does not belong to this user" }],
				404
			)
		}

		const { id, conditions, ...updateFields } = body
		const validated = updateStrategySchema.parse(updateFields)
		const { conditions: validatedConditions, ...strategyData } = validated

		const updateValues: Record<string, unknown> = {
			updatedAt: new Date(),
		}

		if (strategyData.code !== undefined) updateValues.code = strategyData.code
		if (strategyData.name !== undefined) updateValues.name = strategyData.name
		if (strategyData.description !== undefined) updateValues.description = strategyData.description
		if (strategyData.entryCriteria !== undefined) updateValues.entryCriteria = strategyData.entryCriteria
		if (strategyData.exitCriteria !== undefined) updateValues.exitCriteria = strategyData.exitCriteria
		if (strategyData.riskRules !== undefined) updateValues.riskRules = strategyData.riskRules
		if (strategyData.targetRMultiple !== undefined) updateValues.targetRMultiple = strategyData.targetRMultiple.toString()
		if (strategyData.maxRiskPercent !== undefined) updateValues.maxRiskPercent = strategyData.maxRiskPercent.toString()
		if (strategyData.screenshotUrl !== undefined) updateValues.screenshotUrl = strategyData.screenshotUrl || null
		if (strategyData.screenshotS3Key !== undefined) updateValues.screenshotS3Key = strategyData.screenshotS3Key || null
		if (strategyData.notes !== undefined) updateValues.notes = strategyData.notes
		if (strategyData.isActive !== undefined) updateValues.isActive = strategyData.isActive

		await db
			.update(strategies)
			.set(updateValues)
			.where(
				and(
					eq(strategies.id, id),
					eq(strategies.userId, auth.userId)
				)
			)

		const conditionsToInsert = validatedConditions ?? conditions
		if (conditionsToInsert !== undefined) {
			await db
				.delete(strategyConditions)
				.where(eq(strategyConditions.strategyId, id))

			if (conditionsToInsert.length) {
				await db.insert(strategyConditions).values(
					conditionsToInsert.map((condition) => ({
						strategyId: id,
						conditionId: condition.conditionId,
						tier: condition.tier,
						sortOrder: condition.sortOrder ?? 0,
					}))
				)
			}
		}

		const updatedStrategy = await db.query.strategies.findFirst({
			where: (s, { eq: eqOp }) => eqOp(s.id, id),
			with: {
				strategyConditions: {
					with: { condition: true },
				},
			},
		})

		return archSuccess("Strategy updated successfully", updatedStrategy)
	} catch (error) {
		if (error instanceof Error && error.name === "ZodError") {
			return archError(
				"Validation failed",
				[{ code: "VALIDATION_ERROR", detail: error.message }]
			)
		}

		const errorMessage = String(error)
		const errorCause = error instanceof Error ? String(error.cause ?? "") : ""

		if (
			errorMessage.includes("23505") ||
			errorMessage.includes("unique") ||
			errorCause.includes("unique")
		) {
			return archError(
				"Strategy code already exists",
				[{ code: "DUPLICATE_CODE", detail: "A strategy with this code already exists for your account" }],
				409
			)
		}

		return archError(
			"Failed to update strategy",
			[{ code: "UPDATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
