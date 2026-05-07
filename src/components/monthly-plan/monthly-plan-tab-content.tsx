import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan } from "@/db/schema"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { SnapshotHero } from "@/components/fractal-plan/snapshot-hero"
import { MonthlyPlanEditor } from "@/components/fractal-plan/monthly-plan-editor"
import { RCapOverridePopover } from "@/components/fractal-plan/r-cap-override-popover"
import { WeekStrip } from "@/components/fractal-plan/week-strip"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"

interface MonthlyPlanTabContentProps {
	accountId: string
	year: number
	month: number
	locale: string
}

const MONTH_NAME = [
	"",
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]

const MonthlyPlanTabContent = async ({
	accountId,
	year,
	month,
	locale,
}: MonthlyPlanTabContentProps) => {
	const quarter = Math.ceil(month / 3)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})

	if (!yearRow) {
		return (
			<PlanSection
				title={`${MONTH_NAME[month]} ${year}`}
				subtitle="No yearly plan exists"
			>
				<p className="text-txt-200">
					Create a yearly plan first at{" "}
					<a
						href={`/${locale}/plan/${year}`}
						className="text-acc-100 underline"
					>
						/plan/{year}
					</a>
					.
				</p>
			</PlanSection>
		)
	}

	const quarterRow = await db.query.quarterlyPlan.findFirst({
		where: and(
			eq(quarterlyPlan.yearlyPlanId, yearRow.id),
			eq(quarterlyPlan.quarter, quarter)
		),
	})

	const monthRow = quarterRow
		? await db.query.monthlyPlan.findFirst({
				where: and(
					eq(monthlyPlan.quarterlyPlanId, quarterRow.id),
					eq(monthlyPlan.month, month)
				),
			})
		: null

	if (!monthRow) {
		return (
			<PlanSection
				title={`${MONTH_NAME[month]} ${year}`}
				subtitle="No monthly plan row found"
			>
				<p className="text-txt-200">
					Yearly plan should have auto-seeded this month. Check yearly plan
					integrity.
				</p>
			</PlanSection>
		)
	}

	const weeks = await db.query.weeklyPlan.findMany({
		where: eq(weeklyPlan.monthlyPlanId, monthRow.id),
	})

	const firstOfMonth = new Date(year, month - 1, 1)
	const [resolved, profilesResult] = await Promise.all([
		resolveDay(accountId, firstOfMonth),
		listActiveRiskProfiles(),
	])
	const riskProfiles =
		profilesResult.status === "success" && profilesResult.data
			? profilesResult.data
			: []
	const resolvedProfileId =
		monthRow.overrideRiskProfileId ?? yearRow.defaultRiskProfileId ?? null
	const resolvedProfileSource: "month" | "year" | "none" = monthRow.overrideRiskProfileId
		? "month"
		: yearRow.defaultRiskProfileId
			? "year"
			: "none"
	const resolvedProfile = resolvedProfileId
		? riskProfiles.find((p) => p.id === resolvedProfileId) ?? null
		: null

	return (
		<div className="space-y-m-500">
			<PlanSection
				title={`${MONTH_NAME[month]} ${year}`}
				subtitle="Tier snapshot · override caps · weekly progress"
				breadcrumb={
					<>
						<a
							href={`/${locale}/plan/${year}`}
							className="hover:text-txt-100"
						>
							{year}
						</a>
						{" ▸ "}
						<a
							href={`/${locale}/plan/${year}/${quarter}`}
							className="hover:text-txt-100"
						>
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
				<PlanSection
					title="Override caps"
					subtitle="Set deltas; falls back through cascade when reset."
				>
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

			<PlanSection
				title="Risk profile"
				subtitle="Cascade: month override → year default. Drives adaptive sizing."
			>
				<div className="space-y-s-200">
					<div className="flex items-center gap-s-200 text-sm">
						<span className="text-txt-200">Active:</span>
						<span className="text-txt-100 font-medium">
							{resolvedProfile?.name ?? "None"}
						</span>
						<span
							className="rounded-sm bg-bg-200 px-s-200 py-px text-tiny uppercase tracking-wider text-txt-300"
							aria-label={`Source: ${resolvedProfileSource}`}
						>
							{resolvedProfileSource === "none" ? "no profile" : resolvedProfileSource}
						</span>
					</div>
					{resolvedProfile && (
						<>
							{resolvedProfile.description && (
								<p className="text-tiny text-txt-300">{resolvedProfile.description}</p>
							)}
							<dl className="grid grid-cols-2 gap-s-200 text-sm sm:grid-cols-4">
								<div>
									<dt className="text-tiny uppercase tracking-wider text-txt-300">Base risk</dt>
									<dd className="text-txt-100">
										{resolvedProfile.decisionTree.baseTrade.riskR}R
									</dd>
								</div>
								<div>
									<dt className="text-tiny uppercase tracking-wider text-txt-300">Loss recovery</dt>
									<dd className="text-txt-100">
										{resolvedProfile.decisionTree.lossRecovery.sequence.length} steps
									</dd>
								</div>
								<div>
									<dt className="text-tiny uppercase tracking-wider text-txt-300">Gain mode</dt>
									<dd className="text-txt-100">
										{resolvedProfile.decisionTree.gainMode.type}
									</dd>
								</div>
								<div>
									<dt className="text-tiny uppercase tracking-wider text-txt-300">Monthly cap action</dt>
									<dd className="text-txt-100">
										{resolvedProfile.decisionTree.cascadingLimits.monthlyAction}
									</dd>
								</div>
							</dl>
						</>
					)}
				</div>
			</PlanSection>

			<PlanSection title="Goals & narrative">
				<MonthlyPlanEditor
					monthlyPlanId={monthRow.id}
					riskProfiles={riskProfiles}
					existing={{
						monthlyGoalCents: monthRow.monthlyGoalCents,
						intentNotes: monthRow.intentNotes,
						postMortemNotes: monthRow.postMortemNotes,
						overrideRiskProfileId: monthRow.overrideRiskProfileId,
					}}
				/>
			</PlanSection>

			<PlanSection title="Weeks" subtitle="Target/actual per ISO week.">
				<WeekStrip
					weeks={weeks.map((w) => ({
						isoWeek: w.isoWeek,
						isoYear: w.isoYear,
						targetR: w.targetR,
						actualR: w.actualR,
					}))}
				/>
			</PlanSection>
		</div>
	)
}

export type { MonthlyPlanTabContentProps }
export { MonthlyPlanTabContent }
