import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { tradeEnrichmentSnapshots, trades } from "@/db/schema"
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
		const accountIds = authContext.showAllAccounts
			? authContext.allAccountIds
			: [authContext.accountId]

		const rows = await db
			.select({
				snapshot: tradeEnrichmentSnapshots,
				tradeAccountId: trades.accountId,
			})
			.from(tradeEnrichmentSnapshots)
			.innerJoin(trades, eq(trades.id, tradeEnrichmentSnapshots.tradeId))
			.where(
				and(
					eq(tradeEnrichmentSnapshots.runId, runId),
					eq(tradeEnrichmentSnapshots.status, "draft"),
					inArray(trades.accountId, accountIds)
				)
			)

		const hydrated: DryRunSnapshotHydrated[] = rows.map(({ snapshot }) => {
			const dryRunOutput = snapshot.dryRunOutput as {
				result: DryRunResult
				baseline: Record<string, unknown>
			} | null

			return {
				snapshotId: snapshot.id,
				tradeId: snapshot.tradeId,
				version: snapshot.version,
				status: snapshot.status as "draft" | "committed" | "abandoned",
				enrichedAt: snapshot.enrichedAt,
				dryRun: dryRunOutput?.result ?? ({} as DryRunResult),
				baseline: dryRunOutput?.baseline ?? {},
				acceptedFields: snapshot.acceptedFields ?? null,
				rejectedFields: snapshot.rejectedFields ?? null,
			}
		})

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
