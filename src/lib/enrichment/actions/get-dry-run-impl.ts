import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { tradeEnrichmentSnapshots } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import type {
	GetDryRunOutput,
	DryRunSnapshotHydrated,
} from "@/app/actions/enrichment.types"
import type { DryRunResult } from "@/lib/enrichment/types"

const getDryRunImpl = async (
	runId: string
): Promise<ActionResponse<GetDryRunOutput>> => {
	try {
		const authContext = await requireAuth()

		// Query snapshots by runId with draft status
		const snapshots = await db.query.tradeEnrichmentSnapshots.findMany({
			where: and(
				eq(tradeEnrichmentSnapshots.runId, runId as unknown as string),
				eq(tradeEnrichmentSnapshots.status, "draft")
			),
			with: {
				trade: true,
			},
		})

		// Filter to only snapshots where trade belongs to user's account(s)
		const authorizedSnapshots = snapshots.filter((snap) => {
			if (!snap.trade) {
				return false
			}
			if (authContext.showAllAccounts) {
				return authContext.allAccountIds.includes(snap.trade.accountId)
			}
			return snap.trade.accountId === authContext.accountId
		})

		// Hydrate snapshots
		const hydrated: DryRunSnapshotHydrated[] = authorizedSnapshots.map(
			(snap) => {
				const dryRunOutput = snap.dryRunOutput as {
					result: DryRunResult
					baseline: Record<string, unknown>
				} | null

				return {
					snapshotId: snap.id,
					tradeId: snap.tradeId,
					version: snap.version,
					status: snap.status as "draft" | "committed" | "abandoned",
					enrichedAt: snap.enrichedAt,
					dryRun: dryRunOutput?.result ?? ({} as DryRunResult),
					baseline: dryRunOutput?.baseline ?? {},
				}
			}
		)

		return {
			status: "success",
			message: `Found ${hydrated.length} draft snapshots for run ${runId}`,
			data: {
				runId,
				snapshots: hydrated,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error getting dry run:", error)
		}
		return {
			status: "error",
			message: "Failed to get dry run snapshots",
		}
	}
}

export { getDryRunImpl }
