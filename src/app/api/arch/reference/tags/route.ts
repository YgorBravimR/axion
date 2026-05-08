import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { tags } from "@/db/schema"
import { eq, asc } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const rows = await db
			.select({
				id: tags.id,
				name: tags.name,
				type: tags.type,
				color: tags.color,
				description: tags.description,
			})
			.from(tags)
			.where(eq(tags.userId, auth.userId))
			.orderBy(asc(tags.type), asc(tags.name))

		return archSuccess("Tags retrieved successfully", rows)
	} catch (error) {
		return archError(
			"Failed to fetch tags",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
