import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, gte, lte, desc } from "drizzle-orm"
import { fromCents } from "@/lib/money"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/command-center/daily-summary
 *
 * Returns the daily trading summary for a given date.
 *
 * Query params:
 * - date (optional): ISO date string, defaults to today
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	const { accountId } = authResult.auth

	try {
		const dateParam = request.nextUrl.searchParams.get("date")
		const today = dateParam ? new Date(dateParam) : new Date()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		const todaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: [desc(trades.entryDate)],
		})

		let totalPnL = 0
		let winCount = 0
		let lossCount = 0
		let bestTrade = 0
		let worstTrade = 0
		let consecutiveLosses = 0
		let maxConsecutiveLosses = 0

		const sortedTrades = todaysTrades.toSorted(
			(a, b) =>
				new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
		)

		for (const trade of sortedTrades) {
			const pnl = fromCents(trade.pnl)
			totalPnL += pnl

			if (pnl > bestTrade) {
				bestTrade = pnl
			}
			if (pnl < worstTrade) {
				worstTrade = pnl
			}

			if (trade.outcome === "win") {
				winCount++
				consecutiveLosses = 0
			} else if (trade.outcome === "loss") {
				lossCount++
				consecutiveLosses++
				maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses)
			}
		}

		const tradesCount = sortedTrades.filter(
			(t) => t.outcome !== "breakeven"
		).length
		const winRate =
			winCount + lossCount > 0 ? (winCount / (winCount + lossCount)) * 100 : 0

		return archSuccess("Daily summary retrieved", {
			totalPnL,
			tradesCount,
			winCount,
			lossCount,
			winRate,
			bestTrade,
			worstTrade,
			consecutiveLosses: maxConsecutiveLosses,
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError(
			"Failed to get daily summary",
			[{ code: "FETCH_FAILED", detail: message }],
			500
		)
	}
}

export { GET }
