"use server"

import { invalidateMonthlyPlanData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { monthlyPlans, trades } from "@/db/schema"
import type { MonthlyPlan } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and, gte, lt } from "drizzle-orm"
import { z } from "zod"
import { monthlyPlanSchema, type MonthlyPlanInput } from "@/lib/validations/monthly-plan"
import { deriveMonthlyPlanValues } from "@/lib/monthly-plan"
import { requireAuth } from "@/app/actions/auth"
import { getUserDek, encryptMonthlyPlanFields, decryptMonthlyPlanFields } from "@/lib/user-crypto"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { isMonthBeyondAllowed } from "@/lib/monthly-plan-date-guard"
import { getTranslations } from "next-intl/server"

// ==========================================
// MONTHLY PLAN ACTIONS
// ==========================================

/**
 * Get the active monthly plan for the current effective month.
 * Handles replay accounts via getServerEffectiveNow().
 */
export const getActiveMonthlyPlan = async (): Promise<ActionResponse<MonthlyPlan | null>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const effectiveNow = await getServerEffectiveNow()
		const year = effectiveNow.getFullYear()
		const month = effectiveNow.getMonth() + 1 // JS months are 0-indexed

		const plan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, year),
				eq(monthlyPlans.month, month)
			),
		})

		// Decrypt financial fields if DEK is available
		const dek = await getUserDek(userId)
		const decryptedPlan = plan && dek
			? decryptMonthlyPlanFields(plan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
			: plan

		return {
			status: "success",
			message: plan ? "Active monthly plan retrieved successfully" : "No active monthly plan found",
			data: decryptedPlan ?? null,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve active monthly plan",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getActiveMonthlyPlan") }],
		}
	}
}

/**
 * Get a monthly plan for a specific year/month.
 */
export const getMonthlyPlan = async ({
	year,
	month,
}: {
	year: number
	month: number
}): Promise<ActionResponse<MonthlyPlan | null>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const plan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, year),
				eq(monthlyPlans.month, month)
			),
		})

		// Decrypt financial fields if DEK is available
		const dek = await getUserDek(userId)
		const decryptedPlan = plan && dek
			? decryptMonthlyPlanFields(plan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
			: plan

		return {
			status: "success",
			message: plan ? "Monthly plan retrieved successfully" : "No monthly plan found",
			data: decryptedPlan ?? null,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to retrieve monthly plan",
			errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getMonthlyPlan") }],
		}
	}
}

/**
 * Create or update a monthly plan for a given year/month.
 * Validates input, computes derived cent values, and upserts into the database.
 */
export const upsertMonthlyPlan = async (
	input: MonthlyPlanInput
): Promise<ActionResponse<MonthlyPlan>> => {
	const t = await getTranslations("commandCenter.plan")
	try {
		const { userId, accountId } = await requireAuth()
		const validated = monthlyPlanSchema.parse(input)

		// Block plans for months too far in the future
		if (isMonthBeyondAllowed(validated.year, validated.month)) {
			return {
				status: "error",
				message: t("actionErrors.tooFarInFuture"),
				errors: [{ code: "FUTURE_MONTH_BLOCKED", detail: "Plans can only be created for the current month, or next month within the last 5 days of the current month" }],
			}
		}

		// Compute derived cent values from percentage inputs
		const derived = deriveMonthlyPlanValues({
			accountBalance: validated.accountBalance,
			riskPerTradePercent: validated.riskPerTradePercent,
			dailyLossPercent: validated.dailyLossPercent,
			monthlyLossPercent: validated.monthlyLossPercent,
			dailyProfitTargetPercent: validated.dailyProfitTargetPercent ?? null,
			maxDailyTrades: validated.maxDailyTrades ?? null,
			weeklyLossPercent: validated.weeklyLossPercent ?? null,
		})

		// Check if plan already exists for this account + year + month
		const existing = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, validated.year),
				eq(monthlyPlans.month, validated.month)
			),
		})

		const planFields = {
			accountBalance: String(validated.accountBalance),
			riskPerTradePercent: String(validated.riskPerTradePercent),
			dailyLossPercent: String(validated.dailyLossPercent),
			monthlyLossPercent: String(validated.monthlyLossPercent),
			dailyProfitTargetPercent: validated.dailyProfitTargetPercent != null
				? String(validated.dailyProfitTargetPercent)
				: null,
			maxDailyTrades: validated.maxDailyTrades ?? null,
			maxConsecutiveLosses: validated.maxConsecutiveLosses ?? null,
			allowSecondOpAfterLoss: validated.allowSecondOpAfterLoss,
			reduceRiskAfterLoss: validated.reduceRiskAfterLoss,
			riskReductionFactor: validated.riskReductionFactor != null
				? String(validated.riskReductionFactor)
				: null,
			increaseRiskAfterWin: validated.increaseRiskAfterWin,
			capRiskAfterWin: validated.capRiskAfterWin,
			profitReinvestmentPercent: validated.profitReinvestmentPercent != null
				? String(validated.profitReinvestmentPercent)
				: null,
			notes: validated.notes ?? null,
			// Risk profile reference
			riskProfileId: validated.riskProfileId ?? null,
			// Weekly loss
			weeklyLossPercent: validated.weeklyLossPercent != null
				? String(validated.weeklyLossPercent)
				: null,
			weeklyLossCents: derived.weeklyLossCents != null ? String(derived.weeklyLossCents) : null,
			// Derived fields (stored as text for encryption)
			riskPerTradeCents: String(derived.riskPerTradeCents),
			dailyLossCents: String(derived.dailyLossCents),
			monthlyLossCents: String(derived.monthlyLossCents),
			dailyProfitTargetCents: derived.dailyProfitTargetCents,
			derivedMaxDailyTrades: derived.derivedMaxDailyTrades,
		}

		// Encrypt financial fields if DEK is available
		const dek = await getUserDek(userId)
		const encryptedFields = dek ? encryptMonthlyPlanFields(planFields as Record<string, unknown>, dek) : {}

		if (existing) {
			// Update existing plan
			const [updatedPlan] = await db
				.update(monthlyPlans)
				.set({
					...planFields,
					...encryptedFields,
					updatedAt: new Date(),
				})
				.where(eq(monthlyPlans.id, existing.id))
				.returning()

			invalidateMonthlyPlanData()

			// Decrypt before returning
			const decryptedPlan = dek
				? decryptMonthlyPlanFields(updatedPlan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
				: updatedPlan

			return {
				status: "success",
				message: "Monthly plan updated successfully",
				data: decryptedPlan,
			}
		}

		// Create new plan
		const [newPlan] = await db
			.insert(monthlyPlans)
			.values({
				accountId,
				year: validated.year,
				month: validated.month,
				...planFields,
				...encryptedFields,
			})
			.returning()

		invalidateMonthlyPlanData()

		// Decrypt before returning
		const decryptedNewPlan = dek
			? decryptMonthlyPlanFields(newPlan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
			: newPlan

		return {
			status: "success",
			message: "Monthly plan created successfully",
			data: decryptedNewPlan,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((issue) => ({
					code: "VALIDATION_ERROR",
					detail: `${issue.path.join(".")}: ${issue.message}`,
				})),
			}
		}

		return {
			status: "error",
			message: "Failed to save monthly plan",
			errors: [{ code: "SAVE_FAILED", detail: toSafeErrorMessage(error, "upsertMonthlyPlan") }],
		}
	}
}

/**
 * Roll over the previous month's plan into the current month.
 * Copies all percentage/rule fields from the previous month and recalculates derived values
 * using either the provided adjusted balance or the previous balance plus net PnL.
 *
 * @param adjustedBalance - Optional manually adjusted balance in cents. If omitted, auto-calculates from previous balance + monthly net PnL.
 */
export const rolloverMonthlyPlan = async (
	adjustedBalance?: number | null
): Promise<ActionResponse<MonthlyPlan>> => {
	const t = await getTranslations("commandCenter.plan")
	try {
		const { userId, accountId } = await requireAuth()

		const effectiveNow = await getServerEffectiveNow()
		const currentYear = effectiveNow.getFullYear()
		const currentMonth = effectiveNow.getMonth() + 1

		// Calculate previous month (handle January -> December rollback)
		const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
		const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear

		// Fetch previous month's plan and decrypt if needed
		const dek = await getUserDek(userId)
		const rawPreviousPlan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, prevYear),
				eq(monthlyPlans.month, prevMonth)
			),
		})
		const previousPlan = rawPreviousPlan && dek
			? decryptMonthlyPlanFields(rawPreviousPlan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
			: rawPreviousPlan

		if (!previousPlan) {
			return {
				status: "error",
				message: t("actionErrors.noPreviousPlan"),
				errors: [{ code: "NO_PREVIOUS_PLAN", detail: `No monthly plan exists for ${prevYear}-${String(prevMonth).padStart(2, "0")}` }],
			}
		}

		// Calculate the suggested balance for the new month
		let newBalanceCents: number

		if (adjustedBalance != null) {
			// User provided a manual adjustment
			newBalanceCents = adjustedBalance
		} else {
			// Auto-calculate: previous balance + net PnL for the previous month
			const monthStart = new Date(prevYear, prevMonth - 1, 1) // JS months are 0-indexed
			const nextMonthStart = new Date(currentYear, currentMonth - 1, 1)

			const monthlyTrades = await db.query.trades.findMany({
				where: and(
					eq(trades.accountId, accountId),
					gte(trades.entryDate, monthStart),
					lt(trades.entryDate, nextMonthStart),
					eq(trades.isArchived, false)
				),
			})

			const netPnLCents = monthlyTrades.reduce(
				(sum, trade) => sum + (Number(trade.pnl) || 0),
				0
			)

			newBalanceCents = Number(previousPlan.accountBalance) + netPnLCents
		}

		// Ensure balance is at least 1 cent (positive)
		if (newBalanceCents <= 0) {
			newBalanceCents = 1
		}

		// Copy percentage fields from previous plan
		const riskPerTradePercent = parseFloat(previousPlan.riskPerTradePercent)
		const dailyLossPercent = parseFloat(previousPlan.dailyLossPercent)
		const monthlyLossPercent = parseFloat(previousPlan.monthlyLossPercent)
		const dailyProfitTargetPercent = previousPlan.dailyProfitTargetPercent
			? parseFloat(previousPlan.dailyProfitTargetPercent)
			: null

		const weeklyLossPercent = previousPlan.weeklyLossPercent
			? parseFloat(previousPlan.weeklyLossPercent)
			: null

		// Recompute derived values with the new balance
		const derived = deriveMonthlyPlanValues({
			accountBalance: newBalanceCents,
			riskPerTradePercent,
			dailyLossPercent,
			monthlyLossPercent,
			dailyProfitTargetPercent,
			maxDailyTrades: previousPlan.maxDailyTrades,
			weeklyLossPercent,
		})

		// Build the new plan fields (copy everything from previous plan except balance + derived)
		const rolloverFields = {
			accountBalance: String(newBalanceCents),
			riskPerTradePercent: String(riskPerTradePercent),
			dailyLossPercent: String(dailyLossPercent),
			monthlyLossPercent: String(monthlyLossPercent),
			dailyProfitTargetPercent: dailyProfitTargetPercent != null
				? String(dailyProfitTargetPercent)
				: null,
			maxDailyTrades: previousPlan.maxDailyTrades,
			maxConsecutiveLosses: previousPlan.maxConsecutiveLosses,
			allowSecondOpAfterLoss: previousPlan.allowSecondOpAfterLoss,
			reduceRiskAfterLoss: previousPlan.reduceRiskAfterLoss,
			riskReductionFactor: previousPlan.riskReductionFactor,
			increaseRiskAfterWin: previousPlan.increaseRiskAfterWin,
			capRiskAfterWin: previousPlan.capRiskAfterWin,
			profitReinvestmentPercent: previousPlan.profitReinvestmentPercent,
			notes: previousPlan.notes,
			// Risk profile + weekly loss (carried forward)
			riskProfileId: previousPlan.riskProfileId,
			weeklyLossPercent: previousPlan.weeklyLossPercent,
			weeklyLossCents: derived.weeklyLossCents != null ? String(derived.weeklyLossCents) : null,
			// Derived fields (recomputed with new balance, stored as text for encryption)
			riskPerTradeCents: String(derived.riskPerTradeCents),
			dailyLossCents: String(derived.dailyLossCents),
			monthlyLossCents: String(derived.monthlyLossCents),
			dailyProfitTargetCents: derived.dailyProfitTargetCents,
			derivedMaxDailyTrades: derived.derivedMaxDailyTrades,
		}

		// Encrypt financial fields if DEK is available
		const encryptedRolloverFields = dek ? encryptMonthlyPlanFields(rolloverFields as Record<string, unknown>, dek) : {}

		// Check if a plan already exists for the current month (upsert behavior)
		const existingCurrentPlan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, currentYear),
				eq(monthlyPlans.month, currentMonth)
			),
		})

		if (existingCurrentPlan) {
			const [updatedPlan] = await db
				.update(monthlyPlans)
				.set({
					...rolloverFields,
					...encryptedRolloverFields,
					updatedAt: new Date(),
				})
				.where(eq(monthlyPlans.id, existingCurrentPlan.id))
				.returning()

			invalidateMonthlyPlanData()

			const decryptedUpdatedPlan = dek
				? decryptMonthlyPlanFields(updatedPlan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
				: updatedPlan

			return {
				status: "success",
				message: "Monthly plan rolled over successfully (existing plan updated)",
				data: decryptedUpdatedPlan,
			}
		}

		const [newPlan] = await db
			.insert(monthlyPlans)
			.values({
				accountId,
				year: currentYear,
				month: currentMonth,
				...rolloverFields,
				...encryptedRolloverFields,
			})
			.returning()

		invalidateMonthlyPlanData()

		const decryptedNewPlan = dek
			? decryptMonthlyPlanFields(newPlan as unknown as Record<string, unknown>, dek) as unknown as MonthlyPlan
			: newPlan

		return {
			status: "success",
			message: "Monthly plan rolled over successfully",
			data: decryptedNewPlan,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to roll over monthly plan",
			errors: [{ code: "ROLLOVER_FAILED", detail: toSafeErrorMessage(error, "rolloverMonthlyPlan") }],
		}
	}
}
