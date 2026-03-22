import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseArchFilters } from "../../_lib/filters"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"
import { fromCents } from "@/lib/money"
import { formatDateKey } from "@/lib/dates"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const conditions = await parseArchFilters(searchParams, auth)
		const result = await fetchAndDecryptTrades(auth.userId, conditions, {
			orderBy: "desc",
		})

		if (result.length === 0) {
			return archSuccess("No trades found", {
				currentStreak: 0,
				currentStreakType: "none",
				longestWinStreak: 0,
				longestLossStreak: 0,
				bestDay: null,
				worstDay: null,
			})
		}

		// Calculate current streak (most recent first — already desc)
		let currentStreak = 0
		let currentStreakType: "win" | "loss" | "none" = "none"

		if (result.length > 0 && result[0].outcome) {
			currentStreakType =
				result[0].outcome === "win"
					? "win"
					: result[0].outcome === "loss"
						? "loss"
						: "none"
			for (const trade of result) {
				if (currentStreakType === "win" && trade.outcome === "win") {
					currentStreak++
				} else if (currentStreakType === "loss" && trade.outcome === "loss") {
					currentStreak++
				} else {
					break
				}
			}
		}

		// Calculate longest streaks (oldest to newest)
		const sortedTrades = [...result].reverse()
		let longestWinStreak = 0
		let longestLossStreak = 0
		let tempWinStreak = 0
		let tempLossStreak = 0

		for (const trade of sortedTrades) {
			if (trade.outcome === "win") {
				tempWinStreak++
				tempLossStreak = 0
				longestWinStreak = Math.max(longestWinStreak, tempWinStreak)
			} else if (trade.outcome === "loss") {
				tempLossStreak++
				tempWinStreak = 0
				longestLossStreak = Math.max(longestLossStreak, tempLossStreak)
			} else {
				tempWinStreak = 0
				tempLossStreak = 0
			}
		}

		// Calculate best and worst days
		const dailyMap = new Map<string, number>()
		for (const trade of result) {
			const dateKey = formatDateKey(trade.entryDate)
			const existing = dailyMap.get(dateKey) || 0
			dailyMap.set(dateKey, existing + fromCents(trade.pnl))
		}

		let bestDay: { date: string; pnl: number } | null = null
		let worstDay: { date: string; pnl: number } | null = null

		for (const [date, pnl] of dailyMap) {
			if (!bestDay || pnl > bestDay.pnl) {
				bestDay = { date, pnl }
			}
			if (!worstDay || pnl < worstDay.pnl) {
				worstDay = { date, pnl }
			}
		}

		return archSuccess("Streak data retrieved", {
			currentStreak,
			currentStreakType,
			longestWinStreak,
			longestLossStreak,
			bestDay,
			worstDay,
		})
	} catch (error) {
		return archError(
			"Failed to retrieve streak data",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
