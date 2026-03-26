import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { bugReports, users } from "@/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/bugs/list
 *
 * Lists all bug reports with optional status filter and pagination.
 * Query params: ?status=open&limit=50&offset=0
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	try {
		const { searchParams } = new URL(request.url)
		const validStatuses = ["open", "accepted", "rejected", "closed"] as const
		const rawStatus = searchParams.get("status")
		const statusFilter = rawStatus && validStatuses.includes(rawStatus as typeof validStatuses[number])
			? (rawStatus as typeof validStatuses[number])
			: null
		const limit = Math.min(Number(searchParams.get("limit")) || 50, 100)
		const offset = Number(searchParams.get("offset")) || 0

		const conditions = statusFilter
			? eq(bugReports.status, statusFilter)
			: undefined

		const reporter = db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.as("reporter")

		const handler = db
			.select({ id: users.id, name: users.name })
			.from(users)
			.as("handler")

		const rows = await db
			.select({
				id: bugReports.id,
				subject: bugReports.subject,
				description: bugReports.description,
				status: bugReports.status,
				currentUrl: bugReports.currentUrl,
				reportedAt: bugReports.reportedAt,
				acceptedAt: bugReports.acceptedAt,
				rejectedAt: bugReports.rejectedAt,
				closedAt: bugReports.closedAt,
				rejectReason: bugReports.rejectReason,
				adminNotes: bugReports.adminNotes,
				reporterName: reporter.name,
				reporterEmail: reporter.email,
				handlerName: handler.name,
			})
			.from(bugReports)
			.leftJoin(reporter, eq(bugReports.reportedBy, reporter.id))
			.leftJoin(handler, eq(bugReports.handledBy, handler.id))
			.where(conditions)
			.orderBy(desc(bugReports.reportedAt))
			.limit(limit)
			.offset(offset)

		const [{ total }] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(bugReports)
			.where(conditions)

		return archSuccess("Bug reports retrieved", { items: rows, total })
	} catch (error) {
		return archError(
			"Failed to fetch bug reports",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
