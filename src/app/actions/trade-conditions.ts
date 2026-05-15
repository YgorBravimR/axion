"use server"

import { db } from "@/db/drizzle"
import {
	tradeConditions,
	trades,
	tradingConditions,
	type TradeCondition,
} from "@/db/schema"
import type { ActionResponse } from "@/types"
import type {
	TradeConditionItem,
	TradeConditionWithName,
} from "@/app/actions/trade-conditions.types"
import { and, eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"

const verifyTradeOwnership = async (
	tradeId: string,
	userId: string
): Promise<{ id: string } | null> => {
	const trade = await db.query.trades.findFirst({
		where: eq(trades.id, tradeId),
		columns: { id: true, accountId: true },
		with: {
			account: {
				columns: { userId: true },
			},
		},
	})
	if (!trade || !trade.account || trade.account.userId !== userId) {
		return null
	}
	return { id: trade.id }
}

/**
 * Replace this trade's full condition set in one delete-then-insert pass.
 * Snapshot semantics: callers pass every condition that was evaluated at
 * trade-write time, with met=true/false. Frozen — never recomputed.
 *
 * Called from trades.ts inside the create/update flows, sharing the
 * surrounding rollback (deleting the parent trade cascades to these rows).
 */
export const setTradeConditions = async (
	tradeId: string,
	items: TradeConditionItem[]
): Promise<ActionResponse<TradeCondition[]>> => {
	try {
		const { userId } = await requireAuth()

		const trade = await verifyTradeOwnership(tradeId, userId)
		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		await db.delete(tradeConditions).where(eq(tradeConditions.tradeId, tradeId))

		if (items.length === 0) {
			return {
				status: "success",
				message: "Trade conditions cleared",
				data: [],
			}
		}

		const inserted = await db
			.insert(tradeConditions)
			.values(
				items.map((item) => ({
					tradeId,
					conditionId: item.conditionId,
					met: item.met,
				}))
			)
			.returning()

		return {
			status: "success",
			message: "Trade conditions saved",
			data: inserted,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to save trade conditions",
			errors: [
				{
					code: "WRITE_FAILED",
					detail: toSafeErrorMessage(error, "setTradeConditions"),
				},
			],
		}
	}
}

/**
 * Read this trade's evaluated conditions, joined to their human names.
 * Powers the trade-detail scorecard and the count badge in the journal list.
 */
export const getTradeConditions = async (
	tradeId: string
): Promise<ActionResponse<TradeConditionWithName[]>> => {
	try {
		const { userId } = await requireAuth()

		const trade = await verifyTradeOwnership(tradeId, userId)
		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
				errors: [{ code: "NOT_FOUND", detail: "Trade does not exist" }],
			}
		}

		const rows = await db
			.select({
				tradeId: tradeConditions.tradeId,
				conditionId: tradeConditions.conditionId,
				met: tradeConditions.met,
				createdAt: tradeConditions.createdAt,
				name: tradingConditions.name,
				category: tradingConditions.category,
			})
			.from(tradeConditions)
			.innerJoin(
				tradingConditions,
				and(
					eq(tradeConditions.conditionId, tradingConditions.id),
					eq(tradingConditions.userId, userId)
				)
			)
			.where(eq(tradeConditions.tradeId, tradeId))

		return {
			status: "success",
			message: "Trade conditions retrieved",
			data: rows,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve trade conditions",
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getTradeConditions"),
				},
			],
		}
	}
}
