import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { strategies, strategyConditions } from "@/db/schema"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { createStrategySchema } from "@/lib/validations/strategy"
import type { CreateStrategyInput } from "@/lib/validations/strategy"

/**
 * POST /api/arch/strategies/create
 *
 * Creates a new strategy with optional conditions.
 * Validates input with Zod schema and handles unique constraint violations.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as CreateStrategyInput

		const validated = createStrategySchema.parse(body)
		const { conditions, ...strategyData } = validated

		const [newStrategy] = await db
			.insert(strategies)
			.values({
				userId: auth.userId,
				code: strategyData.code,
				name: strategyData.name,
				description: strategyData.description,
				entryCriteria: strategyData.entryCriteria,
				exitCriteria: strategyData.exitCriteria,
				riskRules: strategyData.riskRules,
				targetRMultiple: strategyData.targetRMultiple?.toString(),
				maxRiskPercent: strategyData.maxRiskPercent?.toString(),
				screenshotUrl: strategyData.screenshotUrl || null,
				screenshotS3Key: strategyData.screenshotS3Key || null,
				notes: strategyData.notes,
				isActive: strategyData.isActive,
			})
			.returning()

		if (conditions?.length) {
			await db.insert(strategyConditions).values(
				conditions.map((condition) => ({
					strategyId: newStrategy.id,
					conditionId: condition.conditionId,
					tier: condition.tier,
					sortOrder: condition.sortOrder,
				}))
			)
		}

		const createdStrategy = await db.query.strategies.findFirst({
			where: (s, { eq }) => eq(s.id, newStrategy.id),
			with: {
				strategyConditions: {
					with: { condition: true },
				},
			},
		})

		return archSuccess("Strategy created successfully", createdStrategy)
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
			"Failed to create strategy",
			[{ code: "CREATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
