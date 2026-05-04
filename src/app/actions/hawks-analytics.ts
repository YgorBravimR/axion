"use server"

import { getTranslations } from "next-intl/server"
import { getCurrentAccount } from "@/app/actions/auth"
import { fetchHawksAnalytics } from "@/lib/hawks/analytics"
import { runHawksCoachDetectors } from "@/lib/hawks/coach-detectors"
import type { HawksAnalyticsBundle } from "@/lib/hawks/action-types"
import type { ActionResponse } from "@/types"

const fetchHawksAnalyticsBundle = async (
	rangeDays = 90
): Promise<ActionResponse<HawksAnalyticsBundle>> => {
	const t = await getTranslations("hawksAnalytics")
	try {
		const account = await getCurrentAccount()
		if (!account) return { status: "error", message: t("errors.noAccount") }

		const to = new Date()
		const from = new Date(to.getTime() - 1000 * 60 * 60 * 24 * rangeDays)

		const analytics = await fetchHawksAnalytics({
			accountId: account.id,
			range: { from, to },
		})
		const insights = await runHawksCoachDetectors({
			accountId: account.id,
			range: { from, to },
		})

		return {
			status: "success",
			message: t("actions.loaded"),
			data: {
				...analytics,
				insights,
			},
		}
	} catch (error) {
		console.error("Failed to fetch hawks analytics:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

export { fetchHawksAnalyticsBundle }
