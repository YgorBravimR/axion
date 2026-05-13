"use server"

import { invalidateTradeData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { getTranslations } from "next-intl/server"
import {
	dailyChecklists,
	checklistCompletions,
	accountAssetSettings,
	accountAssets,
	trades,
} from "@/db/schema"
import type {
	DailyChecklist,
	ChecklistCompletion,
	AccountAssetSetting,
} from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm"
import { z } from "zod"
import {
	createChecklistSchema,
	updateChecklistSchema,
	updateCompletionSchema,
	assetSettingsSchema,
	type CreateChecklistInput,
	type UpdateChecklistInput,
	type AssetSettingsInput,
	type ChecklistItem,
	type CircuitBreakerStatus,
} from "@/lib/validations/command-center"
import { fromCents, toCents } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { resolveDay, resolveBehavior } from "@/lib/fractal-plan/resolver"
import { checkHawksCascade } from "@/lib/hawks/cascade"
import type {
	ChecklistWithCompletion,
	AssetSettingWithAsset,
	DailySummary,
} from "./command-center.types"

// ==========================================
// CHECKLIST ACTIONS
// ==========================================

/**
 * Get all checklists for the current account
 */
export const getChecklists = async (): Promise<
	ActionResponse<DailyChecklist[]>
> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		const checklists = await db.query.dailyChecklists.findMany({
			where: and(
				eq(dailyChecklists.userId, userId),
				eq(dailyChecklists.accountId, accountId),
				eq(dailyChecklists.isActive, true)
			),
			orderBy: [desc(dailyChecklists.createdAt)],
		})

		return {
			status: "success",
			message: t("actions.checklistsRetrieved"),
			data: checklists,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.checklistsFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getChecklists"),
				},
			],
		}
	}
}

/**
 * Create a new checklist
 */
export const createChecklist = async (
	input: CreateChecklistInput
): Promise<ActionResponse<DailyChecklist>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()
		const validated = createChecklistSchema.parse(input)

		const [checklist] = await db
			.insert(dailyChecklists)
			.values({
				userId,
				accountId,
				name: validated.name,
				items: JSON.stringify(validated.items),
				isActive: validated.isActive ?? true,
			})
			.returning()

		invalidateTradeData(undefined, userId, accountId)

		return {
			status: "success",
			message: t("actions.checklistCreated"),
			data: checklist,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationError"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: t("actions.checklistCreateFailed"),
			errors: [
				{
					code: "CREATE_FAILED",
					detail: toSafeErrorMessage(error, "createChecklist"),
				},
			],
		}
	}
}

/**
 * Update an existing checklist
 */
export const updateChecklist = async (
	id: string,
	input: UpdateChecklistInput
): Promise<ActionResponse<DailyChecklist>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		const existing = await db.query.dailyChecklists.findFirst({
			where: and(
				eq(dailyChecklists.id, id),
				eq(dailyChecklists.userId, userId),
				eq(dailyChecklists.accountId, accountId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("actions.checklistNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Checklist does not exist" }],
			}
		}

		const validated = updateChecklistSchema.parse(input)

		const [checklist] = await db
			.update(dailyChecklists)
			.set({
				...(validated.name !== undefined && { name: validated.name }),
				...(validated.items !== undefined && {
					items: JSON.stringify(validated.items),
				}),
				...(validated.isActive !== undefined && {
					isActive: validated.isActive,
				}),
				updatedAt: new Date(),
			})
			.where(eq(dailyChecklists.id, id))
			.returning()

		invalidateTradeData(undefined, userId, accountId)

		return {
			status: "success",
			message: t("actions.checklistUpdated"),
			data: checklist,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationError"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: t("actions.checklistUpdateFailed"),
			errors: [
				{
					code: "UPDATE_FAILED",
					detail: toSafeErrorMessage(error, "updateChecklist"),
				},
			],
		}
	}
}

/**
 * Delete a checklist (soft delete)
 */
export const deleteChecklist = async (
	id: string
): Promise<ActionResponse<void>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		const existing = await db.query.dailyChecklists.findFirst({
			where: and(
				eq(dailyChecklists.id, id),
				eq(dailyChecklists.userId, userId),
				eq(dailyChecklists.accountId, accountId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("actions.checklistNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Checklist does not exist" }],
			}
		}

		await db
			.update(dailyChecklists)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(dailyChecklists.id, id))

		invalidateTradeData(undefined, userId, accountId)

		return {
			status: "success",
			message: t("actions.checklistDeleted"),
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.checklistDeleteFailed"),
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteChecklist"),
				},
			],
		}
	}
}

// ==========================================
// COMPLETION ACTIONS
// ==========================================

/**
 * Get checklist completions for a given date (defaults to today)
 */
export const getTodayCompletions = async (
	date?: Date
): Promise<ActionResponse<ChecklistWithCompletion[]>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		const today = date ? new Date(date) : await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Get all active checklists
		const checklists = await db.query.dailyChecklists.findMany({
			where: and(
				eq(dailyChecklists.userId, userId),
				eq(dailyChecklists.accountId, accountId),
				eq(dailyChecklists.isActive, true)
			),
			orderBy: [desc(dailyChecklists.createdAt)],
		})

		// Get today's completions for these checklists
		const checklistIds = checklists.map((c) => c.id)
		const completions =
			checklistIds.length > 0
				? await db.query.checklistCompletions.findMany({
						where: and(
							inArray(checklistCompletions.checklistId, checklistIds),
							gte(checklistCompletions.date, today),
							lte(checklistCompletions.date, tomorrow)
						),
					})
				: []

		// Map completions to checklists
		const checklistsWithCompletions: ChecklistWithCompletion[] = checklists.map(
			(checklist) => {
				const completion =
					completions.find((c) => c.checklistId === checklist.id) || null
				const completedItemIds: string[] = completion
					? JSON.parse(completion.completedItems)
					: []

				return {
					...checklist,
					parsedItems: JSON.parse(checklist.items) as ChecklistItem[],
					completion,
					completedItemIds,
				}
			}
		)

		return {
			status: "success",
			message: t("actions.completionsRetrieved"),
			data: checklistsWithCompletions,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.completionsFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getTodayCompletions"),
				},
			],
		}
	}
}

/**
 * Toggle a checklist item completion
 */
export const toggleChecklistItem = async (
	checklistId: string,
	itemId: string,
	completed: boolean
): Promise<ActionResponse<ChecklistCompletion>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		// Validate input
		const validated = updateCompletionSchema.parse({
			checklistId,
			itemId,
			completed,
		})

		// Get start and end of today (effective date for replay accounts)
		const today = await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Check if completion record exists for today
		const existing = await db.query.checklistCompletions.findFirst({
			where: and(
				eq(checklistCompletions.checklistId, validated.checklistId),
				gte(checklistCompletions.date, today),
				lte(checklistCompletions.date, tomorrow)
			),
		})

		if (existing) {
			// Update existing completion
			const currentItems: string[] = JSON.parse(existing.completedItems)
			let newItems: string[]

			if (validated.completed) {
				// Add item if not already present
				newItems = currentItems.includes(validated.itemId)
					? currentItems
					: [...currentItems, validated.itemId]
			} else {
				// Remove item
				newItems = currentItems.filter((id) => id !== validated.itemId)
			}

			// Get the checklist to check if all items are completed
			const checklist = await db.query.dailyChecklists.findFirst({
				where: eq(dailyChecklists.id, validated.checklistId),
			})
			const allItems: ChecklistItem[] = checklist
				? JSON.parse(checklist.items)
				: []
			const allCompleted = allItems.every((item) => newItems.includes(item.id))

			const [completion] = await db
				.update(checklistCompletions)
				.set({
					completedItems: JSON.stringify(newItems),
					completedAt: allCompleted ? today : null,
					updatedAt: new Date(),
				})
				.where(eq(checklistCompletions.id, existing.id))
				.returning()

			invalidateTradeData(undefined, userId, accountId)

			return {
				status: "success",
				message: t("actions.completionItemUpdated"),
				data: completion,
			}
		} else {
			// Create new completion record
			const newItems = validated.completed ? [validated.itemId] : []

			const [completion] = await db
				.insert(checklistCompletions)
				.values({
					checklistId: validated.checklistId,
					userId,
					date: today,
					completedItems: JSON.stringify(newItems),
					completedAt: null,
				})
				.returning()

			invalidateTradeData(undefined, userId, accountId)

			return {
				status: "success",
				message: t("actions.completionCreated"),
				data: completion,
			}
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationError"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: t("actions.completionToggleFailed"),
			errors: [
				{
					code: "UPDATE_FAILED",
					detail: toSafeErrorMessage(error, "toggleChecklistItem"),
				},
			],
		}
	}
}

// Daily notes (pre/post + mood) live on `dailyPlan` now.
// See: src/app/actions/fractal-plan/daily.ts (`upsertDailyPlan`,
// `getDailyPlanForCurrentAccount`) and src/lib/fractal-plan/ensure-daily.ts.

// ==========================================
// ASSET SETTINGS ACTIONS (Account-Level, Permanent)
// ==========================================

/**
 * Get account-level asset settings.
 * Auto-populates blank rows for enabled assets that don't have settings yet.
 */
export const getAccountAssetSettings = async (): Promise<
	ActionResponse<AssetSettingWithAsset[]>
> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		// Get enabled assets for this account
		const enabledAccountAssets = await db.query.accountAssets.findMany({
			where: and(
				eq(accountAssets.accountId, accountId),
				eq(accountAssets.isEnabled, true)
			),
		})

		// Get existing account asset settings
		const existingSettings = await db.query.accountAssetSettings.findMany({
			where: and(
				eq(accountAssetSettings.userId, userId),
				eq(accountAssetSettings.accountId, accountId),
				eq(accountAssetSettings.isActive, true)
			),
			with: {
				asset: true,
			},
		})

		// Find enabled assets missing settings rows
		const existingAssetIds = new Set(existingSettings.map((s) => s.assetId))
		const missingAssets = enabledAccountAssets.filter(
			(aa) => !existingAssetIds.has(aa.assetId)
		)

		// Auto-populate blank rows for missing assets
		if (missingAssets.length > 0) {
			await db
				.insert(accountAssetSettings)
				.values(
					missingAssets.map((aa) => ({
						userId,
						accountId,
						assetId: aa.assetId,
						isActive: true,
					}))
				)
				.onConflictDoNothing()

			// Re-fetch with asset relation
			const allSettings = await db.query.accountAssetSettings.findMany({
				where: and(
					eq(accountAssetSettings.userId, userId),
					eq(accountAssetSettings.accountId, accountId),
					eq(accountAssetSettings.isActive, true)
				),
				with: {
					asset: true,
				},
			})

			return {
				status: "success",
				message: t("actions.assetSettingsRetrieved"),
				data: allSettings as AssetSettingWithAsset[],
			}
		}

		return {
			status: "success",
			message: t("actions.assetSettingsRetrieved"),
			data: existingSettings as AssetSettingWithAsset[],
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.assetSettingsFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(
						error,
						"getAccountAssetSettings",
						"database"
					),
				},
			],
		}
	}
}

export const getAssetSettings = async () => getAccountAssetSettings()

/**
 * Upsert account-level asset settings
 */
export const upsertAssetSettings = async (
	input: AssetSettingsInput
): Promise<ActionResponse<AccountAssetSetting>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()
		const validated = assetSettingsSchema.parse(input)

		// Check if settings exist for this asset
		const existing = await db.query.accountAssetSettings.findFirst({
			where: and(
				eq(accountAssetSettings.userId, userId),
				eq(accountAssetSettings.accountId, accountId),
				eq(accountAssetSettings.assetId, validated.assetId)
			),
		})

		if (existing) {
			const [settings] = await db
				.update(accountAssetSettings)
				.set({
					bias: validated.bias || null,
					maxDailyTrades: validated.maxDailyTrades || null,
					maxPositionSize: validated.maxPositionSize || null,
					notes: validated.notes || null,
					isActive: validated.isActive ?? true,
					updatedAt: new Date(),
				})
				.where(eq(accountAssetSettings.id, existing.id))
				.returning()

			invalidateTradeData(undefined, userId, accountId)

			return {
				status: "success",
				message: t("actions.assetSettingsUpdated"),
				data: settings,
			}
		} else {
			const [settings] = await db
				.insert(accountAssetSettings)
				.values({
					userId,
					accountId,
					assetId: validated.assetId,
					bias: validated.bias || null,
					maxDailyTrades: validated.maxDailyTrades || null,
					maxPositionSize: validated.maxPositionSize || null,
					notes: validated.notes || null,
					isActive: validated.isActive ?? true,
				})
				.returning()

			invalidateTradeData(undefined, userId, accountId)

			return {
				status: "success",
				message: t("actions.assetSettingsCreated"),
				data: settings,
			}
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationError"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: t("actions.assetSettingsSaveFailed"),
			errors: [
				{
					code: "SAVE_FAILED",
					detail: toSafeErrorMessage(error, "upsertAssetSettings"),
				},
			],
		}
	}
}

/**
 * Delete account-level asset settings (soft delete)
 */
export const deleteAssetSettings = async (
	assetId: string
): Promise<ActionResponse<void>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { userId, accountId } = await requireAuth()

		const existing = await db.query.accountAssetSettings.findFirst({
			where: and(
				eq(accountAssetSettings.userId, userId),
				eq(accountAssetSettings.accountId, accountId),
				eq(accountAssetSettings.assetId, assetId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: t("actions.assetSettingsNotFound"),
				errors: [{ code: "NOT_FOUND", detail: "Asset settings do not exist" }],
			}
		}

		await db
			.update(accountAssetSettings)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(accountAssetSettings.id, existing.id))

		invalidateTradeData(undefined, userId, accountId)

		return {
			status: "success",
			message: t("actions.assetSettingsDeleted"),
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.assetSettingsDeleteFailed"),
			errors: [
				{
					code: "DELETE_FAILED",
					detail: toSafeErrorMessage(error, "deleteAssetSettings"),
				},
			],
		}
	}
}

// ==========================================
// CIRCUIT BREAKER STATUS
// ==========================================

/**
 * Get circuit breaker status for a given date (defaults to today)
 */
export const getCircuitBreakerStatus = async (
	date?: Date
): Promise<ActionResponse<CircuitBreakerStatus>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { accountId } = await requireAuth()

		const today = date ? new Date(date) : await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Get today's trades
		const todaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: [desc(trades.entryDate)],
		})

		// Phase 4b: caps + behaviors come from the fractal-plan cascade.
		const day = await resolveDay(accountId, today)
		const behavior = await resolveBehavior({ accountId, date: today })

		// Calculate metrics
		let dailyPnL = 0
		let consecutiveLosses = 0
		let maxConsecutiveLosses = 0

		// Sort trades by entry date to calculate consecutive losses properly (using toSorted for immutability)
		const sortedTrades = todaysTrades.toSorted(
			(a, b) =>
				new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
		)

		// Breakevens are invisible to trade counts, max trades, and consecutive losses
		const nonBreakevenCount = sortedTrades.filter(
			(t) => t.outcome !== "breakeven"
		).length

		for (const trade of sortedTrades) {
			dailyPnL += fromCents(trade.pnl)

			if (trade.outcome === "loss") {
				consecutiveLosses++
				maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses)
			} else if (trade.outcome === "win") {
				consecutiveLosses = 0
			}
		}

		// Current consecutive losses (from the most recent non-breakeven trades)
		let currentConsecutiveLosses = 0
		for (let i = sortedTrades.length - 1; i >= 0; i--) {
			const trade = sortedTrades[i]
			if (!trade || trade.outcome === "breakeven") {
				continue
			}
			if (trade.outcome === "loss") {
				currentConsecutiveLosses++
			} else {
				break
			}
		}

		// Calculate risk used today (sum of plannedRiskAmount from today's trades)
		const riskUsedTodayCents = todaysTrades.reduce(
			(sum, trade) => sum + (Number(trade.plannedRiskAmount) || 0),
			0
		)

		// Resolve limits from the fractal-plan cascade (single source of truth)
		const oneRCents = day?.oneRCents ?? 0
		const dailyLossLimitCents = day
			? Math.round(Number(day.dailyLossR.value) * oneRCents)
			: 0
		const profitTargetCents = day
			? Math.round(Number(day.dailyTargetR.value) * oneRCents)
			: 0
		const derivedMaxTrades =
			oneRCents > 0 && dailyLossLimitCents > 0
				? Math.floor(dailyLossLimitCents / oneRCents)
				: null
		const maxConsecutiveLossesValue = behavior.maxConsecutiveLosses ?? null

		// When a recovery profile is linked, derivedMaxDailyTrades (floor(dailyLoss / 1R))
		// underestimates because recovery steps use reduced risk. Ensure maxTrades is at
		// least maxConsecutiveLosses so the circuit breaker doesn't show a contradictory cap.
		const maxTradesValue =
			derivedMaxTrades !== null &&
			maxConsecutiveLossesValue !== null &&
			maxConsecutiveLossesValue > derivedMaxTrades
				? maxConsecutiveLossesValue
				: derivedMaxTrades

		// Calculate remaining daily risk
		const remainingDailyRiskCents = Math.max(
			0,
			dailyLossLimitCents - Math.abs(Math.min(0, toCents(dailyPnL)))
		)

		// Get monthly P&L (using the target date's month)
		const monthStart = new Date(today)
		monthStart.setDate(1)

		const monthlyTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, monthStart),
				eq(trades.isArchived, false)
			),
		})
		const monthlyPnL = monthlyTrades.reduce(
			(sum, trade) => sum + fromCents(trade.pnl),
			0
		)

		// Monthly loss limit (resolver — month↔year cascade)
		const monthlyLossLimitCents = day
			? Math.round(Number(day.monthlyLossR.value) * oneRCents)
			: 0
		const remainingMonthlyCents =
			monthlyLossLimitCents > 0
				? Math.max(
						0,
						monthlyLossLimitCents - Math.abs(Math.min(0, toCents(monthlyPnL)))
					)
				: Infinity
		const isMonthlyLimitHit =
			monthlyLossLimitCents > 0 &&
			monthlyPnL <= -fromCents(monthlyLossLimitCents)

		// Calculate recommended risk — base is 1R from the active ladder tier
		let recommendedRiskCents = oneRCents

		// Risk reduction after consecutive losses
		const shouldReduceRisk = behavior.reduceRiskAfterLoss
		const reductionFactor = behavior.riskReductionFactor

		if (shouldReduceRisk && currentConsecutiveLosses > 0 && reductionFactor) {
			recommendedRiskCents = Math.round(
				recommendedRiskCents *
					Math.pow(reductionFactor, currentConsecutiveLosses)
			)
		}

		// Win risk adjustment (increase or cap — mutually exclusive)
		const reinvestmentPercent = behavior.profitReinvestmentPercent
		if (reinvestmentPercent) {
			if (behavior.increaseRiskAfterWin) {
				// INCREASE: add % of last win's profit to base risk
				const lastTrade = sortedTrades.at(-1)
				const lastPnl = Number(lastTrade?.pnl) || 0
				if (lastTrade?.outcome === "win" && lastPnl > 0) {
					const bonusCents = Math.round((lastPnl * reinvestmentPercent) / 100)
					recommendedRiskCents = recommendedRiskCents + bonusCents
				}
			} else if (behavior.capRiskAfterWin) {
				// CAP: find first winning trade of the day, cap risk to min(base, profit * %)
				const firstWin = sortedTrades.find(
					(t) => t.outcome === "win" && t.pnl && Number(t.pnl) > 0
				)
				const firstWinPnl = Number(firstWin?.pnl) || 0
				if (firstWinPnl > 0 && sortedTrades.length > 1) {
					const capCents = Math.round((firstWinPnl * reinvestmentPercent) / 100)
					recommendedRiskCents = Math.min(recommendedRiskCents, capCents)
				}
			}
		}

		// Cap at remaining budgets
		recommendedRiskCents = Math.min(
			recommendedRiskCents,
			remainingDailyRiskCents > 0
				? remainingDailyRiskCents
				: recommendedRiskCents,
			remainingMonthlyCents !== Infinity
				? remainingMonthlyCents
				: recommendedRiskCents
		)

		// Check second op block (resolver — cascades all 4 levels)
		const allowSecondOp = behavior.allowSecondOpAfterLoss
		const isSecondOpBlocked =
			allowSecondOp === false &&
			currentConsecutiveLosses > 0 &&
			nonBreakevenCount > 0

		// Calculate circuit breaker triggers (using plan-first resolved values)
		const profitTargetHit =
			profitTargetCents > 0 ? dailyPnL >= fromCents(profitTargetCents) : false
		const lossLimitHit =
			dailyLossLimitCents > 0
				? dailyPnL <= -fromCents(dailyLossLimitCents)
				: false
		const maxTradesHit = maxTradesValue
			? nonBreakevenCount >= maxTradesValue
			: false
		const maxConsecutiveLossesHit = maxConsecutiveLossesValue
			? currentConsecutiveLosses >= maxConsecutiveLossesValue
			: false

		const cascadeResult = await checkHawksCascade(accountId, today)
		const hawksCascadeTriggered = cascadeResult?.triggered === true

		const shouldStopTrading =
			profitTargetHit ||
			lossLimitHit ||
			maxTradesHit ||
			maxConsecutiveLossesHit ||
			isMonthlyLimitHit ||
			isSecondOpBlocked ||
			hawksCascadeTriggered

		// Build alerts
		const alerts: string[] = []
		if (profitTargetHit) {
			alerts.push("profitTargetHit")
		}
		if (lossLimitHit) {
			alerts.push("lossLimitHit")
		}
		if (maxTradesHit) {
			alerts.push("maxTradesHit")
		}
		if (maxConsecutiveLossesHit) {
			alerts.push("maxConsecutiveLossesHit")
		}
		if (isMonthlyLimitHit) {
			alerts.push("monthlyLimitHit")
		}
		if (isSecondOpBlocked) {
			alerts.push("secondOpBlocked")
		}
		if (hawksCascadeTriggered) {
			alerts.push("hawksCascade")
		}

		return {
			status: "success",
			message: t("actions.circuitBreakerRetrieved"),
			data: {
				dailyPnL,
				tradesCount: nonBreakevenCount,
				consecutiveLosses: currentConsecutiveLosses,
				profitTargetHit,
				lossLimitHit,
				maxTradesHit,
				maxConsecutiveLossesHit,
				shouldStopTrading,
				alerts,
				profitTargetCents,
				dailyLossLimitCents,
				maxTrades: maxTradesValue,
				maxConsecutiveLosses: maxConsecutiveLossesValue,
				reduceRiskAfterLoss: shouldReduceRisk,
				riskReductionFactor:
					behavior.riskReductionFactor !== null
						? String(behavior.riskReductionFactor)
						: null,
				riskUsedTodayCents,
				remainingDailyRiskCents,
				recommendedRiskCents,
				monthlyPnL,
				monthlyLossLimitCents,
				remainingMonthlyCents:
					remainingMonthlyCents === Infinity ? 0 : remainingMonthlyCents,
				isMonthlyLimitHit,
				isSecondOpBlocked,
				hawksCascade: cascadeResult,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.circuitBreakerFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getCircuitBreakerStatus"),
				},
			],
		}
	}
}

/**
 * Get daily summary for a given date (defaults to today)
 */
export const getDailySummary = async (
	date?: Date
): Promise<ActionResponse<DailySummary>> => {
	const t = await getTranslations("commandCenter")
	try {
		const { accountId } = await requireAuth()

		const today = date ? new Date(date) : await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Get today's trades
		const todaysTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				gte(trades.entryDate, today),
				lte(trades.entryDate, tomorrow),
				eq(trades.isArchived, false)
			),
			orderBy: [desc(trades.entryDate)],
		})

		// Calculate metrics
		let totalPnL = 0
		let winCount = 0
		let lossCount = 0
		let bestTrade = 0
		let worstTrade = 0
		let consecutiveLosses = 0
		let maxConsecutiveLosses = 0

		const sortedTrades = todaysTrades.toSorted(
			(a, b) =>
				new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
		)

		for (const trade of sortedTrades) {
			const pnl = fromCents(trade.pnl)
			totalPnL += pnl

			if (pnl > bestTrade) {
				bestTrade = pnl
			}
			if (pnl < worstTrade) {
				worstTrade = pnl
			}

			if (trade.outcome === "win") {
				winCount++
				consecutiveLosses = 0
			} else if (trade.outcome === "loss") {
				lossCount++
				consecutiveLosses++
				maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses)
			}
		}

		const winRate =
			winCount + lossCount > 0 ? (winCount / (winCount + lossCount)) * 100 : 0

		return {
			status: "success",
			message: t("actions.dailySummaryRetrieved"),
			data: {
				totalPnL,
				tradesCount: sortedTrades.filter((t) => t.outcome !== "breakeven")
					.length,
				winCount,
				lossCount,
				winRate,
				bestTrade,
				worstTrade,
				consecutiveLosses: maxConsecutiveLosses,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.dailySummaryFetchFailed"),
			errors: [
				{
					code: "FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDailySummary"),
				},
			],
		}
	}
}
