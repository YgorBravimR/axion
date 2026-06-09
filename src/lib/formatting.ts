import type { Locale } from "@/i18n/config"
import { APP_TIMEZONE } from "@/lib/dates"

/**
 * Locale to BCP 47 language tag mapping
 */
const localeMap: Record<Locale, string> = {
	"pt-BR": "pt-BR",
	"en": "en-US",
}

/**
 * Currency mapping for each locale
 */
const localeCurrency: Record<Locale, string> = {
	"pt-BR": "BRL",
	"en": "USD",
}

/**
 * Format currency value according to locale
 */
export const formatCurrency = (
	value: number,
	locale: Locale,
	currency?: string
): string => {
	const currencyCode = currency || localeCurrency[locale]
	return new Intl.NumberFormat(localeMap[locale], {
		style: "currency",
		currency: currencyCode,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value)
}

/**
 * Format currency value with sign (+ or -)
 */
export const formatCurrencyWithSign = (
	value: number,
	locale: Locale,
	currency?: string
): string => {
	const formatted = formatCurrency(Math.abs(value), locale, currency)
	if (value > 0) {
		return `+${formatted}`
	}
	if (value < 0) {
		return `-${formatted}`
	}
	return formatted
}

/**
 * Format number according to locale (with thousands separator)
 */
export const formatNumber = (
	value: number,
	locale: Locale,
	options?: Intl.NumberFormatOptions
): string => {
	const defaultOptions: Intl.NumberFormatOptions = {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}
	return new Intl.NumberFormat(
		localeMap[locale],
		options || defaultOptions
	).format(value)
}

/**
 * Format a percentage according to the supplied locale.
 *
 * **Input convention**: 0-100 scale (e.g., 60 → "60.0%"), NOT 0-1 decimal.
 * Callers compute percentages as `(part / whole) * 100` upstream; the formatter
 * then divides by 100 once internally because `Intl.NumberFormat` with
 * `style: "percent"` multiplies by 100 — the divide-then-multiply round-trip
 * is intentional, do not "simplify" it away.
 *
 * Rounding: `Intl.NumberFormat` halfExpand (half away from zero) — differs from
 * `.toFixed()` (banker's rounding). Stay on this formatter for user-facing
 * percentages; `.toFixed()` is acceptable only for chart labels and PDF static
 * renders.
 *
 * @param value - percentage on 0-100 scale
 * @param locale - locale for number formatting
 * @param decimals - decimal places (default 1)
 */
export const formatPercent = (
	value: number,
	locale: Locale,
	decimals = 1
): string => {
	return new Intl.NumberFormat(localeMap[locale], {
		style: "percent",
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(value / 100)
}

/**
 * Format R multiple (e.g., +2.5R, -1.2R)
 */
export const formatRMultiple = (value: number, locale: Locale): string => {
	const formatted = formatNumber(Math.abs(value), locale, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 2,
	})
	if (value > 0) {
		return `+${formatted}R`
	}
	if (value < 0) {
		return `-${formatted}R`
	}
	return `${formatted}R`
}

/**
 * Format date according to locale
 */
export const formatDateLocale = (
	date: Date,
	locale: Locale,
	options?: Intl.DateTimeFormatOptions
): string => {
	const defaultOptions: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "short",
		day: "numeric",
	}
	return new Intl.DateTimeFormat(localeMap[locale], {
		...(options || defaultOptions),
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format date and time according to locale
 */
export const formatDateTimeLocale = (date: Date, locale: Locale): string => {
	return new Intl.DateTimeFormat(localeMap[locale], {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format short date according to locale (e.g., "24/01" for pt-BR, "01/24" for en)
 */
export const formatShortDate = (date: Date, locale: Locale): string => {
	return new Intl.DateTimeFormat(localeMap[locale], {
		month: "2-digit",
		day: "2-digit",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format full date according to locale
 */
export const formatFullDate = (date: Date, locale: Locale): string => {
	return new Intl.DateTimeFormat(localeMap[locale], {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format month and year according to locale
 */
export const formatMonthYear = (date: Date, locale: Locale): string => {
	return new Intl.DateTimeFormat(localeMap[locale], {
		year: "numeric",
		month: "long",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Get relative time string according to locale (e.g., "2 days ago")
 */
export const getRelativeTimeLocale = (date: Date, locale: Locale): string => {
	const rtf = new Intl.RelativeTimeFormat(localeMap[locale], {
		numeric: "auto",
	})
	const now = new Date()
	const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000)

	const intervals = [
		{ unit: "year" as const, seconds: 31536000 },
		{ unit: "month" as const, seconds: 2592000 },
		{ unit: "week" as const, seconds: 604800 },
		{ unit: "day" as const, seconds: 86400 },
		{ unit: "hour" as const, seconds: 3600 },
		{ unit: "minute" as const, seconds: 60 },
	]

	for (const interval of intervals) {
		const count = Math.floor(diffInSeconds / interval.seconds)
		if (Math.abs(count) >= 1) {
			return rtf.format(count, interval.unit)
		}
	}

	return rtf.format(0, "second")
}

/**
 * Get day of week name according to locale
 */
export const getDayOfWeekName = (
	dayIndex: number,
	locale: Locale,
	format: "long" | "short" | "narrow" = "long"
): string => {
	const date = new Date(2024, 0, dayIndex) // January 2024 starts on Monday, so offset
	// Adjust for Sunday-based index
	date.setDate(date.getDate() + dayIndex)
	return new Intl.DateTimeFormat(localeMap[locale], { weekday: format }).format(
		date
	)
}

/**
 * Get month name according to locale
 */
export const getMonthName = (
	monthIndex: number,
	locale: Locale,
	format: "long" | "short" | "narrow" = "long"
): string => {
	const date = new Date(2024, monthIndex, 1)
	return new Intl.DateTimeFormat(localeMap[locale], { month: format }).format(
		date
	)
}

/**
 * Format time according to locale
 */
export const formatTime = (date: Date, locale: Locale): string => {
	return new Intl.DateTimeFormat(localeMap[locale], {
		hour: "numeric",
		minute: "2-digit",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format hour of day (e.g., "09:00" for pt-BR, "9:00 AM" for en)
 */
export const formatHourOfDay = (hour: number, locale: Locale): string => {
	const date = new Date()
	date.setHours(hour, 0, 0, 0)
	return new Intl.DateTimeFormat(localeMap[locale], {
		hour: "numeric",
		minute: "2-digit",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format currency in compact form for charts (e.g., $10K, $1.5M)
 * @param value - numeric value to format
 * @param currency - currency code (e.g., "BRL", "USD"); defaults to "BRL"
 */
export const formatCompactCurrency = (
	value: number,
	currency: string = "BRL"
): string => {
	const absValue = Math.abs(value)
	const sign = value < 0 ? "-" : ""

	// Use Intl.NumberFormat for locale-aware compact formatting
	const formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		notation: "compact",
		maximumFractionDigits: 1,
	})

	// Format absolute value, then apply sign
	const formatted = formatter.format(absValue)
	return `${sign}${formatted}`.replace(/^--/, "-")
}

/**
 * Format currency with sign for charts (e.g., +$1.5K, -$500)
 * @param value - numeric value to format
 * @param currency - currency code (e.g., "BRL", "USD"); defaults to "BRL"
 */
export const formatCompactCurrencyWithSign = (
	value: number,
	currency: string = "BRL"
): string => {
	const formatted = formatCompactCurrency(Math.abs(value), currency)
	if (value > 0) {
		return `+${formatted}`
	}
	if (value < 0) {
		return formatted // Already has minus from formatCompactCurrency
	}
	return formatted
}

/**
 * Format percentage for charts (e.g., +15.2%, -3.5%)
 */
export const formatChartPercent = (value: number, showSign = true): string => {
	const sign = showSign && value > 0 ? "+" : ""
	return `${sign}${value.toFixed(1)}%`
}

/**
 * Format ratio for display (handles infinity)
 */
export const formatRatio = (value: number): string => {
	if (!Number.isFinite(value)) {
		return "∞"
	}
	return value.toFixed(2)
}

/**
 * Returns `value.toFixed(decimals)` for finite numbers, otherwise the fallback
 * string. Guards against IEEE 754 Infinity / -Infinity / NaN leaking into
 * user-facing display (e.g., profit factor with zero losses → Infinity).
 *
 * @param value - numeric value to format
 * @param decimals - decimal places (default 2)
 * @param fallback - string to render when value is not finite (default "—")
 */
export const formatFinite = (
	value: number,
	decimals = 2,
	fallback = "—"
): string => (Number.isFinite(value) ? value.toFixed(decimals) : fallback)

/**
 * Format currency with sign prefix (e.g., +R$ 1.234,56 or -$ 500,00)
 * Used in journal and analytics components for P&L display
 * @param value - numeric value to format
 * @param currency - currency code (e.g., "BRL", "USD"); defaults to "BRL"
 */
export const formatBrlWithSign = (
	value: number,
	currency: string = "BRL"
): string => {
	const prefix = value >= 0 ? "+" : ""
	const locale = currency === "BRL" ? "pt-BR" : "en-US"
	return `${prefix}${new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Math.abs(value))}`
}

/**
 * Format R-multiple for compact display (e.g., +2.30R, -1.00R)
 * Used in Monte Carlo and analytics components for R-based displays
 */
export const formatR = (value: number): string => {
	const sign = value > 0 ? "+" : ""
	return `${sign}${value.toFixed(2)}R`
}

/**
 * Format currency in compact form with sign (e.g., +R$1.5K, -$500)
 * Used in analytics components for chart tooltips and compact displays
 * @param value - numeric value to format
 * @param currency - currency code (e.g., "BRL", "USD"); defaults to "BRL"
 */
export const formatBrlCompactWithSign = (
	value: number,
	currency: string = "BRL"
): string => {
	const formatted = formatCompactCurrencyWithSign(value, currency)
	return formatted
}
