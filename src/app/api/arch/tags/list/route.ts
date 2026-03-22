import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { tags, tradeTags, trades } from "@/db/schema"
import { eq, and, asc, inArray } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { calculateWinRate } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"

/**
 * GET /api/arch/tags/list
 *
 * Lists all tags for the user with per-tag performance stats.
 * Sorted by tradeCount descending.
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const userTags = await db
			.select()
			.from(tags)
			.where(eq(tags.userId, auth.userId))
			.orderBy(asc(tags.name))

		if (userTags.length === 0) {
			return archSuccess("Tags retrieved", { items: [] })
		}

		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		const dek = await getUserDek(auth.userId)

		const tagStats = await Promise.all(
			userTags.map(async (tag) => {
				const tagTradeLinks = await db
					.select({ tradeId: tradeTags.tradeId })
					.from(tradeTags)
					.where(eq(tradeTags.tagId, tag.id))

				const tradeIds = tagTradeLinks.map((link) => link.tradeId)

				if (tradeIds.length === 0) {
					return {
						id: tag.id,
						name: tag.name,
						type: tag.type,
						color: tag.color,
						description: tag.description,
						createdAt: tag.createdAt,
						stats: {
							tradeCount: 0,
							totalPnl: 0,
							winRate: 0,
							avgR: 0,
						},
					}
				}

				const rawTrades = await db.query.trades.findMany({
					where: and(
						inArray(trades.id, tradeIds),
						accountCondition,
						eq(trades.isArchived, false)
					),
				})

				const tagTrades = dek
					? rawTrades.map((trade) => decryptTradeFields(trade, dek))
					: rawTrades

				let totalPnl = 0
				let winCount = 0
				let totalR = 0
				let rCount = 0

				for (const trade of tagTrades) {
					totalPnl += fromCents(trade.pnl)

					if (trade.outcome === "win") winCount++

					if (trade.realizedRMultiple) {
						totalR += Number(trade.realizedRMultiple)
						rCount++
					}
				}

				const tradeCount = tagTrades.length

				return {
					id: tag.id,
					name: tag.name,
					type: tag.type,
					color: tag.color,
					description: tag.description,
					createdAt: tag.createdAt,
					stats: {
						tradeCount,
						totalPnl: Math.round(totalPnl * 100) / 100,
						winRate: calculateWinRate(winCount, tradeCount),
						avgR: rCount > 0 ? Math.round((totalR / rCount) * 100) / 100 : 0,
					},
				}
			})
		)

		const sorted = tagStats.toSorted(
			(a, b) => b.stats.tradeCount - a.stats.tradeCount
		)

		return archSuccess("Tags retrieved", { items: sorted })
	} catch (error) {
		return archError(
			"Failed to fetch tags",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
