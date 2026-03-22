import type { NextRequest } from "next/server"
import { eq, and, gte, lte, asc, inArray } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { fromCents } from "@/lib/money"
import { getStartOfMonth, getEndOfMonth, formatDateKey } from "@/lib/dates"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const yearParam = searchParams.get("year")
		const monthParam = searchParams.get("month")

		if (!yearParam || !monthParam) {
			return archError(
				"Missing required parameters",
				[{ code: "MISSING_PARAMS", detail: "year and month query params are required" }]
			)
		}

		const year = parseInt(yearParam, 10)
		const monthIndex = parseInt(monthParam, 10)

		if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
			return archError(
				"Invalid parameters",
				[{ code: "INVALID_PARAMS", detail: "year must be a number, month must be 0-11" }]
			)
		}

		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		// Use timezone-aware boundaries (BRT) to correctly match trade dates
		const refDate = new Date(year, monthIndex, 15)
		const startOfMonth = getStartOfMonth(refDate)
		const endOfMonth = getEndOfMonth(refDate)

		const rawResult = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, startOfMonth),
				lte(trades.entryDate, endOfMonth)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt trade fields
		const dek = await getUserDek(auth.userId)
		const result = dek
			? rawResult.map((t) => decryptTradeFields(t, dek))
			: rawResult

		// Group by date using local timezone
		const dailyMap = new Map<string, { pnl: number; count: number }>()

		for (const trade of result) {
			const dateKey = formatDateKey(trade.entryDate)
			const existing = dailyMap.get(dateKey) || { pnl: 0, count: 0 }
			existing.pnl += fromCents(trade.pnl)
			existing.count++
			dailyMap.set(dateKey, existing)
		}

		const dailyPnL = Array.from(dailyMap.entries()).map(
			([date, data]) => ({
				date,
				pnl: data.pnl,
				tradeCount: data.count,
			})
		)

		return archSuccess("Daily P&L retrieved", dailyPnL)
	} catch (error) {
		return archError(
			"Failed to retrieve daily P&L",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
