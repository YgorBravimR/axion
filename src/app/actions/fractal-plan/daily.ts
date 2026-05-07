"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { dailyPlan } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth, getCurrentAccount } from "@/app/actions/auth"
import { ensureDailyPlanForAccountDate } from "@/lib/fractal-plan/ensure-daily"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import type { DailyPlan } from "@/db/schema"

// `null` = explicit clear; field omitted = leave untouched.
const upsertSchema = z.object({
	dailyPlanId: z.string().uuid(),
	targetR: z.number().nullish(),
	maxTradesToday: z.number().int().positive().nullish(),
	preMarketNotes: z.string().max(5000).nullish(),
	mood: z.enum(["focused", "neutral", "distracted", "risk_off"]).nullish(),
	overrideDailyLossR: z.number().positive().nullish(),
	overrideDailyTargetR: z.number().positive().nullish(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).nullish(),
	postMarketNotes: z.string().max(5000).nullish(),
})

export const upsertDailyPlan = async (
	input: z.infer<typeof upsertSchema>
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()

		const updates: Record<string, unknown> = { updatedAt: new Date() }
		if (parsed.targetR !== undefined) {
			updates.targetR =
				parsed.targetR === null ? null : parsed.targetR.toString()
		}
		if (parsed.maxTradesToday !== undefined) {
			updates.maxTradesToday = parsed.maxTradesToday
		}
		if (parsed.preMarketNotes !== undefined) {
			updates.preMarketNotes = parsed.preMarketNotes
		}
		if (parsed.mood !== undefined) {
			updates.mood = parsed.mood
		}
		if (parsed.overrideDailyLossR !== undefined) {
			updates.overrideDailyLossR =
				parsed.overrideDailyLossR === null
					? null
					: parsed.overrideDailyLossR.toString()
		}
		if (parsed.overrideDailyTargetR !== undefined) {
			updates.overrideDailyTargetR =
				parsed.overrideDailyTargetR === null
					? null
					: parsed.overrideDailyTargetR.toString()
		}
		if (parsed.overrideActivePlaybookIds !== undefined) {
			updates.overrideActivePlaybookIds = parsed.overrideActivePlaybookIds
		}
		if (parsed.postMarketNotes !== undefined) {
			updates.postMarketNotes = parsed.postMarketNotes
		}

		await db
			.update(dailyPlan)
			.set(updates)
			.where(eq(dailyPlan.id, parsed.dailyPlanId))
		return {
			status: "success",
			message: "Daily plan updated",
			data: { id: parsed.dailyPlanId },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "UPSERT_DAILY_FAILED", detail: toSafeErrorMessage(err) },
			],
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

export const resetDailyOverride = async (
	input: z.infer<typeof resetSchema>
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(dailyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(dailyPlan.id, parsed.dailyPlanId))
		return {
			status: "success",
			message: "Override reset",
			data: { id: parsed.dailyPlanId },
		}
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

export const lazyEnsureDailyPlan = async (
	input: z.infer<typeof lazyEnsureSchema>
): Promise<ActionResponse<{ id: string; created: boolean }>> => {
	try {
		const parsed = lazyEnsureSchema.parse(input)
		await requireAuth()

		const existing = await db.query.dailyPlan.findFirst({
			where: and(
				eq(dailyPlan.weeklyPlanId, parsed.weeklyPlanId),
				eq(dailyPlan.date, parsed.date)
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
			errors: [
				{ code: "LAZY_ENSURE_DAILY_FAILED", detail: toSafeErrorMessage(err) },
			],
		}
	}
}

const getDailyPlanByIdSchema = z.object({
	dailyPlanId: z.string().uuid(),
})

export const getDailyPlanById = async (
	input: z.infer<typeof getDailyPlanByIdSchema>
): Promise<ActionResponse<DailyPlan | null>> => {
	try {
		const parsed = getDailyPlanByIdSchema.parse(input)
		await requireAuth()
		const row = await db.query.dailyPlan.findFirst({
			where: eq(dailyPlan.id, parsed.dailyPlanId),
		})
		return {
			status: "success",
			message: "Daily plan fetched",
			data: row ?? null,
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{ code: "GET_DAILY_PLAN_FAILED", detail: toSafeErrorMessage(err) },
			],
		}
	}
}

const fetchByDateSchema = z.object({
	dateISO: z
		.string()
		.datetime()
		.or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
})

type FetchByDateResult =
	| { kind: "ok"; dayRow: DailyPlan }
	| { kind: "no-account" }
	| { kind: "no-yearly-plan" }
	| { kind: "incomplete-cascade"; missing: "quarter" | "month" | "week" }

export const getDailyPlanForCurrentAccount = async (
	input: z.infer<typeof fetchByDateSchema>
): Promise<ActionResponse<FetchByDateResult>> => {
	try {
		const parsed = fetchByDateSchema.parse(input)
		await requireAuth()
		const account = await getCurrentAccount()
		if (!account?.id) {
			return {
				status: "success",
				message: "No active account",
				data: { kind: "no-account" },
			}
		}
		const date = new Date(parsed.dateISO)
		const ensured = await ensureDailyPlanForAccountDate(account.id, date)
		if (ensured.status === "ok") {
			return {
				status: "success",
				message: "Fetched",
				data: { kind: "ok", dayRow: ensured.dayRow },
			}
		}
		if (ensured.status === "no-yearly-plan") {
			return {
				status: "success",
				message: "No yearly plan",
				data: { kind: "no-yearly-plan" },
			}
		}
		return {
			status: "success",
			message: "Incomplete cascade",
			data: { kind: "incomplete-cascade", missing: ensured.missing },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [
				{
					code: "GET_DAILY_PLAN_FOR_ACCOUNT_FAILED",
					detail: toSafeErrorMessage(err),
				},
			],
		}
	}
}
