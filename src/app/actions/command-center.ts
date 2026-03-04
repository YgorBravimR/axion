"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/db/drizzle"
import {
	dailyChecklists,
	checklistCompletions,
	dailyAccountNotes,
	accountAssetSettings,
	accountAssets,
	trades,
	assets,
	monthlyPlans,
} from "@/db/schema"
import type {
	DailyChecklist,
	ChecklistCompletion,
	DailyAccountNote,
	AccountAssetSetting,
	Asset,
} from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm"
import { z } from "zod"
import {
	createChecklistSchema,
	updateChecklistSchema,
	updateCompletionSchema,
	dailyNotesSchema,
	assetSettingsSchema,
	type CreateChecklistInput,
	type UpdateChecklistInput,
	type DailyNotesInput,
	type AssetSettingsInput,
	type ChecklistItem,
	type CircuitBreakerStatus,
	type BiasType,
} from "@/lib/validations/command-center"
import { fromCents, toCents } from "@/lib/money"
import { requireAuth } from "@/app/actions/auth"
import { getUserDek, encryptDailyNotesFields, decryptDailyNotesFields } from "@/lib/user-crypto"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getServerEffectiveNow } from "@/lib/effective-date"

// ==========================================
// CHECKLIST ACTIONS
// ==========================================

/**
 * Get all checklists for the current account
 */
export const getChecklists = async (): Promise<ActionResponse<DailyChecklist[]>> => {
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
			message: "Checklists retrieved successfully",
			data: checklists,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve checklists",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getChecklists") }],
		}
	}
}

/**
 * Create a new checklist
 */
export const createChecklist = async (
	input: CreateChecklistInput
): Promise<ActionResponse<DailyChecklist>> => {
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

		revalidatePath("/command-center")

		return {
			status: "success",
			message: "Checklist created successfully",
			data: checklist,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to create checklist",
			errors: [{ code: "CREATE_FAILED", detail: toSafeErrorMessage(error, "createChecklist") }],
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
				message: "Checklist not found",
				errors: [{ code: "NOT_FOUND", detail: "Checklist does not exist" }],
			}
		}

		const validated = updateChecklistSchema.parse(input)

		const [checklist] = await db
			.update(dailyChecklists)
			.set({
				...(validated.name !== undefined && { name: validated.name }),
				...(validated.items !== undefined && { items: JSON.stringify(validated.items) }),
				...(validated.isActive !== undefined && { isActive: validated.isActive }),
				updatedAt: new Date(),
			})
			.where(eq(dailyChecklists.id, id))
			.returning()

		revalidatePath("/command-center")

		return {
			status: "success",
			message: "Checklist updated successfully",
			data: checklist,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to update checklist",
			errors: [{ code: "UPDATE_FAILED", detail: toSafeErrorMessage(error, "updateChecklist") }],
		}
	}
}

/**
 * Delete a checklist (soft delete)
 */
export const deleteChecklist = async (id: string): Promise<ActionResponse<void>> => {
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
				message: "Checklist not found",
				errors: [{ code: "NOT_FOUND", detail: "Checklist does not exist" }],
			}
		}

		await db
			.update(dailyChecklists)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(dailyChecklists.id, id))

		revalidatePath("/command-center")

		return {
			status: "success",
			message: "Checklist deleted successfully",
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to delete checklist",
			errors: [{ code: "DELETE_FAILED", detail: toSafeErrorMessage(error, "deleteChecklist") }],
		}
	}
}

// ==========================================
// COMPLETION ACTIONS
// ==========================================

export interface ChecklistWithCompletion extends DailyChecklist {
	parsedItems: ChecklistItem[]
	completion: ChecklistCompletion | null
	completedItemIds: string[]
}

/**
 * Get checklist completions for a given date (defaults to today)
 */
export const getTodayCompletions = async (date?: Date): Promise<ActionResponse<ChecklistWithCompletion[]>> => {
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
		const completions = checklistIds.length > 0
			? await db.query.checklistCompletions.findMany({
					where: and(
						inArray(checklistCompletions.checklistId, checklistIds),
						gte(checklistCompletions.date, today),
						lte(checklistCompletions.date, tomorrow)
					),
				})
			: []

		// Map completions to checklists
		const checklistsWithCompletions: ChecklistWithCompletion[] = checklists.map((checklist) => {
			const completion = completions.find((c) => c.checklistId === checklist.id) || null
			const completedItemIds: string[] = completion
				? JSON.parse(completion.completedItems)
				: []

			return {
				...checklist,
				parsedItems: JSON.parse(checklist.items) as ChecklistItem[],
				completion,
				completedItemIds,
			}
		})

		return {
			status: "success",
			message: "Completions retrieved successfully",
			data: checklistsWithCompletions,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve completions",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getTodayCompletions") }],
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
	try {
		const { userId } = await requireAuth()

		// Validate input
		const validated = updateCompletionSchema.parse({ checklistId, itemId, completed })

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
			const allItems: ChecklistItem[] = checklist ? JSON.parse(checklist.items) : []
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

			revalidatePath("/command-center")

			return {
				status: "success",
				message: "Item updated successfully",
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

			revalidatePath("/command-center")

			return {
				status: "success",
				message: "Completion created successfully",
				data: completion,
			}
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to toggle item",
			errors: [{ code: "UPDATE_FAILED", detail: toSafeErrorMessage(error, "toggleChecklistItem") }],
		}
	}
}

// ==========================================
// DAILY NOTES ACTIONS
// ==========================================

/**
 * Get notes for a given date (defaults to today)
 */
export const getTodayNotes = async (date?: Date): Promise<ActionResponse<DailyAccountNote | null>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const today = date ? new Date(date) : await getServerEffectiveNow()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		const rawNotes = await db.query.dailyAccountNotes.findFirst({
			where: and(
				eq(dailyAccountNotes.userId, userId),
				eq(dailyAccountNotes.accountId, accountId),
				gte(dailyAccountNotes.date, today),
				lte(dailyAccountNotes.date, tomorrow)
			),
		})

		// Decrypt notes fields if DEK is available
		const dek = await getUserDek(userId)
		const notes = rawNotes && dek
			? decryptDailyNotesFields(rawNotes as unknown as Record<string, unknown>, dek) as unknown as DailyAccountNote
			: rawNotes

		return {
			status: "success",
			message: notes ? "Notes retrieved successfully" : "No notes found",
			data: notes || null,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve notes",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getTodayNotes") }],
		}
	}
}

/**
 * Upsert daily notes
 */
export const upsertDailyNotes = async (
	input: DailyNotesInput
): Promise<ActionResponse<DailyAccountNote>> => {
	try {
		const { userId, accountId } = await requireAuth()
		const validated = dailyNotesSchema.parse(input)

		// Parse date
		const noteDate = new Date(validated.date)
		noteDate.setHours(0, 0, 0, 0)
		const nextDay = new Date(noteDate)
		nextDay.setDate(nextDay.getDate() + 1)

		// Check if notes exist for this date
		const existing = await db.query.dailyAccountNotes.findFirst({
			where: and(
				eq(dailyAccountNotes.userId, userId),
				eq(dailyAccountNotes.accountId, accountId),
				gte(dailyAccountNotes.date, noteDate),
				lte(dailyAccountNotes.date, nextDay)
			),
		})

		// Encrypt notes fields if DEK is available
		const dek = await getUserDek(userId)
		const encryptedFields = dek
			? encryptDailyNotesFields({
				preMarketNotes: validated.preMarketNotes || null,
				postMarketNotes: validated.postMarketNotes || null,
			}, dek)
			: {}

		if (existing) {
			// Update existing
			const [notes] = await db
				.update(dailyAccountNotes)
				.set({
					preMarketNotes: validated.preMarketNotes || null,
					postMarketNotes: validated.postMarketNotes || null,
					mood: validated.mood || null,
					updatedAt: new Date(),
					...encryptedFields,
				})
				.where(eq(dailyAccountNotes.id, existing.id))
				.returning()

			revalidatePath("/command-center")

			// Decrypt before returning
			const decryptedNotes = dek
				? decryptDailyNotesFields(notes as unknown as Record<string, unknown>, dek) as unknown as DailyAccountNote
				: notes

			return {
				status: "success",
				message: "Notes updated successfully",
				data: decryptedNotes,
			}
		} else {
			// Create new
			const [notes] = await db
				.insert(dailyAccountNotes)
				.values({
					userId,
					accountId,
					date: noteDate,
					preMarketNotes: validated.preMarketNotes || null,
					postMarketNotes: validated.postMarketNotes || null,
					mood: validated.mood || null,
					...encryptedFields,
				})
				.returning()

			revalidatePath("/command-center")

			// Decrypt before returning
			const decryptedNotes = dek
				? decryptDailyNotesFields(notes as unknown as Record<string, unknown>, dek) as unknown as DailyAccountNote
				: notes

			return {
				status: "success",
				message: "Notes created successfully",
				data: decryptedNotes,
			}
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to save notes",
			errors: [{ code: "SAVE_FAILED", detail: toSafeErrorMessage(error, "upsertDailyNotes") }],
		}
	}
}

// ==========================================
// ASSET SETTINGS ACTIONS (Account-Level, Permanent)
// ==========================================

export interface AssetSettingWithAsset extends AccountAssetSetting {
	asset: Asset
}

/**
 * Get account-level asset settings.
 * Auto-populates blank rows for enabled assets that don't have settings yet.
 */
export const getAccountAssetSettings = async (): Promise<ActionResponse<AssetSettingWithAsset[]>> => {
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
			await db.insert(accountAssetSettings).values(
				missingAssets.map((aa) => ({
					userId,
					accountId,
					assetId: aa.assetId,
					isActive: true,
				}))
			)

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
				message: "Asset settings retrieved successfully",
				data: allSettings as AssetSettingWithAsset[],
			}
		}

		return {
			status: "success",
			message: "Asset settings retrieved successfully",
			data: existingSettings as AssetSettingWithAsset[],
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve asset settings",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getAccountAssetSettings") }],
		}
	}
}

/**
 * Legacy aliases for backwards compatibility
 */
export const getTodayAssetSettings = getAccountAssetSettings
export const getAssetSettings = getAccountAssetSettings

/**
 * Upsert account-level asset settings
 */
export const upsertAssetSettings = async (
	input: AssetSettingsInput
): Promise<ActionResponse<AccountAssetSetting>> => {
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

			revalidatePath("/command-center")

			return {
				status: "success",
				message: "Asset settings updated successfully",
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

			revalidatePath("/command-center")

			return {
				status: "success",
				message: "Asset settings created successfully",
				data: settings,
			}
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to save asset settings",
			errors: [{ code: "SAVE_FAILED", detail: toSafeErrorMessage(error, "upsertAssetSettings") }],
		}
	}
}

/**
 * Delete account-level asset settings (soft delete)
 */
export const deleteAssetSettings = async (assetId: string): Promise<ActionResponse<void>> => {
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
				message: "Asset settings not found",
				errors: [{ code: "NOT_FOUND", detail: "Asset settings do not exist" }],
			}
		}

		await db
			.update(accountAssetSettings)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(accountAssetSettings.id, existing.id))

		revalidatePath("/command-center")

		return {
			status: "success",
			message: "Asset settings deleted successfully",
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to delete asset settings",
			errors: [{ code: "DELETE_FAILED", detail: toSafeErrorMessage(error, "deleteAssetSettings") }],
		}
	}
}

// ==========================================
// CIRCUIT BREAKER STATUS
// ==========================================

export interface DailySummary {
	totalPnL: number
	tradesCount: number
	winCount: number
	lossCount: number
	winRate: number
	bestTrade: number
	worstTrade: number
	consecutiveLosses: number
}

/**
 * Get circuit breaker status for a given date (defaults to today)
 */
export const getCircuitBreakerStatus = async (date?: Date): Promise<ActionResponse<CircuitBreakerStatus>> => {
	try {
		const { userId, accountId } = await requireAuth()

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

		// Get monthly plan for current month
		const effectiveNow = date ? new Date(date) : await getServerEffectiveNow()
		const currentYear = effectiveNow.getFullYear()
		const currentMonth = effectiveNow.getMonth() + 1 // 1-indexed

		const rawMonthlyPlan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, currentYear),
				eq(monthlyPlans.month, currentMonth)
			),
		})

		// Decrypt monthly plan fields if DEK is available
		const dek = await getUserDek(userId)
		const { decryptMonthlyPlanFields } = await import("@/lib/user-crypto")
		const monthlyPlan = rawMonthlyPlan && dek
			? decryptMonthlyPlanFields(rawMonthlyPlan as unknown as Record<string, unknown>, dek) as unknown as typeof rawMonthlyPlan
			: rawMonthlyPlan

		// Calculate metrics
		let dailyPnL = 0
		let consecutiveLosses = 0
		let maxConsecutiveLosses = 0

		// Sort trades by entry date to calculate consecutive losses properly (using toSorted for immutability)
		const sortedTrades = todaysTrades.toSorted(
			(a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
		)

		// Breakevens are invisible to trade counts, max trades, and consecutive losses
		const nonBreakevenCount = sortedTrades.filter(t => t.outcome !== "breakeven").length

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
			if (sortedTrades[i].outcome === "breakeven") continue
			if (sortedTrades[i].outcome === "loss") {
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

		// Resolve limits from monthly plan (single source of truth)
		// After decryption, these values are numbers; without DEK, parse from text
		const dailyLossLimitCents = Number(monthlyPlan?.dailyLossCents) || 0
		const profitTargetCents = Number(monthlyPlan?.dailyProfitTargetCents) || 0
		const rawMaxTrades = monthlyPlan?.maxDailyTrades ?? monthlyPlan?.derivedMaxDailyTrades ?? null
		const maxConsecutiveLossesValue = monthlyPlan?.maxConsecutiveLosses ?? null

		// When a recovery profile is linked, derivedMaxDailyTrades (floor(dailyLoss / baseRisk))
		// underestimates because recovery steps use reduced risk. Ensure maxTrades is at least
		// maxConsecutiveLosses so the circuit breaker doesn't show a contradictory cap.
		const maxTradesValue =
			rawMaxTrades !== null && maxConsecutiveLossesValue !== null && maxConsecutiveLossesValue > rawMaxTrades
				? maxConsecutiveLossesValue
				: rawMaxTrades

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

		// Monthly loss limit (plan-only)
		const monthlyLossLimitCents = Number(monthlyPlan?.monthlyLossCents) || 0
		const remainingMonthlyCents =
			monthlyLossLimitCents > 0
				? Math.max(0, monthlyLossLimitCents - Math.abs(Math.min(0, toCents(monthlyPnL))))
				: Infinity
		const isMonthlyLimitHit =
			monthlyLossLimitCents > 0 && monthlyPnL <= -fromCents(monthlyLossLimitCents)

		// Calculate recommended risk (plan-only)
		let recommendedRiskCents = Number(monthlyPlan?.riskPerTradeCents) || 0

		// Risk reduction after consecutive losses
		const shouldReduceRisk = monthlyPlan?.reduceRiskAfterLoss ?? false
		const reductionFactor = monthlyPlan?.riskReductionFactor
			? parseFloat(monthlyPlan.riskReductionFactor)
			: null

		if (shouldReduceRisk && currentConsecutiveLosses > 0 && reductionFactor) {
			recommendedRiskCents = Math.round(
				recommendedRiskCents * Math.pow(reductionFactor, currentConsecutiveLosses)
			)
		}

		// Win risk adjustment (increase or cap — mutually exclusive)
		if (monthlyPlan?.profitReinvestmentPercent) {
			const reinvestmentPercent = parseFloat(monthlyPlan.profitReinvestmentPercent)

			if (monthlyPlan.increaseRiskAfterWin) {
				// INCREASE: add % of last win's profit to base risk
				const lastTrade = sortedTrades.at(-1)
				const lastPnl = Number(lastTrade?.pnl) || 0
				if (lastTrade?.outcome === "win" && lastPnl > 0) {
					const bonusCents = Math.round(lastPnl * reinvestmentPercent / 100)
					recommendedRiskCents = recommendedRiskCents + bonusCents
				}
			} else if (monthlyPlan.capRiskAfterWin) {
				// CAP: find first winning trade of the day, cap risk to min(base, profit * %)
				const firstWin = sortedTrades.find(t => t.outcome === "win" && t.pnl && Number(t.pnl) > 0)
				const firstWinPnl = Number(firstWin?.pnl) || 0
				if (firstWinPnl > 0 && sortedTrades.length > 1) {
					const capCents = Math.round(firstWinPnl * reinvestmentPercent / 100)
					recommendedRiskCents = Math.min(recommendedRiskCents, capCents)
				}
			}
		}

		// Cap at remaining budgets
		recommendedRiskCents = Math.min(
			recommendedRiskCents,
			remainingDailyRiskCents > 0 ? remainingDailyRiskCents : recommendedRiskCents,
			remainingMonthlyCents !== Infinity ? remainingMonthlyCents : recommendedRiskCents
		)

		// Check second op block (plan-only)
		const allowSecondOp = monthlyPlan?.allowSecondOpAfterLoss ?? true
		const isSecondOpBlocked =
			allowSecondOp === false &&
			currentConsecutiveLosses > 0 &&
			nonBreakevenCount > 0

		// Calculate circuit breaker triggers (using plan-first resolved values)
		const profitTargetHit = profitTargetCents > 0
			? dailyPnL >= fromCents(profitTargetCents)
			: false
		const lossLimitHit = dailyLossLimitCents > 0
			? dailyPnL <= -fromCents(dailyLossLimitCents)
			: false
		const maxTradesHit = maxTradesValue
			? nonBreakevenCount >= maxTradesValue
			: false
		const maxConsecutiveLossesHit = maxConsecutiveLossesValue
			? currentConsecutiveLosses >= maxConsecutiveLossesValue
			: false

		const shouldStopTrading =
			profitTargetHit ||
			lossLimitHit ||
			maxTradesHit ||
			maxConsecutiveLossesHit ||
			isMonthlyLimitHit ||
			isSecondOpBlocked

		// Build alerts
		const alerts: string[] = []
		if (profitTargetHit) alerts.push("profitTargetHit")
		if (lossLimitHit) alerts.push("lossLimitHit")
		if (maxTradesHit) alerts.push("maxTradesHit")
		if (maxConsecutiveLossesHit) alerts.push("maxConsecutiveLossesHit")
		if (isMonthlyLimitHit) alerts.push("monthlyLimitHit")
		if (isSecondOpBlocked) alerts.push("secondOpBlocked")

		return {
			status: "success",
			message: "Circuit breaker status retrieved",
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
				riskReductionFactor: monthlyPlan?.riskReductionFactor ?? null,
				riskUsedTodayCents,
				remainingDailyRiskCents,
				recommendedRiskCents,
				monthlyPnL,
				monthlyLossLimitCents,
				remainingMonthlyCents: remainingMonthlyCents === Infinity ? 0 : remainingMonthlyCents,
				isMonthlyLimitHit,
				isSecondOpBlocked,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to get circuit breaker status",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getCircuitBreakerStatus") }],
		}
	}
}

/**
 * Get daily summary for a given date (defaults to today)
 */
export const getDailySummary = async (date?: Date): Promise<ActionResponse<DailySummary>> => {
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
			(a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
		)

		for (const trade of sortedTrades) {
			const pnl = fromCents(trade.pnl)
			totalPnL += pnl

			if (pnl > bestTrade) bestTrade = pnl
			if (pnl < worstTrade) worstTrade = pnl

			if (trade.outcome === "win") {
				winCount++
				consecutiveLosses = 0
			} else if (trade.outcome === "loss") {
				lossCount++
				consecutiveLosses++
				maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses)
			}
		}

		const winRate = winCount + lossCount > 0
			? (winCount / (winCount + lossCount)) * 100
			: 0

		return {
			status: "success",
			message: "Daily summary retrieved",
			data: {
				totalPnL,
				tradesCount: sortedTrades.filter(t => t.outcome !== "breakeven").length,
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
			message: "Failed to get daily summary",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getDailySummary") }],
		}
	}
}
