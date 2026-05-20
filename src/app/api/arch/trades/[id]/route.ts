import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import {
	archSuccess,
	archError,
	formatTradeForArch,
	formatExecutionForArch,
} from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"

const GET = async (
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	const { id: tradeId } = await params

	if (!tradeId) {
		return archError(
			"Trade ID is required",
			[
				{
					code: "MISSING_ID",
					detail: "Provide a valid trade UUID in the URL path",
				},
			],
			400
		)
	}

	try {
		const accountCondition = buildAccountCondition(auth)

		const trade = await db.query.trades.findFirst({
			where: and(
				eq(trades.id, tradeId),
				accountCondition,
				eq(trades.isArchived, false)
			),
			with: {
				strategy: true,
				timeframe: true,
				tradeTags: { with: { tag: true } },
				executions: true,
			},
		})

		if (!trade) {
			return archError(
				"Trade not found",
				[{ code: "NOT_FOUND", detail: `No trade found with ID ${tradeId}` }],
				404
			)
		}

		// Format trade
		const formattedTrade = formatTradeForArch(trade)

		// Format executions
		const formattedExecutions = trade.executions.map((execution) =>
			formatExecutionForArch(execution)
		)

		return archSuccess("Trade retrieved", {
			...formattedTrade,
			executions: formattedExecutions,
		})
	} catch (error) {
		return archError(
			"Failed to fetch trade",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
