import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { dailyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { dailyNotesSchema } from "@/lib/validations/command-center"
import { ensureDailyPlanForAccountDate } from "@/lib/fractal-plan/ensure-daily"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/command-center/notes
 *
 * Returns the daily plan notes (pre/post + mood) for a given date, lazy-seeding
 * the `dailyPlan` row through the fractal cascade if needed.
 *
 * Query params:
 * - date (optional): ISO date string, defaults to today
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	const { accountId } = authResult.auth

	try {
		const dateParam = request.nextUrl.searchParams.get("date")
		const target = dateParam ? new Date(dateParam) : new Date()

		const cascade = await ensureDailyPlanForAccountDate(accountId, target)
		if (cascade.status === "no-yearly-plan") {
			return archError(
				"Yearly plan missing for the requested year",
				[{ code: "NO_YEARLY_PLAN", detail: "Create a yearly plan first." }],
				404
			)
		}
		if (cascade.status === "incomplete-cascade") {
			return archError(
				"Fractal cascade incomplete",
				[
					{
						code: "INCOMPLETE_CASCADE",
						detail: `Missing ${cascade.missing} row in the plan cascade.`,
					},
				],
				409
			)
		}

		return archSuccess("Notes retrieved", cascade.dayRow)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError(
			"Failed to retrieve notes",
			[{ code: "FETCH_FAILED", detail: message }],
			500
		)
	}
}

/**
 * POST /api/arch/command-center/notes
 *
 * Upserts daily notes (pre/post + mood) on the existing `dailyPlan` row for the
 * given date. Lazy-seeds the row via the fractal cascade if missing.
 *
 * Body: { date, preMarketNotes?, postMarketNotes?, mood? }
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	const { accountId } = authResult.auth

	try {
		const body = (await request.json()) as Record<string, unknown>
		const validated = dailyNotesSchema.parse(body)

		const target =
			typeof validated.date === "string"
				? new Date(validated.date)
				: validated.date

		const cascade = await ensureDailyPlanForAccountDate(accountId, target)
		if (cascade.status === "no-yearly-plan") {
			return archError(
				"Yearly plan missing for the requested year",
				[{ code: "NO_YEARLY_PLAN", detail: "Create a yearly plan first." }],
				404
			)
		}
		if (cascade.status === "incomplete-cascade") {
			return archError(
				"Fractal cascade incomplete",
				[
					{
						code: "INCOMPLETE_CASCADE",
						detail: `Missing ${cascade.missing} row in the plan cascade.`,
					},
				],
				409
			)
		}

		const noteFields: Record<string, string | null> = {}
		if (validated.preMarketNotes !== undefined) {
			noteFields.preMarketNotes = validated.preMarketNotes ?? null
		}
		if (validated.postMarketNotes !== undefined) {
			noteFields.postMarketNotes = validated.postMarketNotes ?? null
		}

		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
			...noteFields,
		}
		if (validated.mood !== undefined) {
			updates.mood = validated.mood ?? null
		}

		const [updated] = await db
			.update(dailyPlan)
			.set(updates)
			.where(eq(dailyPlan.id, cascade.dayRow.id))
			.returning()

		return archSuccess("Notes updated", updated)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError(
				"Validation failed",
				error.issues.map((issue) => ({
					code: "VALIDATION_ERROR",
					detail: `${issue.path.join(".")}: ${issue.message}`,
				}))
			)
		}

		const message = error instanceof Error ? error.message : "Unknown error"
		return archError(
			"Failed to save notes",
			[{ code: "SAVE_FAILED", detail: message }],
			500
		)
	}
}

export { GET, POST }
