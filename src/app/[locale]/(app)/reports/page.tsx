import { setRequestLocale } from "next-intl/server"
import { ReportsContent } from "@/components/reports"
import {
	getWeeklyReport,
	getMonthlyReport,
	getMistakeCostAnalysis,
	getCommissionFeeImpact,
} from "@/app/actions/reports"
import {
	getAnnualRollup,
	getWeeklyMetaVsReal,
	getCapitalSnapshot,
} from "@/app/actions/annual-reports"
import { requireAuth } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import {
	getMonthlyDarf,
	getCarryoverState,
	getYearTaxSummary,
} from "@/app/actions/tax-engine"

interface ReportsPageProps {
	params: Promise<{ locale: string }>
}

const ReportsPage = async ({ params }: ReportsPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const { accountId: currentAccountId } = await requireAuth()
	const now = await getServerEffectiveNow()
	const currentYear = now.getFullYear()
	const currentMonth = now.getMonth() + 1

	const [
		weeklyResult,
		monthlyResult,
		mistakeResult,
		feeResult,
		annualRollupResult,
		weeklyMetaResult,
		capitalSnapshotResult,
		darfResult,
		carryoverResult,
		yearSummaryResult,
	] = await Promise.all([
		getWeeklyReport(0).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getMonthlyReport(0).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getMistakeCostAnalysis().catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getCommissionFeeImpact().catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getAnnualRollup(currentYear).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getWeeklyMetaVsReal(currentYear).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getCapitalSnapshot().catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getMonthlyDarf({ accountId: currentAccountId, year: currentYear, month: currentMonth }).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getCarryoverState({ accountId: currentAccountId }).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getYearTaxSummary({ accountId: currentAccountId, year: currentYear }).catch(() => ({
			status: "error" as const,
			data: null,
		})),
	])

	const weeklyReport =
		weeklyResult.status === "success" ? weeklyResult.data ?? null : null
	const monthlyReport =
		monthlyResult.status === "success" ? monthlyResult.data ?? null : null
	const mistakeCostAnalysis =
		mistakeResult.status === "success" ? mistakeResult.data ?? null : null
	const commissionFeeImpact =
		feeResult.status === "success" ? feeResult.data ?? null : null
	const annualRollupData =
		annualRollupResult.status === "success" ? annualRollupResult.data ?? null : null
	const weeklyMetaData =
		weeklyMetaResult.status === "success" ? weeklyMetaResult.data ?? null : null
	const capitalEvents =
		capitalSnapshotResult.status === "success"
			? capitalSnapshotResult.data?.events ?? []
			: []

	const darfRow = darfResult.status === "success" ? darfResult.data ?? null : null
	const carryoverHistory =
		carryoverResult.status === "success" ? carryoverResult.data?.history ?? [] : []
	const yearSummary = yearSummaryResult.status === "success" ? yearSummaryResult.data ?? null : null

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<ReportsContent
					weeklyReport={weeklyReport}
					monthlyReport={monthlyReport}
					mistakeCostAnalysis={mistakeCostAnalysis}
					commissionFeeImpact={commissionFeeImpact}
					annualRollupData={annualRollupData}
					weeklyMetaData={weeklyMetaData}
					capitalEvents={capitalEvents}
					currentYear={currentYear}
					darfRow={darfRow}
					carryoverHistory={carryoverHistory}
					yearSummary={yearSummary}
					currentAccountId={currentAccountId}
				/>
			</div>
		</div>
	)
}

export { ReportsPage as default }
