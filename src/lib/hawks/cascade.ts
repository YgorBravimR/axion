import { and, eq, gte, lt, isNull, isNotNull } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { accountModes, trades, tradeHawksMetadata } from "@/db/schema"
import { formatDateKey, BRT_OFFSET } from "@/lib/dates"

type CascadeReason = "single-5r" | "cumulative-10r"

interface CascadeResult {
	triggered: boolean
	reason: CascadeReason | null
	currentR: number
}

/**
 * Checks if the Hawks R-based cascade stop is triggered for a given account on
 * a given trading day. Queries DB directly (no requireAuth) so it can be called
 * from archAuth routes and plain server actions alike.
 *
 * Returns null when the account is not in Hawks mode.
 */
async function checkHawksCascade(
	accountId: string,
	tradingDay: Date
): Promise<CascadeResult | null> {
	const activeMode = await db.query.accountModes.findFirst({
		where: and(
			eq(accountModes.accountId, accountId),
			isNull(accountModes.deactivatedAt)
		),
		columns: { mode: true },
	})
	if (activeMode?.mode !== "hawks") {
		return null
	}

	const dayStart = new Date(
		`${formatDateKey(tradingDay)}T00:00:00${BRT_OFFSET}`
	)
	const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

	// tradeHawksMetadata has no accountId — must JOIN through trades
	const rows = await db
		.select({ rOutcome: trades.rOutcome })
		.from(tradeHawksMetadata)
		.innerJoin(trades, eq(trades.id, tradeHawksMetadata.tradeId))
		.where(
			and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, dayStart),
				lt(trades.entryDate, dayEnd),
				isNotNull(trades.exitDate),
				isNotNull(trades.rOutcome),
				eq(trades.isArchived, false)
			)
		)

	if (rows.length === 0) {
		return { triggered: false, reason: null, currentR: 0 }
	}

	const rValues = rows.map((r) => Number(r.rOutcome ?? 0))
	const currentR = rValues.reduce((sum, r) => sum + r, 0)
	const worstSingle = Math.min(...rValues)

	const triggered =
		worstSingle <= -5 ? "single-5r" : currentR <= -10 ? "cumulative-10r" : null
	return {
		triggered: triggered !== null,
		reason: triggered,
		currentR,
	}
}

export { checkHawksCascade }
export type { CascadeResult, CascadeReason }
