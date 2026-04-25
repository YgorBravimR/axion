"use server"

import { invalidateStrategyData } from "@/lib/cache/invalidate"
import { getTranslations } from "next-intl/server"
import { db } from "@/db/drizzle"
import {
	strategies,
	trades,
	strategyConditions,
	strategyScenarios,
} from "@/db/schema"
import type { Strategy } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, desc, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import {
	createStrategySchema,
	updateStrategySchema,
	type CreateStrategyInput,
	type UpdateStrategyInput,
} from "@/lib/validations/strategy"
import { calculateWinRate, calculateProfitFactor } from "@/lib/calculations"
import { fromCents } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"

/**
 * Checks whether a database error represents a unique constraint violation.
 * Neon wraps the real Postgres error in `.cause`, so we check both
 * the top-level message and the nested cause for code 23505.
 *
 * @param error - The caught error from a database operation
 * @returns Whether the error is a unique constraint violation
 */
const isUniqueViolation = (error: unknown): boolean => {
	if (!(error instanceof Error)) return false
	const msg = error.message
	if (msg.includes("unique") || msg.includes("23505")) return true
	if (error.cause instanceof Error) {
		const causeMsg = error.cause.message
		if (causeMsg.includes("unique") || causeMsg.includes("23505")) return true
	}
	if (error.cause && typeof error.cause === "object" && "code" in error.cause) {
		if ((error.cause as Record<string, unknown>).code === "23505") return true
	}
	return false
}

export interface StrategyWithStats extends Strategy {
	tradeCount: number
	winCount: number
	lossCount: number
	compliance: number
	totalPnl: number
	winRate: number
	profitFactor: number
	avgR: number
	conditionCount: number
	scenarioCount: number
}

export interface ComplianceOverview {
	overallCompliance: number
	totalTrackedTrades: number
	followedPlanCount: number
	notFollowedCount: number
	strategiesCount: number
	topPerformingStrategy: { name: string; compliance: number } | null
	needsAttentionStrategy: { name: string; compliance: number } | null
}

/**
 * Create a new strategy
 */
export const createStrategy = async (
	input: CreateStrategyInput
): Promise<ActionResponse<Strategy>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId, accountId } = await requireAuth()
		const validated = createStrategySchema.parse(input)

		// Remove soft-deleted strategy with same code so the unique index doesn't block reuse
		await db
			.delete(strategies)
			.where(
				and(
					eq(strategies.userId, userId),
					eq(strategies.code, validated.code),
					eq(strategies.isActive, false)
				)
			)

		const [strategy] = await db
			.insert(strategies)
			.values({
				userId,
				code: validated.code,
				name: validated.name,
				description: validated.description || null,
				entryCriteria: validated.entryCriteria || null,
				exitCriteria: validated.exitCriteria || null,
				riskRules: validated.riskRules || null,
				targetRMultiple: validated.targetRMultiple?.toString() || null,
				maxRiskPercent: validated.maxRiskPercent?.toString() || null,
				screenshotUrl: validated.screenshotUrl || null,
				screenshotS3Key: validated.screenshotS3Key || null,
				notes: validated.notes || null,
				isActive: validated.isActive ?? true,
			})
			.returning()

		// Sync conditions if provided
		if (validated.conditions && validated.conditions.length > 0) {
			await db.insert(strategyConditions).values(
				validated.conditions.map((c) => ({
					strategyId: strategy.id,
					conditionId: c.conditionId,
					tier: c.tier,
					sortOrder: c.sortOrder,
				}))
			)
		}

		invalidateStrategyData(userId, accountId)

		return {
			status: "success",
			message: t("actions.strategyCreated"),
			data: strategy,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationFailed"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		// Check for unique constraint violation (Neon wraps the real error in .cause)
		if (isUniqueViolation(error)) {
			return {
				status: "error",
				message: t("actions.strategyDuplicate"),
				errors: [
					{
						code: "DUPLICATE_STRATEGY",
						detail: "Strategy code must be unique",
					},
				],
			}
		}

		return {
			status: "error",
			message: t("actions.strategyCreateFailed"),
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "createStrategy"),
				},
			],
		}
	}
}

/**
 * Update an existing strategy
 */
export const updateStrategy = async (
	id: string,
	input: UpdateStrategyInput
): Promise<ActionResponse<Strategy>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId, accountId } = await requireAuth()

		const existing = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, id), eq(strategies.userId, userId)),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("actions.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		const validated = updateStrategySchema.parse(input)

		const [strategy] = await db
			.update(strategies)
			.set({
				...(validated.code !== undefined && { code: validated.code }),
				...(validated.name !== undefined && { name: validated.name }),
				...(validated.description !== undefined && {
					description: validated.description || null,
				}),
				...(validated.entryCriteria !== undefined && {
					entryCriteria: validated.entryCriteria || null,
				}),
				...(validated.exitCriteria !== undefined && {
					exitCriteria: validated.exitCriteria || null,
				}),
				...(validated.riskRules !== undefined && {
					riskRules: validated.riskRules || null,
				}),
				...(validated.targetRMultiple !== undefined && {
					targetRMultiple: validated.targetRMultiple?.toString() || null,
				}),
				...(validated.maxRiskPercent !== undefined && {
					maxRiskPercent: validated.maxRiskPercent?.toString() || null,
				}),
				...(validated.screenshotUrl !== undefined && {
					screenshotUrl: validated.screenshotUrl || null,
				}),
				...(validated.screenshotS3Key !== undefined && {
					screenshotS3Key: validated.screenshotS3Key || null,
				}),
				...(validated.notes !== undefined && {
					notes: validated.notes || null,
				}),
				...(validated.isActive !== undefined && {
					isActive: validated.isActive,
				}),
				updatedAt: new Date(),
			})
			.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
			.returning()

		// Sync conditions if provided (delete-all + bulk-insert)
		if (validated.conditions !== undefined) {
			await db
				.delete(strategyConditions)
				.where(eq(strategyConditions.strategyId, id))

			if (validated.conditions.length > 0) {
				await db.insert(strategyConditions).values(
					validated.conditions.map((c) => ({
						strategyId: id,
						conditionId: c.conditionId,
						tier: c.tier,
						sortOrder: c.sortOrder,
					}))
				)
			}
		}

		invalidateStrategyData(userId, accountId)

		return {
			status: "success",
			message: t("actions.strategyUpdated"),
			data: strategy,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationFailed"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		// Check for unique constraint violation (Neon wraps the real error in .cause)
		if (isUniqueViolation(error)) {
			return {
				status: "error",
				message: t("actions.strategyDuplicate"),
				errors: [
					{
						code: "DUPLICATE_STRATEGY",
						detail: "Strategy code must be unique",
					},
				],
			}
		}

		return {
			status: "error",
			message: t("actions.strategyUpdateFailed"),
			errors: [
				{
					code: "UPDATE_FAILED",
					detail: toSafeErrorMessage(error, "updateStrategy"),
				},
			],
		}
	}
}

/**
 * Delete a strategy (soft delete by setting isActive to false, or hard delete)
 */
export const deleteStrategy = async (
	id: string,
	hardDelete = false
): Promise<ActionResponse<void>> => {
	const t = await getTranslations("playbook")
	try {
		const { userId, accountId } = await requireAuth()

		const existing = await db.query.strategies.findFirst({
			where: and(eq(strategies.id, id), eq(strategies.userId, userId)),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("actions.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		if (hardDelete) {
			// Note: trades referencing this strategy will have strategyId set to null (onDelete: "set null")
			await db
				.delete(strategies)
				.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
		} else {
			// Soft delete - just deactivate
			await db
				.update(strategies)
				.set({ isActive: false, updatedAt: new Date() })
				.where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
		}

		invalidateStrategyData(userId, accountId)

		return {
			status: "success",
			message: hardDelete
				? t("actions.strategyDeletedPermanently")
				: t("actions.strategyDeactivated"),
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.strategyDeleteFailed"),
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteStrategy"),
				},
			],
		}
	}
}

/**
 * Calculate stats from a list of trades for a strategy.
 * Shared between getStrategies and getStrategy to avoid duplication.
 */
interface StrategyTradeStats {
	tradeCount: number
	winCount: number
	lossCount: number
	compliance: number
	totalPnl: number
	winRate: number
	profitFactor: number
	avgR: number
}

const calculateStrategyStats = (
	strategyTrades: Array<{
		pnl: number | string | null
		outcome: string | null
		realizedRMultiple: string | null
		followedPlan: boolean | null
	}>
): StrategyTradeStats => {
	let winCount = 0
	let lossCount = 0
	let totalPnl = 0
	let totalR = 0
	let rCount = 0
	let followedPlanCount = 0
	let trackedPlanCount = 0
	let grossProfit = 0
	let grossLoss = 0

	for (const trade of strategyTrades) {
		const pnl = fromCents(trade.pnl)
		totalPnl += pnl

		if (trade.outcome === "win") {
			winCount++
			grossProfit += pnl
		} else if (trade.outcome === "loss") {
			lossCount++
			grossLoss += Math.abs(pnl)
		}

		if (trade.realizedRMultiple) {
			totalR += Number(trade.realizedRMultiple)
			rCount++
		}

		if (trade.followedPlan !== null) {
			trackedPlanCount++
			if (trade.followedPlan) {
				followedPlanCount++
			}
		}
	}

	const compliance =
		trackedPlanCount > 0 ? (followedPlanCount / trackedPlanCount) * 100 : 0

	return {
		tradeCount: strategyTrades.length,
		winCount,
		lossCount,
		compliance,
		totalPnl,
		winRate: calculateWinRate(winCount, winCount + lossCount),
		profitFactor: calculateProfitFactor(grossProfit, grossLoss),
		avgR: rCount > 0 ? totalR / rCount : 0,
	}
}

/**
 * Get all strategies with stats
 */
export const getStrategies = async (
	includeInactive = false
): Promise<ActionResponse<StrategyWithStats[]>> => {
	const t = await getTranslations("playbook")
	try {
		const authContext = await requireAuth()
		// Strategies are user-level, queried by userId
		const strategyCondition = eq(strategies.userId, authContext.userId)
		// Trades are still account-scoped for stats
		const tradesAccountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const conditions = includeInactive
			? strategyCondition
			: and(strategyCondition, eq(strategies.isActive, true))

		const allStrategies = await db.query.strategies.findMany({
			where: conditions,
			orderBy: [desc(strategies.createdAt)],
		})

		if (allStrategies.length === 0) {
			return {
				status: "success",
				message: t("actions.noStrategiesFound"),
				data: [],
			}
		}

		const strategyIds = allStrategies.map((s) => s.id)

		// Batch all data in 3 parallel queries instead of O(n) per-strategy queries
		const [allStrategyTrades, conditionCounts, scenarioCounts] =
			await Promise.all([
				db.query.trades.findMany({
					where: and(
						inArray(trades.strategyId, strategyIds),
						tradesAccountCondition,
						eq(trades.isArchived, false)
					),
				}),
				db
					.select({
						strategyId: strategyConditions.strategyId,
						count: sql<number>`count(*)::int`,
					})
					.from(strategyConditions)
					.where(inArray(strategyConditions.strategyId, strategyIds))
					.groupBy(strategyConditions.strategyId),
				db
					.select({
						strategyId: strategyScenarios.strategyId,
						count: sql<number>`count(*)::int`,
					})
					.from(strategyScenarios)
					.where(inArray(strategyScenarios.strategyId, strategyIds))
					.groupBy(strategyScenarios.strategyId),
			])

		// Build lookup maps for O(1) access
		const tradesByStrategyId = new Map<string, typeof allStrategyTrades>()
		for (const trade of allStrategyTrades) {
			if (!trade.strategyId) continue
			const existing = tradesByStrategyId.get(trade.strategyId)
			if (existing) {
				existing.push(trade)
			} else {
				tradesByStrategyId.set(trade.strategyId, [trade])
			}
		}

		const conditionCountByStrategyId = new Map<string, number>()
		for (const row of conditionCounts) {
			conditionCountByStrategyId.set(row.strategyId, row.count)
		}

		const scenarioCountByStrategyId = new Map<string, number>()
		for (const row of scenarioCounts) {
			scenarioCountByStrategyId.set(row.strategyId, row.count)
		}

		// Join in JS — O(1) per strategy
		const strategiesWithStats: StrategyWithStats[] = allStrategies.map(
			(strategy) => ({
				...strategy,
				...calculateStrategyStats(tradesByStrategyId.get(strategy.id) ?? []),
				conditionCount: conditionCountByStrategyId.get(strategy.id) ?? 0,
				scenarioCount: scenarioCountByStrategyId.get(strategy.id) ?? 0,
			})
		)

		return {
			status: "success",
			message: t("actions.strategiesRetrieved"),
			data: strategiesWithStats,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.strategiesFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStrategies"),
				},
			],
		}
	}
}

/**
 * Get a single strategy by ID with stats
 */
export const getStrategy = async (
	id: string
): Promise<ActionResponse<StrategyWithStats>> => {
	const t = await getTranslations("playbook")
	try {
		const authContext = await requireAuth()
		// Strategies are user-level
		const tradesAccountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const strategy = await db.query.strategies.findFirst({
			where: and(
				eq(strategies.id, id),
				eq(strategies.userId, authContext.userId)
			),
		})

		if (!strategy) {
			return {
				status: "error",
				message: t("actions.strategyNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Strategy does not exist" }],
			}
		}

		// Get trades, condition count, and scenario count for this strategy
		const [strategyTrades, conditionCountResult, scenarioCountResult] =
			await Promise.all([
				db.query.trades.findMany({
					where: and(
						eq(trades.strategyId, strategy.id),
						tradesAccountCondition,
						eq(trades.isArchived, false)
					),
				}),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(strategyConditions)
					.where(eq(strategyConditions.strategyId, strategy.id)),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(strategyScenarios)
					.where(eq(strategyScenarios.strategyId, strategy.id)),
			])

		return {
			status: "success",
			message: t("actions.strategyRetrieved"),
			data: {
				...strategy,
				...calculateStrategyStats(strategyTrades),
				conditionCount: conditionCountResult[0]?.count ?? 0,
				scenarioCount: scenarioCountResult[0]?.count ?? 0,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.strategyFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getStrategy"),
				},
			],
		}
	}
}

/**
 * Get overall compliance overview
 */
export const getComplianceOverview = async (): Promise<
	ActionResponse<ComplianceOverview>
> => {
	const t = await getTranslations("playbook")
	try {
		const authContext = await requireAuth()
		// Strategies are user-level
		const tradesAccountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		// Get all active strategies for this user
		const allStrategies = await db.query.strategies.findMany({
			where: and(
				eq(strategies.userId, authContext.userId),
				eq(strategies.isActive, true)
			),
		})

		// Aggregate overall compliance and per-strategy compliance at the DB level
		const [overallRows, perStrategyRows] = await Promise.all([
			db
				.select({
					trackedCount: sql<number>`count(*) filter (where ${trades.followedPlan} is not null)::int`,
					followedCount: sql<number>`count(*) filter (where ${trades.followedPlan} = true)::int`,
					notFollowedCount: sql<number>`count(*) filter (where ${trades.followedPlan} = false)::int`,
				})
				.from(trades)
				.where(and(tradesAccountCondition, eq(trades.isArchived, false))),
			db
				.select({
					strategyId: trades.strategyId,
					trackedCount: sql<number>`count(*) filter (where ${trades.followedPlan} is not null)::int`,
					followedCount: sql<number>`count(*) filter (where ${trades.followedPlan} = true)::int`,
				})
				.from(trades)
				.where(
					and(
						tradesAccountCondition,
						eq(trades.isArchived, false),
						inArray(
							trades.strategyId,
							allStrategies.map((s) => s.id)
						)
					)
				)
				.groupBy(trades.strategyId),
		])

		const overallRow = overallRows[0]
		const trackedCount = overallRow?.trackedCount ?? 0
		const followedPlanCount = overallRow?.followedCount ?? 0
		const notFollowedCount = overallRow?.notFollowedCount ?? 0
		const overallCompliance =
			trackedCount > 0 ? (followedPlanCount / trackedCount) * 100 : 0

		// Build a name lookup for strategies
		const strategyNameById = new Map(allStrategies.map((s) => [s.id, s.name]))

		// Compute per-strategy compliance from aggregated rows
		const strategyCompliances: Array<{
			name: string
			compliance: number
			tradeCount: number
		}> = []

		for (const row of perStrategyRows) {
			if (!row.strategyId || row.trackedCount === 0) continue
			const name = strategyNameById.get(row.strategyId)
			if (!name) continue
			strategyCompliances.push({
				name,
				compliance: (row.followedCount / row.trackedCount) * 100,
				tradeCount: row.trackedCount,
			})
		}

		// Find top performing (highest compliance with at least 3 trades) - using toSorted for immutability
		const qualifiedStrategies = strategyCompliances.filter(
			(s) => s.tradeCount >= 3
		)
		const sortedByCompliance = qualifiedStrategies.toSorted(
			(a, b) => b.compliance - a.compliance
		)

		const topPerformingStrategy =
			sortedByCompliance.length > 0
				? {
						name: sortedByCompliance[0].name,
						compliance: sortedByCompliance[0].compliance,
					}
				: null

		// Find needs attention (lowest compliance with at least 3 trades)
		const needsAttentionStrategy =
			sortedByCompliance.length > 0
				? {
						name: sortedByCompliance[sortedByCompliance.length - 1].name,
						compliance:
							sortedByCompliance[sortedByCompliance.length - 1].compliance,
					}
				: null

		return {
			status: "success",
			message: t("actions.complianceRetrieved"),
			data: {
				overallCompliance,
				totalTrackedTrades: trackedCount,
				followedPlanCount,
				notFollowedCount,
				strategiesCount: allStrategies.length,
				topPerformingStrategy,
				needsAttentionStrategy:
					needsAttentionStrategy?.compliance !==
					topPerformingStrategy?.compliance
						? needsAttentionStrategy
						: null,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.complianceFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getComplianceOverview"),
				},
			],
		}
	}
}
