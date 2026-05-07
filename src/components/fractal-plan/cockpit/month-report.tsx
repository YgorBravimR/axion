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
import {
	MONTH_LABEL_PT,
	DEFAULT_TRADING_DAYS_PER_MONTH,
} from "@/lib/fractal-plan/month-labels"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import {
	getMonthlyResultsWithProp,
	getMonthlyProjection,
	getMonthComparison,
} from "@/app/actions/reports"
import { getMonthlyDarf } from "@/app/actions/tax-engine"
import { getDayTradeIrRate } from "@/lib/tax/legal-rates"
import { isMonthFinalized } from "@/lib/tax/month-status"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { MonthHeader } from "./month-header"
import { PlanVsReality } from "./plan-vs-reality"
import { CapsStrip } from "./caps-strip"
import { MonthWeekTable } from "./month-week-table"
import { MonthDarfRow } from "./month-darf-row"
import { MonthComparison } from "@/components/monthly/month-comparison"

interface MonthReportProps {
	accountId: string
	year: number
	quarter: number
	month: number
	locale: string
}

const computeMonthOffset = (year: number, month: number): number => {
	const now = new Date()
	const nowY = now.getUTCFullYear()
	const nowM = now.getUTCMonth() + 1
	return (nowY - year) * 12 + (nowM - month)
}

const MonthReport = async ({ accountId, year, quarter, month, locale }: MonthReportProps) => {
	const monthLabel = `${MONTH_LABEL_PT[month]} ${year}`

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})

	if (!yearRow) {
		return (
			<PlanSection title={monthLabel} subtitle="Plano anual ainda não criado">
				<p className="text-txt-200">
					Crie o plano anual primeiro em{" "}
					<a href={`/${locale}/plan/${year}`} className="text-acc-100 underline">
						/plan/{year}
					</a>
					.
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
			<PlanSection title={monthLabel} subtitle="Linha mensal não encontrada">
				<p className="text-txt-200">
					O plano anual deveria ter auto-semeado este mês. Verifique a integridade do plano anual.
				</p>
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
	] = await Promise.all([
		db.query.weeklyPlan.findMany({ where: eq(weeklyPlan.monthlyPlanId, monthRow.id) }),
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
			})
			.from(tradingAccounts)
			.where(eq(tradingAccounts.id, accountId))
			.then((rows) => rows[0] ?? null),
	])

	const riskProfiles =
		profilesResult.status === "success" && profilesResult.data ? profilesResult.data : []
	const monthlyData = monthlyResult.status === "success" ? monthlyResult.data ?? null : null
	const projectionData =
		projectionResult && projectionResult.status === "success" ? projectionResult.data ?? null : null
	const comparisonData =
		comparisonResult.status === "success" ? comparisonResult.data ?? null : null
	const darfRow = darfResult.status === "success" ? darfResult.data ?? null : null

	const irTaxRate = getDayTradeIrRate(year)
	const isPropAccount = account?.accountType === "prop"
	const profitSharePercent = account ? Number(account.profitSharePercentage) : 100
	const showTaxEstimates = account?.showTaxEstimates ?? true

	const grossPnlCents = monthlyData ? Math.round(monthlyData.report.netPnl * 100) : 0
	const traderShareCents =
		isPropAccount && grossPnlCents > 0
			? Math.round((grossPnlCents * profitSharePercent) / 100)
			: grossPnlCents
	const netAfterTaxCents =
		showTaxEstimates && traderShareCents > 0
			? Math.round(traderShareCents * (1 - irTaxRate))
			: traderShareCents

	const totalTradingDays = projectionData?.totalTradingDays ?? DEFAULT_TRADING_DAYS_PER_MONTH
	const daysTraded = projectionData?.daysTraded ?? 0
	const daysRemaining = projectionData?.tradingDaysRemaining ?? Math.max(0, totalTradingDays - daysTraded)
	const dailyAverageCents = projectionData ? Math.round(projectionData.dailyAverage * 100) : 0
	const projectedNetCents = projectionData ? Math.round(projectionData.projectedNetProfit * 100) : null

	const { planGoalCents, planGoalSource } = deriveMonthGoal({
		manualGoalCents: monthRow.monthlyGoalCents,
		weekTargetRs: weeks.map((w) => w.targetR),
		snapshotOneRCents: monthRow.snapshotOneRCents,
		cascadeDailyTargetR: resolved?.dailyTargetR.value ?? null,
		totalTradingDays,
	})

	const resolvedProfileId = behavior.riskProfileId
	const resolvedProfileSource = behavior.riskProfileId_provenance
	const resolvedProfile = resolvedProfileId
		? riskProfiles.find((p) => p.id === resolvedProfileId) ?? null
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

			{resolved && (
				<CapsStrip
					monthlyPlanId={monthRow.id}
					tierIndex={monthRow.snapshotTierIndex}
					oneRCents={monthRow.snapshotOneRCents}
					capitalCents={monthRow.snapshotCapitalCents}
					dailyLossR={resolved.dailyLossR}
					dailyTargetR={resolved.dailyTargetR}
					weeklyLossR={resolved.weeklyLossR}
					monthlyLossR={resolved.monthlyLossR}
				/>
			)}

			<MonthWeekTable
				oneRCents={monthRow.snapshotOneRCents}
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
					className="rounded-lg border border-bg-300 bg-bg-200"
					aria-label="Comparativo mês a mês"
				>
					<header className="flex items-baseline justify-between px-m-400 py-s-300">
						<span className="font-medium text-small text-txt-100">Comparativo</span>
						<span className="text-tiny text-txt-300">vs mês anterior</span>
					</header>
					<div className="border-t border-bg-300 p-m-400">
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
				className="rounded-lg border border-bg-300 bg-bg-200 p-m-400"
				aria-label="Foco e pós-mortem do mês"
			>
				<header className="flex items-baseline justify-between">
					<h2 className="text-small font-medium text-txt-100">Foco · pós-mortem</h2>
					<span className="text-tiny text-txt-300">
						Perfil de risco:{" "}
						<span className="text-txt-200">{resolvedProfile?.name ?? "Nenhum"}</span>
						<span className="ml-s-100 rounded-sm bg-bg-100 px-s-100 py-px text-micro uppercase tracking-wider">
							{resolvedProfileSource === "fallback" ? "padrão" : resolvedProfileSource}
						</span>
					</span>
				</header>
				<div className="mt-s-300 grid gap-m-400 sm:grid-cols-2">
					<div>
						<p className="text-tiny uppercase tracking-wider text-txt-300">Foco</p>
						<p className="mt-s-100 whitespace-pre-wrap text-small text-txt-100">
							{monthRow.intentNotes || (
								<span className="text-txt-300">Sem nota — defina pelo botão "Editar plano".</span>
							)}
						</p>
					</div>
					<div>
						<p className="text-tiny uppercase tracking-wider text-txt-300">Pós-mortem</p>
						<p className="mt-s-100 whitespace-pre-wrap text-small text-txt-100">
							{monthRow.postMortemNotes || (
								<span className="text-txt-300">Sem revisão — defina pelo botão "Editar plano".</span>
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
