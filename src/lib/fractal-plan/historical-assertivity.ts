import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"

const MIN_TRADING_DAYS = 20

interface AssertivityResult {
	assertivityPct: number
	tradingDays: number
	hasEnoughData: boolean
}

/**
 * Computes historical daily assertivity (win days / total trading days).
 *
 * **Important semantic**: This is day-level assertivity, NOT trade-level. A day with
 * `dayPnl > 0` counts as a win, even if multiple trades occurred on that day (some winning,
 * some losing). Use this metric to measure frequency of profitable days, not win rate per trade.
 *
 * UI consumers should label this as "Daily Assertivity (%)" to disambiguate from trade-level
 * win rate. Default recommendation: only display if `hasEnoughData` is true (≥20 trading days).
 *
 * @param accountId - Account ID to analyze
 * @returns Assertivity percentage (0–100), trading day count, and data sufficiency flag
 */
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
