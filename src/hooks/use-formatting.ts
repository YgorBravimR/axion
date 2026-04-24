"use client"

import { useMemo } from "react"
import { useLocale } from "next-intl"
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
} from "@/lib/formatting"

/**
 * Hook that provides locale-aware formatting functions
 * Uses the current locale from next-intl context
 */
export const useFormatting = () => {
	const locale = useLocale() as Locale

	return useMemo(() => ({
		locale,

		// Currency formatting
		formatCurrency: (value: number, currency?: string) =>
			formatCurrency(value, locale, currency),

		formatCurrencyWithSign: (value: number, currency?: string) =>
			formatCurrencyWithSign(value, locale, currency),

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
	}), [locale])
}
