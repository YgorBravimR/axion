/**
 * Tool: `get_trade_with_enrichment`
 *
 * Read the trade + its latest committed enrichment snapshot. Scoped to the
 * caller's active account via `requireAuth()`. Never accepts userId or
 * accountId from the caller (per isolation spec §B.1 + CI lint).
 *
 * Generic "not found" payload: same shape whether the trade doesn't exist
 * or belongs to another account. Indistinguishable.
 */
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import { trades, tradeEnrichmentSnapshots, type Trade } from "@/db/schema"

type TradeEnrichmentSnapshot = typeof tradeEnrichmentSnapshots.$inferSelect

const inputSchema = z.object({
	tradeId: z.string().uuid(),
})

type Input = z.infer<typeof inputSchema>

type Output =
	| {
			found: true
			trade: Trade
			latestCommittedSnapshot: TradeEnrichmentSnapshot | null
	  }
	| { found: false }

const getTradeWithEnrichment = async (rawInput: Input): Promise<Output> => {
	const { tradeId } = inputSchema.parse(rawInput)
	const { accountId } = await requireAuth()

	const [trade] = await db
		.select()
		.from(trades)
		.where(and(eq(trades.id, tradeId), eq(trades.accountId, accountId)))
		.limit(1)

	if (!trade) {
		return { found: false }
	}

	const [snapshot] = await db
		.select()
		.from(tradeEnrichmentSnapshots)
		.where(
			and(
				eq(tradeEnrichmentSnapshots.tradeId, tradeId),
				eq(tradeEnrichmentSnapshots.status, "committed")
			)
		)
		.orderBy(desc(tradeEnrichmentSnapshots.version))
		.limit(1)

	return {
		found: true,
		trade,
		latestCommittedSnapshot: snapshot ?? null,
	}
}

export { getTradeWithEnrichment, inputSchema }
export type { Input, Output }
