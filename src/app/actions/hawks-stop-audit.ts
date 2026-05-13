"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db/drizzle"
import { trades, tradeStopAuditEvents } from "@/db/schema"
import type { TradeStopAuditEvent } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { getActiveHawksAccount } from "@/lib/hawks/account-context"
import { recordStopAuditSchema } from "@/lib/validations/hawks"
import type { RecordStopAuditInput } from "@/lib/validations/hawks"
import type { ActionResponse } from "@/types"
import { toSafeErrorMessage } from "@/lib/error-utils"

export const recordStopAudit = async (
	input: RecordStopAuditInput
): Promise<ActionResponse<TradeStopAuditEvent>> => {
	const t = await getTranslations("hawks")
	try {
		const { accountId } = await requireAuth()
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

		const parsed = recordStopAuditSchema.parse(input)

		const owned = await db.query.trades.findFirst({
			where: and(
				eq(trades.id, parsed.tradeId),
				eq(trades.accountId, accountId)
			),
			columns: { id: true },
		})
		if (!owned) {
			return {
				status: "error",
				message: t("actions.tradeNotFound"),
				errors: [
					{ code: "TRADE_NOT_FOUND", detail: "Trade is not in this account" },
				],
			}
		}

		const [event] = await db
			.insert(tradeStopAuditEvents)
			.values({
				tradeId: parsed.tradeId,
				stopPriceR: parsed.stopPriceR.toString(),
				directionVsPosition: parsed.directionVsPosition,
				methodViolation: parsed.methodViolation,
			})
			.returning()

		return {
			status: "success",
			message: t("actions.stopAuditRecorded"),
			data: event!,
		}
	} catch (error) {
		if (error instanceof Error && error.name === "ZodError") {
			return {
				status: "error",
				message: t("actions.stopAuditValidationFailed"),
				errors: [{ code: "VALIDATION_ERROR", detail: error.message }],
			}
		}
		return {
			status: "error",
			message: t("actions.stopAuditFailed"),
			errors: [
				{
					code: "HAWKS_STOP_AUDIT_FAILED",
					detail: toSafeErrorMessage(error, "recordStopAudit"),
				},
			],
		}
	}
}
