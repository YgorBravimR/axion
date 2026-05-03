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
 * Returns the total number of ISO weeks in a given year (52 or 53).
 * A year has 53 ISO weeks if Jan 1 or Dec 31 falls on Thursday.
 *
 * @param year - Calendar year (e.g. 2026)
 * @returns 52 or 53
 */
const getWeeksInYear = (year: number): number =>
  getISOWeeksInYear(new Date(year, 6, 1))

/**
 * Returns the Monday (ISO week start) for the week containing the given date.
 *
 * @param date - Any date within the target week
 * @returns Date set to Monday 00:00:00.000 UTC of that ISO week
 */
const weekStart = (date: Date): Date => startOfISOWeek(date)

/**
 * Returns the Sunday (ISO week end) for the week containing the given date.
 *
 * @param date - Any date within the target week
 * @returns Date set to Sunday 23:59:59.999 UTC of that ISO week
 */
const weekEnd = (date: Date): Date => endOfISOWeek(date)

export { getWeekNumber, getWeekYear, getWeeksInYear, weekStart, weekEnd }
