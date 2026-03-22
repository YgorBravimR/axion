import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseArchFilters } from "../../_lib/filters"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"
import { fromCents } from "@/lib/money"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const conditions = await parseArchFilters(searchParams, auth)
		const result = await fetchAndDecryptTrades(auth.userId, conditions)

		if (result.length === 0) {
			return archSuccess("No trades found", {
				grossPnl: 0,
				netPnl: 0,
				totalFees: 0,
				winRate: 0,
				profitFactor: 0,
				averageR: 0,
				totalTrades: 0,
				winCount: 0,
				lossCount: 0,
				breakevenCount: 0,
				avgWin: 0,
				avgLoss: 0,
			})
		}

		let totalNetPnl = 0
		let totalFees = 0
		let totalR = 0
		let rCount = 0
		let winCount = 0
		let lossCount = 0
		let breakevenCount = 0
		let grossProfit = 0
		let grossLoss = 0
		const wins: number[] = []
		const losses: number[] = []

		for (const trade of result) {
			const pnl = fromCents(trade.pnl)
			const commission = fromCents(trade.commission ?? 0)
			const fees = fromCents(trade.fees ?? 0)
			const tradeFees = commission + fees

			totalNetPnl += pnl
			totalFees += tradeFees

			if (trade.realizedRMultiple) {
				totalR += Number(trade.realizedRMultiple)
				rCount++
			}

			if (trade.outcome === "win") {
				winCount++
				grossProfit += pnl
				wins.push(pnl)
			} else if (trade.outcome === "loss") {
				lossCount++
				grossLoss += Math.abs(pnl)
				losses.push(Math.abs(pnl))
			} else if (trade.outcome === "breakeven") {
				breakevenCount++
			}
		}

		const totalGrossPnl = totalNetPnl + totalFees
		const totalTrades = result.length
		const winRate = calculateWinRate(winCount, winCount + lossCount)
		const profitFactor = calculateProfitFactor(grossProfit, grossLoss)
		const averageR = rCount > 0 ? totalR / rCount : 0
		const avgWin =
			wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
		const avgLoss =
			losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

		return archSuccess("Stats retrieved", {
			grossPnl: totalGrossPnl,
			netPnl: totalNetPnl,
			totalFees,
			winRate,
			profitFactor,
			averageR,
			totalTrades,
			winCount,
			lossCount,
			breakevenCount,
			avgWin,
			avgLoss,
		})
	} catch (error) {
		return archError(
			"Failed to retrieve stats",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
