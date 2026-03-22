import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { tags } from "@/db/schema"
import { z } from "zod"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const createTagSchema = z.object({
	name: z.string().min(1).max(50),
	type: z.enum(["setup", "mistake", "general"]),
	color: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/)
		.optional(),
	description: z.string().max(500).optional(),
})

type CreateTagInput = z.infer<typeof createTagSchema>

/**
 * POST /api/arch/tags/create
 *
 * Creates a new tag for the user.
 * Validates input with Zod and handles unique constraint violations.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as CreateTagInput

		const validated = createTagSchema.parse(body)

		const [newTag] = await db
			.insert(tags)
			.values({
				userId: auth.userId,
				name: validated.name,
				type: validated.type,
				color: validated.color,
				description: validated.description,
			})
			.returning()

		return archSuccess("Tag created successfully", newTag)
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
				"Tag name already exists",
				[{ code: "DUPLICATE_NAME", detail: "A tag with this name already exists for your account" }],
				409
			)
		}

		return archError(
			"Failed to create tag",
			[{ code: "CREATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
