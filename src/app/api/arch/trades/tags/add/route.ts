import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeTags } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../../_lib/auth"
import { archSuccess, archError } from "../../../_lib/helpers"
import { buildAccountCondition } from "../../../_lib/filters"
import { resolveTagNames } from "../../../_lib/resolve-names"

interface AddTagsBody {
	tradeId: string
	tags: string[]
}

/**
 * POST /api/arch/trades/tags/add
 * Add tags to a trade by fuzzy name resolution.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as AddTagsBody

		if (!body.tradeId || !Array.isArray(body.tags) || body.tags.length === 0) {
			return archError("Missing required fields", [
				{
					code: "VALIDATION_ERROR",
					detail: "tradeId and tags (non-empty array) are required",
				},
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

		// Resolve fuzzy tag names to IDs
		const resolvedTagIds = await resolveTagNames(body.tags, auth.userId)

		if (resolvedTagIds.length === 0) {
			return archError("No tags could be resolved", [
				{
					code: "RESOLUTION_FAILED",
					detail: "None of the provided tag names matched existing tags",
				},
			])
		}

		// Get existing tag associations for this trade to avoid duplicates
		const existingAssociations = await db
			.select({ tagId: tradeTags.tagId })
			.from(tradeTags)
			.where(eq(tradeTags.tradeId, body.tradeId))

		const existingTagIds = new Set(
			existingAssociations.map((assoc) => assoc.tagId)
		)

		const newTagIds = resolvedTagIds.filter(
			(tagId) => !existingTagIds.has(tagId)
		)

		if (newTagIds.length > 0) {
			const insertValues = newTagIds.map((tagId) => ({
				tradeId: body.tradeId,
				tagId,
			}))

			await db.insert(tradeTags).values(insertValues)
		}

		return archSuccess("Tags added successfully", {
			resolvedCount: resolvedTagIds.length,
			newlyAddedCount: newTagIds.length,
			alreadyAssociatedCount: resolvedTagIds.length - newTagIds.length,
		})
	} catch (error) {
		return archError(
			"Failed to add tags",
			[{ code: "ADD_TAGS_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
