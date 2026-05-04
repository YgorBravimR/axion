"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { weeklyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	weeklyPlanId: z.string().uuid(),
	targetR: z.number().optional(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideWeeklyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	intentNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
})

const upsertWeeklyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(weeklyPlan)
			.set({
				targetR: parsed.targetR?.toString(),
				overrideDailyLossR: parsed.overrideDailyLossR?.toString(),
				overrideWeeklyLossR: parsed.overrideWeeklyLossR?.toString(),
				overrideDailyTargetR: parsed.overrideDailyTargetR?.toString(),
				overrideActivePlaybookIds: parsed.overrideActivePlaybookIds,
				intentNotes: parsed.intentNotes,
				postMortemNotes: parsed.postMortemNotes,
				updatedAt: new Date(),
			})
			.where(eq(weeklyPlan.id, parsed.weeklyPlanId))
		return { status: "success", message: "Weekly plan updated", data: { id: parsed.weeklyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_WEEKLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const resetSchema = z.object({
	weeklyPlanId: z.string().uuid(),
	field: z.enum([
		"targetR",
		"overrideDailyLossR",
		"overrideWeeklyLossR",
		"overrideDailyTargetR",
		"overrideActivePlaybookIds",
	]),
})

const resetWeeklyOverride = async (
	input: z.infer<typeof resetSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(weeklyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(weeklyPlan.id, parsed.weeklyPlanId))
		return { status: "success", message: "Override reset", data: { id: parsed.weeklyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "RESET_WEEKLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertWeeklyPlan, resetWeeklyOverride }
