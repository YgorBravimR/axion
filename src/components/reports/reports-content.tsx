"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { BarChart2 } from "lucide-react"
import { WeeklyReportCard } from "./weekly-report-card"
import { MonthlyReportCard } from "./monthly-report-card"
import { MistakeCostCard } from "./mistake-cost-card"
import { CommissionFeeImpactCard } from "./commission-fee-impact-card"
import type {
	WeeklyReport,
	MonthlyReport,
	MistakeCostAnalysis,
	CommissionFeeImpact,
} from "@/app/actions/reports"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { reportsGuide } from "@/components/ui/page-guide/guide-configs/reports"

interface ReportsContentProps {
	weeklyReport: WeeklyReport | null
	monthlyReport: MonthlyReport | null
	mistakeCostAnalysis: MistakeCostAnalysis | null
	commissionFeeImpact: CommissionFeeImpact | null
}

export const ReportsContent = ({
	weeklyReport,
	monthlyReport,
	mistakeCostAnalysis,
	commissionFeeImpact,
}: ReportsContentProps) => {
	const t = useTranslations("reports")
	useRegisterPageGuide(reportsGuide)

	const allNull =
		weeklyReport === null &&
		monthlyReport === null &&
		mistakeCostAnalysis === null &&
		commissionFeeImpact === null

	if (allNull) {
		return (
			<div className="flex flex-col items-center justify-center py-l-700 sm:py-l-800 text-center">
				<BarChart2 className="text-txt-300 mb-m-400 h-12 w-12" aria-hidden="true" />
				<p className="text-body text-txt-200 font-medium">{t("emptyState")}</p>
				<p className="text-small text-txt-300 mt-s-200 max-w-sm">
					{t("emptyStateHint")}
				</p>
				<Link
					href="/journal/new"
					className="text-acc-100 hover:underline text-small mt-m-400"
				>
					{t("goToJournal")}
				</Link>
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Weekly and Monthly side by side on larger screens */}
			<div className="grid gap-m-400 sm:gap-m-500 lg:gap-m-600 md:grid-cols-2 lg:grid-cols-2">
				<WeeklyReportCard initialReport={weeklyReport} />
				<MonthlyReportCard initialReport={monthlyReport} />
			</div>

			{/* Mistake Cost Analysis */}
			<MistakeCostCard data={mistakeCostAnalysis} />

			{/* Commission & Fee Impact */}
			<CommissionFeeImpactCard data={commissionFeeImpact} />
		</div>
	)
}
