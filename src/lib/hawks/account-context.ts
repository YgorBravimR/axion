import { cache } from "react"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { accountModes, dailyHawksBias } from "@/db/schema"
import type { AccountMode, DailyHawksBias } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"

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

export { getActiveAccountModeForUser, getActiveHawksAccount, getDailyHawksBias }
export type { ActiveHawksAccount }
