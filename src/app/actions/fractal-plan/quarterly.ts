"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { quarterlyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	quarterlyPlanId: z.string().uuid(),
	goalCents: z.number().int().nonnegative().optional(),
	reflectionNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
	activePlaybookIds: z.array(z.string().uuid()).optional(),
})

const upsertQuarterlyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(quarterlyPlan)
			.set({
				goalCents: parsed.goalCents,
				reflectionNotes: parsed.reflectionNotes,
				postMortemNotes: parsed.postMortemNotes,
				activePlaybookIds: parsed.activePlaybookIds,
				updatedAt: new Date(),
			})
			.where(eq(quarterlyPlan.id, parsed.quarterlyPlanId))
		return { status: "success", message: "Quarterly plan updated", data: { id: parsed.quarterlyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_QUARTERLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertQuarterlyPlan }
