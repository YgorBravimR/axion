import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"
import { markTaxLedgerDirty } from "@/lib/tax/mark-dirty"

interface ArchDeleteTradeBody {
	id: string
}

/**
 * POST /api/arch/trades/delete
 *
 * Soft-deletes a trade by setting isArchived to true.
 * Verifies trade ownership via accountId (or allAccountIds if showAllAccounts).
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as ArchDeleteTradeBody

		if (!body.id) {
			return archError("Missing required field: id", [
				{ code: "MISSING_FIELDS", detail: "Required: id (UUID)" },
			])
		}

		const accountCondition = buildAccountCondition(auth)

		// Verify trade exists and belongs to the user
		const existing = await db.query.trades.findFirst({
			where: and(eq(trades.id, body.id), accountCondition),
			columns: { id: true, accountId: true, entryDate: true },
		})

		if (!existing) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or does not belong to this account",
					},
				],
				404
			)
		}

		// Soft delete by setting isArchived to true
		await db
			.update(trades)
			.set({ isArchived: true, updatedAt: new Date() })
			.where(and(eq(trades.id, body.id), accountCondition))

		if (existing.entryDate) {
			await markTaxLedgerDirty(
				existing.accountId ?? auth.accountId,
				new Date(existing.entryDate)
			)
		}

		return archSuccess("Trade deleted successfully", { id: body.id })
	} catch (error) {
		return archError(
			"Failed to delete trade",
			[{ code: "DELETE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
