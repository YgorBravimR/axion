import type { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/db/drizzle"
import { tags } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const updateTagSchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	type: z.string().optional(),
	color: z.string().optional(),
	description: z.string().optional(),
})

const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = updateTagSchema.parse(await request.json())
		const { id, name, type, color, description } = body

		const existing = await db.query.tags.findFirst({
			where: and(eq(tags.id, id), eq(tags.userId, auth.userId)),
		})

		if (!existing) {
			return archError(
				"Tag not found",
				[{ code: "NOT_FOUND", detail: "Tag does not exist" }],
				404
			)
		}

		const [tag] = await db
			.update(tags)
			.set({
				...(name && { name }),
				...(type && { type }),
				...(color !== undefined && { color }),
				...(description !== undefined && { description }),
			} as Partial<typeof tags.$inferInsert>)
			.where(and(eq(tags.id, id), eq(tags.userId, auth.userId)))
			.returning()

		return archSuccess("Tag updated successfully", tag)
	} catch (error) {
		if (error instanceof Error && error.message.includes("unique")) {
			return archError("A tag with this name already exists", [
				{ code: "DUPLICATE_TAG", detail: "Tag name must be unique" },
			])
		}

		return archError(
			"Failed to update tag",
			[{ code: "UPDATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
