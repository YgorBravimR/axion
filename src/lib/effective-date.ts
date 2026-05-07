import type { TradingAccount } from "@/db/schema"
import { getCurrentAccount } from "@/app/actions/auth"

/**
 * Returns the effective "now" date for a given account.
 * For replay accounts, this is the stored replayCurrentDate.
 * For all other accounts, this is the actual current date.
 */
const getEffectiveDate = (account: TradingAccount | null): Date => {
	if (account?.accountType === "replay" && account.replayCurrentDate) {
		return new Date(account.replayCurrentDate)
	}
	return new Date()
}

/**
 * Returns the effective date, with an optional override (e.g. from URL search params).
 * Priority: overrideDate > replay date > real now
 */
const getEffectiveDateWithOverride = (
	account: TradingAccount | null,
	overrideDate?: Date
): Date => {
	if (overrideDate) {
		return overrideDate
	}
	return getEffectiveDate(account)
}

/**
 * Server-side convenience: fetches the current account and returns the effective date.
 * Use in server actions and server components that need business-logic "today".
 * getCurrentAccount() is cached per-request via NextAuth, so repeated calls are free.
 */
const getServerEffectiveNow = async (): Promise<Date> => {
	const account = await getCurrentAccount()
	return getEffectiveDate(account)
}

export { getEffectiveDate, getEffectiveDateWithOverride, getServerEffectiveNow }
