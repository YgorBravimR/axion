import { db } from "@/db/drizzle"
import { tradeExecutions, trades } from "@/db/schema"
import { eq } from "drizzle-orm"
import {
	encryptExecutionFields,
	decryptExecutionFields,
} from "@/lib/user-crypto"
import { toCents } from "@/lib/money"
import { updateTradeAggregates } from "@/app/actions/executions"
import type { TradeExecution } from "@/db/schema"
import type { ScaledExecutionInput } from "./scaled-create"
import { validateScaledExecutions } from "./scaled-create"

interface ExecutionUpdatePatch {
	id: string
	executionType?: "entry" | "exit"
	executionDate?: string | Date | number
	price?: number | string
	quantity?: number | string
	orderType?: "market" | "limit" | "stop" | "stop_limit" | null
	notes?: string | null
	commission?: number | string | null
	fees?: number | string | null
	slippage?: number | string | null
}

interface ScaledExecutionOps {
	add?: ScaledExecutionInput[]
	update?: ExecutionUpdatePatch[]
	delete?: string[]
}

const hasOps = (ops: ScaledExecutionOps | undefined | null): boolean => {
	if (!ops) {
		return false
	}
	const addCount = ops.add?.length ?? 0
	const updateCount = ops.update?.length ?? 0
	const deleteCount = ops.delete?.length ?? 0
	return addCount + updateCount + deleteCount > 0
}

const toFiniteNumber = (
	value: number | string | null | undefined
): number | null => {
	if (value === null || value === undefined || value === "") {
		return null
	}
	const parsed = typeof value === "number" ? value : Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * Apply add/update/delete operations to a trade's execution legs in a single
 * pass. After all ops succeed, switch the trade to scaled mode and recompute
 * aggregates via updateTradeAggregates.
 *
 * Validates that:
 * - All `update.id` and `delete` ids belong to the target tradeId (no cross-trade ops).
 * - Resulting total exit quantity does not exceed total entry quantity.
 *
 * Throws "SCALED_OPS:<code>:<detail>" on validation failure (caller maps to archError).
 */
const applyScaledExecutionOps = async (
	tradeId: string,
	ops: ScaledExecutionOps,
	dek: string | null
): Promise<void> => {
	const deleteIds = ops.delete ?? []
	const updates = ops.update ?? []
	const adds = ops.add ?? []

	if (deleteIds.length || updates.length) {
		const existingForTrade = await db.query.tradeExecutions.findMany({
			where: eq(tradeExecutions.tradeId, tradeId),
			columns: { id: true },
		})
		const ownedIds = new Set(existingForTrade.map((row) => row.id))
		for (const id of deleteIds) {
			if (!ownedIds.has(id)) {
				throw new Error(
					`SCALED_OPS:NOT_FOUND:execution ${id} does not belong to trade ${tradeId}`
				)
			}
		}
		for (const patch of updates) {
			if (!ownedIds.has(patch.id)) {
				throw new Error(
					`SCALED_OPS:NOT_FOUND:execution ${patch.id} does not belong to trade ${tradeId}`
				)
			}
		}
	}

	if (adds.length) {
		// Reuse the create-time validator (rejects naked exits, bad qty/price/date).
		// Treat the new legs in isolation; the cross-leg total check happens below
		// after all ops are projected against existing rows.
		validateScaledExecutions(adds)
	}

	// Apply deletes first so update/add quantity checks run against final state.
	if (deleteIds.length) {
		await Promise.all(
			deleteIds.map((id) =>
				db.delete(tradeExecutions).where(eq(tradeExecutions.id, id))
			)
		)
	}

	// Apply updates one row at a time (mirrors per-leg update route logic).
	for (const patch of updates) {
		const updateData: Record<string, unknown> = { updatedAt: new Date() }
		if (patch.executionType !== undefined) {
			updateData.executionType = patch.executionType
		}
		if (patch.executionDate !== undefined) {
			updateData.executionDate = new Date(patch.executionDate)
		}
		if (patch.orderType !== undefined) {
			updateData.orderType = patch.orderType
		}
		if (patch.notes !== undefined) {
			updateData.notes = patch.notes
		}

		const priceNum =
			patch.price !== undefined ? toFiniteNumber(patch.price) : null
		const quantityNum =
			patch.quantity !== undefined ? toFiniteNumber(patch.quantity) : null
		const commissionNum =
			patch.commission !== undefined ? toFiniteNumber(patch.commission) : null
		const feesNum = patch.fees !== undefined ? toFiniteNumber(patch.fees) : null
		const slippageNum =
			patch.slippage !== undefined ? toFiniteNumber(patch.slippage) : null

		if (patch.price !== undefined) {
			if (priceNum === null) {
				throw new Error(
					`SCALED_OPS:INVALID_PRICE:executions.update[${patch.id}].price must be a finite number`
				)
			}
			updateData.price = String(priceNum)
		}
		if (patch.quantity !== undefined) {
			if (quantityNum === null || quantityNum <= 0) {
				throw new Error(
					`SCALED_OPS:INVALID_QUANTITY:executions.update[${patch.id}].quantity must be > 0`
				)
			}
			updateData.quantity = String(quantityNum)
		}
		if (patch.commission !== undefined) {
			updateData.commission = String(commissionNum ?? 0)
		}
		if (patch.fees !== undefined) {
			updateData.fees = String(feesNum ?? 0)
		}
		if (patch.slippage !== undefined) {
			updateData.slippage = String(slippageNum ?? 0)
		}

		// Recompute executionValue when price or quantity changed; otherwise
		// fetch the existing row's price/quantity to keep value in sync.
		let valueRebuildPrice = priceNum
		let valueRebuildQuantity = quantityNum
		if (
			(patch.price !== undefined || patch.quantity !== undefined) &&
			(valueRebuildPrice === null || valueRebuildQuantity === null)
		) {
			// eslint-disable-next-line no-await-in-loop -- per-leg fetch needed only when price/qty changed and the other half is missing
			const existing = await db.query.tradeExecutions.findFirst({
				where: eq(tradeExecutions.id, patch.id),
			})
			if (existing) {
				const decrypted = dek
					? (decryptExecutionFields(
							existing as unknown as Record<string, unknown>,
							dek
						) as unknown as TradeExecution)
					: (existing as unknown as TradeExecution)
				if (valueRebuildPrice === null) {
					valueRebuildPrice = Number(decrypted.price)
				}
				if (valueRebuildQuantity === null) {
					valueRebuildQuantity = Number(decrypted.quantity)
				}
			}
		}

		let executionValue: number | null = null
		if (
			(patch.price !== undefined || patch.quantity !== undefined) &&
			valueRebuildPrice !== null &&
			valueRebuildQuantity !== null
		) {
			executionValue = toCents(valueRebuildPrice * valueRebuildQuantity)
			updateData.executionValue = String(executionValue)
		}

		const encryptedFields = dek
			? encryptExecutionFields(
					{
						price: priceNum ?? undefined,
						quantity: quantityNum ?? undefined,
						commission: commissionNum ?? undefined,
						fees: feesNum ?? undefined,
						slippage: slippageNum ?? undefined,
						executionValue: executionValue ?? undefined,
					},
					dek
				)
			: {}

		// eslint-disable-next-line no-await-in-loop -- per-leg update with patch-specific encrypted payload built above
		await db
			.update(tradeExecutions)
			.set({ ...updateData, ...encryptedFields })
			.where(eq(tradeExecutions.id, patch.id))
	}

	// Apply adds last, encrypted via the same path as create.
	if (adds.length) {
		const validated = validateScaledExecutions(adds)
		const insertValues = validated.legs.map((leg) => {
			const executionValue = toCents(leg.price * leg.quantity)
			const encrypted = dek
				? encryptExecutionFields(
						{
							price: leg.price,
							quantity: leg.quantity,
							commission: leg.commission,
							fees: leg.fees,
							slippage: leg.slippage,
							executionValue,
						},
						dek
					)
				: {}
			return {
				tradeId,
				executionType: leg.executionType,
				executionDate: leg.executionDate,
				price: String(leg.price),
				quantity: String(leg.quantity),
				orderType: leg.orderType,
				notes: leg.notes,
				commission: String(leg.commission),
				fees: String(leg.fees),
				slippage: String(leg.slippage),
				executionValue: String(executionValue),
				...encrypted,
			}
		})
		await db.insert(tradeExecutions).values(insertValues)
	}

	// Final consistency check: total exits ≤ total entries
	const finalRaw = await db.query.tradeExecutions.findMany({
		where: eq(tradeExecutions.tradeId, tradeId),
	})
	const finalLegs = dek
		? finalRaw.map(
				(row) =>
					decryptExecutionFields(
						row as unknown as Record<string, unknown>,
						dek
					) as unknown as TradeExecution
			)
		: (finalRaw as unknown as TradeExecution[])
	const finalEntryQty = finalLegs
		.filter((leg) => leg.executionType === "entry")
		.reduce((sum, leg) => sum + Number(leg.quantity), 0)
	const finalExitQty = finalLegs
		.filter((leg) => leg.executionType === "exit")
		.reduce((sum, leg) => sum + Number(leg.quantity), 0)
	if (finalExitQty > finalEntryQty) {
		throw new Error(
			`SCALED_OPS:EXIT_EXCEEDS_ENTRIES:after operations, total exit quantity (${finalExitQty}) exceeds total entry quantity (${finalEntryQty})`
		)
	}

	if (finalLegs.length === 0) {
		// All legs deleted — revert to simple mode and reset aggregates.
		await db
			.update(trades)
			.set({ executionMode: "simple", updatedAt: new Date() })
			.where(eq(trades.id, tradeId))
	} else {
		await db
			.update(trades)
			.set({ executionMode: "scaled", updatedAt: new Date() })
			.where(eq(trades.id, tradeId))
	}

	await updateTradeAggregates(tradeId, dek)
}

export { applyScaledExecutionOps, hasOps }
export type { ScaledExecutionOps, ExecutionUpdatePatch }
