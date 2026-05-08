import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { createArchTrade } from "../../_lib/trade-create"
import type { ArchCreateTradeBody } from "../../_lib/trade-create"
import type { FormattedTrade } from "../../_lib/helpers"

interface BulkCreateBody {
	trades: ArchCreateTradeBody[]
}

interface BulkRowError {
	index: number
	code: string
	detail: string
}

const MAX_BATCH = 500

/**
 * POST /api/arch/trades/bulk-create
 *
 * Inserts up to 500 trades in a single call. Each row is processed sequentially
 * through createArchTrade, mirroring single-create behavior (scaled mode, fuzzy
 * name resolution, tax-ledger dirtying, encryption). Per-row failures are
 * isolated — successful rows still commit; failed rows are reported in `errors`.
 *
 * Response:
 * {
 *   created: number,
 *   failed: number,
 *   trades: FormattedTrade[],
 *   errors: { index, code, detail }[]
 * }
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as BulkCreateBody
		if (!Array.isArray(body.trades)) {
			return archError("Invalid request body", [
				{
					code: "INVALID_BODY",
					detail: "Expected `trades` to be an array of trade objects",
				},
			])
		}
		if (body.trades.length === 0) {
			return archError("Empty trades array", [
				{
					code: "EMPTY_BATCH",
					detail: "`trades` must contain at least one trade",
				},
			])
		}
		if (body.trades.length > MAX_BATCH) {
			return archError("Batch too large", [
				{
					code: "BATCH_TOO_LARGE",
					detail: `Maximum ${MAX_BATCH} trades per request; received ${body.trades.length}`,
				},
			])
		}

		const successes: FormattedTrade[] = []
		const errors: BulkRowError[] = []

		for (const [index, tradeBody] of body.trades.entries()) {
			try {
				// eslint-disable-next-line no-await-in-loop -- sequential by design: per-row error isolation, dedup checks, and DEK reuse
				const result = await createArchTrade(tradeBody, auth)
				if (result.ok) {
					successes.push(result.trade)
				} else {
					errors.push({ index, code: result.code, detail: result.detail })
				}
			} catch (rowError) {
				errors.push({
					index,
					code: "ROW_FAILED",
					detail:
						rowError instanceof Error ? rowError.message : String(rowError),
				})
			}
		}

		return archSuccess("Bulk create complete", {
			created: successes.length,
			failed: errors.length,
			trades: successes,
			errors,
		})
	} catch (error) {
		return archError(
			"Failed to bulk-create trades",
			[{ code: "BULK_CREATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
