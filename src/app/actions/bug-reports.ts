"use server"

import { db } from "@/db/drizzle"
import { bugReports, bugReportImages, users } from "@/db/schema"
import type { BugReport } from "@/db/schema"
import type { ActionResponse, PaginatedResponse } from "@/types"
import { eq, desc, sql, inArray } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type {
	SubmitBugReportInput,
	UpdateBugReportStatusInput,
	BugReportWithReporter,
	BugReportDetail,
} from "@/app/actions/bug-report-types"

// ==========================================
// SCHEMAS
// ==========================================

const submitBugReportSchema = z.object({
	subject: z.string().min(1).max(200),
	description: z.string().min(1),
	currentUrl: z.string().max(500).optional(),
	userAgent: z.string().max(500).optional(),
	consoleLogs: z.string().optional(),
	networkErrors: z.string().optional(),
	images: z
		.array(
			z.object({
				imageUrl: z.string().url(),
				s3Key: z.string(),
				isScreenshot: z.boolean().default(false),
			})
		)
		.max(3)
		.optional(),
})

const updateStatusSchema = z.object({
	id: z.string().uuid(),
	action: z.enum(["accept", "reject", "close"]),
	rejectReason: z.string().optional(),
	adminNotes: z.string().optional(),
})

// ==========================================
// HELPERS
// ==========================================

const UNAUTHORIZED_RESPONSE: ActionResponse<never> = {
	status: "error",
	message: "Unauthorized",
	errors: [{ code: "UNAUTHORIZED", detail: "Admin access required" }],
}

/** Verify the current user is an admin. Returns userId or an error response. */
const requireAdmin = async (): Promise<
	| { authorized: true; userId: string }
	| { authorized: false; response: ActionResponse<never> }
> => {
	const { userId } = await requireAuth()
	const [user] = await db
		.select({ isAdmin: users.isAdmin })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1)

	if (!user?.isAdmin)
		return { authorized: false, response: UNAUTHORIZED_RESPONSE }
	return { authorized: true, userId }
}

// ==========================================
// ACTIONS
// ==========================================

/**
 * Submit a new bug report — available to any authenticated user.
 */
const submitBugReport = async (
	input: SubmitBugReportInput
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const { userId } = await requireAuth()
		const validated = submitBugReportSchema.parse(input)

		const [report] = await db
			.insert(bugReports)
			.values({
				reportedBy: userId,
				subject: validated.subject,
				description: validated.description,
				currentUrl: validated.currentUrl ?? null,
				userAgent: validated.userAgent ?? null,
				consoleLogs: validated.consoleLogs ?? null,
				networkErrors: validated.networkErrors ?? null,
			})
			.returning()

		if (validated.images && validated.images.length > 0) {
			await db.insert(bugReportImages).values(
				validated.images.map((img) => ({
					bugReportId: report.id,
					imageUrl: img.imageUrl,
					s3Key: img.s3Key,
					isScreenshot: img.isScreenshot,
				}))
			)
		}

		return {
			status: "success",
			message: "Bug report submitted",
			data: { id: report.id },
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error),
			errors: [{ code: "SUBMIT_FAILED", detail: String(error) }],
		}
	}
}

/**
 * List bug reports — admin only.
 * Supports optional status filter and pagination.
 */
const getBugReports = async (filters?: {
	status?: "open" | "accepted" | "rejected" | "closed"
	limit?: number
	offset?: number
}): Promise<ActionResponse<PaginatedResponse<BugReportWithReporter>>> => {
	try {
		const adminResult = await requireAdmin()
		if (!adminResult.authorized) return adminResult.response

		const limit = filters?.limit ?? 50
		const offset = filters?.offset ?? 0

		const conditions = filters?.status
			? eq(bugReports.status, filters.status)
			: undefined

		// Alias for handler join
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
			.where(conditions)
			.orderBy(
				sql`CASE ${bugReports.status} WHEN 'open' THEN 0 WHEN 'accepted' THEN 1 WHEN 'rejected' THEN 2 WHEN 'closed' THEN 3 END`,
				desc(bugReports.reportedAt)
			)
			.limit(limit)
			.offset(offset)

		// Count images per report
		const reportIds = rows.map((r) => r.id)
		const imageCounts =
			reportIds.length > 0
				? await db
						.select({
							bugReportId: bugReportImages.bugReportId,
							count: sql<number>`count(*)::int`.as("count"),
						})
						.from(bugReportImages)
						.where(inArray(bugReportImages.bugReportId, reportIds))
						.groupBy(bugReportImages.bugReportId)
				: []

		const imageCountMap = new Map(
			imageCounts.map((ic) => [ic.bugReportId, ic.count])
		)

		// Total count for pagination
		const [{ total }] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(bugReports)
			.where(conditions)

		const items: BugReportWithReporter[] = rows.map((row) => ({
			...row,
			reporterEmail: row.reporterEmail ?? "",
			imageCount: imageCountMap.get(row.id) ?? 0,
		}))

		return {
			status: "success",
			message: "Bug reports retrieved",
			data: {
				items,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + limit < total,
				},
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error),
			errors: [{ code: "FETCH_FAILED", detail: String(error) }],
		}
	}
}

/**
 * Update a bug report's status — admin only.
 */
const updateBugReportStatus = async (
	input: UpdateBugReportStatusInput
): Promise<ActionResponse<BugReport>> => {
	try {
		const adminResult = await requireAdmin()
		if (!adminResult.authorized) return adminResult.response
		const { userId } = adminResult

		const validated = updateStatusSchema.parse(input)

		if (validated.action === "reject" && !validated.rejectReason) {
			return {
				status: "error",
				message: "Reject reason is required",
				errors: [
					{
						code: "VALIDATION_ERROR",
						detail: "rejectReason is required when rejecting",
					},
				],
			}
		}

		const now = new Date()

		const baseValues = {
			handledBy: userId,
			...(validated.adminNotes !== undefined && {
				adminNotes: validated.adminNotes,
			}),
		}

		const statusValues = (() => {
			switch (validated.action) {
				case "accept":
					return { status: "accepted" as const, acceptedAt: now }
				case "reject":
					return {
						status: "rejected" as const,
						rejectedAt: now,
						rejectReason: validated.rejectReason,
					}
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
			return {
				status: "error",
				message: "Bug report not found",
				errors: [{ code: "NOT_FOUND", detail: "Bug report does not exist" }],
			}
		}

		return {
			status: "success",
			message:
				validated.action === "close"
					? "Bug report closed"
					: `Bug report ${validated.action}ed`,
			data: updated,
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error),
			errors: [{ code: "UPDATE_FAILED", detail: String(error) }],
		}
	}
}

/**
 * Get full bug report detail with images — admin only.
 */
const getBugReportDetail = async (
	id: string
): Promise<ActionResponse<BugReportDetail>> => {
	try {
		const adminResult = await requireAdmin()
		if (!adminResult.authorized) return adminResult.response

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
			return {
				status: "error",
				message: "Bug report not found",
				errors: [{ code: "NOT_FOUND", detail: "Bug report does not exist" }],
			}
		}

		const images = await db
			.select()
			.from(bugReportImages)
			.where(eq(bugReportImages.bugReportId, id))

		return {
			status: "success",
			message: "Bug report retrieved",
			data: {
				...row,
				reporterEmail: row.reporterEmail ?? "",
				images,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error),
			errors: [{ code: "FETCH_FAILED", detail: String(error) }],
		}
	}
}

export {
	submitBugReport,
	getBugReports,
	updateBugReportStatus,
	getBugReportDetail,
}
