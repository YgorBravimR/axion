"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

interface EffectiveDateContextValue {
	effectiveDate: Date
}

const EffectiveDateContext = createContext<EffectiveDateContextValue | null>(null)

interface EffectiveDateProviderProps {
	date: string
	children: ReactNode
}

/**
 * Provides the effective "today" date to all client components.
 * For replay accounts this is the simulated date; for normal accounts it's the real date.
 * The date is resolved on the server and passed as an ISO string to avoid hydration mismatches.
 */
const EffectiveDateProvider = ({ date, children }: EffectiveDateProviderProps) => {
	const value = useMemo<EffectiveDateContextValue>(
		() => ({ effectiveDate: new Date(date) }),
		[date]
	)

	return (
		<EffectiveDateContext.Provider value={value}>
			{children}
		</EffectiveDateContext.Provider>
	)
}

/**
 * Returns the effective "today" date from context.
 * Drop-in replacement for `new Date()` in client components that need business-logic "now".
 */
const useEffectiveDate = (): Date => {
	const context = useContext(EffectiveDateContext)
	if (!context) {
		throw new Error("useEffectiveDate must be used within an EffectiveDateProvider")
	}
	return context.effectiveDate
}

export { EffectiveDateProvider, useEffectiveDate }
