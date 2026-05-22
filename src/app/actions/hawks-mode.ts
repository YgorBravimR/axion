"use server"

import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { dbWs } from "@/db/drizzle-ws"
import { accountModes } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import type { ActionResponse } from "@/types"
import { toSafeErrorMessage } from "@/lib/error-utils"

export const startHawksMode = async (): Promise<
	ActionResponse<{ id: string }>
> => {
	const t = await getTranslations("hawks")
	try {
		const { accountId, userId } = await requireAuth()

		const existing = await dbWs.query.accountModes.findFirst({
			where: and(
				eq(accountModes.accountId, accountId),
				isNull(accountModes.deactivatedAt)
			),
			columns: { id: true, mode: true },
		})
		if (existing?.mode === "hawks") {
			return {
				status: "success",
				message: t("actions.modeAlreadyActive"),
				data: { id: existing.id },
			}
		}

		const [inserted] = await dbWs.transaction(async (tx) => {
			if (existing) {
				await tx
					.update(accountModes)
					.set({ deactivatedAt: new Date() })
					.where(eq(accountModes.id, existing.id))
			}
			return tx
				.insert(accountModes)
				.values({ accountId, userId, mode: "hawks" })
				.returning({ id: accountModes.id })
		})

		revalidatePath("/", "layout")

		return {
			status: "success",
			message: t("actions.modeStarted"),
			data: { id: inserted!.id },
		}
	} catch (error) {
		return {
			status: "error",
			message: (await getTranslations("hawks"))("actions.modeStartFailed"),
			errors: [
				{
					code: "HAWKS_MODE_START_FAILED",
					detail: toSafeErrorMessage(error, "startHawksMode"),
				},
			],
		}
	}
}

export const stopHawksMode = async (): Promise<ActionResponse<null>> => {
	const t = await getTranslations("hawks")
	try {
		const { accountId, userId } = await requireAuth()

		const active = await dbWs.query.accountModes.findFirst({
			where: and(
				eq(accountModes.accountId, accountId),
				eq(accountModes.mode, "hawks"),
				isNull(accountModes.deactivatedAt)
			),
			columns: { id: true },
		})
		if (!active) {
			return {
				status: "success",
				message: t("actions.modeAlreadyInactive"),
				data: null,
			}
		}

		await dbWs.transaction(async (tx) => {
			await tx
				.update(accountModes)
				.set({ deactivatedAt: new Date() })
				.where(eq(accountModes.id, active.id))
			await tx
				.insert(accountModes)
				.values({ accountId, userId, mode: "default" })
		})

		revalidatePath("/", "layout")

		return {
			status: "success",
			message: t("actions.modeStopped"),
			data: null,
		}
	} catch (error) {
		return {
			status: "error",
			message: (await getTranslations("hawks"))("actions.modeStopFailed"),
			errors: [
				{
					code: "HAWKS_MODE_STOP_FAILED",
					detail: toSafeErrorMessage(error, "stopHawksMode"),
				},
			],
		}
	}
}
