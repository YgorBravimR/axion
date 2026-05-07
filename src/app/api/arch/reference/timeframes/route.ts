import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { timeframes } from "@/db/schema"
import { asc } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	try {
		const rows = await db
			.select({
				id: timeframes.id,
				code: timeframes.code,
				name: timeframes.name,
				type: timeframes.type,
				value: timeframes.value,
				unit: timeframes.unit,
				isActive: timeframes.isActive,
			})
			.from(timeframes)
			.orderBy(asc(timeframes.sortOrder))

		return archSuccess("Timeframes retrieved successfully", rows)
	} catch (error) {
		return archError(
			"Failed to fetch timeframes",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
