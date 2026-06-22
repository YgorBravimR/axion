/**
 * Tool: `get_engine_replay_for_trade`
 *
 * Extract the Hawks indicator readout (`indicatorReadout` field) from the
 * trade's latest committed enrichment snapshot. That field is the engine's
 * point-in-time view at trade entry: HTF gates, MACD sign, VWAP sides,
 * AJUSTE position. The agent narrates this; it never invents.
 *
 * Returns `{ available: false }` when no committed snapshot exists or the
 * snapshot lacks an indicator readout (partial enrichment).
 */
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import { trades, tradeEnrichmentSnapshots } from "@/db/schema"
import type { DryRunResult } from "@/lib/enrichment/types"
import type { HawksIndicatorSnapshot } from "@/types/backtest"

const inputSchema = z.object({
	tradeId: z.string().uuid(),
})

type Input = z.infer<typeof inputSchema>

type Output =
	| {
			available: true
			tradeId: string
			indicatorReadout: HawksIndicatorSnapshot
			snapshotVersion: number
	  }
	| { available: false; reason: string }

const getEngineReplayForTrade = async (rawInput: Input): Promise<Output> => {
	const { tradeId } = inputSchema.parse(rawInput)
	const { accountId } = await requireAuth()

	// Ownership re-check via trade.accountId before reading the snapshot.
	const [trade] = await db
		.select({ id: trades.id })
		.from(trades)
		.where(and(eq(trades.id, tradeId), eq(trades.accountId, accountId)))
		.limit(1)
	if (!trade) {
		return { available: false, reason: "Trade not found" }
	}

	const [snapshot] = await db
		.select({
			version: tradeEnrichmentSnapshots.version,
			dryRunOutput: tradeEnrichmentSnapshots.dryRunOutput,
		})
		.from(tradeEnrichmentSnapshots)
		.where(
			and(
				eq(tradeEnrichmentSnapshots.tradeId, tradeId),
				eq(tradeEnrichmentSnapshots.status, "committed")
			)
		)
		.orderBy(desc(tradeEnrichmentSnapshots.version))
		.limit(1)

	if (!snapshot) {
		return {
			available: false,
			reason: "No committed enrichment snapshot for this trade",
		}
	}

	const payload = snapshot.dryRunOutput as { result?: DryRunResult } | null
	const indicatorReadout = payload?.result?.indicatorReadout ?? null
	if (!indicatorReadout) {
		return {
			available: false,
			reason:
				"Enrichment snapshot exists but no indicator readout (likely partial enrichment)",
		}
	}

	return {
		available: true,
		tradeId,
		indicatorReadout,
		snapshotVersion: snapshot.version,
	}
}

export { getEngineReplayForTrade, inputSchema }
export type { Input, Output }
