import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseArchFilters } from "../../_lib/filters"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"
import { fromCents } from "@/lib/money"

interface RDistributionBucket {
	range: string
	rangeMin: number
	rangeMax: number
	count: number
	pnl: number
}

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams
		const conditions = await parseArchFilters(searchParams, auth)
		const result = await fetchAndDecryptTrades(auth.userId, conditions)

		// Filter trades with R-multiple data
		const tradesWithR = result.filter((t) => t.realizedRMultiple !== null)

		if (tradesWithR.length === 0) {
			return archSuccess("No trades with R-multiple data", [])
		}

		// Define buckets
		const buckets: RDistributionBucket[] = [
			{ range: "< -2R", rangeMin: -Infinity, rangeMax: -2, count: 0, pnl: 0 },
			{ range: "-2R to -1.5R", rangeMin: -2, rangeMax: -1.5, count: 0, pnl: 0 },
			{ range: "-1.5R to -1R", rangeMin: -1.5, rangeMax: -1, count: 0, pnl: 0 },
			{ range: "-1R to -0.5R", rangeMin: -1, rangeMax: -0.5, count: 0, pnl: 0 },
			{ range: "-0.5R to 0R", rangeMin: -0.5, rangeMax: 0, count: 0, pnl: 0 },
			{ range: "0R to 0.5R", rangeMin: 0, rangeMax: 0.5, count: 0, pnl: 0 },
			{ range: "0.5R to 1R", rangeMin: 0.5, rangeMax: 1, count: 0, pnl: 0 },
			{ range: "1R to 1.5R", rangeMin: 1, rangeMax: 1.5, count: 0, pnl: 0 },
			{ range: "1.5R to 2R", rangeMin: 1.5, rangeMax: 2, count: 0, pnl: 0 },
			{ range: "2R to 3R", rangeMin: 2, rangeMax: 3, count: 0, pnl: 0 },
			{ range: "> 3R", rangeMin: 3, rangeMax: Infinity, count: 0, pnl: 0 },
		]

		for (const trade of tradesWithR) {
			const r = Number(trade.realizedRMultiple)
			const pnl = fromCents(trade.pnl)

			for (const bucket of buckets) {
				if (r >= bucket.rangeMin && r < bucket.rangeMax) {
					bucket.count++
					bucket.pnl += pnl
					break
				}
			}
		}

		// Filter out empty buckets at the extremes
		const nonEmptyBuckets = buckets.filter((b) => b.count > 0)

		const data =
			nonEmptyBuckets.length > 0
				? nonEmptyBuckets
				: buckets.filter((b) => b.rangeMin >= -2 && b.rangeMax <= 3)

		return archSuccess("R-distribution calculated", data)
	} catch (error) {
		return archError(
			"Failed to calculate R-distribution",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
