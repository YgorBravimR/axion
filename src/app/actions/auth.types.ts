import type { User } from "@/db/schema"

/** User type without passwordHash — safe to send to the client */
export type SafeUser = Omit<User, "passwordHash">

interface AccountPickerItem {
	id: string
	name: string
	accountType: string
	isDefault: boolean
	/**
	 * Today's net P&L (BRL, NOT cents) for this account. `null` when there are
	 * no trades today. Surfaced in the login picker so multi-account users see
	 * which account they were last working on.
	 */
	todayPnl: number | null
	/**
	 * 7-day cumulative equity slice ending today. Values are in BRL and ordered
	 * oldest-first (index 0 = 6 days ago, index 6 = today). Always 7 entries;
	 * missing-trade days carry the previous balance. `null` when the account
	 * has zero recent activity (sparkline degrades gracefully).
	 */
	sparkline: number[] | null
}

interface AuthContext {
	userId: string
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

export type { AccountPickerItem, AuthContext }
