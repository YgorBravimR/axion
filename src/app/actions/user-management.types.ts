export interface UserAccount {
	id: string
	name: string
	accountType: string
	isDefault: boolean
	isActive: boolean
}

export interface UserWithAccounts {
	id: string
	name: string
	email: string
	role: "admin" | "premium" | "trader" | "viewer"
	image: string | null
	createdAt: Date
	tradingAccounts: UserAccount[]
}
