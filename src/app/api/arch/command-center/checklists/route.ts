import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { dailyChecklists, checklistCompletions } from "@/db/schema"
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import type { ChecklistItem } from "@/lib/validations/command-center"

/**
 * GET /api/arch/command-center/checklists
 *
 * Returns all active checklists with their completion status for a given date.
 *
 * Query params:
 * - date (optional): ISO date string, defaults to today
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}

	const { userId, accountId } = authResult.auth

	try {
		const dateParam = request.nextUrl.searchParams.get("date")
		const today = dateParam ? new Date(dateParam) : new Date()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// Get all active checklists
		const checklists = await db.query.dailyChecklists.findMany({
			where: and(
				eq(dailyChecklists.userId, userId),
				eq(dailyChecklists.accountId, accountId),
				eq(dailyChecklists.isActive, true)
			),
			orderBy: [desc(dailyChecklists.createdAt)],
		})

		// Get today's completions for these checklists
		const checklistIds = checklists.map((c) => c.id)
		const completions =
			checklistIds.length > 0
				? await db.query.checklistCompletions.findMany({
						where: and(
							inArray(checklistCompletions.checklistId, checklistIds),
							gte(checklistCompletions.date, today),
							lte(checklistCompletions.date, tomorrow)
						),
					})
				: []

		// Build O(1) completion map by checklistId
		const completionMap = new Map(completions.map((c) => [c.checklistId, c]))

		// Map completions to checklists using O(1) lookup
		const checklistsWithCompletions = checklists.map((checklist) => {
			const completion = completionMap.get(checklist.id) ?? null
			const completedItemIds: string[] = completion
				? ((
						JSON.parse(completion.completedItems) as unknown[] | undefined
					)?.filter((x): x is string => typeof x === "string") ?? [])
				: []

			return {
				...checklist,
				parsedItems: JSON.parse(checklist.items) as ChecklistItem[],
				completion,
				completedItemIds,
			}
		})

		return archSuccess("Checklists retrieved", checklistsWithCompletions)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError(
			"Failed to retrieve checklists",
			[{ code: "FETCH_FAILED", detail: message }],
			500
		)
	}
}

export { GET }
