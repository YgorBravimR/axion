import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"

const MIN_TRADING_DAYS = 20

interface AssertivityResult {
	assertivityPct: number
	tradingDays: number
	hasEnoughData: boolean
}

const getHistoricalAssertivity = async (
	accountId: string
): Promise<AssertivityResult> => {
	const rows = await db
		.select({
			dayPnl: sql<number>`sum(${trades.pnl}::bigint)`,
		})
		.from(trades)
		.where(and(eq(trades.accountId, accountId), isNotNull(trades.pnl)))
		.groupBy(sql`date_trunc('day', ${trades.entryDate})`)

	const tradingDays = rows.length
	const winDays = rows.filter((r) => (r.dayPnl ?? 0) > 0).length
	const hasEnoughData = tradingDays >= MIN_TRADING_DAYS
	const assertivityPct =
		tradingDays > 0 ? Math.round((winDays / tradingDays) * 100) : 50

	return { assertivityPct, tradingDays, hasEnoughData }
}

export { getHistoricalAssertivity, MIN_TRADING_DAYS }
export type { AssertivityResult }
