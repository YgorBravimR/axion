import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeTags } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../../_lib/auth"
import { archSuccess, archError } from "../../../_lib/helpers"
import { buildAccountCondition } from "../../../_lib/filters"
import { resolveTagName } from "../../../_lib/resolve-names"

interface RemoveTagBody {
	tradeId: string
	tag: string
}

/**
 * POST /api/arch/trades/tags/remove
 * Remove a single tag from a trade by fuzzy name resolution.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as RemoveTagBody

		if (!body.tradeId || !body.tag) {
			return archError("Missing required fields", [
				{ code: "VALIDATION_ERROR", detail: "tradeId and tag are required" },
			])
		}

		const tradeCondition = and(
			eq(trades.id, body.tradeId),
			buildAccountCondition(auth)
		)

		const trade = await db.query.trades.findFirst({
			where: tradeCondition,
		})

		if (!trade) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or you do not have access",
					},
				],
				404
			)
		}

		// Resolve fuzzy tag name to ID
		const tagId = await resolveTagName(body.tag, auth.userId)

		if (!tagId) {
			return archError("Tag not found", [
				{
					code: "RESOLUTION_FAILED",
					detail: `Could not resolve tag name: "${body.tag}"`,
				},
			])
		}

		await db
			.delete(tradeTags)
			.where(
				and(eq(tradeTags.tradeId, body.tradeId), eq(tradeTags.tagId, tagId))
			)

		return archSuccess("Tag removed successfully")
	} catch (error) {
		return archError(
			"Failed to remove tag",
			[{ code: "REMOVE_TAG_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
