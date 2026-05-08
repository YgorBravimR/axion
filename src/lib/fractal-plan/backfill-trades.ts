/**
 * Backfill oneRSnapshotCents + rOutcome on existing trades.
 * Idempotent — only touches rows where oneRSnapshotCents is null.
 * Supports dryRun mode for production rollout staging.
 */
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { and, eq, isNull, asc } from "drizzle-orm"
import { captureROnEntry } from "./r-snapshot"

interface BackfillInput {
	accountId: string
	dryRun?: boolean
}

interface BackfillResult {
	scanned: number
	wouldWrite: number
	wrote: number
}

const computeR = (pnlCents: number, oneRCents: number): string =>
	(pnlCents / oneRCents).toFixed(2)

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
				isNull(trades.oneRSnapshotCents)
			)
		)
		.orderBy(asc(trades.entryDate))

	let wrote = 0
	for (const row of rows) {
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

		const updates: { oneRSnapshotCents: number; rOutcome?: string } = {
			oneRSnapshotCents: snapshot,
		}
		const pnlCents = row.pnl === null ? null : Number(row.pnl)
		if (pnlCents !== null && Number.isFinite(pnlCents) && snapshot > 0) {
			updates.rOutcome = computeR(pnlCents, snapshot)
		}

		if (!input.dryRun) {
			// eslint-disable-next-line no-await-in-loop -- per-trade update following sequential R capture; must stay in order
			await db.update(trades).set(updates).where(eq(trades.id, row.id))
		}
		wrote++
	}

	return {
		scanned: rows.length,
		wouldWrite: wrote,
		wrote: input.dryRun ? 0 : wrote,
	}
}

export type { BackfillInput, BackfillResult }
export { backfillTradesForAccount }
