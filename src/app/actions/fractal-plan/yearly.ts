"use server"

import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans } from "@/db/schema"
import { requireAuth, getCurrentAccount } from "@/app/actions/auth"
import { autoSeedYearlyTree } from "@/lib/fractal-plan/auto-seed"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const ladderRuleSchema = z.object({
	minCapitalCents: z.number().int().nonnegative(),
	maxCapitalCents: z.number().int().positive(),
	oneRCents: z.number().int().positive(),
})

const createYearlyPlanInputSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	initialCapitalCents: z.number().int().positive().optional(),
	ladderRules: z.array(ladderRuleSchema).min(1),
	defaultDailyLossR: z.number().positive(),
	defaultDailyWinR: z.number().positive(),
	defaultWeeklyLossR: z.number().positive(),
	defaultWeeklyWinR: z.number().positive(),
	defaultMonthlyLossR: z.number().positive(),
	defaultMonthlyWinR: z.number().positive(),
	drawdownTriggerThresholdR: z.number().positive(),
	tradingDaysPerWeek: z.number().int().min(1).max(7),
	annualGoalCents: z.number().int().nonnegative().optional(),
})

type CreateYearlyPlanInput = z.infer<typeof createYearlyPlanInputSchema>

interface CreateYearlyPlanResult {
	yearlyPlanId: string
	quarterlyPlanIds: readonly string[]
	monthlyPlanIds: readonly string[]
}

const createYearlyPlanV2 = async (
	input: CreateYearlyPlanInput
): Promise<ActionResponse<CreateYearlyPlanResult>> => {
	try {
		const parsed = createYearlyPlanInputSchema.parse(input)
		const { accountId } = await requireAuth()

		let initialCapitalCents = parsed.initialCapitalCents
		if (initialCapitalCents == null) {
			const account = await getCurrentAccount()
			if (account?.startingBalanceCents == null) {
				return {
					status: "error",
					message:
						"Set the account starting balance in Settings → Annual Reporting before seeding a yearly plan.",
					errors: [
						{
							code: "MISSING_STARTING_BALANCE",
							detail: "account.startingBalanceCents is null",
						},
					],
				}
			}
			initialCapitalCents = account.startingBalanceCents
		}

		const result = await autoSeedYearlyTree({
			accountId,
			year: parsed.year,
			initialCapitalCents,
			ladderRules: parsed.ladderRules,
			defaultDailyLossR: parsed.defaultDailyLossR,
			defaultDailyWinR: parsed.defaultDailyWinR,
			defaultWeeklyLossR: parsed.defaultWeeklyLossR,
			defaultWeeklyWinR: parsed.defaultWeeklyWinR,
			defaultMonthlyLossR: parsed.defaultMonthlyLossR,
			defaultMonthlyWinR: parsed.defaultMonthlyWinR,
			drawdownTriggerThresholdR: parsed.drawdownTriggerThresholdR,
			tradingDaysPerWeek: parsed.tradingDaysPerWeek,
			annualGoalCents: parsed.annualGoalCents,
			now: new Date(),
		})

		return {
			status: "success",
			message: "Yearly plan created with seeded fractal tree",
			data: result,
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "CREATE_YEARLY_PLAN_FAILED", detail: toSafeErrorMessage(err) },
			],
		}
	}
}

const updateYearlyPlanInputSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	initialCapitalCents: z.number().int().positive().optional(),
	ladderRules: z.array(ladderRuleSchema).min(1).optional(),
	tradingDaysPerWeek: z.number().int().min(1).max(7).optional(),
	defaultDailyLossR: z.number().positive().optional(),
	defaultDailyWinR: z.number().positive().optional(),
	defaultWeeklyLossR: z.number().positive().optional(),
	defaultWeeklyWinR: z.number().positive().optional(),
	defaultMonthlyLossR: z.number().positive().optional(),
	defaultMonthlyWinR: z.number().positive().optional(),
	defaultRiskProfileId: z.union([z.string().uuid(), z.null()]).optional(),
	notes: z.string().max(5000).optional(),
})

type UpdateYearlyPlanInput = z.infer<typeof updateYearlyPlanInputSchema>

const updateYearlyPlan = async (
	input: UpdateYearlyPlanInput
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = updateYearlyPlanInputSchema.parse(input)
		const { accountId } = await requireAuth()

		const existing = await db.query.yearlyPlans.findFirst({
			where: and(
				eq(yearlyPlans.accountId, accountId),
				eq(yearlyPlans.year, parsed.year)
			),
		})
		if (!existing) {
			return {
				status: "error",
				message: "Yearly plan not found for this year",
				errors: [{ code: "NOT_FOUND", detail: `year=${parsed.year}` }],
			}
		}

		const updates: Record<string, unknown> = { updatedAt: new Date() }
		if (parsed.initialCapitalCents !== undefined) {
			updates.initialCapitalCents = parsed.initialCapitalCents
		}
		if (parsed.ladderRules !== undefined) {
			updates.ladderRules = parsed.ladderRules
		}
		if (parsed.tradingDaysPerWeek !== undefined) {
			updates.tradingDaysPerWeek = parsed.tradingDaysPerWeek
		}
		if (parsed.defaultDailyLossR !== undefined) {
			updates.defaultDailyLossR = parsed.defaultDailyLossR.toFixed(2)
		}
		if (parsed.defaultDailyWinR !== undefined) {
			updates.defaultDailyWinR = parsed.defaultDailyWinR.toFixed(2)
		}
		if (parsed.defaultWeeklyLossR !== undefined) {
			updates.defaultWeeklyLossR = parsed.defaultWeeklyLossR.toFixed(2)
		}
		if (parsed.defaultWeeklyWinR !== undefined) {
			updates.defaultWeeklyWinR = parsed.defaultWeeklyWinR.toFixed(2)
		}
		if (parsed.defaultMonthlyLossR !== undefined) {
			updates.defaultMonthlyLossR = parsed.defaultMonthlyLossR.toFixed(2)
		}
		if (parsed.defaultMonthlyWinR !== undefined) {
			updates.defaultMonthlyWinR = parsed.defaultMonthlyWinR.toFixed(2)
		}
		if (parsed.defaultRiskProfileId !== undefined) {
			updates.defaultRiskProfileId = parsed.defaultRiskProfileId
		}
		if (parsed.notes !== undefined) {
			updates.notes = parsed.notes
		}

		await db
			.update(yearlyPlans)
			.set(updates)
			.where(eq(yearlyPlans.id, existing.id))

		return {
			status: "success",
			message: "Yearly plan updated",
			data: { id: existing.id },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "UPDATE_YEARLY_FAILED", detail: toSafeErrorMessage(err) },
			],
		}
	}
}

export { createYearlyPlanV2, updateYearlyPlan }
