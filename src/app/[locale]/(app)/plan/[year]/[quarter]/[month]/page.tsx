import { setRequestLocale } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { SnapshotHero } from "@/components/fractal-plan/snapshot-hero"
import { MonthlyPlanEditor } from "@/components/fractal-plan/monthly-plan-editor"
import { RCapOverridePopover } from "@/components/fractal-plan/r-cap-override-popover"
import { WeekStrip } from "@/components/fractal-plan/week-strip"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string }>
}

const MONTH_NAME = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const PlanMonthPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, quarter: quarterStr, month: monthStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	const quarter = Number(quarterStr)
	const month = Number(monthStr)
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(quarter) ||
		!Number.isInteger(month) ||
		month < 1 ||
		month > 12 ||
		quarter < 1 ||
		quarter > 4
	) {
		return (
			<PlanSection title="Invalid month">
				<p className="text-txt-200">Year/quarter/month must be valid integers.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})
	if (!yearRow) {
		return (
			<PlanSection title={`${MONTH_NAME[month]} ${year}`} subtitle="No yearly plan exists">
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

	if (!monthRow) {
		return (
			<PlanSection title={`${MONTH_NAME[month]} ${year}`} subtitle="No monthly plan row found">
				<p className="text-txt-200">Yearly plan should have auto-seeded this month. Check yearly plan integrity.</p>
			</PlanSection>
		)
	}

	const weeks = await db.query.weeklyPlan.findMany({
		where: eq(weeklyPlan.monthlyPlanId, monthRow.id),
	})

	// Resolve effective caps for the 1st of the month — provenance reflects month/year cascade
	const firstOfMonth = new Date(year, month - 1, 1)
	const resolved = await resolveDay(accountId, firstOfMonth)

	return (
		<div className="space-y-m-500">
			<PlanSection
				title={`${MONTH_NAME[month]} ${year}`}
				subtitle="Tier snapshot · override caps · weekly progress"
				breadcrumb={
					<>
						<a href={`/${locale}/plan/${year}`} className="hover:text-txt-100">
							{year}
						</a>
						{" ▸ "}
						<a href={`/${locale}/plan/${year}/${quarter}`} className="hover:text-txt-100">
							Q{quarter}
						</a>
					</>
				}
			>
				<SnapshotHero
					tierIndex={monthRow.snapshotTierIndex}
					oneRCents={monthRow.snapshotOneRCents}
					capitalCents={monthRow.snapshotCapitalCents}
					computedAt={monthRow.snapshotComputedAt}
					reason={monthRow.snapshotReason}
				/>
			</PlanSection>

			{resolved && (
				<PlanSection title="Override caps" subtitle="Set deltas; falls back through cascade when reset.">
					<dl className="grid grid-cols-1 gap-s-300 sm:grid-cols-2">
						<div>
							<dt className="text-sm text-txt-200">Daily loss R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="month"
									planRowId={monthRow.id}
									fieldKey="overrideDailyLossR"
									fieldLabel="daily loss R"
									currentValue={resolved.dailyLossR.value}
									currentSource={resolved.dailyLossR.source}
									idPrefix="m-cap-daily-loss"
								/>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Daily target R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="month"
									planRowId={monthRow.id}
									fieldKey="overrideDailyTargetR"
									fieldLabel="daily target R"
									currentValue={resolved.dailyTargetR.value}
									currentSource={resolved.dailyTargetR.source}
									idPrefix="m-cap-daily-target"
								/>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Weekly loss R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="month"
									planRowId={monthRow.id}
									fieldKey="overrideWeeklyLossR"
									fieldLabel="weekly loss R"
									currentValue={resolved.weeklyLossR.value}
									currentSource={resolved.weeklyLossR.source}
									idPrefix="m-cap-weekly-loss"
								/>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-txt-200">Monthly loss R</dt>
							<dd className="mt-1">
								<RCapOverridePopover
									level="month"
									planRowId={monthRow.id}
									fieldKey="overrideMonthlyLossR"
									fieldLabel="monthly loss R"
									currentValue={resolved.monthlyLossR.value}
									currentSource={resolved.monthlyLossR.source}
									idPrefix="m-cap-monthly-loss"
								/>
							</dd>
						</div>
					</dl>
				</PlanSection>
			)}

			<PlanSection title="Goals & narrative">
				<MonthlyPlanEditor
					monthlyPlanId={monthRow.id}
					existing={{
						monthlyGoalCents: monthRow.monthlyGoalCents,
						intentNotes: monthRow.intentNotes,
						postMortemNotes: monthRow.postMortemNotes,
					}}
				/>
			</PlanSection>

			<PlanSection title="Weeks" subtitle="Click a week to drill into target/actual + day strip.">
				<WeekStrip
					weeks={weeks.map((w) => ({
						isoWeek: w.isoWeek,
						isoYear: w.isoYear,
						targetR: w.targetR,
						actualR: w.actualR,
					}))}
					year={year}
					month={month}
					quarter={quarter}
					locale={locale}
				/>
			</PlanSection>

			<PlanSection title="Tax" subtitle="DARF for this month — see ledger for full detail.">
				<a
					href={`/${locale}/tax`}
					className="inline-flex items-center text-sm text-acc-100 hover:underline"
				>
					Open tax ledger →
				</a>
			</PlanSection>
		</div>
	)
}

export { PlanMonthPage as default }
