/**
 * Server-only helper: walks the fractal cascade
 * (yearlyPlans → quarterlyPlan → monthlyPlan → weeklyPlan)
 * and lazy-seeds a `dailyPlan` row for the given (account, date), then returns
 * the full row.
 *
 * Returns:
 *   - `{ status: "ok", dayRow }` when the cascade exists and a day row was found/created
 *   - `{ status: "no-yearly-plan" }` when the user hasn't seeded a yearly plan
 *   - `{ status: "incomplete-cascade" }` when an intermediate row is missing
 *     (should only happen if the user manually deleted a quarter/month/week row)
 */
import { db } from "@/db/drizzle"
import {
	yearlyPlans,
	quarterlyPlan,
	monthlyPlan,
	weeklyPlan,
	dailyPlan,
} from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { getWeekNumber, getWeekYear } from "@/lib/calendar/iso-week"
import { formatDateKey } from "@/lib/dates"
import type { DailyPlan } from "@/db/schema"

type EnsureDailyResult =
	| { status: "ok"; dayRow: DailyPlan }
	| { status: "no-yearly-plan" }
	| { status: "incomplete-cascade"; missing: "quarter" | "month" | "week" }

const ensureDailyPlanForAccountDate = async (
	accountId: string,
	date: Date
): Promise<EnsureDailyResult> => {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const quarter = Math.ceil(month / 3)
	const isoWeek = getWeekNumber(date)
	const isoYear = getWeekYear(date)
	const dateKey = formatDateKey(date)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})
	if (!yearRow) {
		return { status: "no-yearly-plan" }
	}

	const quarterRow = await db.query.quarterlyPlan.findFirst({
		where: and(
			eq(quarterlyPlan.yearlyPlanId, yearRow.id),
			eq(quarterlyPlan.quarter, quarter)
		),
	})
	if (!quarterRow) {
		return { status: "incomplete-cascade", missing: "quarter" }
	}

	const monthRow = await db.query.monthlyPlan.findFirst({
		where: and(
			eq(monthlyPlan.quarterlyPlanId, quarterRow.id),
			eq(monthlyPlan.month, month)
		),
	})
	if (!monthRow) {
		return { status: "incomplete-cascade", missing: "month" }
	}

	const weekRow = await db.query.weeklyPlan.findFirst({
		where: and(
			eq(weeklyPlan.monthlyPlanId, monthRow.id),
			eq(weeklyPlan.isoWeek, isoWeek),
			eq(weeklyPlan.isoYear, isoYear)
		),
	})
	if (!weekRow) {
		return { status: "incomplete-cascade", missing: "week" }
	}

	const existing = await db.query.dailyPlan.findFirst({
		where: and(
			eq(dailyPlan.weeklyPlanId, weekRow.id),
			eq(dailyPlan.date, dateKey)
		),
	})
	if (existing) {
		return { status: "ok", dayRow: existing }
	}

	const [created] = await db
		.insert(dailyPlan)
		.values({ weeklyPlanId: weekRow.id, date: dateKey })
		.returning()
	return { status: "ok", dayRow: created }
}

export type { EnsureDailyResult }
export { ensureDailyPlanForAccountDate }
