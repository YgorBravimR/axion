"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { dailyPlan } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	dailyPlanId: z.string().uuid(),
	targetR: z.number().optional(),
	maxTradesToday: z.number().int().positive().optional(),
	preMarketNotes: z.string().max(5000).optional(),
	mood: z.enum(["focused", "neutral", "distracted", "risk_off"]).optional(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	postMarketNotes: z.string().max(5000).optional(),
})

const upsertDailyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(dailyPlan)
			.set({
				targetR: parsed.targetR?.toString(),
				maxTradesToday: parsed.maxTradesToday,
				preMarketNotes: parsed.preMarketNotes,
				mood: parsed.mood,
				overrideDailyLossR: parsed.overrideDailyLossR?.toString(),
				overrideDailyTargetR: parsed.overrideDailyTargetR?.toString(),
				overrideActivePlaybookIds: parsed.overrideActivePlaybookIds,
				postMarketNotes: parsed.postMarketNotes,
				updatedAt: new Date(),
			})
			.where(eq(dailyPlan.id, parsed.dailyPlanId))
		return { status: "success", message: "Daily plan updated", data: { id: parsed.dailyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_DAILY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const resetSchema = z.object({
	dailyPlanId: z.string().uuid(),
	field: z.enum([
		"targetR",
		"maxTradesToday",
		"mood",
		"overrideDailyLossR",
		"overrideDailyTargetR",
		"overrideActivePlaybookIds",
	]),
})

const resetDailyOverride = async (
	input: z.infer<typeof resetSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(dailyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(dailyPlan.id, parsed.dailyPlanId))
		return { status: "success", message: "Override reset", data: { id: parsed.dailyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "RESET_DAILY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const lazyEnsureSchema = z.object({
	weeklyPlanId: z.string().uuid(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const lazyEnsureDailyPlan = async (
	input: z.infer<typeof lazyEnsureSchema>,
): Promise<ActionResponse<{ id: string; created: boolean }>> => {
	try {
		const parsed = lazyEnsureSchema.parse(input)
		await requireAuth()

		const existing = await db.query.dailyPlan.findFirst({
			where: and(
				eq(dailyPlan.weeklyPlanId, parsed.weeklyPlanId),
				eq(dailyPlan.date, parsed.date),
			),
		})
		if (existing) {
			return {
				status: "success",
				message: "Daily plan exists",
				data: { id: existing.id, created: false },
			}
		}

		const [created] = await db
			.insert(dailyPlan)
			.values({
				weeklyPlanId: parsed.weeklyPlanId,
				date: parsed.date,
			})
			.returning({ id: dailyPlan.id })

		return {
			status: "success",
			message: "Daily plan created",
			data: { id: created.id, created: true },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "LAZY_ENSURE_DAILY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertDailyPlan, resetDailyOverride, lazyEnsureDailyPlan }
