import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseArchFilters } from "../../_lib/filters"
import { fetchAndDecryptTrades } from "../../_lib/decrypt"

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

		const tradesWithPlanData = result.filter((t) => t.followedPlan !== null)
		const followedCount = tradesWithPlanData.filter(
			(t) => t.followedPlan === true
		).length
		const totalTrades = tradesWithPlanData.length
		const score = totalTrades > 0 ? (followedCount / totalTrades) * 100 : 0

		// Calculate recent compliance (last 10 trades)
		const recentTrades = tradesWithPlanData.slice(0, 10)
		const recentFollowed = recentTrades.filter(
			(t) => t.followedPlan === true
		).length
		const recentCompliance =
			recentTrades.length > 0 ? (recentFollowed / recentTrades.length) * 100 : 0

		// Determine trend
		let trend: "up" | "down" | "stable" = "stable"
		if (recentTrades.length >= 5 && totalTrades >= 10) {
			const olderTrades = tradesWithPlanData.slice(10, 20)
			const olderFollowed = olderTrades.filter(
				(t) => t.followedPlan === true
			).length
			const olderCompliance =
				olderTrades.length > 0 ? (olderFollowed / olderTrades.length) * 100 : 0

			if (recentCompliance > olderCompliance + 5) {
				trend = "up"
			} else if (recentCompliance < olderCompliance - 5) {
				trend = "down"
			}
		}

		return archSuccess("Discipline score retrieved", {
			score,
			totalTrades,
			followedCount,
			trend,
			recentCompliance,
		})
	} catch (error) {
		return archError(
			"Failed to retrieve discipline score",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
