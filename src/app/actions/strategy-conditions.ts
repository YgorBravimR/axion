"use server"

import { invalidatePlaybookData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { strategyConditions, strategies, tradingConditions } from "@/db/schema"
import type { StrategyCondition, TradingCondition } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type { StrategyConditionInput } from "@/types/trading-condition"
import { eq, and, asc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"

interface StrategyConditionWithDetail extends StrategyCondition {
	condition: TradingCondition
}

/**
 * Sync strategy conditions — delete-all + bulk-insert (replacement strategy).
 * Simpler than diffing, and the junction table is small per strategy.
 */
const syncStrategyConditions = async (
	strategyId: string,
	conditions: StrategyConditionInput[]
): Promise<ActionResponse<StrategyCondition[]>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		// Verify strategy ownership
		const strategy = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
		})

		if (!strategy) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		// Delete existing junction rows
		await db
			.delete(strategyConditions)
			.where(eq(strategyConditions.strategyId, strategyId))

		// Bulk insert new conditions
		if (conditions.length === 0) {
			invalidatePlaybookData()
			return {
				status: "success",
				message: "Strategy conditions cleared",
				data: [],
			}
		}

		const inserted = await db
			.insert(strategyConditions)
			.values(
				conditions.map((c) => ({
					strategyId,
					conditionId: c.conditionId,
					tier: c.tier,
					sortOrder: c.sortOrder,
				}))
			)
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: "Strategy conditions synced successfully",
			data: inserted,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actionErrors.syncFailed"),
			errors: [
				{
					code: "SYNC_FAILED",
					detail: toSafeErrorMessage(error, "syncStrategyConditions"),
				},
			],
		}
	}
}

/**
 * Get all conditions linked to a strategy, joined with full condition data
 */
const getStrategyConditions = async (
	strategyId: string
): Promise<ActionResponse<StrategyConditionWithDetail[]>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		// Verify strategy ownership
		const strategy = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
		})

		if (!strategy) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		const result = await db.query.strategyConditions.findMany({
			where: eq(strategyConditions.strategyId, strategyId),
			with: { condition: true },
			orderBy: [asc(strategyConditions.sortOrder)],
		})

		return {
			status: "success",
			message: "Strategy conditions retrieved successfully",
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actionErrors.retrieveFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStrategyConditions"),
				},
			],
		}
	}
}

export {
	syncStrategyConditions,
	getStrategyConditions,
	type StrategyConditionWithDetail,
}
