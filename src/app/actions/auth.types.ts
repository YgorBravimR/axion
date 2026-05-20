import type { User } from "@/db/schema"

/** User type without passwordHash — safe to send to the client */
export type SafeUser = Omit<User, "passwordHash">

interface AccountPickerItem {
	id: string
	name: string
	accountType: string
	isDefault: boolean
}

interface AuthContext {
	userId: string
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

export type { AccountPickerItem, AuthContext }
