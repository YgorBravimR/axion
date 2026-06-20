"use server"

import { db } from "@/db/drizzle"
import { trades, tradeEnrichmentSnapshots } from "@/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"

import type { ActionResponse } from "@/types"
import type {
	AbandonDryRunInput,
	AbandonDryRunOutput,
} from "@/app/actions/enrichment.types"

export const abandonDryRunImpl = async (
	input: AbandonDryRunInput
): Promise<ActionResponse<AbandonDryRunOutput>> => {
	try {
		const authContext = await requireAuth()

		// Build account filter: get trade IDs in user's account(s)
		const userTradeIds = await db
			.select({ id: trades.id })
			.from(trades)
			.where(
				authContext.showAllAccounts
					? inArray(trades.accountId, authContext.allAccountIds)
					: eq(trades.accountId, authContext.accountId)
			)

		// Update snapshots: mark as abandoned, clear payload (D.18b)
		const updatedSnapshots = await db
			.update(tradeEnrichmentSnapshots)
			.set({
				status: "abandoned",
				dryRunOutput: {},
			})
			.where(
				and(
					eq(tradeEnrichmentSnapshots.runId, input.runId),
					eq(tradeEnrichmentSnapshots.status, "draft"),
					inArray(
						tradeEnrichmentSnapshots.tradeId,
						userTradeIds.map((t) => t.id)
					)
				)
			)
			.returning({ id: tradeEnrichmentSnapshots.id })

		return {
			status: "success",
			message: "Dry run abandoned",
			data: {
				runId: input.runId,
				abandonedCount: updatedSnapshots.length,
			},
		}
	} catch (error) {
		if (isFrameworkSignal(error)) {
			throw error
		}
		console.error("Failed to abandon dry run:", error)
		return {
			status: "error",
			message: "Failed to abandon dry run",
		}
	}
}
