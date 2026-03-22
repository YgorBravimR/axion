import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseArchFilters } from "../../_lib/filters"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"
import { fromCents } from "@/lib/money"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const conditions = await parseArchFilters(searchParams, auth)
		const result = await fetchAndDecryptTrades(auth.userId, conditions)

		const tradesWithOutcome = result.filter(
			(t) => t.outcome === "win" || t.outcome === "loss"
		)

		if (tradesWithOutcome.length === 0) {
			return archSuccess("No completed trades found", {
				winRate: 0,
				avgWin: 0,
				avgLoss: 0,
				expectedValue: 0,
				projectedPnl100: 0,
				sampleSize: 0,
				avgWinR: 0,
				avgLossR: 0,
				expectedR: 0,
				projectedR100: 0,
				rSampleSize: 0,
			})
		}

		// Capital Expectancy ($)
		const wins: number[] = []
		const losses: number[] = []

		for (const trade of tradesWithOutcome) {
			const pnl = fromCents(trade.pnl)
			if (trade.outcome === "win") {
				wins.push(pnl)
			} else if (trade.outcome === "loss") {
				losses.push(Math.abs(pnl))
			}
		}

		const winRate = wins.length / tradesWithOutcome.length
		const avgWin =
			wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
		const avgLoss =
			losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

		// EV($) = (Win Rate x Avg Win) - (Loss Rate x Avg Loss)
		const expectedValue = winRate * avgWin - (1 - winRate) * avgLoss
		const projectedPnl100 = expectedValue * 100

		// Edge Expectancy (R-based)
		const tradesWithR = tradesWithOutcome.filter(
			(t) => t.realizedRMultiple !== null
		)

		const rWins: number[] = []
		const rLosses: number[] = []

		for (const trade of tradesWithR) {
			const rMultiple = Number(trade.realizedRMultiple)
			if (rMultiple > 0) {
				rWins.push(rMultiple)
			} else if (rMultiple < 0) {
				rLosses.push(Math.abs(rMultiple))
			}
		}

		const rSampleSize = tradesWithR.length
		const rDecisiveCount = rWins.length + rLosses.length
		const rWinRate = rDecisiveCount > 0 ? rWins.length / rDecisiveCount : 0
		const avgWinR =
			rWins.length > 0 ? rWins.reduce((a, b) => a + b, 0) / rWins.length : 0
		const avgLossR =
			rLosses.length > 0
				? rLosses.reduce((a, b) => a + b, 0) / rLosses.length
				: 0
		// EV(R) = (Win Rate x Avg Win R) - (Loss Rate x Avg Loss R)
		const expectedR =
			rDecisiveCount > 0 ? rWinRate * avgWinR - (1 - rWinRate) * avgLossR : 0
		const projectedR100 = expectedR * 100

		return archSuccess("Expected value calculated", {
			winRate: winRate * 100,
			avgWin,
			avgLoss,
			expectedValue,
			projectedPnl100,
			sampleSize: tradesWithOutcome.length,
			avgWinR,
			avgLossR,
			expectedR,
			projectedR100,
			rSampleSize,
		})
	} catch (error) {
		return archError(
			"Failed to calculate expected value",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
