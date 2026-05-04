"use server"

import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
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
	initialCapitalCents: z.number().int().positive(),
	ladderRules: z.array(ladderRuleSchema).min(1),
	defaultDailyLossR: z.number().positive(),
	defaultWeeklyLossR: z.number().positive(),
	defaultMonthlyLossR: z.number().positive(),
	defaultDailyTargetR: z.number().positive(),
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
	input: CreateYearlyPlanInput,
): Promise<ActionResponse<CreateYearlyPlanResult>> => {
	try {
		const parsed = createYearlyPlanInputSchema.parse(input)
		const { accountId } = await requireAuth()

		const result = await autoSeedYearlyTree({
			accountId,
			year: parsed.year,
			initialCapitalCents: parsed.initialCapitalCents,
			ladderRules: parsed.ladderRules,
			defaultDailyLossR: parsed.defaultDailyLossR,
			defaultWeeklyLossR: parsed.defaultWeeklyLossR,
			defaultMonthlyLossR: parsed.defaultMonthlyLossR,
			defaultDailyTargetR: parsed.defaultDailyTargetR,
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
			errors: [{ code: "CREATE_YEARLY_PLAN_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { createYearlyPlanV2 }
