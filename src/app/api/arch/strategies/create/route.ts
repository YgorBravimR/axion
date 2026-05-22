import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { strategies, strategyConditions, strategyVersions } from "@/db/schema"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { createStrategySchema } from "@/lib/validations/strategy"
import type { CreateStrategyInput } from "@/lib/validations/strategy"
import { snapshotStrategy } from "@/lib/strategy-versions"

/**
 * POST /api/arch/strategies/create
 *
 * Creates a new strategy with optional conditions.
 * Validates input with Zod schema and handles unique constraint violations.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as CreateStrategyInput

		const validated = createStrategySchema.parse(body)
		const { conditions, ...strategyData } = validated

		const newStrategy = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(strategies)
				.values({
					userId: auth.userId,
					code: strategyData.code,
					name: strategyData.name,
					description: strategyData.description,
					entryCriteria: strategyData.entryCriteria,
					exitCriteria: strategyData.exitCriteria,
					riskRules: strategyData.riskRules,
					finalR: strategyData.finalR?.toString(),
					maxRiskPercent: strategyData.maxRiskPercent?.toString(),
					screenshotUrl: strategyData.screenshotUrl || null,
					screenshotS3Key: strategyData.screenshotS3Key || null,
					notes: strategyData.notes,
					isActive: strategyData.isActive,
				})
				.returning()
			if (!created) {
				throw new Error("Insert returned no row")
			}

			const [version] = await tx
				.insert(strategyVersions)
				.values(snapshotStrategy(created.id, created.currentVersion, created))
				.returning({ id: strategyVersions.id })
			if (!version) {
				throw new Error("Failed to create strategy version")
			}

			if (conditions?.length) {
				await tx.insert(strategyConditions).values(
					conditions.map((condition) => ({
						strategyId: created.id,
						strategyVersionId: version.id,
						conditionId: condition.conditionId,
						tier: condition.tier,
						sortOrder: condition.sortOrder,
					}))
				)
			}

			return created
		})

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
			return archError("Validation failed", [
				{ code: "VALIDATION_ERROR", detail: error.message },
			])
		}

		const errorMessage = String(error)
		const errorCause =
			error instanceof Error && error.cause instanceof Error
				? error.cause.message
				: ""

		if (
			errorMessage.includes("23505") ||
			errorMessage.includes("unique") ||
			errorCause.includes("unique")
		) {
			return archError(
				"Strategy code already exists",
				[
					{
						code: "DUPLICATE_CODE",
						detail: "A strategy with this code already exists for your account",
					},
				],
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
