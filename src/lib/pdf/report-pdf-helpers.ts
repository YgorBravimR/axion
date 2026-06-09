import type { Locale } from "@/i18n/config"

/**
 * Pure helper functions used by the React-PDF report templates.
 *
 * Extracted into their own module so they can be unit-tested independently
 * of the @react-pdf/renderer rendering environment.
 *
 * All formatters accept an optional `locale` parameter (defaults to "pt-BR")
 * for locale-aware output. PDF generation calls should thread the user's
 * locale from server-action input.
 */

/**
 * Locale to BCP 47 language tag mapping (same as in formatting.ts)
 */
const localeMap: Record<Locale, string> = {
	"pt-BR": "pt-BR",
	"en": "en-US",
}

/**
 * Currency mapping for each locale (same as in formatting.ts)
 */
const localeCurrency: Record<Locale, string> = {
	"pt-BR": "BRL",
	"en": "USD",
}

/**
 * Formats a monetary value with a "+" prefix for non-negative numbers.
 *
 * @param value - The numeric value in the same unit as the report
 * @param locale - BCP 47 language tag; defaults to "pt-BR" (pt-BR → BRL, en → USD)
 * @returns A locale-formatted string, e.g. "+R$ 1.250,00" or "-$1,300.00"
 */
const formatCurrency = (value: number, locale: Locale = "pt-BR"): string => {
	const prefix = value >= 0 ? "+" : ""
	const currencyCode = localeCurrency[locale]
	const formatted = new Intl.NumberFormat(localeMap[locale], {
		style: "currency",
		currency: currencyCode,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Math.abs(value))
	return `${prefix}${formatted}`
}

/**
 * Formats a percentage value rounded to one decimal place.
 *
 * @param value - The raw percentage value on 0-100 scale (e.g. 66.666… → "66.7%")
 * @param locale - BCP 47 language tag; defaults to "pt-BR" (affects decimal separator)
 * @returns A string with one decimal place and a "%" suffix
 */
const formatPercent = (value: number, locale: Locale = "pt-BR"): string => {
	return new Intl.NumberFormat(localeMap[locale], {
		style: "percent",
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(value / 100)
}

/**
 * Formats an R-multiple value with a "+" prefix for non-negative numbers.
 *
 * @param value - The R-multiple (e.g. 2.5 → "+2.50R", -1 → "-1.00R")
 * @param locale - BCP 47 language tag; defaults to "pt-BR" (affects decimal separator)
 * @returns A string with two decimal places and an "R" suffix
 */
const formatR = (value: number, locale: Locale = "pt-BR"): string => {
	const prefix = value >= 0 ? "+" : "-"
	const formatted = new Intl.NumberFormat(localeMap[locale], {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Math.abs(value))
	return `${prefix}${formatted}R`
}

/**
 * Builds the PDF download filename for a weekly report.
 *
 * The `weekStart` string comes from `WeeklyReport.weekStart` which is an
 * ISO date string in "YYYY-MM-DD" format (e.g. "2026-03-30").
 *
 * @param weekStart - ISO date string for the first day of the report week
 * @returns Filename string, e.g. "axion-weekly-2026-03-30.pdf"
 */
const buildWeeklyPdfFilename = (weekStart: string): string =>
	`axion-weekly-${weekStart}.pdf`

/**
 * Builds the PDF download filename for a monthly report.
 *
 * The `monthStart` string comes from `MonthlyReport.monthStart` which is an
 * ISO date string in "YYYY-MM-DD" format (e.g. "2026-04-01").
 *
 * @param monthStart - ISO date string for the first day of the report month
 * @returns Filename string, e.g. "axion-monthly-2026-04-01.pdf"
 */
const buildMonthlyPdfFilename = (monthStart: string): string =>
	`axion-monthly-${monthStart}.pdf`

/**
 * Parses the `offset` query-string parameter into a safe integer.
 *
 * Rules:
 *   - `null` (parameter absent)  → 0
 *   - Non-numeric string          → NaN  (caller must reject)
 *   - Valid integer string "3"    → 3
 *
 * @param raw - The raw string value from `searchParams.get("offset")`
 * @returns Parsed integer, or NaN if the string is not a valid integer
 */
const parseOffsetParam = (raw: string | null): number =>
	parseInt(raw ?? "0", 10)

/**
 * Validates the `type` query-string parameter for the PDF report endpoint.
 *
 * Only the string literals "weekly" and "monthly" are accepted.
 *
 * @param raw - The raw string value from `searchParams.get("type")`
 * @returns `true` when the value is a valid report type, `false` otherwise
 */
const isValidReportType = (raw: string | null): raw is "weekly" | "monthly" =>
	raw === "weekly" || raw === "monthly"

export {
	formatCurrency,
	formatPercent,
	formatR,
	buildWeeklyPdfFilename,
	buildMonthlyPdfFilename,
	parseOffsetParam,
	isValidReportType,
	type Locale,
}
