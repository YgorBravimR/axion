import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, gte, lte, desc } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"
import { formatDateKey, APP_TIMEZONE } from "@/lib/dates"
import { fromCents } from "@/lib/money"

interface DaySummary {
	date: string
	dateDisplay: string
	netPnl: number
	grossPnl: number
	totalFees: number
	winRate: number
	wins: number
	losses: number
	breakevens: number
	totalTrades: number
	avgR: number
	profitFactor: number
}

interface DayTradeCompact {
	id: string
	time: string
	asset: string
	direction: "long" | "short"
	timeframeName: string | null
	strategyName: string | null
	pnl: number
	rMultiple: number | null
	outcome: "win" | "loss" | "breakeven" | null
}

interface TradesByDay {
	summary: DaySummary
	trades: DayTradeCompact[]
}

const dateDisplayFormatter = new Intl.DateTimeFormat("en-US", {
	weekday: "long",
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: APP_TIMEZONE,
})

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZone: APP_TIMEZONE,
})

/**
 * Calculates per-day summary stats from an array of compact trades.
 *
 * @param dayTrades - Array of compact trades for one day
 * @returns Computed summary with netPnl, winRate, profitFactor, etc.
 */
const calculateDaySummary = (
	dateKey: string,
	dateDisplay: string,
	dayTrades: DayTradeCompact[],
	totalFees: number
): DaySummary => {
	let netPnl = 0
	let wins = 0
	let losses = 0
	let breakevens = 0
	let totalR = 0
	let rCount = 0
	let grossProfit = 0
	let grossLoss = 0

	for (const trade of dayTrades) {
		netPnl += trade.pnl

		if (trade.outcome === "win") {
			wins++
			grossProfit += trade.pnl
		} else if (trade.outcome === "loss") {
			losses++
			grossLoss += Math.abs(trade.pnl)
		} else {
			breakevens++
		}

		if (trade.rMultiple !== null) {
			totalR += trade.rMultiple
			rCount++
		}
	}

	const totalTrades = dayTrades.length
	const winRate = totalTrades > 0 ? wins / totalTrades : 0
	const avgR = rCount > 0 ? totalR / rCount : 0
	const profitFactor =
		grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
	const grossPnl = netPnl + totalFees

	return {
		date: dateKey,
		dateDisplay,
		netPnl: Math.round(netPnl * 100) / 100,
		grossPnl: Math.round(grossPnl * 100) / 100,
		totalFees: Math.round(totalFees * 100) / 100,
		winRate: Math.round(winRate * 10000) / 10000,
		wins,
		losses,
		breakevens,
		totalTrades,
		avgR: Math.round(avgR * 100) / 100,
		profitFactor:
			profitFactor === Infinity
				? profitFactor
				: Math.round(profitFactor * 100) / 100,
	}
}

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const dateFrom = searchParams.get("dateFrom")
		const dateTo = searchParams.get("dateTo")

		const conditions = [
			buildAccountCondition(auth),
			eq(trades.isArchived, false),
		]

		if (dateFrom) {
			conditions.push(gte(trades.entryDate, new Date(dateFrom)))
		}
		if (dateTo) {
			conditions.push(lte(trades.entryDate, new Date(dateTo)))
		}

		const whereClause = and(...conditions)

		// Query trades with strategy + timeframe relations
		const result = await db.query.trades.findMany({
			where: whereClause,
			with: {
				strategy: true,
				timeframe: true,
			},
			orderBy: [desc(trades.entryDate)],
		})

		// Group by BRT day
		const dayMap = new Map<
			string,
			{ trades: DayTradeCompact[]; totalFees: number; sampleDate: Date }
		>()

		for (const trade of result) {
			const dateKey = formatDateKey(trade.entryDate)

			if (!dayMap.has(dateKey)) {
				dayMap.set(dateKey, {
					trades: [],
					totalFees: 0,
					sampleDate: trade.entryDate,
				})
			}

			const dayData = dayMap.get(dateKey)!
			const pnl = fromCents(trade.pnl)
			const commission = fromCents(trade.commission)
			const fees = fromCents(trade.fees)
			const rMultipleRaw = trade.realizedRMultiple
			const rMultiple =
				rMultipleRaw !== null && rMultipleRaw !== undefined
					? Number(rMultipleRaw)
					: null

			dayData.totalFees += commission + fees

			dayData.trades.push({
				id: trade.id,
				time: timeFormatter.format(trade.entryDate),
				asset: trade.asset,
				direction: trade.direction,
				timeframeName: trade.timeframe?.name ?? null,
				strategyName: trade.strategy?.name ?? null,
				pnl,
				rMultiple:
					rMultiple !== null && Number.isNaN(rMultiple) ? null : rMultiple,
				outcome: trade.outcome,
			})
		}

		// Build response array
		const days: TradesByDay[] = []

		for (const [dateKey, dayData] of dayMap) {
			const dateDisplay = dateDisplayFormatter.format(dayData.sampleDate)
			const summary = calculateDaySummary(
				dateKey,
				dateDisplay,
				dayData.trades,
				dayData.totalFees
			)
			days.push({ summary, trades: dayData.trades })
		}

		return archSuccess("Trades grouped by day", { days })
	} catch (error) {
		return archError(
			"Failed to fetch grouped trades",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
