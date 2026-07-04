import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { createArchTrade } from "../../_lib/trade-create"
import type { ArchCreateTradeBody } from "../../_lib/trade-create"

/**
 * POST /api/arch/trades/create
 *
 * Creates a new trade via the Arch API layer.
 *
 * Modes:
 * - **Simple**: caller provides entryPrice + positionSize. P&L computed from
 *   entry/exit prices when exitPrice present.
 * - **Scaled**: caller provides `executions[]` (entry/exit legs). Aggregates
 *   (avg prices, totals, P&L, outcome, R-multiple) computed from legs via
 *   updateTradeAggregates after insert.
 *
 * Resolves fuzzy names for strategy, timeframe, and tags. Encrypts sensitive
 * fields when DEK is configured for the user. Marks the monthly tax ledger
 * dirty for the affected month.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as ArchCreateTradeBody
		const result = await createArchTrade(body, auth)
		if (!result.ok) {
			return archError(
				"Failed to create trade",
				[{ code: result.code, detail: result.detail }],
				result.status ?? 400
			)
		}
		return archSuccess("Trade created successfully", result.trade)
	} catch (error) {
		console.error("[arch/trades/create] Unexpected error:", error)
		return archError(
			"Failed to create trade",
			[{ code: "CREATE_FAILED", detail: "Internal error" }],
			500
		)
	}
}

export { POST }
