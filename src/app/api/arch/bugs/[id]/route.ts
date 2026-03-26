import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { bugReports, bugReportImages, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/bugs/[id]
 *
 * Returns full bug report detail with images, console logs, network errors, and reporter info.
 */
const GET = async (
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	try {
		const { id } = await params

		const reporter = db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.as("reporter")

		const handler = db
			.select({ id: users.id, name: users.name })
			.from(users)
			.as("handler")

		const [row] = await db
			.select({
				id: bugReports.id,
				reportedBy: bugReports.reportedBy,
				subject: bugReports.subject,
				description: bugReports.description,
				currentUrl: bugReports.currentUrl,
				userAgent: bugReports.userAgent,
				consoleLogs: bugReports.consoleLogs,
				networkErrors: bugReports.networkErrors,
				status: bugReports.status,
				reportedAt: bugReports.reportedAt,
				acceptedAt: bugReports.acceptedAt,
				rejectedAt: bugReports.rejectedAt,
				closedAt: bugReports.closedAt,
				handledBy: bugReports.handledBy,
				rejectReason: bugReports.rejectReason,
				adminNotes: bugReports.adminNotes,
				reporterName: reporter.name,
				reporterEmail: reporter.email,
				handlerName: handler.name,
			})
			.from(bugReports)
			.leftJoin(reporter, eq(bugReports.reportedBy, reporter.id))
			.leftJoin(handler, eq(bugReports.handledBy, handler.id))
			.where(eq(bugReports.id, id))
			.limit(1)

		if (!row) {
			return archError(
				"Bug report not found",
				[{ code: "NOT_FOUND", detail: "Bug report does not exist" }],
				404
			)
		}

		const images = await db
			.select()
			.from(bugReportImages)
			.where(eq(bugReportImages.bugReportId, id))

		return archSuccess("Bug report retrieved", { ...row, images })
	} catch (error) {
		return archError(
			"Failed to fetch bug report",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
