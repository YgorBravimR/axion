import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"

interface UpdateNotesBody {
	id: string
	preTradeThoughts?: string | null
	postTradeReflection?: string | null
	lessonLearned?: string | null
	disciplineNotes?: string | null
}

/**
 * POST /api/arch/trades/notes
 * Update journal notes on a trade.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as UpdateNotesBody

		if (!body.id) {
			return archError("Missing required field", [
				{ code: "VALIDATION_ERROR", detail: "id is required" },
			])
		}

		const { id, ...noteFields } = body

		// Verify at least one note field is provided
		const hasNoteField =
			noteFields.preTradeThoughts !== undefined ||
			noteFields.postTradeReflection !== undefined ||
			noteFields.lessonLearned !== undefined ||
			noteFields.disciplineNotes !== undefined

		if (!hasNoteField) {
			return archError("No note fields provided", [
				{
					code: "VALIDATION_ERROR",
					detail:
						"At least one of preTradeThoughts, postTradeReflection, lessonLearned, or disciplineNotes must be provided",
				},
			])
		}

		const tradeCondition = and(eq(trades.id, id), buildAccountCondition(auth))

		const trade = await db.query.trades.findFirst({
			where: tradeCondition,
		})

		if (!trade) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or you do not have access",
					},
				],
				404
			)
		}

		// Build update data with only provided note fields
		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		}

		if (noteFields.preTradeThoughts !== undefined) {
			updateData.preTradeThoughts = noteFields.preTradeThoughts
		}
		if (noteFields.postTradeReflection !== undefined) {
			updateData.postTradeReflection = noteFields.postTradeReflection
		}
		if (noteFields.lessonLearned !== undefined) {
			updateData.lessonLearned = noteFields.lessonLearned
		}
		if (noteFields.disciplineNotes !== undefined) {
			updateData.disciplineNotes = noteFields.disciplineNotes
		}

		await db.update(trades).set(updateData).where(eq(trades.id, id))

		return archSuccess("Trade notes updated successfully")
	} catch (error) {
		return archError(
			"Failed to update trade notes",
			[{ code: "UPDATE_NOTES_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
