/**
 * ISO 8601 week-date helpers wrapping date-fns ISO functions.
 *
 * @see https://date-fns.org/docs/getISOWeek
 */
import {
	getISOWeek,
	getISOWeekYear,
	getISOWeeksInYear,
	startOfISOWeek,
	endOfISOWeek,
} from "date-fns"

/**
 * Returns the ISO 8601 week number for a given date.
 * Weeks start on Monday. Week 1 is the week containing the first Thursday of the year.
 *
 * @param date - The date to extract the week number from
 * @returns ISO week number (1–53)
 */
const getWeekNumber = (date: Date): number => getISOWeek(date)

/**
 * Returns the ISO 8601 week-year for a given date.
 * This differs from the calendar year for dates in the first/last week of the year
 * (e.g. Dec 29 2025 → ISO week 1 of 2026, so getWeekYear returns 2026).
 *
 * @param date - The date to extract the ISO week-year from
 * @returns ISO week-year (e.g. 2026)
 */
const getWeekYear = (date: Date): number => getISOWeekYear(date)

/**
 * Returns the number of ISO weeks in a given year (52 or 53).
 *
 * @param year - Calendar year (e.g. 2026)
 * @returns 52 or 53
 * @see https://date-fns.org/docs/getISOWeeksInYear
 * @see https://en.wikipedia.org/wiki/ISO_week_date
 */
const getWeeksInYear = (year: number): number =>
	getISOWeeksInYear(new Date(year, 6, 1))

/**
 * Returns the Monday (ISO week start) for the week containing the given date.
 *
 * @param date - Any date within the target week
 * @returns Date anchored at Monday 00:00:00.000 in the host's local timezone
 */
const weekStart = (date: Date): Date => startOfISOWeek(date)

/**
 * Returns the Sunday (ISO week end) for the week containing the given date.
 *
 * @param date - Any date within the target week
 * @returns Date anchored at Sunday 23:59:59.999 in the host's local timezone
 */
const weekEnd = (date: Date): Date => endOfISOWeek(date)

interface IsoWeekEntry {
	week: number
	isoYear: number
	startDate: Date
	endDate: Date
}

/**
 * Returns the ISO 8601 week number for a date using a UTC-anchored algorithm.
 * Equivalent to `getWeekNumber` but expressed without date-fns; kept for the
 * yearly-plan call sites that prefer the explicit Iso* naming.
 *
 * @param date - The date to extract the week number from
 * @returns ISO week number (1–53)
 */
const getIsoWeekOfDate = (date: Date): number => {
	const d = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
	)
	const dayNum = d.getUTCDay() || 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum)
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Returns the ISO 8601 week-year for a date.
 * Equivalent to `getWeekYear` but expressed without date-fns.
 *
 * @param date - The date to extract the ISO week-year from
 * @returns ISO week-year (e.g. 2026)
 */
const getIsoYearOfDate = (date: Date): number => {
	const d = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
	)
	const dayNum = d.getUTCDay() || 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum)
	return d.getUTCFullYear()
}

/**
 * Returns all ISO weeks that belong to a given calendar year.
 * An ISO week belongs to the year in which most of its days fall (ISO 8601 rule).
 *
 * @param year - Calendar year to enumerate (e.g. 2026)
 * @returns Ordered array of IsoWeekEntry rows for weeks whose ISO year matches `year`
 */
const getIsoWeeksForYear = (year: number): IsoWeekEntry[] => {
	const weeks: IsoWeekEntry[] = []
	const jan4 = new Date(Date.UTC(year, 0, 4))
	const startOfWeek1 = new Date(jan4)
	const dayOfWeek = (jan4.getUTCDay() + 6) % 7
	startOfWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek)

	for (let i = 0; i < 53; i++) {
		const weekStartDate = new Date(startOfWeek1)
		weekStartDate.setUTCDate(startOfWeek1.getUTCDate() + i * 7)
		const weekEndDate = new Date(weekStartDate)
		weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6)

		const isoYear = getIsoYearOfDate(weekStartDate)
		if (isoYear !== year) {
			break
		}

		weeks.push({
			week: getIsoWeekOfDate(weekStartDate),
			isoYear,
			startDate: weekStartDate,
			endDate: weekEndDate,
		})
	}

	return weeks
}

/**
 * Groups week-keyed rows by calendar month (1-12).
 * Each ISO week is assigned to the month containing its Thursday (ISO 8601 convention).
 *
 * @param weeks - Rows containing isoWeek + isoYear fields (e.g. WeeklyTarget rows)
 * @param year - The calendar year these weeks belong to
 * @returns Map keyed 1..12 — months with no weeks are still present with an empty array
 */
const groupWeeksByMonth = <T extends { isoWeek: number; isoYear: number }>(
	weeks: T[],
	year: number
): Record<number, T[]> => {
	const allIsoWeeks = getIsoWeeksForYear(year)
	const weekToMonth = new Map<number, number>()

	for (const entry of allIsoWeeks) {
		const thursday = new Date(entry.startDate)
		thursday.setUTCDate(entry.startDate.getUTCDate() + 3)
		weekToMonth.set(entry.week, thursday.getUTCMonth() + 1)
	}

	const result: Record<number, T[]> = {}
	for (let m = 1; m <= 12; m++) {
		result[m] = []
	}

	for (const week of weeks) {
		const month = weekToMonth.get(week.isoWeek)
		if (month != null) {
			result[month]!.push(week)
		}
	}

	return result
}

export { getWeekNumber, getWeekYear, getWeeksInYear, weekStart, weekEnd }
export {
	getIsoWeeksForYear,
	getIsoWeekOfDate,
	getIsoYearOfDate,
	groupWeeksByMonth,
}
export type { IsoWeekEntry }
