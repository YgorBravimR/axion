import Link from "next/link"
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
import { resolveDay } from "@/lib/fractal-plan/resolver"
import {
	deriveMonthGoal,
	type PlanGoalSource,
} from "@/lib/fractal-plan/derive-goal"
import { getHistoricalAssertivity } from "@/lib/fractal-plan/historical-assertivity"
import { computeProjectedOneRCents } from "@/lib/fractal-plan/compound-projection"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"
import {
	monthLabelPt,
	monthAbbrPt,
	DEFAULT_TRADING_DAYS_PER_MONTH,
} from "@/lib/fractal-plan/month-labels"
import {
	getMonthlyResultsWithProp,
	getMonthlyProjection,
} from "@/app/actions/reports"
import { getMonthlyDarf } from "@/app/actions/tax-engine"
import { getDayTradeIrRate } from "@/lib/tax/legal-rates"
import { isMonthFinalized, isMonthCurrent } from "@/lib/tax/month-status"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { QuarterHeader } from "./quarter-header"
import { QuarterPlanVsReality } from "./quarter-plan-vs-reality"
import { QuarterMonthCard } from "./quarter-month-card"
import {
	DarfStrip,
	type DarfStripChip,
	type DarfStatus as UiDarfStatus,
} from "./darf-strip"

interface QuarterReportProps {
	accountId: string
	year: number
	quarter: number
	locale: string
}

const computeMonthOffset = (year: number, month: number): number => {
	const now = new Date()
	const nowY = now.getUTCFullYear()
	const nowM = now.getUTCMonth() + 1
	return (nowY - year) * 12 + (nowM - month)
}

const monthState = (
	year: number,
	month: number
): "past" | "current" | "future" => {
	if (isMonthFinalized(year, month)) {
		return "past"
	}
	if (isMonthCurrent(year, month)) {
		return "current"
	}
	return "future"
}

const QuarterReport = async ({
	accountId,
	year,
	quarter,
	locale,
}: QuarterReportProps) => {
	const [t, tSetup] = await Promise.all([
		getTranslations("plan.quarter"),
		getTranslations("plan.setup"),
	])
	const quarterLabel = `Q${quarter} ${year}`
	const months = [
		(quarter - 1) * 3 + 1,
		(quarter - 1) * 3 + 2,
		(quarter - 1) * 3 + 3,
	] as const
	const monthRangeLabel = months.map((m) => monthAbbrPt(m)).join(" · ")

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})
	if (!yearRow) {
		return (
			<PlanSection title={quarterLabel} subtitle={tSetup("noAnnualPlan")}>
				<p className="text-txt-200">
					{tSetup("noAnnualPlanBody")}{" "}
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

	if (!quarterRow) {
		return (
			<PlanSection title={quarterLabel} subtitle={t("noQuarterPlan")}>
				<p className="text-txt-200">{t("noQuarterPlanBody")}</p>
			</PlanSection>
		)
	}

	const account = await db
		.select({
			accountType: tradingAccounts.accountType,
			profitSharePercentage: tradingAccounts.profitSharePercentage,
			showTaxEstimates: tradingAccounts.showTaxEstimates,
		})
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.then((rows) => rows[0] ?? null)

	const irTaxRate = getDayTradeIrRate(year)
	const isPropAccount = account?.accountType === "prop"
	const profitSharePercent = account
		? Number(account.profitSharePercentage)
		: 100
	const showTaxEstimates = account?.showTaxEstimates ?? true

	const computeNetAfterTaxCents = (netPnl: number): number => {
		const grossCents = Math.round(netPnl * 100)
		const traderCents =
			isPropAccount && grossCents > 0
				? Math.round((grossCents * profitSharePercent) / 100)
				: grossCents
		return showTaxEstimates && traderCents > 0
			? Math.round(traderCents * (1 - irTaxRate))
			: traderCents
	}

	const [monthRowsRaw, assertivityData] = await Promise.all([
		db.query.monthlyPlan.findMany({
			where: and(eq(monthlyPlan.quarterlyPlanId, quarterRow.id)),
		}),
		getHistoricalAssertivity(accountId),
	])
	const monthRowByMonth = new Map(monthRowsRaw.map((m) => [m.month, m]))

	const configuredAssertivityPct = yearRow.defaultAssertivityPercent
		? Math.round(parseFloat(yearRow.defaultAssertivityPercent))
		: 50
	const assertivityPct = assertivityData.hasEnoughData
		? assertivityData.assertivityPct
		: configuredAssertivityPct

	const defaultDailyWinR = yearRow.defaultDailyWinR
		? parseFloat(yearRow.defaultDailyWinR)
		: 0
	const ladderRules = yearRow.ladderRules as unknown as LadderRuleR[]

	const perMonth = await Promise.all(
		months.map(async (m) => {
			const row = monthRowByMonth.get(m) ?? null
			const firstOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0))
			const offset = computeMonthOffset(year, m)
			const isCurrent = isMonthCurrent(year, m)

			const [weeks, resolved, monthlyResult, projectionResult, darfResult] =
				await Promise.all([
					row
						? db.query.weeklyPlan.findMany({
								where: eq(weeklyPlan.monthlyPlanId, row.id),
							})
						: Promise.resolve([]),
					resolveDay(accountId, firstOfMonth),
					getMonthlyResultsWithProp(offset),
					isCurrent ? getMonthlyProjection() : Promise.resolve(null),
					getMonthlyDarf({ accountId, year, month: m }),
				])

			const monthlyData =
				monthlyResult.status === "success" ? (monthlyResult.data ?? null) : null
			const projectionData =
				projectionResult && projectionResult.status === "success"
					? (projectionResult.data ?? null)
					: null
			const darfRow =
				darfResult.status === "success" ? (darfResult.data ?? null) : null

			const totalTradingDays =
				projectionData?.totalTradingDays ?? DEFAULT_TRADING_DAYS_PER_MONTH

			const compoundOneRCents =
				defaultDailyWinR > 0
					? computeProjectedOneRCents(m, {
							initialCapitalCents: yearRow.initialCapitalCents,
							ladderRules,
							dailyTargetR: defaultDailyWinR,
							assertivityPct,
						})
					: (row?.snapshotOneRCents ?? 0)

			const goal = row
				? deriveMonthGoal({
						manualGoalCents: row.monthlyGoalCents,
						weekTargetRs: weeks.map((w) => w.targetR),
						snapshotOneRCents: compoundOneRCents,
						cascadeDailyTargetR: resolved?.dailyTargetR.value ?? null,
						totalTradingDays,
						assertivityPct,
					})
				: { planGoalCents: null, planGoalSource: "none" as PlanGoalSource }

			const realizedNetCents = monthlyData
				? computeNetAfterTaxCents(monthlyData.report.netPnl)
				: null
			const projectedNetCents = projectionData
				? Math.round(projectionData.projectedNetProfit * 100)
				: null

			const tradeCount = monthlyData?.report.totalTrades ?? 0

			const finalized = isMonthFinalized(year, m)
			const uiDarfStatus: UiDarfStatus = finalized
				? (darfRow?.darfStatus ?? "unknown")
				: isCurrent
					? "in_progress"
					: "future"

			return {
				month: m,
				row,
				goal,
				realizedNetCents,
				projectedNetCents,
				darfStatus: uiDarfStatus,
				darfDueCents: darfRow?.darfDueCents ?? 0,
				tradeCount,
				state: monthState(year, m),
				tierIndex: row?.snapshotTierIndex ?? 0,
				oneRCents: row?.snapshotOneRCents ?? 0,
			}
		})
	)

	const goalSums = perMonth.reduce(
		(acc, p) => {
			if (p.goal.planGoalCents !== null) {
				acc.cents += p.goal.planGoalCents
				acc.sources.add(p.goal.planGoalSource)
			}
			return acc
		},
		{ cents: 0, sources: new Set<PlanGoalSource>() }
	)
	const aggregatedGoalCents = goalSums.cents > 0 ? goalSums.cents : null
	const aggregatedGoalSource:
		| "manual"
		| "weeks"
		| "default"
		| "mixed"
		| "none" = (() => {
		if (aggregatedGoalCents === null) {
			return "none"
		}
		if (goalSums.sources.size === 1) {
			const only = [...goalSums.sources][0]
			return only === "none" ? "none" : (only as "manual" | "weeks" | "default")
		}
		return "mixed"
	})()

	const realizedTotalCents = perMonth.reduce(
		(acc, p) => acc + (p.realizedNetCents ?? 0),
		0
	)
	const monthsTraded = perMonth.filter((p) => p.tradeCount > 0).length
	const totalMonths = months.length

	const currentMonthInQ = perMonth.find((p) => p.state === "current")
	const projectedQuarterNetCents =
		currentMonthInQ?.projectedNetCents !== null
			? perMonth.reduce(
					(acc, p) =>
						acc +
						(p === currentMonthInQ
							? (currentMonthInQ.projectedNetCents ?? 0)
							: (p.realizedNetCents ?? 0)),
					0
				)
			: null

	return (
		<div className="space-y-m-400">
			<QuarterHeader
				year={year}
				quarter={quarter}
				locale={locale}
				quarterLabel={quarterLabel}
				monthRangeLabel={monthRangeLabel}
				quarterlyPlanId={quarterRow.id}
				existing={{
					goalCents: quarterRow.goalCents,
					reflectionNotes: quarterRow.reflectionNotes,
					postMortemNotes: quarterRow.postMortemNotes,
				}}
			/>

			<QuarterPlanVsReality
				quarterLabel={quarterLabel}
				planGoalCents={
					quarterRow.goalCents !== null && quarterRow.goalCents > 0
						? quarterRow.goalCents
						: aggregatedGoalCents
				}
				planGoalSource={
					quarterRow.goalCents !== null && quarterRow.goalCents > 0
						? "manual"
						: aggregatedGoalSource
				}
				realizedNetCents={realizedTotalCents}
				projectedNetCents={projectedQuarterNetCents}
				monthsTraded={monthsTraded}
				totalMonths={totalMonths}
			/>

			<section
				aria-label={t("monthsAriaLabel")}
				className="gap-m-400 grid grid-cols-1 md:grid-cols-3"
			>
				{perMonth.map((p) => (
					<QuarterMonthCard
						key={p.month}
						href={`/${locale}/plan/${year}/${quarter}/${p.month}`}
						monthLabel={monthLabelPt(p.month)}
						state={p.state}
						tierIndex={p.tierIndex}
						oneRCents={p.oneRCents}
						planGoalCents={p.goal.planGoalCents}
						planGoalSource={p.goal.planGoalSource}
						realizedNetCents={p.realizedNetCents}
						projectedNetCents={p.projectedNetCents}
						darfStatus={p.darfStatus}
						darfDueCents={p.darfDueCents}
					/>
				))}
			</section>

			<section
				className="border-bg-300 bg-bg-200 rounded-lg border"
				aria-label={t("darfAriaLabel")}
			>
				<header className="px-m-400 py-s-300 flex items-baseline justify-between">
					<span className="text-small text-txt-100 font-medium">
						{t("darfTitle")}
					</span>
					<span className="text-tiny text-txt-300">{t("darfSubtitle")}</span>
				</header>
				<div className="border-bg-300 p-m-400 border-t">
					<DarfStrip
						chips={perMonth.map<DarfStripChip>((p) => ({
							monthIndex: p.month - 1,
							status: p.darfStatus,
							dueCents: p.darfDueCents,
						}))}
					/>
				</div>
			</section>

			{(quarterRow.reflectionNotes || quarterRow.postMortemNotes) && (
				<section
					id="quarter-narrative"
					className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border"
					aria-label={t("narrative.ariaLabel")}
				>
					<header className="flex items-baseline justify-between">
						<h2 className="text-small text-txt-100 font-medium">
							{t("narrative.heading")}
						</h2>
						<span className="text-tiny text-txt-300">{quarterLabel}</span>
					</header>
					<div className="mt-s-300 gap-m-400 grid sm:grid-cols-2">
						<div>
							<p className="text-tiny text-txt-300 tracking-wider uppercase">
								{t("narrative.reflectionLabel")}
							</p>
							<p className="mt-s-100 text-small text-txt-100 whitespace-pre-wrap">
								{quarterRow.reflectionNotes || (
									<span className="text-txt-300">
										{t("narrative.noReflectionNote")}
									</span>
								)}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-300 tracking-wider uppercase">
								{t("narrative.postMortemLabel")}
							</p>
							<p className="mt-s-100 text-small text-txt-100 whitespace-pre-wrap">
								{quarterRow.postMortemNotes || (
									<span className="text-txt-300">
										{t("narrative.noPostMortemNote")}
									</span>
								)}
							</p>
						</div>
					</div>
				</section>
			)}
		</div>
	)
}

export { QuarterReport }
export type { QuarterReportProps }
