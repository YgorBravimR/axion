import type { NextRequest } from "next/server"
import { z } from "zod"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { tags, tradeTags, trades } from "@/db/schema"
import { archAuth } from "../../_lib/auth"
import { archError, archSuccess, formatTradeForArch } from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"

const setTagsBodySchema = z.object({
	tradeId: z.string().uuid("tradeId must be a UUID"),
	tagIds: z.array(z.string().uuid("tagIds must be UUIDs")),
})

/**
 * POST /api/arch/trades/set-tags
 *
 * Full-replace semantics: removes every existing tag association for the trade
 * and inserts the provided ids. Pass an empty `tagIds` array to clear all tags.
 *
 * Body: { tradeId: uuid, tagIds: uuid[] }
 * - All tagIds must belong to the calling user (cross-tenant assignment is rejected).
 * - Returns the updated trade with resolved tagNames via formatTradeForArch.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = setTagsBodySchema.parse(await request.json())

		const trade = await db.query.trades.findFirst({
			where: and(eq(trades.id, body.tradeId), buildAccountCondition(auth)),
			columns: { id: true },
		})

		if (!trade) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or does not belong to this account",
					},
				],
				404
			)
		}

		const uniqueIds = Array.from(new Set(body.tagIds))
		if (uniqueIds.length > 0) {
			const ownedRows = await db
				.select({ id: tags.id })
				.from(tags)
				.where(and(inArray(tags.id, uniqueIds), eq(tags.userId, auth.userId)))

			if (ownedRows.length !== uniqueIds.length) {
				return archError(
					"One or more tagIds not found",
					[
						{
							code: "TAG_NOT_FOUND",
							detail:
								"At least one tagId does not exist or does not belong to this user",
						},
					],
					404
				)
			}
		}

		// neon-http driver does not support transactions; perform delete + insert
		// sequentially. Race risk is negligible for a single-user account scope.
		await db.delete(tradeTags).where(eq(tradeTags.tradeId, body.tradeId))
		if (uniqueIds.length > 0) {
			await db.insert(tradeTags).values(
				uniqueIds.map((tagId) => ({
					tradeId: body.tradeId,
					tagId,
				}))
			)
		}

		const tradeWithRelations = await db.query.trades.findFirst({
			where: eq(trades.id, body.tradeId),
			with: {
				strategy: { columns: { name: true } },
				timeframe: { columns: { name: true } },
				tradeTags: { with: { tag: true } },
			},
		})

		if (!tradeWithRelations) {
			return archError(
				"Tags replaced but trade could not be retrieved",
				[
					{
						code: "RETRIEVE_FAILED",
						detail: "Trade tag replacement succeeded but re-fetch failed",
					},
				],
				500
			)
		}

		return archSuccess(
			"Trade tags replaced successfully",
			formatTradeForArch(tradeWithRelations)
		)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError(
				"Validation failed",
				error.issues.map((issue) => ({
					code: "VALIDATION_ERROR",
					detail: `${issue.path.join(".") || "body"}: ${issue.message}`,
				}))
			)
		}

		return archError(
			"Failed to set tags",
			[{ code: "SET_TAGS_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
