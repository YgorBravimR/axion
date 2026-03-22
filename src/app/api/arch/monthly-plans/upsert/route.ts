import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { monthlyPlans } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { monthlyPlanSchema } from "@/lib/validations/monthly-plan"
import { deriveMonthlyPlanValues } from "@/lib/monthly-plan"
import { getUserDek, encryptMonthlyPlanFields, decryptMonthlyPlanFields } from "@/lib/user-crypto"
import { isMonthBeyondAllowed } from "@/lib/monthly-plan-date-guard"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * POST /api/arch/monthly-plans/upsert
 *
 * Creates or updates a monthly plan for a given year/month.
 * Validates input, computes derived cent values, encrypts, and upserts.
 *
 * Body: MonthlyPlanInput (JSON)
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	const { userId, accountId } = authResult.auth

	try {
		const body = await request.json()
		const validated = monthlyPlanSchema.parse(body)

		// Block plans for months too far in the future
		if (isMonthBeyondAllowed(validated.year, validated.month)) {
			return archError("Plans can only be created for the current or next month (within last 5 days)", [
				{ code: "FUTURE_MONTH_BLOCKED", detail: "Plans can only be created for the current month, or next month within the last 5 days of the current month" },
			])
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
			riskProfileId: validated.riskProfileId ?? null,
			weeklyLossPercent: validated.weeklyLossPercent != null
				? String(validated.weeklyLossPercent)
				: null,
			weeklyLossCents: derived.weeklyLossCents != null ? String(derived.weeklyLossCents) : null,
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
			const [updatedPlan] = await db
				.update(monthlyPlans)
				.set({
					...planFields,
					...encryptedFields,
					updatedAt: new Date(),
				})
				.where(eq(monthlyPlans.id, existing.id))
				.returning()

			const decryptedPlan = dek
				? decryptMonthlyPlanFields(updatedPlan as unknown as Record<string, unknown>, dek) as unknown as typeof updatedPlan
				: updatedPlan

			return archSuccess("Monthly plan updated", decryptedPlan)
		}

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

		const decryptedNewPlan = dek
			? decryptMonthlyPlanFields(newPlan as unknown as Record<string, unknown>, dek) as unknown as typeof newPlan
			: newPlan

		return archSuccess("Monthly plan created", decryptedNewPlan)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError("Validation failed", error.issues.map((issue) => ({
				code: "VALIDATION_ERROR",
				detail: `${issue.path.join(".")}: ${issue.message}`,
			})))
		}

		const message = error instanceof Error ? error.message : "Unknown error"
		return archError("Failed to save monthly plan", [
			{ code: "SAVE_FAILED", detail: message },
		], 500)
	}
}

export { POST }
