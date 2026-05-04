"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksRenkoCalibrations } from "@/db/schema"
import { getCurrentAccount } from "@/app/actions/auth"
import { startOfIsoWeek } from "@/lib/hawks/atr-calc"
import type {
	CalibrationRecord,
	UpsertCalibrationInput,
} from "@/lib/hawks/action-types"
import type { ActionResponse } from "@/types"

const upsertHawksCalibration = async (
	input: UpsertCalibrationInput
): Promise<ActionResponse<CalibrationRecord>> => {
	const t = await getTranslations("hawksCalibration")
	try {
		const account = await getCurrentAccount()
		if (!account) return { status: "error", message: t("errors.noAccount") }

		const weekStart = startOfIsoWeek(
			input.weekStart ? new Date(input.weekStart) : new Date()
		)

		const existing = await db.query.hawksRenkoCalibrations.findFirst({
			where: and(
				eq(hawksRenkoCalibrations.accountId, account.id),
				eq(hawksRenkoCalibrations.weekStart, weekStart),
				eq(hawksRenkoCalibrations.assetSymbol, input.assetSymbol),
				eq(hawksRenkoCalibrations.timeframeMinutes, input.timeframeMinutes)
			),
		})

		const payload = {
			rValue: input.rValue,
			source: input.source ?? "user_calc",
			notes: input.notes ?? null,
		}

		let row
		if (existing) {
			const [updated] = await db
				.update(hawksRenkoCalibrations)
				.set(payload)
				.where(eq(hawksRenkoCalibrations.id, existing.id))
				.returning()
			row = updated
		} else {
			const [inserted] = await db
				.insert(hawksRenkoCalibrations)
				.values({
					accountId: account.id,
					weekStart,
					assetSymbol: input.assetSymbol,
					timeframeMinutes: input.timeframeMinutes,
					...payload,
				})
				.returning()
			row = inserted
		}

		revalidatePath("/hawks/calibration")

		return {
			status: "success",
			message: t("actions.saved"),
			data: {
				id: row.id,
				accountId: row.accountId,
				weekStart: row.weekStart.toISOString(),
				assetSymbol: row.assetSymbol,
				timeframeMinutes: row.timeframeMinutes,
				rValue: row.rValue,
				source: row.source,
				notes: row.notes,
			},
		}
	} catch (error) {
		console.error("Failed to upsert hawks calibration:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

const listHawksCalibrations = async (
	limit = 12
): Promise<ActionResponse<CalibrationRecord[]>> => {
	const t = await getTranslations("hawksCalibration")
	try {
		const account = await getCurrentAccount()
		if (!account) return { status: "error", message: t("errors.noAccount") }

		const rows = await db.query.hawksRenkoCalibrations.findMany({
			where: eq(hawksRenkoCalibrations.accountId, account.id),
			orderBy: [desc(hawksRenkoCalibrations.weekStart)],
			limit,
		})

		return {
			status: "success",
			message: t("actions.listed"),
			data: rows.map((row) => ({
				id: row.id,
				accountId: row.accountId,
				weekStart: row.weekStart.toISOString(),
				assetSymbol: row.assetSymbol,
				timeframeMinutes: row.timeframeMinutes,
				rValue: row.rValue,
				source: row.source,
				notes: row.notes,
			})),
		}
	} catch (error) {
		console.error("Failed to list hawks calibrations:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

export { upsertHawksCalibration, listHawksCalibrations }
