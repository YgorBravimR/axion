"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { dbWs } from "@/db/drizzle-ws"
import { monthlyPlan, quarterlyPlan } from "@/db/schema"
import { and, eq, gt, inArray, ne } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import {
	resolveTier,
	type LadderRuleR,
} from "@/lib/fractal-plan/capital-ladder"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	monthlyPlanId: z.string().uuid(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideWeeklyLossR: z.number().positive().optional(),
	overrideMonthlyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	overrideRiskProfileId: z.union([z.string().uuid(), z.null()]).optional(),
	monthlyGoalCents: z.number().int().nonnegative().optional(),
	intentNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
})

export const upsertMonthlyPlan = async (
	input: z.infer<typeof upsertSchema>
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		const updates: Record<string, unknown> = { updatedAt: new Date() }
		if (parsed.overrideDailyLossR !== undefined) {
			updates.overrideDailyLossR = parsed.overrideDailyLossR.toString()
		}
		if (parsed.overrideWeeklyLossR !== undefined) {
			updates.overrideWeeklyLossR = parsed.overrideWeeklyLossR.toString()
		}
		if (parsed.overrideMonthlyLossR !== undefined) {
			updates.overrideMonthlyLossR = parsed.overrideMonthlyLossR.toString()
		}
		if (parsed.overrideDailyTargetR !== undefined) {
			updates.overrideDailyTargetR = parsed.overrideDailyTargetR.toString()
		}
		if (parsed.overrideActivePlaybookIds !== undefined) {
			updates.overrideActivePlaybookIds = parsed.overrideActivePlaybookIds
		}
		if (parsed.overrideRiskProfileId !== undefined) {
			updates.overrideRiskProfileId = parsed.overrideRiskProfileId
		}
		if (parsed.monthlyGoalCents !== undefined) {
			updates.monthlyGoalCents = parsed.monthlyGoalCents
		}
		if (parsed.intentNotes !== undefined) {
			updates.intentNotes = parsed.intentNotes
		}
		if (parsed.postMortemNotes !== undefined) {
			updates.postMortemNotes = parsed.postMortemNotes
		}

		await db
			.update(monthlyPlan)
			.set(updates)
			.where(eq(monthlyPlan.id, parsed.monthlyPlanId))
		return {
			status: "success",
			message: "Monthly plan updated",
			data: { id: parsed.monthlyPlanId },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "UPSERT_MONTHLY_FAILED", detail: toSafeErrorMessage(err) },
			],
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
		"overrideRiskProfileId",
	]),
})

export const resetMonthlyOverride = async (
	input: z.infer<typeof resetSchema>
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(monthlyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(monthlyPlan.id, parsed.monthlyPlanId))
		return {
			status: "success",
			message: "Override reset",
			data: { id: parsed.monthlyPlanId },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "RESET_MONTHLY_FAILED", detail: toSafeErrorMessage(err) },
			],
		}
	}
}

const setMonthlyCapitalSchema = z.object({
	monthlyPlanId: z.string().uuid(),
	capitalCents: z.number().int().positive(),
	propagateForward: z.boolean().default(true),
})

interface SetMonthlyCapitalResult {
	readonly id: string
	readonly tierIndex: number
	readonly oneRCents: number
	readonly forwardUpdated: number
}

export const setMonthlyCapital = async (
	input: z.infer<typeof setMonthlyCapitalSchema>
): Promise<ActionResponse<SetMonthlyCapitalResult>> => {
	try {
		const parsed = setMonthlyCapitalSchema.parse(input)
		const { accountId } = await requireAuth()

		const target = await db.query.monthlyPlan.findFirst({
			where: eq(monthlyPlan.id, parsed.monthlyPlanId),
			with: {
				quarterlyPlan: { with: { yearlyPlan: true } },
			},
		})
		if (!target) {
			return {
				status: "error",
				message: "Monthly plan not found.",
				errors: [{ code: "NOT_FOUND", detail: parsed.monthlyPlanId }],
			}
		}
		if (target.quarterlyPlan.yearlyPlan.accountId !== accountId) {
			return {
				status: "error",
				message: "Forbidden — monthly plan belongs to another account.",
				errors: [{ code: "FORBIDDEN", detail: "account mismatch" }],
			}
		}

		const ladder = target.quarterlyPlan.yearlyPlan
			.ladderRules as unknown as LadderRuleR[]
		const { tierIndex, oneRCents } = resolveTier(parsed.capitalCents, ladder)
		const now = new Date()

		const forwardUpdated = await dbWs.transaction(async (tx) => {
			await tx
				.update(monthlyPlan)
				.set({
					snapshotCapitalCents: parsed.capitalCents,
					snapshotOneRCents: oneRCents,
					snapshotTierIndex: tierIndex,
					snapshotComputedAt: now,
					snapshotReason: "manual" as const,
					updatedAt: now,
				})
				.where(eq(monthlyPlan.id, parsed.monthlyPlanId))

			if (!parsed.propagateForward) {
				return 0
			}

			// Cascade to forward months in same year that haven't been manually overridden.
			const yearlyPlanId = target.quarterlyPlan.yearlyPlan.id
			const quarterIds = (
				await tx
					.select({ id: quarterlyPlan.id })
					.from(quarterlyPlan)
					.where(eq(quarterlyPlan.yearlyPlanId, yearlyPlanId))
			).map((q) => q.id)

			if (quarterIds.length === 0) {
				return 0
			}

			const updated = await tx
				.update(monthlyPlan)
				.set({
					snapshotCapitalCents: parsed.capitalCents,
					snapshotOneRCents: oneRCents,
					snapshotTierIndex: tierIndex,
					snapshotComputedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						inArray(monthlyPlan.quarterlyPlanId, quarterIds),
						gt(monthlyPlan.month, target.month),
						eq(monthlyPlan.year, target.year),
						ne(monthlyPlan.snapshotReason, "manual")
					)
				)
				.returning({ id: monthlyPlan.id })
			return updated.length
		})

		return {
			status: "success",
			message: "Capital atualizado",
			data: { id: parsed.monthlyPlanId, tierIndex, oneRCents, forwardUpdated },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "SET_MONTHLY_CAPITAL_FAILED", detail: toSafeErrorMessage(err) },
			],
		}
	}
}
