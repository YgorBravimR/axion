/**
 * App timezone — all dates in the journal are displayed and grouped in São Paulo time (BRT, UTC-3).
 * Brazil abolished DST in 2019, so this is a fixed offset.
 */
export const APP_TIMEZONE = "America/Sao_Paulo"

/**
 * Fixed UTC offset for BRT (UTC-3).
 * Used when constructing ISO-8601 date strings to ensure correct UTC instant
 * regardless of the server/browser's local timezone.
 */
export const BRT_OFFSET = "-03:00"

/** Pad a number to 2 digits */
const pad2 = (n: number): string => String(n).padStart(2, "0")

/**
 * Extract year/month/day components as they appear in São Paulo timezone.
 * Useful for constructing BRT-aware date boundaries.
 */
const getBrtDateParts = (
	date: Date
): { year: number; month: number; day: number } => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: APP_TIMEZONE,
		year: "numeric",
		month: "numeric",
		day: "numeric",
	}).formatToParts(date)

	return {
		year: parseInt(parts.find((p) => p.type === "year")!.value),
		month: parseInt(parts.find((p) => p.type === "month")!.value),
		day: parseInt(parts.find((p) => p.type === "day")!.value),
	}
}

/** Build a YYYY-MM-DD string from year/month/day numbers */
const toDateString = (year: number, month: number, day: number): string =>
	`${year}-${pad2(month)}-${pad2(day)}`

/**
 * Get start and end dates for the week containing the given date
 * Week starts on Sunday. All boundaries are in BRT.
 */
export const getWeekBoundaries = (date: Date): { start: Date; end: Date } => {
	const { year, month, day } = getBrtDateParts(date)

	const tempDate = new Date(year, month - 1, day)
	const dayOfWeek = tempDate.getDay()

	const startDate = new Date(year, month - 1, day - dayOfWeek)
	const endDate = new Date(year, month - 1, day - dayOfWeek + 6)

	const startKey = toDateString(
		startDate.getFullYear(),
		startDate.getMonth() + 1,
		startDate.getDate()
	)
	const endKey = toDateString(
		endDate.getFullYear(),
		endDate.getMonth() + 1,
		endDate.getDate()
	)

	return {
		start: new Date(`${startKey}T00:00:00${BRT_OFFSET}`),
		end: new Date(`${endKey}T23:59:59.999${BRT_OFFSET}`),
	}
}

/**
 * Get start and end dates for the month containing the given date.
 * All boundaries are in BRT.
 */
export const getMonthBoundaries = (date: Date): { start: Date; end: Date } => ({
	start: getStartOfMonth(date),
	end: getEndOfMonth(date),
})

/**
 * Get start of day for a given date (midnight in BRT)
 */
export const getStartOfDay = (date: Date): Date => {
	const dateKey = formatDateKey(date)
	return new Date(`${dateKey}T00:00:00${BRT_OFFSET}`)
}

/**
 * Get end of day for a given date (23:59:59.999 in BRT)
 */
export const getEndOfDay = (date: Date): Date => {
	const dateKey = formatDateKey(date)
	return new Date(`${dateKey}T23:59:59.999${BRT_OFFSET}`)
}

/**
 * Format date for display (always in BRT)
 */
export const formatDate = (
	date: Date,
	options?: Intl.DateTimeFormatOptions,
	locale = "en-US"
): string => {
	const defaultOptions: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "short",
		day: "numeric",
	}
	return new Intl.DateTimeFormat(locale, {
		...(options || defaultOptions),
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format date and time for display (always in BRT)
 */
export const formatDateTime = (date: Date, locale = "en-US"): string => {
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: APP_TIMEZONE,
	}).format(date)
}

/**
 * Format date as YYYY-MM-DD in São Paulo timezone (BRT).
 * Uses Intl.DateTimeFormat with en-CA locale which outputs YYYY-MM-DD natively.
 */
export const formatDateKey = (date: Date): string => {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: APP_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date)
}

/**
 * Parse a YYYY-MM-DD date key back into numeric components.
 * Throws on malformed input — this is the inverse of formatDateKey,
 * so callers should always pass strings produced by formatDateKey or
 * an equivalent contract.
 */
export const parseDateKey = (
	dateKey: string
): { year: number; month: number; day: number } => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
	if (!match) {
		throw new Error(`Invalid date key: ${dateKey}`)
	}
	const [, yearStr, monthStr, dayStr] = match as unknown as [
		string,
		string,
		string,
		string,
	]
	return {
		year: Number(yearStr),
		month: Number(monthStr),
		day: Number(dayStr),
	}
}

/**
 * Get start of month for a given date (in BRT)
 */
export const getStartOfMonth = (date: Date): Date => {
	const { year, month } = getBrtDateParts(date)
	return new Date(`${toDateString(year, month, 1)}T00:00:00${BRT_OFFSET}`)
}

/**
 * Get end of month for a given date (in BRT)
 */
export const getEndOfMonth = (date: Date): Date => {
	const { year, month } = getBrtDateParts(date)
	const lastDay = new Date(year, month, 0).getDate()
	return new Date(
		`${toDateString(year, month, lastDay)}T23:59:59.999${BRT_OFFSET}`
	)
}

/**
 * Format a Date as "HH:mm:ss" in BRT timezone.
 * Used to populate <input type="time"> fields with the correct BRT time.
 */
export const formatBrtTimeInput = (date: Date): string => {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: APP_TIMEZONE,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(date)
}

/**
 * Format a Date as "dd/MM HH:mm:ss" in BRT timezone.
 * Used for compact execution date/time display.
 *
 * en-GB's date-only format is "DD/MM/YYYY" so we take the "DD/MM" prefix,
 * then append the 24-hour time from formatBrtTimeInput.
 */
export const formatBrtShortDateTime = (date: Date): string => {
	const datePart = new Intl.DateTimeFormat("en-GB", {
		timeZone: APP_TIMEZONE,
		day: "2-digit",
		month: "2-digit",
	}).format(date)

	return `${datePart} ${formatBrtTimeInput(date)}`
}

/**
 * Format a Date as "HH:mm" in BRT timezone (without seconds).
 * Used for compact time display in forms.
 */
export const formatBrtTimeShort = (date: Date): string => {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: APP_TIMEZONE,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date)
}

/**
 * Extract hour, minute, and dayOfWeek as they appear in São Paulo timezone.
 * Avoids getHours()/getDay() which use the server's local TZ (UTC on Vercel).
 */
export const getBrtTimeParts = (
	date: Date
): { hour: number; minute: number; dayOfWeek: number } => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: APP_TIMEZONE,
		hour: "numeric",
		minute: "numeric",
		weekday: "short",
		hour12: false,
	}).formatToParts(date)

	const dayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	}

	const weekday = parts.find((p) => p.type === "weekday")!.value
	return {
		hour: parseInt(parts.find((p) => p.type === "hour")!.value),
		minute: parseInt(parts.find((p) => p.type === "minute")!.value),
		dayOfWeek: dayMap[weekday]!,
	}
}

/**
 * Map a next-intl locale string to the corresponding date-fns Locale object.
 * Used by react-day-picker for locale-aware month/day names and formatting.
 */
export const getDateFnsLocale = async (locale: string) => {
	if (locale === "pt-BR") {
		const { ptBR } = await import("date-fns/locale/pt-BR")
		return ptBR
	}
	const { enUS } = await import("date-fns/locale/en-US")
	return enUS
}

/**
 * Get relative time string (e.g., "2 days ago")
 * Uses absolute timestamp differences — timezone doesn't affect this.
 */
export const getRelativeTime = (date: Date, locale = "en"): string => {
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
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
