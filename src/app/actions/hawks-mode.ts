"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { activateHawksMode } from "@/lib/hawks/activate-mode"
import { deactivateHawksMode, getAccountMode } from "@/lib/hawks/deactivate-mode"
import { getCurrentAccount } from "@/app/actions/auth"
import type { ActionResponse } from "@/types"

interface HawksModeStatus {
	mode: "default" | "hawks"
	accountId: string
}

const fetchHawksMode = async (): Promise<ActionResponse<HawksModeStatus>> => {
	const t = await getTranslations("hawksMode")
	try {
		const account = await getCurrentAccount()
		if (!account) {
			return { status: "error", message: t("errors.noAccount") }
		}
		const mode = await getAccountMode(account.id)
		return {
			status: "success",
			message: t("actions.statusRetrieved"),
			data: { mode, accountId: account.id },
		}
	} catch (error) {
		console.error("Failed to fetch hawks mode:", error)
		return { status: "error", message: t("errors.statusFetchFailed") }
	}
}

const enableHawksMode = async (): Promise<ActionResponse<HawksModeStatus>> => {
	const t = await getTranslations("hawksMode")
	try {
		const account = await getCurrentAccount()
		if (!account) {
			return { status: "error", message: t("errors.noAccount") }
		}
		await activateHawksMode({ accountId: account.id })
		revalidatePath("/", "layout")
		return {
			status: "success",
			message: t("actions.activated"),
			data: { mode: "hawks", accountId: account.id },
		}
	} catch (error) {
		console.error("Failed to activate hawks mode:", error)
		return { status: "error", message: t("errors.activationFailed") }
	}
}

const disableHawksMode = async (): Promise<ActionResponse<HawksModeStatus>> => {
	const t = await getTranslations("hawksMode")
	try {
		const account = await getCurrentAccount()
		if (!account) {
			return { status: "error", message: t("errors.noAccount") }
		}
		await deactivateHawksMode({ accountId: account.id })
		revalidatePath("/", "layout")
		return {
			status: "success",
			message: t("actions.deactivated"),
			data: { mode: "default", accountId: account.id },
		}
	} catch (error) {
		console.error("Failed to deactivate hawks mode:", error)
		return { status: "error", message: t("errors.deactivationFailed") }
	}
}

export { fetchHawksMode, enableHawksMode, disableHawksMode }
export type { HawksModeStatus }
