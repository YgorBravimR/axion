import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { bugReports } from "@/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const updateSchema = z.object({
	id: z.string().uuid(),
	action: z.enum(["accept", "reject", "close"]),
	rejectReason: z.string().optional(),
	adminNotes: z.string().optional(),
})

/**
 * POST /api/arch/bugs/update
 *
 * Update bug report status. Actions: accept, reject (requires rejectReason), close.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = await request.json()
		const validated = updateSchema.parse(body)

		if (validated.action === "reject" && !validated.rejectReason) {
			return archError("rejectReason is required when rejecting", [
				{ code: "VALIDATION_ERROR", detail: "rejectReason is required" },
			])
		}

		const now = new Date()

		const baseValues = {
			handledBy: auth.userId,
			...(validated.adminNotes !== undefined && { adminNotes: validated.adminNotes }),
		}

		const statusValues = (() => {
			switch (validated.action) {
				case "accept":
					return { status: "accepted" as const, acceptedAt: now }
				case "reject":
					return { status: "rejected" as const, rejectedAt: now, rejectReason: validated.rejectReason }
				case "close":
					return { status: "closed" as const, closedAt: now }
			}
		})()

		const [updated] = await db
			.update(bugReports)
			.set({ ...baseValues, ...statusValues })
			.where(eq(bugReports.id, validated.id))
			.returning()

		if (!updated) {
			return archError(
				"Bug report not found",
				[{ code: "NOT_FOUND", detail: "Bug report does not exist" }],
				404
			)
		}

		const actionLabel = validated.action === "close" ? "closed" : `${validated.action}ed`
		return archSuccess(`Bug report ${actionLabel}`, updated)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError("Invalid request body", [
				{ code: "VALIDATION_ERROR", detail: error.message },
			])
		}
		return archError(
			"Failed to update bug report",
			[{ code: "UPDATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
