"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { monthlyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	monthlyPlanId: z.string().uuid(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideWeeklyLossR: z.number().positive().optional(),
	overrideMonthlyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	monthlyGoalCents: z.number().int().nonnegative().optional(),
	intentNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
})

const upsertMonthlyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(monthlyPlan)
			.set({
				overrideDailyLossR: parsed.overrideDailyLossR?.toString(),
				overrideWeeklyLossR: parsed.overrideWeeklyLossR?.toString(),
				overrideMonthlyLossR: parsed.overrideMonthlyLossR?.toString(),
				overrideDailyTargetR: parsed.overrideDailyTargetR?.toString(),
				overrideActivePlaybookIds: parsed.overrideActivePlaybookIds,
				monthlyGoalCents: parsed.monthlyGoalCents,
				intentNotes: parsed.intentNotes,
				postMortemNotes: parsed.postMortemNotes,
				updatedAt: new Date(),
			})
			.where(eq(monthlyPlan.id, parsed.monthlyPlanId))
		return { status: "success", message: "Monthly plan updated", data: { id: parsed.monthlyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_MONTHLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const resetSchema = z.object({
	monthlyPlanId: z.string().uuid(),
	field: z.enum([
		"overrideDailyLossR",
		"overrideWeeklyLossR",
		"overrideMonthlyLossR",
		"overrideDailyTargetR",
		"overrideActivePlaybookIds",
	]),
})

const resetMonthlyOverride = async (
	input: z.infer<typeof resetSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(monthlyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(monthlyPlan.id, parsed.monthlyPlanId))
		return { status: "success", message: "Override reset", data: { id: parsed.monthlyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "RESET_MONTHLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertMonthlyPlan, resetMonthlyOverride }
