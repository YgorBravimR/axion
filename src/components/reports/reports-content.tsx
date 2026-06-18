"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { BarChart2 } from "lucide-react"
import { WeeklyReportCard } from "./weekly-report-card"
import { MonthlyReportCard } from "./monthly-report-card"
import { MistakeCostCard } from "./mistake-cost-card"
import { CommissionFeeImpactCard } from "./commission-fee-impact-card"
import { WeeklyMetaChart } from "./weekly-meta-chart"
import { AnnualRollupTable } from "./annual-rollup-table"
import { CapitalEventLog } from "./capital-event-log"
import { WithdrawalCalculator } from "./withdrawal-calculator"
import { RDistributionServer } from "./r-distribution-server"
import { MonthClosingSection, type AccountType } from "./month-closing-section"
import type {
	WeeklyReport,
	MonthlyReport,
	MistakeCostAnalysis,
	CommissionFeeImpact,
	MonthlyResultsWithProp,
	MonthlyProjection as MonthlyProjectionData,
	MonthComparison as MonthComparisonData,
} from "@/app/actions/reports.types"
import type {
	AnnualRollupData,
	WeeklyMetaVsRealData,
} from "@/lib/reports/annual-types"
import type { CapitalEvent } from "@/types/integration"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { reportsGuide } from "@/components/ui/page-guide/guide-configs/reports"
import type { MonthlyDarfRow, YearTaxSummary } from "@/lib/tax/types"
import type { CarryoverHistoryRow } from "@/components/tax"
import { CarryoverLedger, AnnualTaxSummary } from "@/components/tax"

interface ReportsContentProps {
	weeklyReport: WeeklyReport | null
	monthlyReport: MonthlyReport | null
	mistakeCostAnalysis: MistakeCostAnalysis | null
	commissionFeeImpact: CommissionFeeImpact | null
	annualRollupData: AnnualRollupData | null
	weeklyMetaData: WeeklyMetaVsRealData | null
	capitalEvents: CapitalEvent[]
	currentYear: number
	currentMonth: number
	darfRow: MonthlyDarfRow | null
	carryoverHistory: CarryoverHistoryRow[]
	yearSummary: YearTaxSummary | null
	currentAccountId: string
	accountType: AccountType
	monthlyWithProp: MonthlyResultsWithProp | null
	projectionData: MonthlyProjectionData | null
	comparisonData: MonthComparisonData | null
}

export const ReportsContent = ({
	weeklyReport,
	monthlyReport,
	mistakeCostAnalysis,
	commissionFeeImpact,
	annualRollupData,
	weeklyMetaData,
	capitalEvents,
	currentYear,
	currentMonth,
	darfRow,
	carryoverHistory,
	yearSummary,
	currentAccountId,
	accountType,
	monthlyWithProp,
	projectionData,
	comparisonData,
}: ReportsContentProps) => {
	const t = useTranslations("reports")
	useRegisterPageGuide(reportsGuide)

	const allNull =
		weeklyReport === null &&
		monthlyReport === null &&
		mistakeCostAnalysis === null &&
		commissionFeeImpact === null &&
		annualRollupData === null &&
		weeklyMetaData === null &&
		darfRow === null &&
		yearSummary === null

	if (allNull) {
		return (
			<div className="py-l-700 sm:py-l-800 flex flex-col items-center justify-center text-center">
				<BarChart2
					className="text-txt-300 mb-m-400 h-12 w-12"
					aria-hidden="true"
				/>
				<p className="text-body text-txt-200 font-medium">{t("emptyState")}</p>
				<p className="text-small text-txt-300 mt-s-200 max-w-sm">
					{t("emptyStateHint")}
				</p>
				<Link
					href="/journal/new"
					className="text-acc-100 text-small mt-m-400 hover:underline"
				>
					{t("goToJournal")}
				</Link>
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Month Closing — absorbed from /monthly. Branches by account type. */}
			<MonthClosingSection
				accountType={accountType}
				currentAccountId={currentAccountId}
				currentYear={currentYear}
				currentMonth={currentMonth}
				monthlyData={monthlyWithProp}
				projectionData={projectionData}
				comparisonData={comparisonData}
				darfRow={darfRow}
			/>

			{/* Weekly and Monthly side by side on larger screens */}
			<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid lg:grid-cols-2">
				<WeeklyReportCard initialReport={weeklyReport} />
				<MonthlyReportCard initialReport={monthlyReport} />
			</div>

			{/* Mistake Cost Analysis */}
			<MistakeCostCard data={mistakeCostAnalysis} />

			{/* Commission & Fee Impact */}
			<CommissionFeeImpactCard data={commissionFeeImpact} />

			{/* Annual Report Section */}
			{(annualRollupData || weeklyMetaData) && (
				<section
					aria-labelledby="annual-section-heading"
					className="space-y-m-500"
				>
					<div className="gap-s-200 flex items-center">
						<span
							className="bg-acc-100 h-1.5 w-1.5 rounded-full"
							aria-hidden="true"
						/>
						<h2
							id="annual-section-heading"
							className="text-txt-200 text-tiny tracking-wider uppercase"
						>
							{t("annualReportTitle", { year: currentYear })}
						</h2>
					</div>

					{weeklyMetaData && (
						<div className="space-y-s-200">
							<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
								{t("weeklyMetaTitle")}
							</h3>
							<WeeklyMetaChart data={weeklyMetaData} />
						</div>
					)}

					{annualRollupData && (
						<div className="space-y-s-200">
							<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
								{t("annualRollupTitle")}
							</h3>
							<AnnualRollupTable data={annualRollupData} />
						</div>
					)}

					{annualRollupData &&
						annualRollupData.withdrawalTargetPercent !== null &&
						annualRollupData.withdrawalTargetPercent > 0 && (
							<WithdrawalCalculator
								currentMonthNetPnl={
									annualRollupData.rows.find(
										(r) => r.month === new Date().getMonth() + 1
									)?.resultadoLiquido ?? 0
								}
								withdrawalTargetPercent={
									annualRollupData.withdrawalTargetPercent
								}
							/>
						)}

					<CapitalEventLog events={capitalEvents} year={currentYear} />
				</section>
			)}

			{(() => {
				// Hide the year-tax block when the ledger is empty — otherwise the
				// Resumo Anual renders an all-zeros table that visually contradicts
				// the Consolidado Anual above it (which reads from trades, not the
				// ledger). Show the widget only when at least one ledger figure is
				// non-zero, or when carry-over history exists.
				const hasLedgerData =
					yearSummary !== null &&
					(yearSummary.grossGainCents !== 0 ||
						yearSummary.totalDarfPaidCents !== 0 ||
						yearSummary.totalDarfPendingCents !== 0 ||
						yearSummary.totalFeesCents !== 0 ||
						yearSummary.totalIrrfCents !== 0)
				if (!hasLedgerData && carryoverHistory.length === 0) {
					return null
				}
				return (
					<section
						aria-labelledby="tax-section-heading"
						className="space-y-m-400 sm:space-y-m-500"
					>
						<div className="gap-s-200 flex items-center">
							<span
								className="bg-acc-100 h-1.5 w-1.5 rounded-full"
								aria-hidden="true"
							/>
							<h2
								id="tax-section-heading"
								className="text-txt-200 text-tiny tracking-wider uppercase"
							>
								{t("yearTaxTitle", { year: currentYear })}
							</h2>
						</div>
						{hasLedgerData && yearSummary && (
							<AnnualTaxSummary year={currentYear} summary={yearSummary} />
						)}
						{carryoverHistory.length > 0 && (
							<div className="space-y-s-200">
								<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
									{t("carryoverTitle")}
								</h3>
								<CarryoverLedger history={carryoverHistory} />
							</div>
						)}
					</section>
				)
			})()}

			{/* R-Distribution Section (fractal plan) */}
			<section
				aria-labelledby="r-dist-section-heading"
				className="space-y-m-400"
			>
				<div className="gap-s-200 flex items-center">
					<span
						className="bg-acc-100 h-1.5 w-1.5 rounded-full"
						aria-hidden="true"
					/>
					<h2
						id="r-dist-section-heading"
						className="text-txt-200 text-tiny tracking-wider uppercase"
					>
						{t("rDistributionTitle", { year: currentYear })}
					</h2>
				</div>
				<RDistributionServer
					from={new Date(currentYear, 0, 1)}
					to={new Date(currentYear, 11, 31, 23, 59, 59)}
				/>
			</section>
		</div>
	)
}
