"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { db } from "@/db/drizzle"
import { dailyHawksBias } from "@/db/schema"
import type { DailyHawksBias } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { getActiveHawksAccount } from "@/lib/hawks/account-context"
import { confirmDailyBiasSchema } from "@/lib/validations/hawks"
import type { ConfirmDailyBiasInput } from "@/lib/validations/hawks"
import type { ActionResponse } from "@/types"
import { toSafeErrorMessage } from "@/lib/error-utils"

export const confirmDailyBias = async (
	input: ConfirmDailyBiasInput
): Promise<ActionResponse<DailyHawksBias>> => {
	const t = await getTranslations("hawks")
	try {
		const hawks = await getActiveHawksAccount()
		if (!hawks) {
			return {
				status: "error",
				message: t("actions.modeNotActive"),
				errors: [
					{
						code: "HAWKS_MODE_NOT_ACTIVE",
						detail: "Account is not in Hawks mode",
					},
				],
			}
		}

		const parsed = confirmDailyBiasSchema.parse(input)
		const { tradingDay, bias, screens, notesPt } = parsed

		const existing = await db.query.dailyHawksBias.findFirst({
			where: and(
				eq(dailyHawksBias.accountId, hawks.accountId),
				eq(dailyHawksBias.tradingDay, tradingDay)
			),
		})

		let row: DailyHawksBias
		if (existing) {
			const [updated] = await db
				.update(dailyHawksBias)
				.set({
					bias,
					renkoCloseAbove60min: screens.renko60,
					macdSlopeUp: screens.macd,
					emaStackBullish: screens.emaStack,
					vwapAbove: screens.vwap,
					ajusteRespected: screens.ajuste,
					notesPt: notesPt ?? null,
					updatedAt: new Date(),
				})
				.where(eq(dailyHawksBias.id, existing.id))
				.returning()
			row = updated!
		} else {
			const [created] = await db
				.insert(dailyHawksBias)
				.values({
					accountId: hawks.accountId,
					tradingDay,
					bias,
					renkoCloseAbove60min: screens.renko60,
					macdSlopeUp: screens.macd,
					emaStackBullish: screens.emaStack,
					vwapAbove: screens.vwap,
					ajusteRespected: screens.ajuste,
					notesPt: notesPt ?? null,
				})
				.returning()
			row = created!
		}

		revalidatePath("/journal", "layout")

		return {
			status: "success",
			message: t("actions.biasConfirmed"),
			data: row,
		}
	} catch (error) {
		if (error instanceof Error && error.name === "ZodError") {
			return {
				status: "error",
				message: t("actions.biasValidationFailed"),
				errors: [{ code: "VALIDATION_ERROR", detail: error.message }],
			}
		}
		return {
			status: "error",
			message: t("actions.biasConfirmFailed"),
			errors: [
				{
					code: "HAWKS_BIAS_CONFIRM_FAILED",
					detail: toSafeErrorMessage(error, "confirmDailyBias"),
				},
			],
		}
	}
}

export const getDailyBias = async (
	tradingDay: string
): Promise<ActionResponse<DailyHawksBias | null>> => {
	const t = await getTranslations("hawks")
	try {
		await requireAuth()
		const hawks = await getActiveHawksAccount()
		if (!hawks) {
			return {
				status: "success",
				message: t("actions.modeNotActive"),
				data: null,
			}
		}
		const row = await db.query.dailyHawksBias.findFirst({
			where: and(
				eq(dailyHawksBias.accountId, hawks.accountId),
				eq(dailyHawksBias.tradingDay, tradingDay)
			),
		})
		return {
			status: "success",
			message: t("actions.biasFetched"),
			data: row ?? null,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.biasFetchFailed"),
			errors: [
				{
					code: "HAWKS_BIAS_FETCH_FAILED",
					detail: toSafeErrorMessage(error, "getDailyBias"),
				},
			],
		}
	}
}
