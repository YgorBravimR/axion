import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksRenkoSizes } from "@/db/schema"
import { weekStart } from "@/lib/calendar/iso-week"
import { format } from "date-fns"

const POINTS_PER_TICK = 5

const rNumberToPoints = (rNumber: number): number => {
	return (rNumber - 1) * POINTS_PER_TICK
}

const resolveBrickSize5mPoints = async (
	assetId: string,
	entryDate: Date
): Promise<number | null> => {
	const monday = weekStart(entryDate)
	const effectiveDate = format(monday, "yyyy-MM-dd")

	const row = await db.query.hawksRenkoSizes.findFirst({
		where: and(
			eq(hawksRenkoSizes.assetId, assetId),
			eq(hawksRenkoSizes.effectiveDate, effectiveDate)
		),
	})

	if (!row) {
		return null
	}

	return rNumberToPoints(row.size5m)
}

export { rNumberToPoints, resolveBrickSize5mPoints }
