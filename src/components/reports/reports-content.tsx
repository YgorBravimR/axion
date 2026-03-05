"use client"

import { WeeklyReportCard } from "./weekly-report-card"
import { MonthlyReportCard } from "./monthly-report-card"
import { MistakeCostCard } from "./mistake-cost-card"
import type { WeeklyReport, MonthlyReport, MistakeCostAnalysis } from "@/app/actions/reports"

interface ReportsContentProps {
	weeklyReport: WeeklyReport | null
	monthlyReport: MonthlyReport | null
	mistakeCostAnalysis: MistakeCostAnalysis | null
}

export const ReportsContent = ({
	weeklyReport,
	monthlyReport,
	mistakeCostAnalysis,
}: ReportsContentProps) => {
	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Weekly and Monthly side by side on larger screens */}
			<div className="grid gap-m-400 sm:gap-m-500 lg:gap-m-600 lg:grid-cols-2">
				<WeeklyReportCard initialReport={weeklyReport} />
				<MonthlyReportCard initialReport={monthlyReport} />
			</div>

			{/* Mistake Cost Analysis */}
			<MistakeCostCard data={mistakeCostAnalysis} />
		</div>
	)
}
