import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseArchFilters } from "../../_lib/filters"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"
import { fromCents } from "@/lib/money"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { getBrtTimeParts } from "@/lib/dates"

type GroupByOption = "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"

const VALID_GROUP_BY: GroupByOption[] = ["asset", "timeframe", "hour", "dayOfWeek", "strategy"]

const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const

interface GroupData {
	tradeCount: number
	pnl: number
	winCount: number
	lossCount: number
	totalR: number
	rCount: number
	grossProfit: number
	grossLoss: number
}

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const groupByParam = searchParams.get("groupBy") as GroupByOption | null

		if (!groupByParam || !VALID_GROUP_BY.includes(groupByParam)) {
			return archError(
				"Invalid or missing groupBy parameter",
				[{ code: "INVALID_PARAMS", detail: `groupBy must be one of: ${VALID_GROUP_BY.join(", ")}` }]
			)
		}

		const conditions = await parseArchFilters(searchParams, auth)

		// Fetch trades with relations for strategy/timeframe grouping
		const needsRelations = groupByParam === "strategy" || groupByParam === "timeframe"
		const result = await fetchAndDecryptTrades(auth.userId, conditions, {
			...(needsRelations && { with: { strategy: true, timeframe: true } }),
		})

		if (result.length === 0) {
			return archSuccess("No trades found", [])
		}

		// Group trades by the specified variable
		const groups = new Map<string, GroupData>()

		for (const trade of result) {
			let groupKey: string

			switch (groupByParam) {
				case "asset":
					groupKey = trade.asset
					break
				case "timeframe":
					groupKey = (trade as Record<string, unknown>).timeframe
						? ((trade as Record<string, unknown>).timeframe as { name: string }).name
						: "Unknown"
					break
				case "hour": {
					const { hour } = getBrtTimeParts(trade.entryDate)
					groupKey = `${hour.toString().padStart(2, "0")}:00`
					break
				}
				case "dayOfWeek": {
					const { dayOfWeek } = getBrtTimeParts(trade.entryDate)
					groupKey = DAY_NAMES[dayOfWeek]
					break
				}
				case "strategy":
					groupKey = (trade as Record<string, unknown>).strategy
						? ((trade as Record<string, unknown>).strategy as { name: string }).name
						: "No Strategy"
					break
				default:
					groupKey = "Unknown"
			}

			const existing = groups.get(groupKey) || {
				tradeCount: 0,
				pnl: 0,
				winCount: 0,
				lossCount: 0,
				totalR: 0,
				rCount: 0,
				grossProfit: 0,
				grossLoss: 0,
			}

			const pnl = fromCents(trade.pnl)
			existing.tradeCount++
			existing.pnl += pnl

			if (trade.outcome === "win") {
				existing.winCount++
				existing.grossProfit += pnl
			} else if (trade.outcome === "loss") {
				existing.lossCount++
				existing.grossLoss += Math.abs(pnl)
			}

			if (trade.realizedRMultiple) {
				existing.totalR += Number(trade.realizedRMultiple)
				existing.rCount++
			}

			groups.set(groupKey, existing)
		}

		// Convert to array and calculate final stats
		const performanceData = Array.from(groups.entries())
			.map(([group, data]) => ({
				group,
				tradeCount: data.tradeCount,
				pnl: data.pnl,
				winRate: calculateWinRate(data.winCount, data.winCount + data.lossCount),
				avgR: data.rCount > 0 ? data.totalR / data.rCount : 0,
				profitFactor: calculateProfitFactor(data.grossProfit, data.grossLoss),
			}))
			.toSorted((a, b) => b.pnl - a.pnl)

		return archSuccess("Performance data retrieved", performanceData)
	} catch (error) {
		return archError(
			"Failed to retrieve performance data",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
