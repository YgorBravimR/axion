import { cache } from "react"
import {
	getWeeklyReport,
	getMonthlyReport,
	getMistakeCostAnalysis,
	getCommissionFeeImpact,
	getMonthlyResultsWithProp,
	getMonthlyProjection,
	getMonthComparison,
} from "@/app/actions/reports"
import {
	getAnnualRollup,
	getWeeklyMetaVsReal,
	getCapitalSnapshot,
} from "@/app/actions/annual-reports"
import {
	getMonthlyDarf,
	getCarryoverState,
	getYearTaxSummary,
} from "@/app/actions/tax-engine"
import { WeeklyReportCard } from "./weekly-report-card"
import { MonthlyReportCard } from "./monthly-report-card"
import { MistakeCostCard } from "./mistake-cost-card"
import { CommissionFeeImpactCard } from "./commission-fee-impact-card"
import { RDistributionServer } from "./r-distribution-server"
import {
	CapitalEventLog,
	WithdrawalCalculator,
	AnnualRollupTable,
} from "./index"
import { WeeklyMetaChart } from "./weekly-meta-chart"
import { CarryoverLedger, AnnualTaxSummary } from "@/components/tax"
import {
	MonthClosingSection as MonthClosingSectionComponent,
	type AccountType,
} from "./month-closing-section"

const cachedGetWeeklyReport = cache(getWeeklyReport)
const cachedGetMonthlyReport = cache(getMonthlyReport)
const cachedGetMistakeCostAnalysis = cache(getMistakeCostAnalysis)
const cachedGetCommissionFeeImpact = cache(getCommissionFeeImpact)
const cachedGetAnnualRollup = cache(getAnnualRollup)
const cachedGetWeeklyMetaVsReal = cache(getWeeklyMetaVsReal)
const cachedGetCapitalSnapshot = cache(getCapitalSnapshot)
const cachedGetMonthlyDarf = cache(getMonthlyDarf)
const cachedGetCarryoverState = cache(getCarryoverState)
const cachedGetYearTaxSummary = cache(getYearTaxSummary)
const cachedGetMonthlyResultsWithProp = cache(getMonthlyResultsWithProp)
const cachedGetMonthlyProjection = cache(getMonthlyProjection)
const cachedGetMonthComparison = cache(getMonthComparison)

const WeeklyReportCardAsync = async () => {
	const result = await cachedGetWeeklyReport(0)
	const report = result.status === "success" ? (result.data ?? null) : null
	return <WeeklyReportCard initialReport={report} />
}

const MonthlyReportCardAsync = async () => {
	const result = await cachedGetMonthlyReport(0)
	const report = result.status === "success" ? (result.data ?? null) : null
	return <MonthlyReportCard initialReport={report} />
}

const MistakeCostCardAsync = async () => {
	const result = await cachedGetMistakeCostAnalysis()
	const data = result.status === "success" ? (result.data ?? null) : null
	return <MistakeCostCard data={data} />
}

const CommissionFeeImpactCardAsync = async () => {
	const result = await cachedGetCommissionFeeImpact()
	const data = result.status === "success" ? (result.data ?? null) : null
	return <CommissionFeeImpactCard data={data} />
}

interface AnnualReportSectionAsyncProps {
	currentYear: number
}

const AnnualReportSectionAsync = async ({
	currentYear,
}: AnnualReportSectionAsyncProps) => {
	const [annualRollupResult, weeklyMetaResult, capitalSnapshotResult] =
		await Promise.all([
			cachedGetAnnualRollup(currentYear).catch(() => ({
				status: "error" as const,
				data: null,
			})),
			cachedGetWeeklyMetaVsReal(currentYear).catch(() => ({
				status: "error" as const,
				data: null,
			})),
			cachedGetCapitalSnapshot().catch(() => ({
				status: "error" as const,
				data: null,
			})),
		])

	const annualRollupData =
		annualRollupResult.status === "success"
			? (annualRollupResult.data ?? null)
			: null
	const weeklyMetaData =
		weeklyMetaResult.status === "success"
			? (weeklyMetaResult.data ?? null)
			: null
	const capitalEvents =
		capitalSnapshotResult.status === "success"
			? (capitalSnapshotResult.data?.events ?? [])
			: []

	if (!annualRollupData && !weeklyMetaData) {
		return null
	}

	return (
		<section aria-labelledby="annual-section-heading" className="space-y-m-500">
			<div className="gap-s-200 flex items-center">
				<span
					className="bg-acc-100 h-1.5 w-1.5 rounded-full"
					aria-hidden="true"
				/>
				<h2
					id="annual-section-heading"
					className="text-txt-200 text-tiny tracking-wider uppercase"
				>
					Annual Report {currentYear}
				</h2>
			</div>

			{weeklyMetaData && (
				<div className="space-y-s-200">
					<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
						Weekly Meta
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
						withdrawalTargetPercent={annualRollupData.withdrawalTargetPercent}
						onLogged={() => {
							// Refresh will be handled by Next.js
						}}
					/>
				)}

			<CapitalEventLog
				events={capitalEvents}
				year={currentYear}
				onEventDeleted={() => {
					// Refresh will be handled by Next.js
				}}
				onEventAdded={() => {
					// Refresh will be handled by Next.js
				}}
			/>
		</section>
	)
}

interface TaxSectionAsyncProps {
	currentYear: number
	currentAccountId: string
}

const TaxSectionAsync = async ({
	currentYear,
	currentAccountId,
}: TaxSectionAsyncProps) => {
	const [yearSummaryResult, carryoverResult] = await Promise.all([
		cachedGetYearTaxSummary({
			accountId: currentAccountId,
			year: currentYear,
		}).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		cachedGetCarryoverState({ accountId: currentAccountId }).catch(() => ({
			status: "error" as const,
			data: null,
		})),
	])

	const yearSummary =
		yearSummaryResult.status === "success"
			? (yearSummaryResult.data ?? null)
			: null
	const carryoverHistory =
		carryoverResult.status === "success"
			? (carryoverResult.data?.history ?? [])
			: []

	if (!yearSummary && carryoverHistory.length === 0) {
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
					Year Tax {currentYear}
				</h2>
			</div>
			{yearSummary && (
				<AnnualTaxSummary year={currentYear} summary={yearSummary} />
			)}
			{carryoverHistory.length > 0 && (
				<div className="space-y-s-200">
					<h3 className="text-txt-300 text-tiny font-medium tracking-wider uppercase">
						Carryover
					</h3>
					<CarryoverLedger history={carryoverHistory} />
				</div>
			)}
		</section>
	)
}

interface RDistributionSectionAsyncProps {
	from: Date
	to: Date
}

const RDistributionSectionAsync = async ({
	from,
	to,
}: RDistributionSectionAsyncProps) => {
	return <RDistributionServer from={from} to={to} />
}

interface MonthClosingSectionProps {
	currentAccountId: string
	currentYear: number
	currentMonth: number
	accountType: AccountType
}

const MonthClosingSection = async ({
	currentAccountId,
	currentYear,
	currentMonth,
	accountType,
}: MonthClosingSectionProps) => {
	const [
		monthlyWithPropResult,
		projectionResult,
		comparisonResult,
		darfResult,
	] = await Promise.all([
		cachedGetMonthlyResultsWithProp(0).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		cachedGetMonthlyProjection().catch(() => ({
			status: "error" as const,
			data: null,
		})),
		cachedGetMonthComparison(0).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		cachedGetMonthlyDarf({
			accountId: currentAccountId,
			year: currentYear,
			month: currentMonth,
		}).catch(() => ({
			status: "error" as const,
			data: null,
		})),
	])

	const monthlyWithProp =
		monthlyWithPropResult.status === "success"
			? (monthlyWithPropResult.data ?? null)
			: null
	const projectionData =
		projectionResult.status === "success"
			? (projectionResult.data ?? null)
			: null
	const comparisonData =
		comparisonResult.status === "success"
			? (comparisonResult.data ?? null)
			: null
	const darfRow =
		darfResult.status === "success" ? (darfResult.data ?? null) : null

	return (
		<MonthClosingSectionComponent
			accountType={accountType}
			currentAccountId={currentAccountId}
			currentYear={currentYear}
			currentMonth={currentMonth}
			monthlyData={monthlyWithProp}
			projectionData={projectionData}
			comparisonData={comparisonData}
			darfRow={darfRow}
		/>
	)
}

export {
	WeeklyReportCardAsync,
	MonthlyReportCardAsync,
	MistakeCostCardAsync,
	CommissionFeeImpactCardAsync,
	AnnualReportSectionAsync,
	TaxSectionAsync,
	RDistributionSectionAsync,
	MonthClosingSection,
}
