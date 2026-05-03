"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksScenarioOnTrade, trades } from "@/db/schema"
import { getCurrentAccount } from "@/app/actions/auth"
import type { ActionResponse } from "@/types"

interface ScenarioRecord {
	id: string
	tradeId: string
	scenarioCode: number | null
	elliottWave: string | null
	pullbackLevel: string | null
	confluencia: string[]
	mmaAligned: string | null
}

interface UpsertScenarioInput {
	tradeId: string
	scenarioCode: number | null
	elliottWave?: string | null
	pullbackLevel?: string | null
	confluencia?: string[]
	mmaAligned?: string | null
}

const guardTradeOwnership = async (tradeId: string): Promise<boolean> => {
	const account = await getCurrentAccount()
	if (!account) return false
	const trade = await db.query.trades.findFirst({
		where: eq(trades.id, tradeId),
	})
	return trade?.accountId === account.id
}

const fetchHawksScenario = async (
	tradeId: string
): Promise<ActionResponse<ScenarioRecord | null>> => {
	const t = await getTranslations("hawksScenario")
	try {
		if (!(await guardTradeOwnership(tradeId))) {
			return { status: "error", message: t("errors.unauthorized") }
		}
		const row = await db.query.hawksScenarioOnTrade.findFirst({
			where: eq(hawksScenarioOnTrade.tradeId, tradeId),
		})
		if (!row) {
			return { status: "success", message: t("actions.empty"), data: null }
		}
		return {
			status: "success",
			message: t("actions.retrieved"),
			data: {
				id: row.id,
				tradeId: row.tradeId,
				scenarioCode: row.scenarioCode,
				elliottWave: row.elliottWave,
				pullbackLevel: row.pullbackLevel,
				confluencia: (row.confluencia as string[]) ?? [],
				mmaAligned: row.mmaAligned,
			},
		}
	} catch (error) {
		console.error("Failed to fetch hawks scenario:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

const upsertHawksScenario = async (
	input: UpsertScenarioInput
): Promise<ActionResponse<ScenarioRecord>> => {
	const t = await getTranslations("hawksScenario")
	try {
		if (!(await guardTradeOwnership(input.tradeId))) {
			return { status: "error", message: t("errors.unauthorized") }
		}

		const existing = await db.query.hawksScenarioOnTrade.findFirst({
			where: eq(hawksScenarioOnTrade.tradeId, input.tradeId),
		})

		const payload = {
			scenarioCode: input.scenarioCode,
			elliottWave: input.elliottWave ?? null,
			pullbackLevel: input.pullbackLevel ?? null,
			confluencia: input.confluencia ?? [],
			mmaAligned: input.mmaAligned ?? null,
		}

		let row
		if (existing) {
			const [updated] = await db
				.update(hawksScenarioOnTrade)
				.set(payload)
				.where(eq(hawksScenarioOnTrade.id, existing.id))
				.returning()
			row = updated
		} else {
			const [inserted] = await db
				.insert(hawksScenarioOnTrade)
				.values({
					tradeId: input.tradeId,
					...payload,
				})
				.returning()
			row = inserted
		}

		revalidatePath("/journal")
		revalidatePath(`/journal/${input.tradeId}`)

		return {
			status: "success",
			message: t("actions.saved"),
			data: {
				id: row.id,
				tradeId: row.tradeId,
				scenarioCode: row.scenarioCode,
				elliottWave: row.elliottWave,
				pullbackLevel: row.pullbackLevel,
				confluencia: (row.confluencia as string[]) ?? [],
				mmaAligned: row.mmaAligned,
			},
		}
	} catch (error) {
		console.error("Failed to upsert hawks scenario:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

export { fetchHawksScenario, upsertHawksScenario }
export type { ScenarioRecord, UpsertScenarioInput }
