"use server"

import { db } from "@/db/drizzle"
import { trades, tradeEnrichmentSnapshots } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"

import type { ActionResponse } from "@/types"
import type {
	SaveDraftSelectionsInput,
	SaveDraftSelectionsOutput,
} from "@/app/actions/enrichment.types"

// Persists per-snapshot accepted/rejected field choices on the DRAFT row.
// Status stays "draft" — this is not a commit. Repeated calls overwrite the
// arrays. A no-op when the snapshot has already been committed or abandoned
// (the user's choices for that row are frozen at that point).
export const saveDraftSelectionsImpl = async (
	input: SaveDraftSelectionsInput
): Promise<ActionResponse<SaveDraftSelectionsOutput>> => {
	try {
		const authContext = await requireAuth()

		const snapshot = await db.query.tradeEnrichmentSnapshots.findFirst({
			where: and(
				eq(tradeEnrichmentSnapshots.runId, input.runId),
				eq(tradeEnrichmentSnapshots.tradeId, input.tradeId),
				eq(tradeEnrichmentSnapshots.status, "draft")
			),
		})

		if (!snapshot) {
			return {
				status: "error",
				message: "Snapshot not found or no longer draft",
			}
		}

		const trade = await db.query.trades.findFirst({
			where: eq(trades.id, input.tradeId),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
			}
		}

		if (
			trade.accountId !== authContext.accountId &&
			!authContext.allAccountIds.includes(trade.accountId ?? "")
		) {
			return {
				status: "error",
				message: "Unauthorized",
			}
		}

		await db
			.update(tradeEnrichmentSnapshots)
			.set({
				acceptedFields: input.acceptedFields,
				rejectedFields: input.rejectedFields,
			})
			.where(eq(tradeEnrichmentSnapshots.id, snapshot.id))

		return {
			status: "success",
			message: "Draft saved",
			data: { snapshotId: snapshot.id },
		}
	} catch (error) {
		if (isFrameworkSignal(error)) {
			throw error
		}
		return {
			status: "error",
			message: "Failed to save draft selections",
		}
	}
}
