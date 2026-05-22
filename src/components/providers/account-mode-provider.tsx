"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

type AccountModeValue = "default" | "hawks"

interface AccountModeContextValue {
	mode: AccountModeValue
	isHawks: boolean
	isDefault: boolean
}

const AccountModeContext = createContext<AccountModeContextValue | null>(null)

interface AccountModeProviderProps {
	mode: AccountModeValue
	children: ReactNode
}

/**
 * Provides the active account mode to client components.
 * Mode is server-resolved once at the app shell and passed in; client never fetches.
 * Pair with `useAccountMode()` for boolean checks, or `<ModeVariant />` for declarative swaps.
 */
const AccountModeProvider = ({ mode, children }: AccountModeProviderProps) => {
	const value = useMemo<AccountModeContextValue>(
		() => ({ mode, isHawks: mode === "hawks", isDefault: mode === "default" }),
		[mode]
	)

	return (
		<AccountModeContext.Provider value={value}>
			{children}
		</AccountModeContext.Provider>
	)
}

const useAccountMode = (): AccountModeContextValue => {
	const ctx = useContext(AccountModeContext)
	if (!ctx) {
		throw new Error("useAccountMode must be used within an AccountModeProvider")
	}
	return ctx
}

export {
	AccountModeProvider,
	useAccountMode,
	type AccountModeValue,
	type AccountModeContextValue,
}
