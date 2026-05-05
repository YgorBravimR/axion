import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { strategies } from "@/db/schema"
import { eq, asc } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const rows = await db
			.select({
				id: strategies.id,
				code: strategies.code,
				name: strategies.name,
				isActive: strategies.isActive,
				finalR: strategies.finalR,
				description: strategies.description,
			})
			.from(strategies)
			.where(eq(strategies.userId, auth.userId))
			.orderBy(asc(strategies.name))

		return archSuccess("Strategies retrieved successfully", rows)
	} catch (error) {
		return archError(
			"Failed to fetch strategies",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
