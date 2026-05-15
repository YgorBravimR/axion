"use client"

import { useMemo, useState, useEffect } from "react"
import { useLocale } from "next-intl"
import { useSession } from "next-auth/react"
import type { Locale } from "@/i18n/config"
import {
	formatCurrency,
	formatCurrencyWithSign,
	formatNumber,
	formatPercent,
	formatRMultiple,
	formatDateLocale,
	formatDateTimeLocale,
	formatShortDate,
	formatFullDate,
	formatMonthYear,
	getRelativeTimeLocale,
	formatTime,
	formatHourOfDay,
	formatCompactCurrency,
	formatCompactCurrencyWithSign,
	formatBrlWithSign,
	formatBrlCompactWithSign,
} from "@/lib/formatting"
import { getAccountCurrency } from "@/app/actions/auth"

/**
 * Hook that provides locale-aware formatting functions
 * Uses the current locale from next-intl context
 * Currency formatters default to account currency from session
 */
export const useFormatting = () => {
	const locale = useLocale() as Locale
	const session = useSession()
	const [accountCurrency, setAccountCurrency] = useState<string>("BRL")

	// Fetch account currency when session is ready
	useEffect(() => {
		if (session?.data?.user?.id) {
			getAccountCurrency()
				.then(setAccountCurrency)
				.catch(() => {
					// Silently fall back to BRL on error
					setAccountCurrency("BRL")
				})
		}
	}, [session?.data?.user?.id])

	return useMemo(
		() => ({
			locale,
			accountCurrency,

			// Currency formatting
			formatCurrency: (value: number, currency?: string) =>
				formatCurrency(value, locale, currency),

			formatCurrencyWithSign: (value: number, currency?: string) =>
				formatCurrencyWithSign(value, locale, currency),

			// Compact currency formatting (uses accountCurrency as default)
			formatCompactCurrency: (value: number, currency?: string) =>
				formatCompactCurrency(value, currency ?? accountCurrency),

			formatCompactCurrencyWithSign: (value: number, currency?: string) =>
				formatCompactCurrencyWithSign(value, currency ?? accountCurrency),

			formatBrlWithSign: (value: number, currency?: string) =>
				formatBrlWithSign(value, currency ?? accountCurrency),

			formatBrlCompactWithSign: (value: number, currency?: string) =>
				formatBrlCompactWithSign(value, currency ?? accountCurrency),

			// Number formatting
			formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
				formatNumber(value, locale, options),

			formatPercent: (value: number, decimals?: number) =>
				formatPercent(value, locale, decimals),

			formatRMultiple: (value: number) => formatRMultiple(value, locale),

			// Date formatting
			formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) =>
				formatDateLocale(date, locale, options),

			formatDateTime: (date: Date) => formatDateTimeLocale(date, locale),

			formatShortDate: (date: Date) => formatShortDate(date, locale),

			formatFullDate: (date: Date) => formatFullDate(date, locale),

			formatMonthYear: (date: Date) => formatMonthYear(date, locale),

			getRelativeTime: (date: Date) => getRelativeTimeLocale(date, locale),

			formatTime: (date: Date) => formatTime(date, locale),

			formatHourOfDay: (hour: number) => formatHourOfDay(hour, locale),
		}),
		[locale, accountCurrency]
	)
}
