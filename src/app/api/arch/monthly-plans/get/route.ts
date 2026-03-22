import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { monthlyPlans } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { getUserDek, decryptMonthlyPlanFields } from "@/lib/user-crypto"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/monthly-plans/get
 *
 * Returns a monthly plan for a specific year/month.
 *
 * Query params:
 * - year (required): 4-digit year
 * - month (required): 1-indexed month (1-12)
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	const { userId, accountId } = authResult.auth

	const yearParam = request.nextUrl.searchParams.get("year")
	const monthParam = request.nextUrl.searchParams.get("month")

	if (!yearParam || !monthParam) {
		return archError("Missing required query params: year and month", [
			{ code: "MISSING_PARAMS", detail: "Both year and month query params are required" },
		])
	}

	const year = parseInt(yearParam, 10)
	const month = parseInt(monthParam, 10)

	if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
		return archError("Invalid year or month", [
			{ code: "INVALID_PARAMS", detail: "Year must be a number, month must be 1-12" },
		])
	}

	try {
		const plan = await db.query.monthlyPlans.findFirst({
			where: and(
				eq(monthlyPlans.accountId, accountId),
				eq(monthlyPlans.year, year),
				eq(monthlyPlans.month, month)
			),
		})

		const dek = await getUserDek(userId)
		const decryptedPlan = plan && dek
			? decryptMonthlyPlanFields(plan as unknown as Record<string, unknown>, dek) as unknown as typeof plan
			: plan

		return archSuccess(
			plan ? "Monthly plan retrieved" : "No monthly plan found",
			decryptedPlan ?? null
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError("Failed to retrieve monthly plan", [
			{ code: "FETCH_FAILED", detail: message },
		], 500)
	}
}

export { GET }
