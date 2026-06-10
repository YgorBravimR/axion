"use client"

import { createContext, useContext, type ReactNode } from "react"

const AccountCurrencyContext = createContext<string>("BRL")

interface AccountCurrencyProviderProps {
	currency: string
	children: ReactNode
}

/**
 * Provides the active account's default currency to client components.
 * Server-resolved once at the app shell so client formatters skip the
 * per-mount `getAccountCurrency()` Server Action (one POST per mount × 60+
 * formatter call sites floods dev logs and adds network round-trips).
 */
const AccountCurrencyProvider = ({
	currency,
	children,
}: AccountCurrencyProviderProps) => {
	return (
		<AccountCurrencyContext.Provider value={currency}>
			{children}
		</AccountCurrencyContext.Provider>
	)
}

const useAccountCurrency = (): string => {
	return useContext(AccountCurrencyContext)
}

export { AccountCurrencyProvider, useAccountCurrency }
