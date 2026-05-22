"use client"

import { useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { format, parseISO } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MonthlyProjection } from "@/components/reports/monthly-projection"
import { WeeklyBreakdown } from "@/components/reports/weekly-breakdown"
import { MonthComparison } from "@/components/reports/month-comparison"
import { useFormatting } from "@/hooks/use-formatting"
import {
	getMonthlyResultsWithProp,
	getMonthComparison,
} from "@/app/actions/reports"
import type {
	MonthlyResultsWithProp,
	MonthlyProjection as MonthlyProjectionData,
	MonthComparison as MonthComparisonData,
} from "@/app/actions/reports.types"

interface MonthlyContentProps {
	initialData: MonthlyResultsWithProp | null
	initialProjection: MonthlyProjectionData | null
	initialComparison: MonthComparisonData | null
}

const MonthlyContent = ({
	initialData,
	initialProjection,
	initialComparison,
}: MonthlyContentProps) => {
	const t = useTranslations("monthly")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS
	const { formatCurrency } = useFormatting()
	const [isPending, startTransition] = useTransition()

	const [monthOffset, setMonthOffset] = useState(0)
	const [data, setData] = useState<MonthlyResultsWithProp | null>(initialData)
	const [comparison, setComparison] = useState<MonthComparisonData | null>(
		initialComparison
	)
	const [projection] = useState<MonthlyProjectionData | null>(initialProjection)

	const handleMonthChange = (newOffset: number) => {
		startTransition(async () => {
			const [dataResult, compResult] = await Promise.all([
				getMonthlyResultsWithProp(newOffset),
				getMonthComparison(newOffset),
			])
			if (dataResult.status === "success" && dataResult.data) {
				setData(dataResult.data)
				setMonthOffset(newOffset)
			}
			if (compResult.status === "success" && compResult.data) {
				setComparison(compResult.data)
			}
		})
	}

	const monthName = data?.monthStart
		? format(parseISO(data.monthStart), "MMMM yyyy", { locale: dateLocale })
		: ""

	return (
		<div className="space-y-m-500 sm:space-y-l-700 lg:space-y-l-800">
			{/* Month Navigator */}
			<div className="flex items-center justify-between">
				<h1 className="text-h2 sm:text-h1 text-txt-100 font-semibold capitalize">
					{monthName}
				</h1>
				<div className="gap-s-200 flex items-center">
					{isPending && (
						<Loader2
							className="text-txt-300 h-4 w-4 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					)}
					<Button
						id="month-nav-previous"
						variant="ghost"
						size="sm"
						onClick={() => handleMonthChange(monthOffset + 1)}
						disabled={isPending}
						aria-label={t("previousMonth")}
					>
						<ChevronLeft className="h-4 w-4" aria-hidden="true" />
					</Button>
					<Button
						id="month-nav-next"
						variant="ghost"
						size="sm"
						onClick={() => handleMonthChange(Math.max(0, monthOffset - 1))}
						disabled={isPending || monthOffset === 0}
						aria-label={t("nextMonth")}
					>
						<ChevronRight className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			{data === null ? (
				<p className="text-txt-300 py-l-800 text-center">{t("errorLoading")}</p>
			) : (
				<>
					{/* Profit Summary Cards — always rendered (show $0.00 when no trades) */}
					<div className="gap-m-400 sm:gap-m-500 grid grid-cols-1 sm:grid-cols-3">
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<p className="text-tiny text-txt-300">{t("grossProfit")}</p>
							<p
								className={cn(
									"text-h3 font-bold",
									data.prop.grossProfit >= 0
										? "text-trade-buy"
										: "text-trade-sell"
								)}
							>
								{formatCurrency(data.prop.grossProfit)}
							</p>
						</div>
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<p className="text-tiny text-txt-300">{t("traderShare")}</p>
							<p
								className={cn(
									"text-h3 font-bold",
									data.prop.traderShare >= 0
										? "text-trade-buy"
										: "text-trade-sell"
								)}
							>
								{formatCurrency(data.prop.traderShare)}
							</p>
						</div>
						<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
							<p className="text-tiny text-txt-300">{t("netProfit")}</p>
							<p
								className={cn(
									"text-h3 font-bold",
									data.prop.netProfit >= 0
										? "text-trade-buy"
										: "text-trade-sell"
								)}
							>
								{formatCurrency(data.prop.netProfit)}
							</p>
						</div>
					</div>

					{data.report.totalTrades === 0 && (
						<p className="text-txt-300 py-m-500 text-center">{t("noData")}</p>
					)}

					{/* Monthly Projection — current month only */}
					{monthOffset === 0 && projection !== null && (
						<MonthlyProjection data={projection} />
					)}

					{/* Month Comparison */}
					{comparison !== null && (
						<MonthComparison
							current={comparison.currentMonth}
							previous={comparison.previousMonth}
							changes={comparison.changes}
						/>
					)}

					{/* Weekly Breakdown */}
					{data.weeklyBreakdown.length > 0 && (
						<WeeklyBreakdown weeks={data.weeklyBreakdown} />
					)}
				</>
			)}
		</div>
	)
}

export { MonthlyContent }
