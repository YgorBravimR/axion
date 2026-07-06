/**
 * DB helper for the Hawks never-red daily governor. This is the single DRY seam
 * both live-status call sites use (the live-trading-status action and the
 * circuit-breaker route) so the governor stop is computed once, one way.
 *
 * Mirrors src/lib/hawks/cascade.ts: gates on Hawks mode, JOINs
 * tradeHawksMetadata -> trades to pull per-trade rOutcome for the day, and only
 * counts CLOSED trades (exitDate + rOutcome present). Returns null when the
 * account is not in Hawks mode — callers then leave existing behavior untouched.
 */

import { and, eq, gte, lt, isNull, isNotNull } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { accountModes, trades, tradeHawksMetadata } from "@/db/schema"
import { formatDateKey, BRT_OFFSET } from "@/lib/dates"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import {
	resolveHawksDailyGovernor,
	type GovernorResult,
	type GovernorTrade,
} from "@/lib/hawks/daily-governor"
import type { LiveTradingStatus } from "@/types/live-trading-status"

/**
 * Resolve the governor state for an account on a trading day.
 * Returns null when the account is not in Hawks mode, or when the day has no
 * resolvable plan (no target). Fail-open: on any DB error, returns null so the
 * existing loss cap + cascade net remain the safety layer (never a wrong stop).
 */
async function getHawksDailyGovernorStatus(
	accountId: string,
	tradingDay: Date
): Promise<GovernorResult | null> {
	try {
		const activeMode = await db.query.accountModes.findFirst({
			where: and(
				eq(accountModes.accountId, accountId),
				isNull(accountModes.deactivatedAt)
			),
			columns: { mode: true },
		})
		if (activeMode?.mode !== "hawks") {
			return null
		}

		const day = await resolveDay(accountId, tradingDay)
		if (!day) {
			return null
		}
		const dailyTargetR = Number(day.dailyTargetR.value)
		if (!Number.isFinite(dailyTargetR) || dailyTargetR <= 0) {
			return null
		}

		const dayStart = new Date(
			`${formatDateKey(tradingDay)}T00:00:00${BRT_OFFSET}`
		)
		const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

		// tradeHawksMetadata has no accountId — JOIN through trades. Closed trades
		// only (realized R): isNotNull(exitDate) + isNotNull(rOutcome).
		const rows = await db
			.select({
				rOutcome: trades.rOutcome,
				outcome: trades.outcome,
				entryDate: trades.entryDate,
			})
			.from(tradeHawksMetadata)
			.innerJoin(trades, eq(trades.id, tradeHawksMetadata.tradeId))
			.where(
				and(
					eq(trades.accountId, accountId),
					gte(trades.entryDate, dayStart),
					lt(trades.entryDate, dayEnd),
					isNotNull(trades.exitDate),
					isNotNull(trades.rOutcome),
					eq(trades.isArchived, false)
				)
			)
			.orderBy(trades.entryDate)

		const governorTrades: GovernorTrade[] = rows.map((row) => ({
			rOutcome: Number(row.rOutcome ?? 0),
			outcome: row.outcome as GovernorTrade["outcome"],
		}))

		return resolveHawksDailyGovernor({
			trades: governorTrades,
			dailyTargetR,
		})
	} catch (error) {
		console.error(
			`[hawks-daily-governor] failed for account ${accountId}:`,
			error instanceof Error ? error.message : String(error)
		)
		return null
	}
}

/**
 * Compose a governor result into a LiveTradingStatus IN PLACE, applying the D3
 * rules. Single source of truth for the merge so all live-status call sites
 * behave identically. No-op when governor is null (non-Hawks account).
 *
 * D3: for Hawks, the governor owns post-target and never-red stops. Hitting the
 * daily target is a milestone, not an exit — so a cents-based
 * "dailyTargetReached" stop is cleared unless the governor itself stops.
 */
function applyGovernorToStatus(
	status: LiveTradingStatus,
	governor: GovernorResult | null
): void {
	if (!governor) {
		return
	}
	status.hawksGovernor = {
		phase: governor.phase,
		totalR: governor.totalR,
		cushion: governor.cushion,
		armed: governor.armed,
	}
	if (governor.shouldStop) {
		status.shouldStopTrading = true
		status.stopReason = governor.stopReason
	} else if (status.stopReason === "dailyTargetReached") {
		status.shouldStopTrading = false
		status.stopReason = null
	}
}

export { getHawksDailyGovernorStatus, applyGovernorToStatus }
