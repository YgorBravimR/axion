"use client"

import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { MonthlyDarfCard } from "@/components/tax"
import { markDarfPaid } from "@/app/actions/tax-engine"
import { isMonthFinalized } from "@/lib/tax/month-status"
import type { MonthlyDarfRow } from "@/lib/tax/types"
import type {
	MonthlyResultsWithProp,
	MonthlyProjection as MonthlyProjectionData,
	MonthComparison as MonthComparisonData,
} from "@/app/actions/reports.types"
import { PropProfitSummary } from "./prop-profit-summary"
import { MonthlyProjection } from "./monthly-projection"
import { MonthComparison } from "./month-comparison"
import { WeeklyBreakdown } from "./weekly-breakdown"

type AccountType = "personal" | "prop"

interface MonthClosingSectionProps {
	accountType: AccountType
	currentAccountId: string
	currentYear: number
	currentMonth: number
	monthlyData: MonthlyResultsWithProp | null
	projectionData: MonthlyProjectionData | null
	comparisonData: MonthComparisonData | null
	darfRow: MonthlyDarfRow | null
}

const MonthClosingSection = ({
	accountType,
	currentAccountId,
	currentYear,
	currentMonth,
	monthlyData,
	projectionData,
	comparisonData,
	darfRow,
}: MonthClosingSectionProps) => {
	const t = useTranslations("reports.monthClosing")
	const router = useRouter()
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS

	// If both data sources are empty we'd render an empty section — skip.
	const hasPersonalClosing = accountType === "personal" && darfRow !== null
	const hasPropClosing =
		accountType === "prop" &&
		monthlyData !== null &&
		monthlyData.report.totalTrades > 0
	if (!hasPersonalClosing && !hasPropClosing) {
		return null
	}

	const monthName = format(
		new Date(currentYear, currentMonth - 1, 1),
		"MMMM yyyy",
		{ locale: dateLocale }
	)

	const hasDetailContent =
		(projectionData !== null && comparisonData !== null) ||
		(monthlyData !== null && monthlyData.weeklyBreakdown.length > 0)

	return (
		<section
			aria-labelledby="month-closing-section-heading"
			className="space-y-m-400 sm:space-y-m-500"
		>
			<div className="gap-s-200 flex items-center">
				<span
					className="bg-acc-100 h-1.5 w-1.5 rounded-full"
					aria-hidden="true"
				/>
				<h2
					id="month-closing-section-heading"
					className="text-txt-200 text-tiny tracking-wider uppercase"
				>
					{t("title", { month: monthName })}
				</h2>
			</div>

			{/* Primary closing — branches by account type */}
			{hasPersonalClosing && darfRow && (
				<MonthlyDarfCard
					ledgerRow={darfRow}
					isFinal={isMonthFinalized(currentYear, currentMonth)}
					onMarkPaid={async (paidAmountCents) => {
						const result = await markDarfPaid({
							accountId: currentAccountId,
							year: currentYear,
							month: currentMonth,
							paidAmountCents,
						})
						if (result.status === "error") {
							console.error("Failed to mark DARF paid:", result.errors)
						}
						router.refresh()
					}}
				/>
			)}

			{hasPropClosing && monthlyData && (
				<PropProfitSummary
					data={monthlyData.prop}
					isPropAccount={monthlyData.settings.isPropAccount}
					propFirmName={monthlyData.settings.propFirmName}
					profitSharePercentage={monthlyData.settings.profitSharePercentage}
					taxRate={monthlyData.settings.dayTradeTaxRate}
				/>
			)}

			{/* Collapsible Month Detail — ported from /monthly */}
			{hasDetailContent && (
				<details className="border-bg-300 bg-bg-100 group rounded-lg border">
					<summary className="text-small text-txt-200 hover:text-txt-100 px-m-400 py-s-300 cursor-pointer font-medium select-none">
						{t("detailToggle")}
					</summary>
					<div className="px-m-400 pb-m-400 space-y-s-300 sm:space-y-m-400 pt-s-200">
						{projectionData && <MonthlyProjection data={projectionData} />}
						{comparisonData && (
							<MonthComparison
								current={comparisonData.currentMonth}
								previous={comparisonData.previousMonth}
								changes={comparisonData.changes}
							/>
						)}
						{monthlyData && monthlyData.weeklyBreakdown.length > 0 && (
							<WeeklyBreakdown weeks={monthlyData.weeklyBreakdown} />
						)}
					</div>
				</details>
			)}
		</section>
	)
}

export { MonthClosingSection, type AccountType }
