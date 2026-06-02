"use server"

import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, gte, desc } from "drizzle-orm"
import { subDays } from "date-fns"
import { requireAuth } from "@/app/actions/auth"
import { getActiveHawksAccount } from "@/lib/hawks/account-context"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { detectAllHawksPatterns } from "@/lib/coaching/hawks-pattern-detector"
import type { TradeForHawks } from "@/lib/coaching/hawks-types"
import type { ActionResponse } from "@/types"
import type { HawksCoachingResult } from "./hawks-coaching.types"
import { toSafeErrorMessage } from "@/lib/error-utils"

export const getHawksCoachingInsights = async (
	days = 90
): Promise<ActionResponse<HawksCoachingResult>> => {
	try {
		await requireAuth()
		const hawks = await getActiveHawksAccount()
		if (!hawks) {
			return {
				status: "success",
				message: "Account is not in Hawks mode",
				data: { insights: [], tradeCount: 0, periodDays: days },
			}
		}

		const safeDays = Math.max(1, Math.min(365, Math.floor(days)))
		const effectiveNow = await getServerEffectiveNow()
		const dateFrom = subDays(effectiveNow, safeDays)

		const rows = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, hawks.accountId),
				eq(trades.isArchived, false),
				gte(trades.entryDate, dateFrom)
			),
			with: {
				strategy: { columns: { name: true } },
				hawksMetadata: true,
				stopAuditEvents: {
					columns: { methodViolation: true, directionVsPosition: true },
				},
			},
			orderBy: [desc(trades.entryDate)],
		})

		const hawksTrades: TradeForHawks[] = rows.map((row) => ({
			entryDate: new Date(row.entryDate),
			exitDate: row.exitDate ? new Date(row.exitDate) : null,
			pnl: row.pnl,
			outcome: row.outcome as "win" | "loss" | "breakeven" | null,
			realizedRMultiple: row.realizedRMultiple,
			asset: row.asset,
			direction: row.direction,
			strategyName: row.strategy?.name ?? null,
			setupRank: row.setupRank as "A" | "AA" | "AAA" | null,
			rating: row.rating as "A" | "B" | "C" | "D" | "F" | null,
			followedPlan: row.followedPlan,
			commission: row.commission,
			fees: row.fees,
			tripleScreenConfirmed: row.hawksMetadata.tripleScreenConfirmed,
			biasAtEntry: row.hawksMetadata.biasAtEntry,
			dailyTradeOrdinal: row.hawksMetadata.dailyTradeOrdinal,
			stopEvents: row.stopAuditEvents.map((e) => ({
				methodViolation: e.methodViolation,
				directionVsPosition: e.directionVsPosition,
			})),
		}))

		const insights = detectAllHawksPatterns(hawksTrades)

		return {
			status: "success",
			message: "Hawks coaching insights computed",
			data: { insights, tradeCount: hawksTrades.length, periodDays: safeDays },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to compute Hawks coaching insights",
			errors: [
				{
					code: "HAWKS_COACHING_FAILED",
					detail: toSafeErrorMessage(error, "getHawksCoachingInsights"),
				},
			],
		}
	}
}
