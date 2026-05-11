export type EquityCurveMode = "daily" | "trade"

interface AccountFilter {
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

export type { AccountFilter }
