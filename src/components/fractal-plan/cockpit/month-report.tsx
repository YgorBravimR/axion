import { getTranslations } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	yearlyPlans,
	quarterlyPlan,
	monthlyPlan,
	weeklyPlan,
	tradingAccounts,
} from "@/db/schema"
import { resolveDay, resolveBehavior } from "@/lib/fractal-plan/resolver"
import { deriveMonthGoal } from "@/lib/fractal-plan/derive-goal"
import { getHistoricalAssertivity } from "@/lib/fractal-plan/historical-assertivity"
import {
	computeRealizedPnlByMonth,
	computeNetPnlChain,
	resolveMonthStartCapital,
} from "@/lib/fractal-plan/real-carry-forward"
import {
	resolveTier,
	type LadderRuleR,
} from "@/lib/fractal-plan/capital-ladder"
import {
	DEFAULT_TRADING_DAYS_PER_MONTH,
	computeMonthOffset,
} from "@/lib/fractal-plan/month-labels"
import { parseFiniteNumber } from "@/lib/fractal-plan/parse-number"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import {
	getMonthlyResultsWithProp,
	getMonthlyProjection,
	getMonthComparison,
} from "@/app/actions/reports"
import { getMonthlyDarf } from "@/app/actions/tax-engine"
import { getDayTradeIrRate } from "@/lib/tax/legal-rates"
import { isMonthFinalized } from "@/lib/tax/month-status"
import Link from "next/link"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { MonthHeader } from "./month-header"
import { PlanVsReality } from "./plan-vs-reality"
import { CapsStrip } from "./caps-strip"
import { MonthWeekTable } from "./month-week-table"
import { MonthDarfRow } from "./month-darf-row"
import { MonthComparison } from "@/components/reports/month-comparison"
import { HawksScorecardPanel } from "@/components/hawks/hawks-scorecard-panel"

interface MonthReportProps {
	accountId: string
	year: number
	quarter: number
	month: number
	locale: string
}

const MonthReport = async ({
	accountId,
	year,
	quarter,
	month,
	locale,
}: MonthReportProps) => {
	const t = await getTranslations("plan.month")
	const tMonths = await getTranslations("months")
	const monthLabel = `${tMonths(String(month - 1))} ${year}`

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})

	if (!yearRow) {
		return (
			<PlanSection title={monthLabel} subtitle={t("noAnnualPlan")}>
				<p className="text-txt-200">
					{t("noAnnualPlanBody")}{" "}
					<Link
						href={`/${locale}/plan/${year}`}
						className="text-acc-100 underline"
					>
						/plan/{year}
					</Link>
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
			<PlanSection title={monthLabel} subtitle={t("noMonthRow")}>
				<p className="text-txt-200">{t("noMonthRowBody")}</p>
			</PlanSection>
		)
	}

	const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
	const monthOffset = computeMonthOffset(year, month)

	const [
		weeks,
		resolved,
		behavior,
		profilesResult,
		monthlyResult,
		projectionResult,
		comparisonResult,
		darfResult,
		account,
		assertivityData,
	] = await Promise.all([
		db.query.weeklyPlan.findMany({
			where: eq(weeklyPlan.monthlyPlanId, monthRow.id),
		}),
		resolveDay(accountId, firstOfMonth),
		resolveBehavior({ accountId, date: firstOfMonth }),
		listActiveRiskProfiles(),
		getMonthlyResultsWithProp(monthOffset),
		monthOffset === 0 ? getMonthlyProjection() : Promise.resolve(null),
		getMonthComparison(monthOffset),
		getMonthlyDarf({ accountId, year, month }),
		db
			.select({
				accountType: tradingAccounts.accountType,
				profitSharePercentage: tradingAccounts.profitSharePercentage,
				propFirmName: tradingAccounts.propFirmName,
				showTaxEstimates: tradingAccounts.showTaxEstimates,
				accountStartYear: tradingAccounts.accountStartYear,
				accountStartMonth: tradingAccounts.accountStartMonth,
				startingBalanceCents: tradingAccounts.startingBalanceCents,
				withdrawalTargetPercent: tradingAccounts.withdrawalTargetPercent,
			})
			.from(tradingAccounts)
			.where(eq(tradingAccounts.id, accountId))
			.then((rows) => rows[0] ?? null),
		getHistoricalAssertivity(accountId),
	])

	const riskProfiles =
		profilesResult.status === "success" && profilesResult.data
			? profilesResult.data
			: []
	const monthlyData =
		monthlyResult.status === "success" ? (monthlyResult.data ?? null) : null
	const projectionData =
		projectionResult && projectionResult.status === "success"
			? (projectionResult.data ?? null)
			: null
	const comparisonData =
		comparisonResult.status === "success"
			? (comparisonResult.data ?? null)
			: null
	const darfRow =
		darfResult.status === "success" ? (darfResult.data ?? null) : null

	const irTaxRate = getDayTradeIrRate(year)
	const isPropAccount = account?.accountType === "prop"
	const profitSharePercent = account
		? Number(account.profitSharePercentage)
		: 100
	const showTaxEstimates = account?.showTaxEstimates ?? true

	const grossPnlCents = monthlyData
		? Math.round(monthlyData.report.netPnl * 100)
		: 0
	const pnlChain = computeNetPnlChain({
		grossCents: grossPnlCents,
		profitSharePercent: isPropAccount ? profitSharePercent : 100,
		irTaxRate,
		applyTax: showTaxEstimates,
		withdrawalPct: 0, // Month display does not apply withdrawal
	})
	const netAfterTaxCents = pnlChain.netAfterTaxCents

	const totalTradingDays =
		projectionData?.totalTradingDays ?? DEFAULT_TRADING_DAYS_PER_MONTH
	const daysTraded = projectionData?.daysTraded ?? 0
	const daysRemaining =
		projectionData?.tradingDaysRemaining ??
		Math.max(0, totalTradingDays - daysTraded)
	const dailyAverageCents = projectionData
		? Math.round(projectionData.dailyAverage * 100)
		: 0
	const projectedNetCents = projectionData
		? Math.round(projectionData.projectedNetProfit * 100)
		: null

	const configuredAssertivityPct = Math.round(
		parseFiniteNumber(yearRow.defaultAssertivityPercent, 50)
	)
	const assertivityPct = assertivityData.hasEnoughData
		? assertivityData.assertivityPct
		: configuredAssertivityPct

	const planStartMonth =
		account?.accountStartYear === year && account?.accountStartMonth != null
			? account.accountStartMonth
			: 1
	// Source of truth: account.startingBalanceCents when it's set and the account
	// starts in this year (matches the year-page logic). Falls back to the yearly
	// plan's initialCapitalCents only when the account row has no balance.
	const effectiveInitialCapitalCents =
		account?.startingBalanceCents != null && account.accountStartYear === year
			? account.startingBalanceCents
			: yearRow.initialCapitalCents
	const ladderRules = yearRow.ladderRules as unknown as LadderRuleR[]
	// Month-start capital = REAL carry-forward: initial capital + actual realized
	// net P&L of every prior month (prop-share → tax → withdrawal), mirroring the
	// annual cockpit grid so all views agree. Prior code compounded the *planned*
	// goal each month, which inflated capital whenever real results missed target.
	const withdrawalPct =
		account?.withdrawalTargetPercent != null
			? Number(account.withdrawalTargetPercent) / 100
			: 0
	const realPnlByMonth =
		ladderRules.length > 0
			? await computeRealizedPnlByMonth({
					accountId,
					year,
					profitSharePercent,
					irTaxRate,
					withdrawalPct,
					applyTax: showTaxEstimates,
				})
			: []
	const monthCapital = resolveMonthStartCapital({
		ladderRules,
		initialCapitalCents: effectiveInitialCapitalCents,
		realPnlByMonth,
		planStartMonth,
		month,
		snapshotOneRCents: monthRow.snapshotOneRCents,
	})
	const effectiveCapitalCents = monthCapital.capitalCents
	const compoundOneRCents = monthCapital.oneRCents
	const effectiveTierIndex =
		ladderRules.length > 0
			? resolveTier(effectiveCapitalCents, ladderRules).tierIndex
			: monthRow.snapshotTierIndex

	const { planGoalCents, planGoalSource } = deriveMonthGoal({
		manualGoalCents: monthRow.monthlyGoalCents,
		weekTargetRs: weeks.map((w) => w.targetR),
		snapshotOneRCents: compoundOneRCents,
		cascadeDailyTargetR: resolved?.dailyTargetR.value ?? null,
		totalTradingDays,
		assertivityPct,
	})

	const resolvedProfileId = behavior.riskProfileId
	const resolvedProfileSource = behavior.riskProfileId_provenance
	const resolvedProfile = resolvedProfileId
		? (riskProfiles.find((p) => p.id === resolvedProfileId) ?? null)
		: null

	return (
		<div className="space-y-m-400">
			<MonthHeader
				year={year}
				quarter={quarter}
				month={month}
				locale={locale}
				monthLabel={monthLabel}
				monthlyPlanId={monthRow.id}
				riskProfiles={riskProfiles}
				existing={{
					monthlyGoalCents: monthRow.monthlyGoalCents,
					intentNotes: monthRow.intentNotes,
					postMortemNotes: monthRow.postMortemNotes,
					overrideRiskProfileId: monthRow.overrideRiskProfileId,
				}}
			/>

			<PlanVsReality
				monthLabel={monthLabel}
				planGoalCents={planGoalCents}
				planGoalSource={planGoalSource}
				totalTradingDays={totalTradingDays}
				daysTraded={daysTraded}
				tradingDaysRemaining={daysRemaining}
				currentNetProfitCents={netAfterTaxCents}
				projectedNetProfitCents={projectedNetCents}
				dailyAverageCents={dailyAverageCents}
				irTaxRate={irTaxRate}
			/>

			<HawksScorecardPanel accountId={accountId} year={year} month={month} />

			{resolved && (
				<CapsStrip
					monthlyPlanId={monthRow.id}
					tierIndex={effectiveTierIndex}
					oneRCents={compoundOneRCents}
					capitalCents={effectiveCapitalCents}
					capitalIsRealCarryForward={monthCapital.isRealCarryForward}
					dailyLossR={resolved.dailyLossR}
					dailyTargetR={resolved.dailyTargetR}
					weeklyLossR={resolved.weeklyLossR}
					monthlyLossR={resolved.monthlyLossR}
				/>
			)}

			<MonthWeekTable
				oneRCents={compoundOneRCents}
				planWeeks={weeks
					.map((w) => ({
						weeklyPlanId: w.id,
						isoWeek: w.isoWeek,
						isoYear: w.isoYear,
						targetR: w.targetR,
						actualR: w.actualR,
					}))
					.sort((a, b) => a.isoWeek - b.isoWeek)}
				actualWeeks={monthlyData?.weeklyBreakdown ?? []}
				monthlyGoalCents={planGoalCents}
			/>

			{darfRow && (
				<MonthDarfRow
					accountId={accountId}
					year={year}
					month={month}
					darfStatus={darfRow.darfStatus}
					darfDueCents={darfRow.darfDueCents}
					darfDueDate={darfRow.darfDueDate}
					darfPaidAmountCents={darfRow.darfPaidAmountCents}
					darfPaidAt={darfRow.darfPaidAt ?? null}
					isFinal={isMonthFinalized(year, month)}
				/>
			)}

			{comparisonData?.previousMonth && (
				<section
					className="border-bg-300 bg-bg-200 rounded-lg border"
					aria-label={t("comparison.ariaLabel")}
				>
					<header className="px-m-400 py-s-300 flex items-baseline justify-between">
						<span className="text-small text-txt-100 font-medium">
							{t("comparison.heading")}
						</span>
						<span className="text-tiny text-txt-300">{t("comparison.vs")}</span>
					</header>
					<div className="border-bg-300 p-m-400 border-t">
						<MonthComparison
							current={comparisonData.currentMonth}
							previous={comparisonData.previousMonth}
							changes={comparisonData.changes}
						/>
					</div>
				</section>
			)}

			<section
				id="month-narrative"
				className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border"
				aria-label={t("narrative.ariaLabel")}
			>
				<header className="flex items-baseline justify-between">
					<h2 className="text-small text-txt-100 font-medium">
						{t("narrative.heading")}
					</h2>
					<span className="text-tiny text-txt-300">
						{t("narrative.riskProfile")}{" "}
						<span className="text-txt-200">
							{resolvedProfile?.name ?? t("narrative.none")}
						</span>
						<span className="ml-s-100 bg-bg-100 px-s-100 text-micro rounded-sm py-px tracking-wider uppercase">
							{resolvedProfileSource === "fallback"
								? t("narrative.default")
								: resolvedProfileSource}
						</span>
					</span>
				</header>
				<div className="mt-s-300 gap-m-400 grid sm:grid-cols-2">
					<div>
						<p className="text-tiny text-txt-300 tracking-wider uppercase">
							{t("narrative.focusLabel")}
						</p>
						<p className="mt-s-100 text-small text-txt-100 whitespace-pre-wrap">
							{monthRow.intentNotes || (
								<span className="text-txt-300">
									{t("narrative.noFocusNote")}
								</span>
							)}
						</p>
					</div>
					<div>
						<p className="text-tiny text-txt-300 tracking-wider uppercase">
							{t("narrative.postMortemLabel")}
						</p>
						<p className="mt-s-100 text-small text-txt-100 whitespace-pre-wrap">
							{monthRow.postMortemNotes || (
								<span className="text-txt-300">
									{t("narrative.noPostMortemNote")}
								</span>
							)}
						</p>
					</div>
				</div>
			</section>
		</div>
	)
}

export { MonthReport }
export type { MonthReportProps }
