"use server"

import { invalidatePlaybookData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import {
	strategyConditions,
	strategies,
	tradingConditions,
	tradeConditions,
	trades,
	accountModes,
} from "@/db/schema"
import type { StrategyCondition } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type { StrategyConditionInput } from "@/types/trading-condition"
import { eq, and, asc, sql, isNull, inArray } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getCurrentVersionId } from "@/lib/strategy-versions"
import { getTranslations } from "next-intl/server"
import { syncStrategyConditionsSchema } from "@/lib/validations/trading-condition"
import type {
	StrategyConditionWithDetail,
	StrategyConditionsRollup,
} from "./strategy-conditions.types"

/**
 * Sync strategy conditions — delete-all + bulk-insert (replacement strategy).
 * Simpler than diffing, and the junction table is small per strategy.
 */
export const syncStrategyConditions = async (
	strategyId: string,
	conditions: StrategyConditionInput[]
): Promise<ActionResponse<StrategyCondition[]>> => {
	const t = await getTranslations("playbook")

	const parsed = syncStrategyConditionsSchema.safeParse({
		strategyId,
		conditions,
	})
	if (!parsed.success) {
		return {
			status: "error",
			message: t("actionErrors.invalidInput"),
			errors: parsed.error.issues.map((issue) => ({
				code: "INVALID_INPUT",
				detail: issue.message,
			})),
		}
	}

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

		// Strategy versioning v1: conditions are part of the version snapshot.
		// If trades reference this strategy, mutating the condition list in-place
		// would retroactively change historical scoring — callers must fork via
		// createStrategyVersion instead.
		const tradeCountRow = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(trades)
			.where(eq(trades.strategyId, strategyId))
		const tradeCount = tradeCountRow[0]?.count ?? 0

		if (tradeCount > 0) {
			return {
				status: "error",
				message: t("actionErrors.strategyLive"),
				errors: [
					{
						code: "STRATEGY_LIVE",
						detail:
							"Strategy is locked because trades reference it. Create a new version instead.",
					},
				],
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
				message: t("actionErrors.conditionsCleared"),
				data: [],
			}
		}

		const versionId = await getCurrentVersionId(
			strategyId,
			strategy.currentVersion
		)
		if (!versionId) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [
					{
						code: "MISSING_VERSION",
						detail: `Strategy ${strategyId} is missing a v${strategy.currentVersion} row`,
					},
				],
			}
		}

		const inserted = await db
			.insert(strategyConditions)
			.values(
				conditions.map((c) => ({
					strategyId,
					strategyVersionId: versionId,
					conditionId: c.conditionId,
					tier: c.tier,
					sortOrder: c.sortOrder,
				}))
			)
			.returning()

		invalidatePlaybookData()

		return {
			status: "success",
			message: t("actionErrors.conditionsSynced"),
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
export const getStrategyConditions = async (
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
			message: t("actionErrors.conditionsRetrieved"),
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

/**
 * Rollup of how often each linked condition was met across trades pinned
 * to a specific strategy version. Feeds the playbook-detail scorecard.
 *
 * Two-query shape: (1) expected conditions for the version (strategyConditions
 * filtered by strategyVersionId + name/category), (2) per-condition stats from
 * trade_conditions joined on trades pinned to that version. Both legs scope
 * to a single version so v1 → v2 forks don't pollute historical scoring.
 *
 * `versionId` defaults to the strategy's currentVersion when omitted. Callers
 * inspecting historical versions pass an explicit id.
 */
export const getStrategyConditionsRollup = async (
	strategyId: string,
	versionId?: string
): Promise<ActionResponse<StrategyConditionsRollup>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId } = await requireAuth()

		const strategy = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
			columns: { id: true, currentVersion: true, methodology: true },
		})
		if (!strategy) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		const resolvedVersionId =
			versionId ??
			(await getCurrentVersionId(strategy.id, strategy.currentVersion))
		if (!resolvedVersionId) {
			return {
				status: "error",
				message: t("actionErrors.strategyNotFound"),
				errors: [
					{
						code: "MISSING_VERSION",
						detail: `Strategy ${strategyId} is missing a v${strategy.currentVersion} row`,
					},
				],
			}
		}

		const expected = await db
			.select({
				conditionId: strategyConditions.conditionId,
				conditionName: tradingConditions.name,
				category: tradingConditions.category,
				tier: strategyConditions.tier,
				sortOrder: strategyConditions.sortOrder,
			})
			.from(strategyConditions)
			.innerJoin(
				tradingConditions,
				eq(tradingConditions.id, strategyConditions.conditionId)
			)
			.where(eq(strategyConditions.strategyVersionId, resolvedVersionId))
			.orderBy(asc(strategyConditions.sortOrder))

		const strategyTradeIds = await db
			.select({ id: trades.id })
			.from(trades)
			.where(eq(trades.strategyVersionId, resolvedVersionId))

		const tradeIds = strategyTradeIds.map((row) => row.id)
		const totalTrades = tradeIds.length

		const stats =
			tradeIds.length === 0
				? []
				: await db
						.select({
							conditionId: tradeConditions.conditionId,
							totalRecorded: sql<number>`count(*)::int`,
							metCount: sql<number>`count(case when ${tradeConditions.met} = true then 1 end)::int`,
						})
						.from(tradeConditions)
						.where(inArray(tradeConditions.tradeId, tradeIds))
						.groupBy(tradeConditions.conditionId)

		const statsByCondition = new Map(
			stats.map((s) => [s.conditionId, s] as const)
		)

		const conditions = expected.map((row) => {
			const stat = statsByCondition.get(row.conditionId)
			const totalRecorded = stat?.totalRecorded ?? 0
			const metCount = stat?.metCount ?? 0
			return {
				conditionId: row.conditionId,
				conditionName: row.conditionName,
				category: row.category,
				tier: row.tier,
				sortOrder: row.sortOrder,
				totalRecorded,
				metCount,
				metRate: totalRecorded > 0 ? metCount / totalRecorded : 0,
			}
		})

		const hawksAccountUsage =
			tradeIds.length === 0
				? []
				: await db
						.select({ id: trades.id })
						.from(trades)
						.innerJoin(
							accountModes,
							and(
								eq(accountModes.accountId, trades.accountId),
								eq(accountModes.mode, "hawks"),
								isNull(accountModes.deactivatedAt)
							)
						)
						.where(eq(trades.strategyId, strategyId))
						.limit(1)

		return {
			status: "success",
			message: t("actionErrors.conditionsRetrieved"),
			data: {
				totalTrades,
				conditions,
				methodology: strategy.methodology,
				isHawksStrategy: hawksAccountUsage.length > 0,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actionErrors.retrieveFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStrategyConditionsRollup"),
				},
			],
		}
	}
}
