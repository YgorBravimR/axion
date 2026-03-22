import type { NextRequest } from "next/server"
import { eq, and, gte, lte, inArray } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades, settings, tradingAccounts } from "@/db/schema"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"
import type { SQL } from "drizzle-orm"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const mode = searchParams.get("mode") === "trade" ? "trade" : "daily"

		// Get account balance from trading account
		const account = await db.query.tradingAccounts.findFirst({
			where: eq(tradingAccounts.id, auth.accountId),
		})
		// Fallback to global settings if account doesn't have balance
		const accountBalanceSetting = await db.query.settings.findFirst({
			where: eq(settings.key, "account_balance"),
		})
		const initialBalance = accountBalanceSetting
			? Number(accountBalanceSetting.value) || 10000
			: 10000

		// Build conditions manually (not using parseArchFilters — matches action pattern)
		const accountCondition = auth.showAllAccounts
			? inArray(trades.accountId, auth.allAccountIds)
			: eq(trades.accountId, auth.accountId)

		const conditions: SQL[] = [accountCondition, eq(trades.isArchived, false)]

		const dateFrom = searchParams.get("dateFrom")
		const dateTo = searchParams.get("dateTo")
		if (dateFrom) conditions.push(gte(trades.entryDate, new Date(dateFrom)))
		if (dateTo) conditions.push(lte(trades.entryDate, new Date(dateTo)))

		const result = await fetchAndDecryptTrades(auth.userId, conditions, {
			orderBy: "asc",
		})

		if (result.length === 0) {
			return archSuccess("No trades found", [])
		}

		const equityPoints: {
			date: string
			equity: number
			accountEquity: number
			drawdown: number
			tradeNumber?: number
		}[] = []

		if (mode === "trade") {
			let cumulativePnL = 0
			let peak = initialBalance

			for (let i = 0; i < result.length; i++) {
				const trade = result[i]
				const pnl = fromCents(trade.pnl)
				cumulativePnL += pnl
				const accountEquity = initialBalance + cumulativePnL

				if (accountEquity > peak) {
					peak = accountEquity
				}

				const drawdown = peak > 0 ? ((peak - accountEquity) / peak) * 100 : 0

				equityPoints.push({
					date: formatDateKey(trade.entryDate),
					equity: cumulativePnL,
					accountEquity,
					drawdown,
					tradeNumber: i + 1,
				})
			}
		} else {
			// Daily aggregated equity curve
			const dailyPnlMap = new Map<string, number>()
			for (const trade of result) {
				const dateKey = formatDateKey(trade.entryDate)
				const pnl = fromCents(trade.pnl)
				const existing = dailyPnlMap.get(dateKey) || 0
				dailyPnlMap.set(dateKey, existing + pnl)
			}

			const sortedDates = Array.from(dailyPnlMap.keys()).toSorted()

			let cumulativePnL = 0
			let peak = initialBalance

			for (const date of sortedDates) {
				const dailyPnl = dailyPnlMap.get(date) || 0
				cumulativePnL += dailyPnl
				const accountEquity = initialBalance + cumulativePnL

				if (accountEquity > peak) {
					peak = accountEquity
				}

				const drawdown = peak > 0 ? ((peak - accountEquity) / peak) * 100 : 0

				equityPoints.push({
					date,
					equity: cumulativePnL,
					accountEquity,
					drawdown,
				})
			}
		}

		return archSuccess("Equity curve retrieved", equityPoints)
	} catch (error) {
		return archError(
			"Failed to retrieve equity curve",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
