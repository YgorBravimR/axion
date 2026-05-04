"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { hawksStopAudit, trades } from "@/db/schema"
import { getCurrentAccount } from "@/app/actions/auth"
import {
	isStopMovementViolation,
	type LogStopChangeInput,
	type StopAuditRecord,
} from "@/lib/hawks/stop-audit"
import type { ActionResponse } from "@/types"

const guardTradeOwnership = async (tradeId: string): Promise<boolean> => {
	const account = await getCurrentAccount()
	if (!account) return false
	const trade = await db.query.trades.findFirst({
		where: eq(trades.id, tradeId),
	})
	return trade?.accountId === account.id
}

const logHawksStopChange = async (
	input: LogStopChangeInput
): Promise<ActionResponse<StopAuditRecord>> => {
	const t = await getTranslations("hawksStopAudit")
	try {
		if (!(await guardTradeOwnership(input.tradeId))) {
			return { status: "error", message: t("errors.unauthorized") }
		}

		const violation = isStopMovementViolation({
			oldStop: input.oldStop,
			newStop: input.newStop,
			direction: input.direction,
		})

		const [row] = await db
			.insert(hawksStopAudit)
			.values({
				tradeId: input.tradeId,
				oldStop: input.oldStop,
				newStop: input.newStop,
				direction: input.direction,
				violation,
			})
			.returning()

		revalidatePath(`/journal/${input.tradeId}`)

		return {
			status: "success",
			message: violation ? t("actions.savedViolation") : t("actions.saved"),
			data: {
				id: row.id,
				tradeId: row.tradeId,
				changedAt: row.changedAt.toISOString(),
				oldStop: row.oldStop,
				newStop: row.newStop,
				direction: row.direction as "long" | "short",
				violation: row.violation,
			},
		}
	} catch (error) {
		console.error("Failed to log hawks stop change:", error)
		return { status: "error", message: t("errors.saveFailed") }
	}
}

const fetchHawksStopAudit = async (
	tradeId: string
): Promise<ActionResponse<StopAuditRecord[]>> => {
	const t = await getTranslations("hawksStopAudit")
	try {
		if (!(await guardTradeOwnership(tradeId))) {
			return { status: "error", message: t("errors.unauthorized") }
		}
		const rows = await db.query.hawksStopAudit.findMany({
			where: eq(hawksStopAudit.tradeId, tradeId),
			orderBy: [desc(hawksStopAudit.changedAt)],
		})
		return {
			status: "success",
			message: t("actions.retrieved"),
			data: rows.map((row) => ({
				id: row.id,
				tradeId: row.tradeId,
				changedAt: row.changedAt.toISOString(),
				oldStop: row.oldStop,
				newStop: row.newStop,
				direction: row.direction as "long" | "short",
				violation: row.violation,
			})),
		}
	} catch (error) {
		console.error("Failed to fetch hawks stop audit:", error)
		return { status: "error", message: t("errors.fetchFailed") }
	}
}

export { logHawksStopChange, fetchHawksStopAudit }
