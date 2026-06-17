"use server"

import { db } from "@/db/drizzle"
import { trades, assets, tradeEnrichmentSnapshots } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"
import { deriveTradeFieldsFromEnrichment } from "@/lib/enrichment/derive-trade-fields"

import type { ActionResponse } from "@/types"
import type {
	CommitTradeInput,
	CommitTradeOutput,
	StalenessConflict,
} from "@/app/actions/enrichment.types"
import type {
	DryRunResult,
	MergedEnrichmentField,
} from "@/lib/enrichment/types"

// Deep equality check using JSON serialization
const deepEqual = (a: unknown, b: unknown): boolean => {
	try {
		return JSON.stringify(a) === JSON.stringify(b)
	} catch {
		return a === b
	}
}

export const commitTradeImpl = async (
	input: CommitTradeInput
): Promise<ActionResponse<CommitTradeOutput>> => {
	try {
		const authContext = await requireAuth()

		// Load snapshot
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
				message: "Snapshot not found or already committed/abandoned",
			}
		}

		// Load trade and authorize
		const trade = await db.query.trades.findFirst({
			where: eq(trades.id, input.tradeId),
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
			}
		}

		// Authorization check: user's account or in showAllAccounts list
		if (
			trade.accountId === null ||
			(trade.accountId !== authContext.accountId &&
				!authContext.allAccountIds.includes(trade.accountId))
		) {
			return {
				status: "error",
				message: "Unauthorized",
			}
		}

		// Extract dry run output
		const dryRunPayload = snapshot.dryRunOutput as {
			result: DryRunResult
			baseline: Record<string, unknown>
		}

		if (!dryRunPayload || !dryRunPayload.result || !dryRunPayload.baseline) {
			return {
				status: "error",
				message: "Invalid dry run output payload",
			}
		}

		const { result, baseline } = dryRunPayload

		// Staleness check per accepted field (D.19)
		const staleness: StalenessConflict[] = []
		const committedFields: string[] = []
		const updatePayload: Record<string, unknown> = {}

		for (const field of input.acceptedFields) {
			const baselineValue = baseline[field]
			const currentValue = (trade as Record<string, unknown>)[field]
			const isStale = !deepEqual(baselineValue, currentValue)

			if (isStale) {
				staleness.push({ field, baselineValue, currentValue })
			} else {
				committedFields.push(field)
				const mergedField = result.mergedFields[field] as
					| MergedEnrichmentField
					| undefined
				if (mergedField) {
					updatePayload[field] = mergedField.value
				}
			}
		}

		// Recompute derived R-math from the accepted fields ∪ current trade.
		// Same logic the createTrade action runs for new trades — so the journal
		// shows realizedRMultiple / plannedRMultiple / plannedRiskAmount / outcome
		// after enrichment, not just the raw pnl/SL/TP.
		const tradeAsset = await db.query.assets.findFirst({
			where: eq(assets.symbol, trade.asset),
		})
		const { patch: derivedPatch } = deriveTradeFieldsFromEnrichment({
			current: trade,
			accepted: updatePayload,
			asset: tradeAsset ?? null,
		})
		Object.assign(updatePayload, derivedPatch)

		// Add metadata fields
		updatePayload.enrichmentVersion = snapshot.version
		updatePayload.enrichedAt = new Date()

		// Determine enrichmentStatus based on result passes. "skipped" means
		// the pass had no input to work with (no CSV op, no candles), which
		// is not a failure — it's just a no-op. Only treat "failed" as
		// blocking. Anything else counts as enriched.
		const passStatuses = [
			result.passes.operations.passStatus,
			result.passes.candleMath.passStatus,
			result.passes.indicatorReadout.passStatus,
			result.passes.deterministicSlTarget.passStatus,
		]

		const allPassed = passStatuses.every((s) => s !== "failed")
		updatePayload.enrichmentStatus = allPassed ? "enriched" : "partial"

		// Persist per-pass statuses
		updatePayload.enrichmentOpsStatus = result.passes.operations.passStatus
		updatePayload.enrichmentCandleStatus = result.passes.candleMath.passStatus
		updatePayload.enrichmentIndicatorStatus =
			result.passes.indicatorReadout.passStatus
		updatePayload.enrichmentSlTargetStatus =
			result.passes.deterministicSlTarget.passStatus

		// Transaction: update trade and snapshot
		await db.transaction(async (tx) => {
			await tx
				.update(trades)
				.set(updatePayload)
				.where(eq(trades.id, input.tradeId))

			await tx
				.update(tradeEnrichmentSnapshots)
				.set({
					status: "committed",
					acceptedFields: input.acceptedFields,
					rejectedFields: input.rejectedFields,
				})
				.where(eq(tradeEnrichmentSnapshots.id, snapshot.id))
		})

		return {
			status: "success",
			message: "Trade committed",
			data: {
				snapshotId: snapshot.id,
				tradeId: input.tradeId,
				committedFields,
				staleness,
			},
		}
	} catch (error) {
		if (isFrameworkSignal(error)) {
			throw error
		}
		console.error("Failed to commit trade:", error)
		return {
			status: "error",
			message: "Failed to commit trade",
		}
	}
}
