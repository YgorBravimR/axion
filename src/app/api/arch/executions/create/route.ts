import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions } from "@/db/schema"
import type { TradeExecution } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import {
	archSuccess,
	archError,
	formatExecutionForArch,
} from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"
import {
	getUserDek,
	encryptExecutionFields,
	decryptExecutionFields,
} from "@/lib/user-crypto"
import { updateTradeAggregates } from "@/app/actions/executions"
import { toCents } from "@/lib/money"

interface CreateExecutionBody {
	tradeId: string
	executionType: "entry" | "exit"
	executionDate: string
	price: number
	quantity: number
	orderType?: "market" | "limit" | "stop" | "stop_limit" | null
	notes?: string | null
	commission?: number | null
	fees?: number | null
	slippage?: number | null
}

/**
 * POST /api/arch/executions/create
 * Create a new execution leg for a trade.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as CreateExecutionBody

		if (
			!body.tradeId ||
			!body.executionType ||
			!body.executionDate ||
			body.price == null ||
			body.quantity == null
		) {
			return archError("Missing required fields", [
				{
					code: "VALIDATION_ERROR",
					detail:
						"tradeId, executionType, executionDate, price, and quantity are required",
				},
			])
		}

		if (!["entry", "exit"].includes(body.executionType)) {
			return archError("Invalid execution type", [
				{
					code: "VALIDATION_ERROR",
					detail: "executionType must be 'entry' or 'exit'",
				},
			])
		}

		const tradeCondition = and(
			eq(trades.id, body.tradeId),
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

		const dek = await getUserDek(auth.userId)

		// Validate exit quantity does not exceed entry quantity
		if (body.executionType === "exit") {
			const rawExistingExecutions = await db.query.tradeExecutions.findMany({
				where: eq(tradeExecutions.tradeId, body.tradeId),
			})

			const existingExecutions = dek
				? rawExistingExecutions.map(
						(ex) =>
							decryptExecutionFields(
								ex as unknown as Record<string, unknown>,
								dek
							) as unknown as TradeExecution
					)
				: rawExistingExecutions

			const totalEntryQty = existingExecutions
				.filter((e) => e.executionType === "entry")
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			const totalExitQty = existingExecutions
				.filter((e) => e.executionType === "exit")
				.reduce((sum, e) => sum + Number(e.quantity), 0)

			if (totalExitQty + body.quantity > totalEntryQty) {
				const remainingQty = totalEntryQty - totalExitQty
				return archError("Exit quantity exceeds available entries", [
					{
						code: "EXIT_EXCEEDS_ENTRIES",
						detail: `Total exit quantity (${totalExitQty + body.quantity}) would exceed total entry quantity (${totalEntryQty}). Remaining: ${remainingQty}`,
					},
				])
			}
		}

		// Switch trade to scaled mode if needed
		if (trade.executionMode !== "scaled") {
			await db
				.update(trades)
				.set({ executionMode: "scaled", updatedAt: new Date() })
				.where(eq(trades.id, body.tradeId))
		}

		const executionValue = toCents(body.price * body.quantity)

		const encryptedFields = dek
			? encryptExecutionFields(
					{
						price: body.price,
						quantity: body.quantity,
						commission: body.commission ?? 0,
						fees: body.fees ?? 0,
						slippage: body.slippage ?? 0,
						executionValue,
					},
					dek
				)
			: {}

		const [execution] = await db
			.insert(tradeExecutions)
			.values({
				tradeId: body.tradeId,
				executionType: body.executionType,
				executionDate: new Date(body.executionDate),
				price: String(body.price),
				quantity: String(body.quantity),
				orderType: body.orderType ?? null,
				notes: body.notes ?? null,
				commission: String(body.commission ?? 0),
				fees: String(body.fees ?? 0),
				slippage: String(body.slippage ?? 0),
				executionValue: String(executionValue),
				...encryptedFields,
			})
			.returning()

		await updateTradeAggregates(body.tradeId, dek)

		const decryptedExecution = dek
			? (decryptExecutionFields(
					execution as unknown as Record<string, unknown>,
					dek
				) as unknown as TradeExecution)
			: execution

		const formatted = formatExecutionForArch(
			decryptedExecution as unknown as Record<string, unknown>
		)

		return archSuccess("Execution created successfully", formatted)
	} catch (error) {
		return archError(
			"Failed to create execution",
			[{ code: "CREATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
