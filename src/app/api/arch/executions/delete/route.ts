import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions } from "@/db/schema"
import { eq } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { getUserDek } from "@/lib/user-crypto"
import { updateTradeAggregates } from "@/app/actions/executions"

interface DeleteExecutionBody {
	id: string
}

/**
 * POST /api/arch/executions/delete
 * Delete an execution leg from a trade.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as DeleteExecutionBody

		if (!body.id) {
			return archError("Missing required field", [
				{ code: "VALIDATION_ERROR", detail: "id is required" },
			])
		}

		const existing = await db.query.tradeExecutions.findFirst({
			where: eq(tradeExecutions.id, body.id),
			with: { trade: true },
		})

		if (!existing?.trade) {
			return archError(
				"Execution not found",
				[{ code: "NOT_FOUND", detail: "Execution does not exist" }],
				404
			)
		}

		// Verify trade ownership
		const tradeAccountId = existing.trade.accountId ?? ""
		const hasAccess = auth.showAllAccounts
			? auth.allAccountIds.includes(tradeAccountId)
			: tradeAccountId === auth.accountId

		if (!hasAccess) {
			return archError(
				"Execution not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Execution does not exist or you do not have access",
					},
				],
				404
			)
		}

		const tradeId = existing.tradeId

		await db.delete(tradeExecutions).where(eq(tradeExecutions.id, body.id))

		const dek = await getUserDek(auth.userId)
		await updateTradeAggregates(tradeId, dek)

		// Check if any executions remain
		const remainingExecutions = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
		})

		// If no executions left, revert trade to simple mode
		if (remainingExecutions.length === 0) {
			await db
				.update(trades)
				.set({ executionMode: "simple", updatedAt: new Date() })
				.where(eq(trades.id, tradeId))
		}

		return archSuccess("Execution deleted successfully")
	} catch (error) {
		return archError(
			"Failed to delete execution",
			[{ code: "DELETE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
