import { fromCents } from "@/lib/money"

interface TradeForSummary {
	pnl: number | string | null
	commission: number | string | null
	fees: number | string | null
	outcome: string | null
	realizedRMultiple: string | null
}

interface ReportSummary {
	totalTrades: number
	winCount: number
	lossCount: number
	breakevenCount: number
	grossPnl: number
	netPnl: number
	totalFees: number
	winRate: number
	avgWin: number
	avgLoss: number
	profitFactor: number
	avgR: number
}

/**
 * Calculates a standard report summary from a list of trades.
 * Used by weekly, monthly, and monthly-results report endpoints.
 *
 * @param tradeList - Array of trades with P&L, fees, outcome, and R-multiple fields
 * @returns Computed summary with netPnl, winRate, profitFactor, avgR, etc.
 */
const calculateReportSummary = (tradeList: TradeForSummary[]): ReportSummary => {
	const winTrades = tradeList.filter((t) => t.outcome === "win")
	const lossTrades = tradeList.filter((t) => t.outcome === "loss")
	const breakevenCount = tradeList.filter((t) => t.outcome === "breakeven").length

	const netPnl = tradeList.reduce((sum, t) => sum + fromCents(t.pnl), 0)
	const totalFees = tradeList.reduce(
		(sum, t) => sum + fromCents(t.commission) + fromCents(t.fees),
		0
	)
	const grossPnl = netPnl + totalFees
	const grossProfit = winTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0)
	const grossLoss = Math.abs(lossTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0))
	const avgWin = winTrades.length > 0
		? winTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0) / winTrades.length
		: 0
	const avgLoss = lossTrades.length > 0
		? lossTrades.reduce((sum, t) => sum + fromCents(t.pnl), 0) / lossTrades.length
		: 0
	const tradesWithR = tradeList.filter((t) => t.realizedRMultiple)
	const avgR = tradesWithR.length > 0
		? tradesWithR.reduce((sum, t) => sum + parseFloat(t.realizedRMultiple!), 0) / tradesWithR.length
		: 0
	const decidedCount = winTrades.length + lossTrades.length

	return {
		totalTrades: tradeList.length,
		winCount: winTrades.length,
		lossCount: lossTrades.length,
		breakevenCount,
		grossPnl,
		netPnl,
		totalFees,
		winRate: decidedCount > 0 ? (winTrades.length / decidedCount) * 100 : 0,
		avgWin,
		avgLoss,
		profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
		avgR,
	}
}

export { calculateReportSummary }
export type { TradeForSummary, ReportSummary }
