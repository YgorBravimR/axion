import { setRequestLocale } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan, dailyPlan } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { lazyEnsureDailyPlan } from "@/app/actions/fractal-plan/daily"
import { getWeekNumber, getWeekYear } from "@/lib/calendar/iso-week"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { DayModeSwitcher } from "@/components/fractal-plan/day-mode-switcher"
import { RCapOverridePopover } from "@/components/fractal-plan/r-cap-override-popover"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string; week: string; date: string }>
}

const PlanDayPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, quarter: quarterStr, month: monthStr, week: weekStr, date } = await params
	setRequestLocale(locale)

	const year = Number(yearStr)
	const quarter = Number(quarterStr)
	const month = Number(monthStr)
	const isoWeek = Number(weekStr)
	const [y, m, d] = date.split("-").map(Number)
	const dayDate = new Date(y, m - 1, d)
	if (Number.isNaN(dayDate.getTime())) {
		return (
			<PlanSection title="Invalid date">
				<p className="text-txt-200">Date must be ISO yyyy-MM-dd.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})
	if (!yearRow) {
		return (
			<PlanSection title={date} subtitle="No yearly plan exists">
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
				eq(weeklyPlan.isoYear, getWeekYear(dayDate)),
			),
		})
		: null

	if (!weekRow) {
		return (
			<PlanSection title={date} subtitle="No weekly plan row found">
				<p className="text-txt-200">Yearly plan should have auto-seeded this week.</p>
			</PlanSection>
		)
	}

	// Lazy-seed daily plan if missing
	let dayRow = await db.query.dailyPlan.findFirst({
		where: and(eq(dailyPlan.weeklyPlanId, weekRow.id), eq(dailyPlan.date, date)),
	})
	if (!dayRow) {
		const ensureResult = await lazyEnsureDailyPlan({ weeklyPlanId: weekRow.id, date })
		if (ensureResult.status === "success" && ensureResult.data) {
			dayRow = await db.query.dailyPlan.findFirst({
				where: eq(dailyPlan.id, ensureResult.data.id),
			})
		}
	}

	if (!dayRow) {
		return (
			<PlanSection title={date} subtitle="Could not create daily plan">
				<p className="text-txt-200">Lazy-seed failed. Try refreshing.</p>
			</PlanSection>
		)
	}

	// Resolve effective caps for the day
	const resolved = await resolveDay(accountId, dayDate)

	// Default mode: pre-market if before 17:00 BRT (UTC-3), else post-market
	// BRT 17:00 = UTC 20:00
	const nowUtcHour = new Date().getUTCHours()
	const isToday = dayDate.toDateString() === new Date().toDateString()
	const defaultMode: "pre" | "post" = !isToday ? "post" : nowUtcHour >= 20 ? "post" : "pre"

	// Compute weekday label
	const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayDate.getDay()]

	return (
		<div className="space-y-m-500">
			<PlanSection
				title={`${weekday} · ${date}`}
				subtitle="Pre-market intent · post-market reflection · effective caps"
				breadcrumb={
					<>
						<a href={`/${locale}/plan/${year}`} className="hover:text-txt-100">{year}</a>
						{" ▸ "}
						<a href={`/${locale}/plan/${year}/${quarter}`} className="hover:text-txt-100">Q{quarter}</a>
						{" ▸ "}
						<a href={`/${locale}/plan/${year}/${quarter}/${month}`} className="hover:text-txt-100">M{month}</a>
						{" ▸ "}
						<a href={`/${locale}/plan/${year}/${quarter}/${month}/${isoWeek}`} className="hover:text-txt-100">W{isoWeek}</a>
					</>
				}
			>
				<DayModeSwitcher
					dailyPlanId={dayRow.id}
					defaultMode={defaultMode}
					existing={{
						targetR: dayRow.targetR,
						maxTradesToday: dayRow.maxTradesToday,
						mood: dayRow.mood,
						preMarketNotes: dayRow.preMarketNotes,
						postMarketNotes: dayRow.postMarketNotes,
					}}
				/>
			</PlanSection>

			{resolved && (
				<PlanSection title="Effective caps" subtitle="Day-level overrides take precedence; resets fall back through cascade.">
					<dl className="grid grid-cols-1 gap-s-300 sm:grid-cols-2">
						<div>
							<dt className="text-sm text-txt-200">Daily loss R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="day"
									planRowId={dayRow.id}
									fieldKey="overrideDailyLossR"
									fieldLabel="daily loss R"
									currentValue={resolved.dailyLossR.value}
									currentSource={resolved.dailyLossR.source}
									idPrefix="d-cap-daily-loss"
								/>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Daily target R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="day"
									planRowId={dayRow.id}
									fieldKey="overrideDailyTargetR"
									fieldLabel="daily target R"
									currentValue={resolved.dailyTargetR.value}
									currentSource={resolved.dailyTargetR.source}
									idPrefix="d-cap-daily-target"
								/>
							</dd>
						</div>
					</dl>
				</PlanSection>
			)}
		</div>
	)
}

export { PlanDayPage as default }
