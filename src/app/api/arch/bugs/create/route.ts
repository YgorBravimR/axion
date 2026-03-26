import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { bugReports } from "@/db/schema"
import { z } from "zod"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const ARCH_USER_AGENT = "Arch API"

const createSchema = z.object({
	subject: z.string().min(1).max(200),
	description: z.string().min(1),
	currentUrl: z.string().max(500).optional(),
	consoleLogs: z.string().optional(),
	networkErrors: z.string().optional(),
})

/**
 * POST /api/arch/bugs/create
 *
 * Create a bug report on behalf of the Arch user.
 * Useful for Arch to file bugs discovered during automated operations.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = await request.json()
		const validated = createSchema.parse(body)

		const [report] = await db
			.insert(bugReports)
			.values({
				reportedBy: auth.userId,
				subject: validated.subject,
				description: validated.description,
				currentUrl: validated.currentUrl ?? null,
				consoleLogs: validated.consoleLogs ?? null,
				networkErrors: validated.networkErrors ?? null,
				userAgent: ARCH_USER_AGENT,
			})
			.returning()

		return archSuccess("Bug report created", { id: report.id })
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError("Invalid request body", [
				{ code: "VALIDATION_ERROR", detail: error.message },
			])
		}
		return archError(
			"Failed to create bug report",
			[{ code: "CREATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
