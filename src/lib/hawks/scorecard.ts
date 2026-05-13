import { and, eq, gte, lt, isNull, count } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	accountModes,
	trades,
	tradeHawksMetadata,
	dailyHawksBias,
	tradeStopAuditEvents,
} from "@/db/schema"

interface HawksScorecardData {
	tripleScreenRate: number
	biasAlignmentRate: number
	stopViolationCount: number
	overTradeDays: number
	totalHawksTrades: number
	methodologyScore: number
}

/**
 * Computes the Hawks methodology scorecard for a given calendar month.
 * Returns null when the account is not in Hawks mode.
 */
async function getHawksScorecardForMonth(
	accountId: string,
	year: number,
	month: number
): Promise<HawksScorecardData | null> {
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

	const monthStart = new Date(Date.UTC(year, month - 1, 1))
	const monthEnd = new Date(Date.UTC(year, month, 1))

	const [tradeRows, biasRows, violationRows] = await Promise.all([
		db
			.select({
				tripleScreenConfirmed: tradeHawksMetadata.tripleScreenConfirmed,
				biasAtEntry: tradeHawksMetadata.biasAtEntry,
				dailyTradeOrdinal: tradeHawksMetadata.dailyTradeOrdinal,
				entryDate: trades.entryDate,
			})
			.from(tradeHawksMetadata)
			.innerJoin(trades, eq(trades.id, tradeHawksMetadata.tradeId))
			.where(
				and(
					eq(trades.accountId, accountId),
					gte(trades.entryDate, monthStart),
					lt(trades.entryDate, monthEnd),
					eq(trades.isArchived, false)
				)
			),
		db.query.dailyHawksBias.findMany({
			where: and(
				eq(dailyHawksBias.accountId, accountId),
				gte(dailyHawksBias.tradingDay, monthStart.toISOString().slice(0, 10)),
				lt(dailyHawksBias.tradingDay, monthEnd.toISOString().slice(0, 10))
			),
			columns: { tradingDay: true, bias: true },
		}),
		db
			.select({ total: count() })
			.from(tradeStopAuditEvents)
			.innerJoin(trades, eq(trades.id, tradeStopAuditEvents.tradeId))
			.where(
				and(
					eq(trades.accountId, accountId),
					gte(trades.entryDate, monthStart),
					lt(trades.entryDate, monthEnd),
					eq(trades.isArchived, false),
					eq(tradeStopAuditEvents.methodViolation, true)
				)
			),
	])

	if (tradeRows.length === 0) {
		return {
			tripleScreenRate: 0,
			biasAlignmentRate: 0,
			stopViolationCount: 0,
			overTradeDays: 0,
			totalHawksTrades: 0,
			methodologyScore: 0,
		}
	}

	const biasMap = new Map<string, string>()
	for (const row of biasRows) {
		biasMap.set(row.tradingDay, row.bias)
	}

	let tripleScreenCount = 0
	let biasAlignedCount = 0
	const dateMaxOrdinal = new Map<string, number>()

	for (const row of tradeRows) {
		if (row.tripleScreenConfirmed) {
			tripleScreenCount++
		}

		const dateStr = new Date(row.entryDate).toISOString().slice(0, 10)
		if (biasMap.get(dateStr) === row.biasAtEntry) {
			biasAlignedCount++
		}

		const currentMax = dateMaxOrdinal.get(dateStr) ?? 0
		if (row.dailyTradeOrdinal > currentMax) {
			dateMaxOrdinal.set(dateStr, row.dailyTradeOrdinal)
		}
	}

	const total = tradeRows.length
	const tripleScreenRate = tripleScreenCount / total
	const biasAlignmentRate = biasAlignedCount / total
	const stopViolationCount = Number(violationRows[0]?.total ?? 0)
	const overTradeDays = [...dateMaxOrdinal.values()].filter(
		(ord) => ord > 3
	).length
	const methodologyScore =
		tripleScreenRate * 0.4 +
		biasAlignmentRate * 0.4 +
		(stopViolationCount === 0 ? 0.2 : 0)

	return {
		tripleScreenRate,
		biasAlignmentRate,
		stopViolationCount,
		overTradeDays,
		totalHawksTrades: total,
		methodologyScore,
	}
}

export { getHawksScorecardForMonth }
export type { HawksScorecardData }
