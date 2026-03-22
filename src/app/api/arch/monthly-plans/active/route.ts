import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { monthlyPlans } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { getUserDek, decryptMonthlyPlanFields } from "@/lib/user-crypto"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

/**
 * GET /api/arch/monthly-plans/active
 *
 * Returns the active monthly plan for the current month.
 * Uses the current date to determine year/month.
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response

	const { userId, accountId } = authResult.auth

	try {
		const now = new Date()
		const year = now.getFullYear()
		const month = now.getMonth() + 1

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
			plan ? "Active monthly plan retrieved" : "No active monthly plan found",
			decryptedPlan ?? null
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return archError("Failed to retrieve active monthly plan", [
			{ code: "FETCH_FAILED", detail: message },
		], 500)
	}
}

export { GET }
