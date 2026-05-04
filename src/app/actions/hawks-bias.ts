"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksDailyBias } from "@/db/schema"
import { getCurrentAccount } from "@/app/actions/auth"
import type {
	BiasValue,
	DailyBiasRecord,
	UpsertBiasInput,
} from "@/lib/hawks/action-types"
import type { ActionResponse } from "@/types"

const dayBoundaries = (isoDate: string) => {
	const start = new Date(isoDate)
	start.setUTCHours(0, 0, 0, 0)
	const end = new Date(start)
	end.setUTCDate(end.getUTCDate() + 1)
	return { start, end }
}

const fetchHawksDailyBias = async ({
	date,
	assetSymbol,
}: {
	date: string
	assetSymbol: string
}): Promise<ActionResponse<DailyBiasRecord | null>> => {
	const t = await getTranslations("hawksBias")
	try {
		const account = await getCurrentAccount()
		if (!account) return { status: "error", message: t("errors.noAccount") }

		const { start } = dayBoundaries(date)
		const row = await db.query.hawksDailyBias.findFirst({
			where: and(
				eq(hawksDailyBias.accountId, account.id),
				eq(hawksDailyBias.date, start),
				eq(hawksDailyBias.assetSymbol, assetSymbol)
			),
		})

		if (!row) {
			return { status: "success", message: t("actions.empty"), data: null }
		}

		return {
			status: "success",
			message: t("actions.retrieved"),
			data: {
				id: row.id,
				accountId: row.accountId,
				date: row.date.toISOString(),
				assetSymbol: row.assetSymbol,
				bias: row.bias as BiasValue,
				checklist: (row.checklist as Record<string, boolean>) ?? {},
				notes: row.notes,
			},
		}
	} catch (error) {
		console.error("Failed to fetch hawks daily bias:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

const upsertHawksDailyBias = async (
	input: UpsertBiasInput
): Promise<ActionResponse<DailyBiasRecord>> => {
	const t = await getTranslations("hawksBias")
	try {
		const account = await getCurrentAccount()
		if (!account) return { status: "error", message: t("errors.noAccount") }

		const { start } = dayBoundaries(input.date)

		const existing = await db.query.hawksDailyBias.findFirst({
			where: and(
				eq(hawksDailyBias.accountId, account.id),
				eq(hawksDailyBias.date, start),
				eq(hawksDailyBias.assetSymbol, input.assetSymbol)
			),
		})

		const now = new Date()
		const checklist = input.checklist ?? {}
		const notes = input.notes ?? null

		let row
		if (existing) {
			const [updated] = await db
				.update(hawksDailyBias)
				.set({
					bias: input.bias,
					checklist,
					notes,
					updatedAt: now,
				})
				.where(eq(hawksDailyBias.id, existing.id))
				.returning()
			row = updated
		} else {
			const [inserted] = await db
				.insert(hawksDailyBias)
				.values({
					accountId: account.id,
					date: start,
					assetSymbol: input.assetSymbol,
					bias: input.bias,
					checklist,
					notes,
				})
				.returning()
			row = inserted
		}

		revalidatePath("/", "layout")

		return {
			status: "success",
			message: t("actions.saved"),
			data: {
				id: row.id,
				accountId: row.accountId,
				date: row.date.toISOString(),
				assetSymbol: row.assetSymbol,
				bias: row.bias as BiasValue,
				checklist: (row.checklist as Record<string, boolean>) ?? {},
				notes: row.notes,
			},
		}
	} catch (error) {
		console.error("Failed to upsert hawks daily bias:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

export { fetchHawksDailyBias, upsertHawksDailyBias }
