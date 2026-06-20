/**
 * Pure function to find IDs of expired draft enrichment snapshots.
 * Exported for unit testing and reuse.
 */
export const findExpiredDraftIds = (
	snapshots: Array<{
		id: string
		status: "draft" | "committed" | "abandoned"
		expires_at: Date | string | null
	}>,
	now: Date
): string[] => {
	return snapshots
		.filter(
			(snap) =>
				snap.status === "draft" &&
				snap.expires_at &&
				new Date(snap.expires_at) < now
		)
		.map((snap) => snap.id)
}
