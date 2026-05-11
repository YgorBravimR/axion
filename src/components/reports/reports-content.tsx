"use client"

import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
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
import { RDistributionTab } from "./r-distribution-tab"
import type {
	WeeklyReport,
	MonthlyReport,
	MistakeCostAnalysis,
	CommissionFeeImpact,
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
import {
	MonthlyDarfCard,
	CarryoverLedger,
	AnnualTaxSummary,
} from "@/components/tax"
import { markDarfPaid } from "@/app/actions/tax-engine"
import { isMonthFinalized } from "@/lib/tax/month-status"

interface ReportsContentProps {
	weeklyReport: WeeklyReport | null
	monthlyReport: MonthlyReport | null
	mistakeCostAnalysis: MistakeCostAnalysis | null
	commissionFeeImpact: CommissionFeeImpact | null
	annualRollupData: AnnualRollupData | null
	weeklyMetaData: WeeklyMetaVsRealData | null
	capitalEvents: CapitalEvent[]
	currentYear: number
	darfRow: MonthlyDarfRow | null
	carryoverHistory: CarryoverHistoryRow[]
	yearSummary: YearTaxSummary | null
	currentAccountId: string
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
	darfRow,
	carryoverHistory,
	yearSummary,
	currentAccountId,
}: ReportsContentProps) => {
	const t = useTranslations("reports")
	const router = useRouter()
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
			{/* Weekly and Monthly side by side on larger screens */}
			<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid md:grid-cols-2 lg:grid-cols-2">
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
					<div className="border-acc-100 pl-s-300 flex items-center justify-between border-l-2">
						<h2
							id="annual-section-heading"
							className="text-txt-200 text-tiny tracking-wider uppercase"
						>
							Annual Report — {currentYear}
						</h2>
					</div>

					{weeklyMetaData && (
						<div className="space-y-s-200">
							<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
								Weekly Meta vs Real
							</h3>
							<WeeklyMetaChart data={weeklyMetaData} />
						</div>
					)}

					{annualRollupData && (
						<div className="space-y-s-200">
							<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
								Annual Rollup
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
								onLogged={() => router.refresh()}
							/>
						)}

					<CapitalEventLog
						events={capitalEvents}
						year={currentYear}
						onEventDeleted={() => router.refresh()}
						onEventAdded={() => router.refresh()}
					/>
				</section>
			)}

			{darfRow && (
				<section
					aria-labelledby="tax-section-heading"
					className="space-y-m-400 sm:space-y-m-500"
				>
					<div className="border-acc-100 pl-s-300 flex items-center justify-between border-l-2">
						<h2
							id="tax-section-heading"
							className="text-txt-200 text-tiny tracking-wider uppercase"
						>
							Impostos — {currentYear}
						</h2>
					</div>
					<div className="gap-m-400 grid lg:grid-cols-2">
						{(() => {
							const monthDate =
								darfRow.month instanceof Date
									? darfRow.month
									: new Date(darfRow.month)
							const ledgerYear = monthDate.getUTCFullYear()
							const ledgerMonth = monthDate.getUTCMonth() + 1
							const isFinal = isMonthFinalized(ledgerYear, ledgerMonth)
							return (
								<MonthlyDarfCard
									ledgerRow={darfRow}
									isFinal={isFinal}
									onMarkPaid={async (paidAmountCents) => {
										const result = await markDarfPaid({
											accountId: currentAccountId,
											year: ledgerYear,
											month: ledgerMonth,
											paidAmountCents,
										})
										if (result.status === "error") {
											console.error("Failed to mark DARF paid:", result.errors)
										}
										router.refresh()
									}}
								/>
							)
						})()}
						{yearSummary && (
							<AnnualTaxSummary year={currentYear} summary={yearSummary} />
						)}
					</div>
					{carryoverHistory.length > 0 && (
						<div className="space-y-s-200">
							<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
								Prejuízo a Compensar
							</h3>
							<CarryoverLedger history={carryoverHistory} />
						</div>
					)}
				</section>
			)}

			{/* R-Distribution Section (fractal plan) */}
			<section
				aria-labelledby="r-dist-section-heading"
				className="space-y-m-400"
			>
				<div className="border-acc-100 pl-s-300 border-l-2">
					<h2
						id="r-dist-section-heading"
						className="text-txt-200 text-tiny tracking-wider uppercase"
					>
						R Distribution — {currentYear}
					</h2>
				</div>
				<RDistributionTab
					from={new Date(currentYear, 0, 1)}
					to={new Date(currentYear, 11, 31, 23, 59, 59)}
				/>
			</section>
		</div>
	)
}
