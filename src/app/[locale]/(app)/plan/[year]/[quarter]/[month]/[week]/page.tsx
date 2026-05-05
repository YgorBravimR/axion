import { setRequestLocale } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan, dailyPlan } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { WeeklyPlanEditor } from "@/components/fractal-plan/weekly-plan-editor"
import { RCapOverridePopover } from "@/components/fractal-plan/r-cap-override-popover"
import { TargetActualGauge } from "@/components/fractal-plan/target-actual-gauge"
import { DayStrip } from "@/components/fractal-plan/day-strip"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string; week: string }>
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const isoWeekMonday = (isoYear: number, isoWeek: number): Date => {
	const jan4 = new Date(Date.UTC(isoYear, 0, 4))
	const dayOfWeek = (jan4.getUTCDay() + 6) % 7
	const week1Monday = new Date(jan4)
	week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek)
	const monday = new Date(week1Monday)
	monday.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7)
	return monday
}

const PlanWeekPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, quarter: quarterStr, month: monthStr, week: weekStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	const quarter = Number(quarterStr)
	const month = Number(monthStr)
	const isoWeek = Number(weekStr)
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(quarter) ||
		!Number.isInteger(month) ||
		!Number.isInteger(isoWeek) ||
		isoWeek < 1 ||
		isoWeek > 53
	) {
		return (
			<PlanSection title="Invalid week">
				<p className="text-txt-200">Year/quarter/month/week must be valid integers; week 1-53.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})
	if (!yearRow) {
		return (
			<PlanSection title={`Week ${isoWeek}`} subtitle="No yearly plan exists">
				<p className="text-txt-200">
					Create a yearly plan first at <a href={`/${locale}/plan/${year}`} className="text-acc-100 underline">/plan/{year}</a>.
				</p>
			</PlanSection>
		)
	}

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
				eq(weeklyPlan.isoYear, year),
			),
		})
		: null

	if (!weekRow) {
		return (
			<PlanSection title={`Week ${isoWeek}`} subtitle="No weekly plan row found">
				<p className="text-txt-200">Yearly plan should have auto-seeded this week.</p>
			</PlanSection>
		)
	}

	const days = await db.query.dailyPlan.findMany({
		where: eq(dailyPlan.weeklyPlanId, weekRow.id),
	})

	const monday = isoWeekMonday(year, isoWeek)
	const dayItems = Array.from({ length: 5 }, (_, i) => {
		const d = new Date(monday)
		d.setUTCDate(monday.getUTCDate() + i)
		const dateStr = d.toISOString().slice(0, 10)
		const dayRow = days.find((dp) => dp.date === dateStr)
		return {
			date: dateStr,
			dayLabel: DAY_LABEL[d.getUTCDay()],
			targetR: dayRow?.targetR ?? null,
			actualR: dayRow?.actualR ?? null,
			hasOverride: !!(dayRow?.overrideDailyLossR || dayRow?.overrideDailyTargetR),
		}
	})

	// Resolve effective caps using week-Monday as anchor
	const anchor = new Date(monday)
	const resolved = await resolveDay(accountId, anchor)

	return (
		<div className="space-y-m-500">
			<PlanSection
				title={`Week ${isoWeek} · ${year}`}
				subtitle="Target/actual · day strip · override caps"
				breadcrumb={
					<>
						<a href={`/${locale}/plan/${year}`} className="hover:text-txt-100">{year}</a>
						{" ▸ "}
						<a href={`/${locale}/plan/${year}/${quarter}`} className="hover:text-txt-100">Q{quarter}</a>
						{" ▸ "}
						<a href={`/${locale}/plan/${year}/${quarter}/${month}`} className="hover:text-txt-100">M{month}</a>
					</>
				}
			>
				<TargetActualGauge targetR={weekRow.targetR} actualR={weekRow.actualR} />
			</PlanSection>

			{resolved && (
				<PlanSection title="Override caps" subtitle="Set deltas at the week level; resets fall back to month/year.">
					<dl className="grid grid-cols-1 gap-s-300 sm:grid-cols-2">
						<div>
							<dt className="text-sm text-txt-200">Daily loss R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="week"
									planRowId={weekRow.id}
									fieldKey="overrideDailyLossR"
									fieldLabel="daily loss R"
									currentValue={resolved.dailyLossR.value}
									currentSource={resolved.dailyLossR.source}
									idPrefix="w-cap-daily-loss"
								/>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Daily target R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="week"
									planRowId={weekRow.id}
									fieldKey="overrideDailyTargetR"
									fieldLabel="daily target R"
									currentValue={resolved.dailyTargetR.value}
									currentSource={resolved.dailyTargetR.source}
									idPrefix="w-cap-daily-target"
								/>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Weekly loss R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="week"
									planRowId={weekRow.id}
									fieldKey="overrideWeeklyLossR"
									fieldLabel="weekly loss R"
									currentValue={resolved.weeklyLossR.value}
									currentSource={resolved.weeklyLossR.source}
									idPrefix="w-cap-weekly-loss"
								/>
							</dd>
						</div>
					</dl>
				</PlanSection>
			)}

			<PlanSection title="Days" subtitle="Click a day to drill into pre/post-market mode.">
				<DayStrip
					days={dayItems}
					year={year}
					quarter={quarter}
					month={month}
					isoWeek={isoWeek}
					locale={locale}
				/>
			</PlanSection>

			<PlanSection title="Intent & post-mortem">
				<WeeklyPlanEditor
					weeklyPlanId={weekRow.id}
					existing={{
						targetR: weekRow.targetR,
						intentNotes: weekRow.intentNotes,
						postMortemNotes: weekRow.postMortemNotes,
					}}
				/>
			</PlanSection>
		</div>
	)
}

export { PlanWeekPage as default }
