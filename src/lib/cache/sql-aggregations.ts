import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { sql, and, type SQL } from "drizzle-orm"

// ==========================================
// Return types
// ==========================================

interface OverallStats {
	totalTrades: number
	netPnlCents: number
	winCount: number
	lossCount: number
	breakevenCount: number
	totalCommissionCents: number
	totalFeesCents: number
	avgWinCents: number | null
	avgLossCents: number | null
	avgR: number | null
}

interface DailyPnl {
	day: string
	pnlCents: number
	tradeCount: number
}

interface AssetPerformance {
	asset: string
	totalTrades: number
	pnlCents: number
	winCount: number
	lossCount: number
	avgR: number | null
	grossProfitCents: number
	grossLossCents: number
}

interface HourlyStats {
	hour: number
	totalTrades: number
	pnlCents: number
	winCount: number
	lossCount: number
	avgR: number | null
}

// ==========================================
// SQL aggregation functions
// ==========================================

/**
 * Returns a single row with overall trade statistics.
 *
 * @param conditions - Array of Drizzle SQL conditions to filter trades
 * @returns Aggregated stats (totals, win/loss counts, averages)
 */
const getOverallStatsSql = async (conditions: SQL[]): Promise<OverallStats> => {
	const result = await db
		.select({
			totalTrades: sql<number>`count(*)::integer`,
			netPnlCents: sql<number>`coalesce(sum(nullif(${trades.pnl}, '')::bigint), 0)`,
			winCount: sql<number>`count(*) filter (where ${trades.outcome} = 'win')`,
			lossCount: sql<number>`count(*) filter (where ${trades.outcome} = 'loss')`,
			breakevenCount: sql<number>`count(*) filter (where ${trades.outcome} = 'breakeven')`,
			totalCommissionCents: sql<number>`coalesce(sum(nullif(${trades.commission}, '')::bigint), 0)`,
			totalFeesCents: sql<number>`coalesce(sum(nullif(${trades.fees}, '')::bigint), 0)`,
			avgWinCents: sql<number | null>`avg(case when ${trades.outcome} = 'win' then nullif(${trades.pnl}, '')::bigint end)`,
			avgLossCents: sql<number | null>`avg(case when ${trades.outcome} = 'loss' then nullif(${trades.pnl}, '')::bigint end)`,
			avgR: sql<number | null>`avg(${trades.realizedRMultiple}::numeric)`,
		})
		.from(trades)
		.where(and(...conditions))

	return result[0] as OverallStats
}

/**
 * Returns daily PnL aggregates, grouped by BRT date.
 *
 * @param conditions - Array of Drizzle SQL conditions to filter trades
 * @returns Array of daily PnL rows ordered chronologically
 */
const getDailyPnlSql = async (conditions: SQL[]): Promise<DailyPnl[]> => {
	const result = await db
		.select({
			day: sql<string>`date(${trades.entryDate} at time zone 'America/Sao_Paulo')`,
			pnlCents: sql<number>`coalesce(sum(nullif(${trades.pnl}, '')::bigint), 0)`,
			tradeCount: sql<number>`count(*)::integer`,
		})
		.from(trades)
		.where(and(...conditions))
		.groupBy(sql`date(${trades.entryDate} at time zone 'America/Sao_Paulo')`)
		.orderBy(sql`date(${trades.entryDate} at time zone 'America/Sao_Paulo')`)

	return result as DailyPnl[]
}

/**
 * Returns performance metrics grouped by asset.
 *
 * @param conditions - Array of Drizzle SQL conditions to filter trades
 * @returns Array of per-asset performance rows ordered by PnL descending
 */
const getPerformanceByAssetSql = async (conditions: SQL[]): Promise<AssetPerformance[]> => {
	const pnlCents = sql<number>`coalesce(sum(nullif(${trades.pnl}, '')::bigint), 0)`

	const result = await db
		.select({
			asset: trades.asset,
			totalTrades: sql<number>`count(*)::integer`,
			pnlCents,
			winCount: sql<number>`count(*) filter (where ${trades.outcome} = 'win')`,
			lossCount: sql<number>`count(*) filter (where ${trades.outcome} = 'loss')`,
			avgR: sql<number | null>`avg(${trades.realizedRMultiple}::numeric)`,
			grossProfitCents: sql<number>`coalesce(sum(case when ${trades.outcome} = 'win' then nullif(${trades.pnl}, '')::bigint else 0 end), 0)`,
			grossLossCents: sql<number>`coalesce(sum(case when ${trades.outcome} = 'loss' then abs(nullif(${trades.pnl}, '')::bigint) else 0 end), 0)`,
		})
		.from(trades)
		.where(and(...conditions))
		.groupBy(trades.asset)
		.orderBy(sql`coalesce(sum(nullif(${trades.pnl}, '')::bigint), 0) desc`)

	return result as AssetPerformance[]
}

/**
 * Returns trade statistics grouped by hour of day (BRT timezone).
 *
 * @param conditions - Array of Drizzle SQL conditions to filter trades
 * @returns Array of hourly stats rows ordered by hour ascending
 */
const getHourlyStatsSql = async (conditions: SQL[]): Promise<HourlyStats[]> => {
	const hourExpr = sql`extract(hour from ${trades.entryDate} at time zone 'America/Sao_Paulo')::integer`

	const result = await db
		.select({
			hour: hourExpr,
			totalTrades: sql<number>`count(*)::integer`,
			pnlCents: sql<number>`coalesce(sum(nullif(${trades.pnl}, '')::bigint), 0)`,
			winCount: sql<number>`count(*) filter (where ${trades.outcome} = 'win')`,
			lossCount: sql<number>`count(*) filter (where ${trades.outcome} = 'loss')`,
			avgR: sql<number | null>`avg(${trades.realizedRMultiple}::numeric)`,
		})
		.from(trades)
		.where(and(...conditions))
		.groupBy(hourExpr)
		.orderBy(hourExpr)

	return result as HourlyStats[]
}

export {
	getOverallStatsSql,
	getDailyPnlSql,
	getPerformanceByAssetSql,
	getHourlyStatsSql,
}

export type {
	OverallStats,
	DailyPnl,
	AssetPerformance,
	HourlyStats,
}
