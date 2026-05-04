"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksGlobalCalibrations, users } from "@/db/schema"
import { getCurrentUser } from "@/app/actions/auth"
import { startOfIsoWeek } from "@/lib/hawks/atr-calc"
import type {
	CalibrationRecord,
	UpsertCalibrationInput,
} from "@/lib/hawks/action-types"
import type { ActionResponse } from "@/types"

const guardAdmin = async () => {
	const user = await getCurrentUser()
	if (!user) return { admin: false as const, user: null }
	const row = await db.query.users.findFirst({
		where: eq(users.id, user.id),
		columns: { id: true, isAdmin: true, role: true },
	})
	if (!row || !(row.isAdmin || row.role === "admin")) {
		return { admin: false as const, user }
	}
	return { admin: true as const, user }
}

const toRecord = (row: typeof hawksGlobalCalibrations.$inferSelect): CalibrationRecord => ({
	id: row.id,
	weekStart: row.weekStart.toISOString(),
	assetSymbol: row.assetSymbol,
	timeframeMinutes: row.timeframeMinutes,
	rValue: row.rValue,
	atrReading: row.atrReading,
	notes: row.notes,
})

const upsertHawksCalibration = async (
	input: UpsertCalibrationInput
): Promise<ActionResponse<CalibrationRecord>> => {
	const t = await getTranslations("hawksCalibration")
	try {
		const guard = await guardAdmin()
		if (!guard.admin) return { status: "error", message: t("errors.adminOnly") }

		const weekStart = startOfIsoWeek(
			input.weekStart ? new Date(input.weekStart) : new Date()
		)

		const existing = await db.query.hawksGlobalCalibrations.findFirst({
			where: and(
				eq(hawksGlobalCalibrations.weekStart, weekStart),
				eq(hawksGlobalCalibrations.assetSymbol, input.assetSymbol),
				eq(hawksGlobalCalibrations.timeframeMinutes, input.timeframeMinutes)
			),
		})

		const payload = {
			rValue: input.rValue,
			atrReading: input.atrReading ?? null,
			notes: input.notes ?? null,
			updatedAt: new Date(),
		}

		let row
		if (existing) {
			const [updated] = await db
				.update(hawksGlobalCalibrations)
				.set(payload)
				.where(eq(hawksGlobalCalibrations.id, existing.id))
				.returning()
			row = updated
		} else {
			const [inserted] = await db
				.insert(hawksGlobalCalibrations)
				.values({
					weekStart,
					assetSymbol: input.assetSymbol,
					timeframeMinutes: input.timeframeMinutes,
					createdBy: guard.user.id,
					...payload,
				})
				.returning()
			row = inserted
		}

		revalidatePath("/settings")

		return {
			status: "success",
			message: t("actions.saved"),
			data: toRecord(row),
		}
	} catch (error) {
		console.error("Failed to upsert hawks calibration:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

const listHawksCalibrations = async (
	limit = 26
): Promise<ActionResponse<CalibrationRecord[]>> => {
	const t = await getTranslations("hawksCalibration")
	try {
		const rows = await db.query.hawksGlobalCalibrations.findMany({
			orderBy: [desc(hawksGlobalCalibrations.weekStart)],
			limit,
		})

		return {
			status: "success",
			message: t("actions.listed"),
			data: rows.map(toRecord),
		}
	} catch (error) {
		console.error("Failed to list hawks calibrations:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

export { upsertHawksCalibration, listHawksCalibrations }
