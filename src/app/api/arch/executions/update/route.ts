import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions } from "@/db/schema"
import type { TradeExecution } from "@/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import {
	archSuccess,
	archError,
	formatExecutionForArch,
} from "../../_lib/helpers"
import {
	getUserDek,
	encryptExecutionFields,
	decryptExecutionFields,
} from "@/lib/user-crypto"
import { updateTradeAggregates } from "@/app/actions/executions"
import { toCents } from "@/lib/money"

interface UpdateExecutionBody {
	id: string
	executionType?: "entry" | "exit"
	executionDate?: string
	price?: number
	quantity?: number
	orderType?: "market" | "limit" | "stop" | "stop_limit" | null
	notes?: string | null
	commission?: number | null
	fees?: number | null
	slippage?: number | null
}

/**
 * POST /api/arch/executions/update
 * Update an existing execution leg.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as UpdateExecutionBody

		if (!body.id) {
			return archError("Missing required field", [
				{ code: "VALIDATION_ERROR", detail: "id is required" },
			])
		}

		const rawExisting = await db.query.tradeExecutions.findFirst({
			where: eq(tradeExecutions.id, body.id),
			with: { trade: true },
		})

		if (!rawExisting?.trade) {
			return archError(
				"Execution not found",
				[{ code: "NOT_FOUND", detail: "Execution does not exist" }],
				404
			)
		}

		// Verify trade ownership
		const tradeAccountId = rawExisting.trade.accountId ?? ""
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

		const dek = await getUserDek(auth.userId)

		const existing = dek
			? {
					...(decryptExecutionFields(
						rawExisting as unknown as Record<string, unknown>,
						dek
					) as unknown as typeof rawExisting),
					trade: rawExisting.trade,
				}
			: rawExisting

		// Validate exit quantity if type or quantity is changing
		const resultType = body.executionType ?? existing.executionType
		const resultQuantity = body.quantity ?? Number(existing.quantity)

		if (resultType === "exit") {
			const rawAllExecutions = await db.query.tradeExecutions.findMany({
				where: eq(tradeExecutions.tradeId, existing.tradeId),
			})

			const allExecutions = dek
				? rawAllExecutions.map(
						(ex) =>
							decryptExecutionFields(
								ex as unknown as Record<string, unknown>,
								dek
							) as unknown as TradeExecution
					)
				: rawAllExecutions

			const totalEntryQty = allExecutions
				.filter((e) => e.executionType === "entry")
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			const otherExitQty = allExecutions
				.filter((e) => e.executionType === "exit" && e.id !== body.id)
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			if (otherExitQty + resultQuantity > totalEntryQty) {
				const remainingQty = totalEntryQty - otherExitQty
				return archError("Exit quantity exceeds available entries", [
					{
						code: "EXIT_EXCEEDS_ENTRIES",
						detail: `Total exit quantity (${otherExitQty + resultQuantity}) would exceed total entry quantity (${totalEntryQty}). Remaining: ${remainingQty}`,
					},
				])
			}
		}

		// Calculate new execution value
		const price = body.price ?? Number(existing.price)
		const quantity = body.quantity ?? Number(existing.quantity)
		const executionValue = toCents(price * quantity)

		// Build update data
		const updateData: Record<string, unknown> = {
			executionValue: String(executionValue),
			updatedAt: new Date(),
		}

		if (body.executionType !== undefined)
			updateData.executionType = body.executionType
		if (body.executionDate !== undefined)
			updateData.executionDate = new Date(body.executionDate)
		if (body.price !== undefined) updateData.price = String(body.price)
		if (body.quantity !== undefined) updateData.quantity = String(body.quantity)
		if (body.orderType !== undefined) updateData.orderType = body.orderType
		if (body.notes !== undefined) updateData.notes = body.notes
		if (body.commission !== undefined)
			updateData.commission = String(body.commission ?? 0)
		if (body.fees !== undefined) updateData.fees = String(body.fees ?? 0)
		if (body.slippage !== undefined)
			updateData.slippage = String(body.slippage ?? 0)

		// Encrypt financial fields if DEK is available
		const encryptedFields = dek
			? encryptExecutionFields(
					{
						price: body.price,
						quantity: body.quantity,
						commission: body.commission,
						fees: body.fees,
						slippage: body.slippage,
						executionValue,
					},
					dek
				)
			: {}

		const [execution] = await db
			.update(tradeExecutions)
			.set({ ...updateData, ...encryptedFields })
			.where(eq(tradeExecutions.id, body.id))
			.returning()

		await updateTradeAggregates(existing.tradeId, dek)

		const decryptedExecution = dek
			? (decryptExecutionFields(
					execution as unknown as Record<string, unknown>,
					dek
				) as unknown as TradeExecution)
			: execution

		const formatted = formatExecutionForArch(
			decryptedExecution as unknown as Record<string, unknown>
		)

		return archSuccess("Execution updated successfully", formatted)
	} catch (error) {
		return archError(
			"Failed to update execution",
			[{ code: "UPDATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
