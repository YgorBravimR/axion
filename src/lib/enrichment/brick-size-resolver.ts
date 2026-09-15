import { and, desc, eq, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksRenkoSizes } from "@/db/schema"
import { format } from "date-fns"
import { rNumberToPoints } from "./r-number"

// Picks the calibration in force on the trade date: the most recent row with
// effective_date <= entryDate.
//
// This used to snap entryDate to its ISO-week Monday and require an EXACT row
// on that Monday. That silently returned null in two real cases, both of which
// exist in the measured 134-week series:
//
//   1. Carnival weeks. B3 is shut Monday and Tuesday, so the week's first
//      trading day — and the stored effective_date — is the Wednesday
//      (2024-02-14, 2025-03-05, 2026-02-18). Asking for the Monday found
//      nothing.
//   2. Gap weeks. Year-end weeks are absent from the series entirely, so
//      consecutive rows are not always 7 days apart.
//
// The old synthetic seed was 22 consecutive Mondays with no gaps, so the bug
// could never fire. Real data fires it.
//
// This is the same shape inspector-data, hawks-engine-lab-data and the OCO
// reader already use, so it is now consistent across every consumer.
const resolveBrickSize5mPoints = async (
	assetId: string,
	entryDate: Date
): Promise<number | null> => {
	const target = format(entryDate, "yyyy-MM-dd")

	const row = await db.query.hawksRenkoSizes.findFirst({
		where: and(
			eq(hawksRenkoSizes.assetId, assetId),
			lte(hawksRenkoSizes.effectiveDate, target)
		),
		orderBy: [desc(hawksRenkoSizes.effectiveDate)],
	})

	if (!row) {
		return null
	}

	return rNumberToPoints(row.size5m)
}

export { rNumberToPoints, resolveBrickSize5mPoints }
