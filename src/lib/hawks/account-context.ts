import { cache } from "react"
import { and, eq, isNull, max, gte, lt } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	accountModes,
	dailyHawksBias,
	trades,
	tradeHawksMetadata,
} from "@/db/schema"
import type { AccountMode, DailyHawksBias } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { BRT_OFFSET } from "@/lib/dates"

interface ActiveHawksAccount {
	accountId: string
	userId: string
	activatedAt: Date
}

const getActiveAccountModeForUser = cache(
	async (): Promise<AccountMode["mode"]> => {
		const { accountId, userId } = await requireAuth()
		const active = await db.query.accountModes.findFirst({
			where: and(
				eq(accountModes.accountId, accountId),
				eq(accountModes.userId, userId),
				isNull(accountModes.deactivatedAt)
			),
			columns: { mode: true },
		})
		return active?.mode ?? "default"
	}
)

const getActiveHawksAccount = cache(
	async (): Promise<ActiveHawksAccount | null> => {
		const { accountId, userId } = await requireAuth()
		const active = await db.query.accountModes.findFirst({
			where: and(
				eq(accountModes.accountId, accountId),
				eq(accountModes.userId, userId),
				isNull(accountModes.deactivatedAt)
			),
			columns: { mode: true, activatedAt: true },
		})
		if (active?.mode !== "hawks") {
			return null
		}
		return { accountId, userId, activatedAt: active.activatedAt }
	}
)

const getDailyHawksBias = cache(
	async (tradingDay: string): Promise<DailyHawksBias | null> => {
		const hawks = await getActiveHawksAccount()
		if (!hawks) {
			return null
		}
		const row = await db.query.dailyHawksBias.findFirst({
			where: and(
				eq(dailyHawksBias.accountId, hawks.accountId),
				eq(dailyHawksBias.tradingDay, tradingDay)
			),
		})
		return row ?? null
	}
)

const getDayBounds = (tradingDay: string) => {
	const dayStart = new Date(`${tradingDay}T00:00:00${BRT_OFFSET}`)
	// dayEnd is next-day midnight BRT — used with lt() for exclusive upper bound
	const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
	return { dayStart, dayEnd }
}

const getHawksDailyOrdinal = cache(
	async (tradingDay: string): Promise<number> => {
		const hawks = await getActiveHawksAccount()
		if (!hawks) {
			return 0
		}

		const { dayStart, dayEnd } = getDayBounds(tradingDay)

		const result = await db
			.select({ maxOrdinal: max(tradeHawksMetadata.dailyTradeOrdinal) })
			.from(tradeHawksMetadata)
			.innerJoin(trades, eq(trades.id, tradeHawksMetadata.tradeId))
			.where(
				and(
					eq(trades.accountId, hawks.accountId),
					gte(trades.entryDate, dayStart),
					lt(trades.entryDate, dayEnd),
					eq(trades.isArchived, false)
				)
			)

		return Number(result[0]?.maxOrdinal ?? 0)
	}
)

export {
	getActiveAccountModeForUser,
	getActiveHawksAccount,
	getDailyHawksBias,
	getHawksDailyOrdinal,
}
export type { ActiveHawksAccount }
