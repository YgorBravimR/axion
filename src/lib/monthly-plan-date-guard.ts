/**
 * Determines the maximum year/month a user is allowed to create a plan for.
 *
 * Rule: users can only plan for next month if they are within 5 days of
 * the end of the current month. Otherwise, the current month is the max.
 *
 * @param now - Optional date override for testing; defaults to current date.
 * @returns Object with `maxYear` and `maxMonth` (1-indexed).
 */
const DAYS_BEFORE_END_TO_ALLOW_NEXT = 5

const getMaxAllowedPlanMonth = (now = new Date()): { maxYear: number; maxMonth: number } => {
	const currentYear = now.getFullYear()
	const currentMonth = now.getMonth() + 1 // 1-indexed
	const currentDay = now.getDate()

	// Last day of the current month (day 0 of next month = last day of current)
	const lastDayOfMonth = new Date(currentYear, now.getMonth() + 1, 0).getDate()
	const daysUntilEndOfMonth = lastDayOfMonth - currentDay

	if (daysUntilEndOfMonth < DAYS_BEFORE_END_TO_ALLOW_NEXT) {
		// Allow next month
		const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
		const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
		return { maxYear: nextYear, maxMonth: nextMonth }
	}

	return { maxYear: currentYear, maxMonth: currentMonth }
}

/**
 * Checks whether a given year/month exceeds the allowed plan creation window.
 *
 * @returns `true` if the target month is too far in the future.
 */
const isMonthBeyondAllowed = (targetYear: number, targetMonth: number, now = new Date()): boolean => {
	const { maxYear, maxMonth } = getMaxAllowedPlanMonth(now)
	if (targetYear > maxYear) return true
	if (targetYear === maxYear && targetMonth > maxMonth) return true
	return false
}

export { getMaxAllowedPlanMonth, isMonthBeyondAllowed }
