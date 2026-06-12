/**
 * Backfill oneRSnapshotCents + rOutcome on existing trades.
 * Idempotent — only touches rows where oneRSnapshotCents is null.
 * Supports dryRun mode for production rollout staging.
 */
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { and, eq, isNull, isNotNull, asc, or } from "drizzle-orm"
import { captureROnEntry, computeROutcome } from "./r-snapshot"

interface BackfillInput {
	accountId: string
	dryRun?: boolean
}

interface BackfillResult {
	scanned: number
	wouldWrite: number
	wrote: number
}

const backfillTradesForAccount = async (
	input: BackfillInput
): Promise<BackfillResult> => {
	const rows = await db
		.select({
			id: trades.id,
			entryDate: trades.entryDate,
			pnl: trades.pnl,
			oneRSnapshotCents: trades.oneRSnapshotCents,
			rOutcome: trades.rOutcome,
		})
		.from(trades)
		.where(
			and(
				eq(trades.accountId, input.accountId),
				or(
					isNull(trades.oneRSnapshotCents),
					and(isNull(trades.rOutcome), isNotNull(trades.pnl))
				)
			)
		)
		.orderBy(asc(trades.entryDate))

	let wrote = 0
	for (const row of rows) {
		// Case 1: oneRSnapshotCents is missing — capture it from fractal plan
		if (row.oneRSnapshotCents === null) {
			// eslint-disable-next-line no-await-in-loop -- R snapshot captured per trade in entry-date order; sequential to correctly compute R against the plan state at each entry date
			const snapshot = await captureROnEntry({
				accountId: input.accountId,
				entryDate:
					row.entryDate instanceof Date
						? row.entryDate
						: new Date(row.entryDate as string),
			})
			if (snapshot === null) {
				continue
			}

			const updates: { oneRSnapshotCents: number; rOutcome?: string | null } = {
				oneRSnapshotCents: snapshot,
			}
			const pnlCents = row.pnl === null ? null : Number(row.pnl)
			if (pnlCents !== null && Number.isFinite(pnlCents) && snapshot > 0) {
				updates.rOutcome = computeROutcome({
					pnlCents,
					oneRSnapshotCents: snapshot,
				})
			}

			if (!input.dryRun) {
				// eslint-disable-next-line no-await-in-loop -- per-trade update following sequential R capture; must stay in order
				await db.update(trades).set(updates).where(eq(trades.id, row.id))
			}
			wrote++
		} else if (row.rOutcome === null && row.pnl !== null) {
			// Case 2: rOutcome is missing but both oneRSnapshotCents and pnl exist — compute rOutcome
			const pnlCents = Number(row.pnl)
			const oneRCents = row.oneRSnapshotCents
			if (
				Number.isFinite(pnlCents) &&
				oneRCents &&
				typeof oneRCents === "number" &&
				oneRCents > 0
			) {
				const updates = {
					rOutcome: computeROutcome({ pnlCents, oneRSnapshotCents: oneRCents }),
				}

				if (!input.dryRun) {
					// eslint-disable-next-line no-await-in-loop -- per-trade update; must stay sequential
					await db.update(trades).set(updates).where(eq(trades.id, row.id))
				}
				wrote++
			}
		}
	}

	return {
		scanned: rows.length,
		wouldWrite: wrote,
		wrote: input.dryRun ? 0 : wrote,
	}
}

export type { BackfillInput, BackfillResult }
export { backfillTradesForAccount }
