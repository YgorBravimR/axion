/**
 * Cascade resolver: walks year → quarter → month → week → day,
 * runs resolveCascade per overridable field, returns merged plan + provenance map.
 *
 * NOTE (Phase 2): yearlyPlans.defaultDailyLossR / defaultDailyTargetR / defaultWeeklyLossR /
 * defaultMonthlyLossR / drawdownTriggerThresholdR columns do NOT yet exist on the live DB table.
 * They are read here via optional access and fall back to hardcoded sane defaults when absent.
 * Phase 3 migration script adds these columns + backfills.
 */
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan, dailyPlan } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { resolveCascade, type CascadeResult } from "./cascade-merge"
import { getWeekNumber, getWeekYear } from "@/lib/calendar/iso-week"

interface ResolvedDay {
	readonly accountId: string
	readonly date: Date
	readonly oneRCents: number
	readonly tierIndex: number
	readonly dailyLossR: CascadeResult<string>
	readonly dailyTargetR: CascadeResult<string>
	readonly weeklyLossR: CascadeResult<string>
	readonly monthlyLossR: CascadeResult<string>
	readonly activePlaybookIds: CascadeResult<readonly string[]> | null
	readonly raw: {
		year: { id: string }
		quarter: { id: string } | null
		month: { id: string } | null
		week: { id: string } | null
		day: { id: string } | null
	}
}

// Sane defaults used when the Phase 3 columns are not yet present on yearlyPlans.
const FALLBACK_DAILY_LOSS_R = "3.00"
const FALLBACK_DAILY_TARGET_R = "2.00"
const FALLBACK_WEEKLY_LOSS_R = "6.00"
const FALLBACK_MONTHLY_LOSS_R = "10.00"

const resolveDay = async (
	accountId: string,
	date: Date,
): Promise<ResolvedDay | null> => {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const quarter = Math.ceil(month / 3)
	const isoWeek = getWeekNumber(date)
	const isoYear = getWeekYear(date)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})
	if (!yearRow) return null

	const quarterRow = await db.query.quarterlyPlan.findFirst({
		where: and(eq(quarterlyPlan.yearlyPlanId, yearRow.id), eq(quarterlyPlan.quarter, quarter)),
	})
	const monthRow = quarterRow
		? await db.query.monthlyPlan.findFirst({
			where: and(eq(monthlyPlan.quarterlyPlanId, quarterRow.id), eq(monthlyPlan.month, month)),
		})
		: null
	const weekRow = monthRow
		? await db.query.weeklyPlan.findFirst({
			where: and(
				eq(weeklyPlan.monthlyPlanId, monthRow.id),
				eq(weeklyPlan.isoWeek, isoWeek),
				eq(weeklyPlan.isoYear, isoYear),
			),
		})
		: null
	const dayRow = weekRow
		? await db.query.dailyPlan.findFirst({
			where: and(
				eq(dailyPlan.weeklyPlanId, weekRow.id),
				eq(dailyPlan.date, date.toISOString().slice(0, 10)),
			),
		})
		: null

	// Phase 3 columns — read via optional access, fall back to hardcoded defaults.
	const yearRecord = yearRow as typeof yearRow & {
		defaultDailyLossR?: string | null
		defaultDailyTargetR?: string | null
		defaultWeeklyLossR?: string | null
		defaultMonthlyLossR?: string | null
	}

	const dailyLossR = resolveCascade<string>([
		{ level: "day", value: dayRow?.overrideDailyLossR },
		{ level: "week", value: weekRow?.overrideDailyLossR },
		{ level: "month", value: monthRow?.overrideDailyLossR },
		{ level: "year", value: yearRecord.defaultDailyLossR ?? FALLBACK_DAILY_LOSS_R },
	])
	const dailyTargetR = resolveCascade<string>([
		{ level: "day", value: dayRow?.overrideDailyTargetR },
		{ level: "week", value: weekRow?.overrideDailyTargetR },
		{ level: "month", value: monthRow?.overrideDailyTargetR },
		{ level: "year", value: yearRecord.defaultDailyTargetR ?? FALLBACK_DAILY_TARGET_R },
	])
	const weeklyLossR = resolveCascade<string>([
		{ level: "week", value: weekRow?.overrideWeeklyLossR },
		{ level: "month", value: monthRow?.overrideWeeklyLossR },
		{ level: "year", value: yearRecord.defaultWeeklyLossR ?? FALLBACK_WEEKLY_LOSS_R },
	])
	const monthlyLossR = resolveCascade<string>([
		{ level: "month", value: monthRow?.overrideMonthlyLossR },
		{ level: "year", value: yearRecord.defaultMonthlyLossR ?? FALLBACK_MONTHLY_LOSS_R },
	])

	const playbookLayers = [
		{ level: "day" as const, value: dayRow?.overrideActivePlaybookIds as string[] | null | undefined },
		{ level: "week" as const, value: weekRow?.overrideActivePlaybookIds as string[] | null | undefined },
		{ level: "month" as const, value: monthRow?.overrideActivePlaybookIds as string[] | null | undefined },
		{ level: "quarter" as const, value: quarterRow?.activePlaybookIds as string[] | null | undefined },
	]
	const hasPlaybooks = playbookLayers.some((l) => l.value !== null && l.value !== undefined)
	const activePlaybookIds = hasPlaybooks ? resolveCascade<readonly string[]>(playbookLayers) : null

	return {
		accountId,
		date,
		oneRCents: monthRow?.snapshotOneRCents ?? 0,
		tierIndex: monthRow?.snapshotTierIndex ?? 0,
		dailyLossR,
		dailyTargetR,
		weeklyLossR,
		monthlyLossR,
		activePlaybookIds,
		raw: {
			year: { id: yearRow.id },
			quarter: quarterRow ? { id: quarterRow.id } : null,
			month: monthRow ? { id: monthRow.id } : null,
			week: weekRow ? { id: weekRow.id } : null,
			day: dayRow ? { id: dayRow.id } : null,
		},
	}
}

export type { ResolvedDay }
export { resolveDay }
