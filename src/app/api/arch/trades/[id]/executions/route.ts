import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions } from "@/db/schema"
import type { TradeExecution } from "@/db/schema"
import { eq, and, asc, inArray } from "drizzle-orm"
import { archAuth } from "../../../_lib/auth"
import { archSuccess, archError, formatExecutionForArch } from "../../../_lib/helpers"
import { getUserDek, decryptExecutionFields } from "@/lib/user-crypto"
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
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const { id: tradeId } = await params

		const tradeCondition = auth.showAllAccounts
			? and(eq(trades.id, tradeId), inArray(trades.accountId, auth.allAccountIds))
			: and(eq(trades.id, tradeId), eq(trades.accountId, auth.accountId))

		const trade = await db.query.trades.findFirst({
			where: tradeCondition,
		})

		if (!trade) {
			return archError(
				"Trade not found",
				[{ code: "NOT_FOUND", detail: "Trade does not exist or you do not have access" }],
				404
			)
		}

		const rawExecutions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
			orderBy: [asc(tradeExecutions.executionDate)],
		})

		const dek = await getUserDek(auth.userId)

		const decryptedExecutions = dek
			? rawExecutions.map((ex) =>
				decryptExecutionFields(ex as unknown as Record<string, unknown>, dek) as unknown as TradeExecution
			)
			: rawExecutions

		const executions = decryptedExecutions.map((ex) =>
			formatExecutionForArch(ex as unknown as Record<string, unknown>)
		)

		const summary = calculateExecutionSummary(decryptedExecutions)

		return archSuccess("Executions retrieved successfully", { executions, summary })
	} catch (error) {
		return archError(
			"Failed to fetch executions",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
