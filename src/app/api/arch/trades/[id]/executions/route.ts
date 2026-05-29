import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions } from "@/db/schema"
import { eq, and, asc } from "drizzle-orm"
import { archAuth } from "../../../_lib/auth"
import {
	archSuccess,
	archError,
	formatExecutionForArch,
} from "../../../_lib/helpers"
import { buildAccountCondition } from "../../../_lib/filters"
import { calculateExecutionSummary } from "@/lib/calculations"

/**
 * GET /api/arch/trades/[id]/executions
 * List all executions for a trade with computed summary.
 */
const GET = async (
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const { id: tradeId } = await params

		const tradeCondition = and(
			eq(trades.id, tradeId),
			buildAccountCondition(auth)
		)

		const trade = await db.query.trades.findFirst({
			where: tradeCondition,
		})

		if (!trade) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or you do not have access",
					},
				],
				404
			)
		}

		const executions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
			orderBy: [asc(tradeExecutions.executionDate)],
		})

		const formattedExecutions = executions.map((ex) =>
			formatExecutionForArch(ex as unknown as Record<string, unknown>)
		)

		const summary = calculateExecutionSummary(executions)

		return archSuccess("Executions retrieved successfully", {
			executions: formattedExecutions,
			summary,
		})
	} catch (error) {
		return archError(
			"Failed to fetch executions",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
