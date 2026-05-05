"use server"

import { db } from "@/db/drizzle"
import { yearlyPlans, monthlyRiskConfig } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"

const syncCapitalBetweenPlans = async (
	monthlyRiskConfigId: string,
	source: "monthly" | "yearly",
): Promise<ActionResponse<void>> => {
	try {
		const { accountId } = await requireAuth()

		const monthlyRiskConfigRow = await db.query.monthlyRiskConfig.findFirst({
			where: and(eq(monthlyRiskConfig.id, monthlyRiskConfigId), eq(monthlyRiskConfig.accountId, accountId)),
		})
		if (!monthlyRiskConfigRow) {
			return {
				status: "error",
				message: "Monthly risk config not found",
				errors: [{ code: "NOT_FOUND", detail: "Monthly risk config not found" }],
			}
		}

		const yearlyPlan = await db.query.yearlyPlans.findFirst({
			where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, monthlyRiskConfigRow.year)),
		})
		if (!yearlyPlan) {
			return {
				status: "success",
				message: "No yearly plan found for this year — sync skipped",
				data: undefined,
			}
		}

		const monthlyTs = monthlyRiskConfigRow.updatedAt.getTime()
		const yearlyTs = yearlyPlan.updatedAt.getTime()

		if (source === "monthly" || monthlyTs >= yearlyTs) {
			await db
				.update(yearlyPlans)
				.set({
					initialCapitalCents: Math.round(parseFloat(String(monthlyRiskConfigRow.accountBalance))),
					updatedAt: new Date(),
				})
				.where(eq(yearlyPlans.id, yearlyPlan.id))
		} else {
			await db
				.update(monthlyRiskConfig)
				.set({
					accountBalance: String(yearlyPlan.initialCapitalCents),
					updatedAt: new Date(),
				})
				.where(eq(monthlyRiskConfig.id, monthlyRiskConfigRow.id))
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
