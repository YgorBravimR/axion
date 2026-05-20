import type { TradingAccount } from "@/db/schema"

/**
 * Returns the effective "now" date for a given account.
 *
 * Historically this branched on `accountType === "replay"` to read a stored
 * replay date. Replay account mode was deprecated; the helper survives as the
 * single chokepoint that any feature can swap to a stored/virtual clock if a
 * similar mode is reintroduced. Callers don't need to change when that happens.
 */
const getEffectiveDate = (_account: TradingAccount | null): Date => {
	return new Date()
}

/**
 * Returns the effective date, with an optional override (e.g. from URL search params).
 * Priority: overrideDate > real now.
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
 * Server-side convenience: returns the effective date as a Promise to match
 * the original async signature; callers already await it.
 */
const getServerEffectiveNow = async (): Promise<Date> => {
	return getEffectiveDate(null)
}

export { getEffectiveDate, getEffectiveDateWithOverride, getServerEffectiveNow }
