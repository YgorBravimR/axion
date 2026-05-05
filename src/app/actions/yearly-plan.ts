"use server"

import { db } from "@/db/drizzle"
import { yearlyPlans, monthlyPlans } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"

const syncCapitalBetweenPlans = async (
	monthlyPlanId: string,
	source: "monthly" | "yearly",
): Promise<ActionResponse<void>> => {
	try {
		const { accountId } = await requireAuth()

		const monthlyPlan = await db.query.monthlyPlans.findFirst({
			where: and(eq(monthlyPlans.id, monthlyPlanId), eq(monthlyPlans.accountId, accountId)),
		})
		if (!monthlyPlan) {
			return {
				status: "error",
				message: "Monthly plan not found",
				errors: [{ code: "NOT_FOUND", detail: "Monthly plan not found" }],
			}
		}

		const yearlyPlan = await db.query.yearlyPlans.findFirst({
			where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, monthlyPlan.year)),
		})
		if (!yearlyPlan) {
			return {
				status: "success",
				message: "No yearly plan found for this year — sync skipped",
				data: undefined,
			}
		}

		const monthlyTs = monthlyPlan.updatedAt.getTime()
		const yearlyTs = yearlyPlan.updatedAt.getTime()

		if (source === "monthly" || monthlyTs >= yearlyTs) {
			await db
				.update(yearlyPlans)
				.set({
					initialCapitalCents: Math.round(parseFloat(String(monthlyPlan.accountBalance))),
					updatedAt: new Date(),
				})
				.where(eq(yearlyPlans.id, yearlyPlan.id))
		} else {
			await db
				.update(monthlyPlans)
				.set({
					accountBalance: String(yearlyPlan.initialCapitalCents),
					updatedAt: new Date(),
				})
				.where(eq(monthlyPlans.id, monthlyPlan.id))
		}

		return { status: "success", message: "Capital synced", data: undefined }
	} catch (error) {
		return {
			status: "error",
			message: "Failed to sync capital",
			errors: [{ code: "SYNC_FAILED", detail: toSafeErrorMessage(error, "syncCapitalBetweenPlans") }],
		}
	}
}

export { syncCapitalBetweenPlans }
