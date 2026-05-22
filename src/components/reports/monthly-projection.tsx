"use client"

import { useTranslations } from "next-intl"
import { TrendingUp, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"
import type { MonthlyProjection as MonthlyProjectionData } from "@/app/actions/reports.types"

interface MonthlyProjectionProps {
	data: MonthlyProjectionData
}

export const MonthlyProjection = ({ data }: MonthlyProjectionProps) => {
	const t = useTranslations("monthly.projection")
	const { formatCurrency } = useFormatting()

	const progressPercent = Math.min(
		100,
		(data.daysTraded / data.totalTradingDays) * 100
	)

	return (
		<div
			id="monthly-projection"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<h3 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
				<TrendingUp className="text-acc-100 h-5 w-5" aria-hidden="true" />
				{t("title")}
			</h3>

			<div className="mt-m-400 sm:mt-m-500 space-y-s-300 sm:space-y-m-400">
				{/* Progress Bar */}
				<div className="space-y-s-200">
					<div className="text-small flex items-center justify-between">
						<div className="gap-s-200 text-txt-200 flex items-center">
							<CalendarDays className="h-4 w-4" aria-hidden="true" />
							<span>
								{t("daysTraded", {
									current: data.daysTraded,
									total: data.totalTradingDays,
								})}
							</span>
						</div>
						<span className="text-acc-100">{progressPercent.toFixed(0)}%</span>
					</div>
					<div className="bg-bg-100 h-3 w-full overflow-hidden rounded-full">
						<div
							className="bg-acc-100 h-full rounded-full transition-[width] duration-500"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
				</div>

				{/* Stats Grid */}
				<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2">
					{/* Daily Average */}
					<div className="bg-bg-100 p-s-300 rounded-sm">
						<p className="text-tiny text-txt-300">{t("dailyAverage")}</p>
						<p
							className={cn(
								"text-body font-medium",
								data.dailyAverage > 0 && "text-trade-buy",
								data.dailyAverage < 0 && "text-trade-sell",
								data.dailyAverage === 0 && "text-txt-100"
							)}
						>
							{formatCurrency(data.dailyAverage)}
						</p>
					</div>

					{/* Days Remaining */}
					<div className="bg-bg-100 p-s-300 rounded-sm">
						<p className="text-tiny text-txt-300">{t("daysRemaining")}</p>
						<p className="text-body text-txt-100 font-medium">
							{data.tradingDaysRemaining}
						</p>
					</div>

					{/* Projected Monthly */}
					<div className="bg-bg-100 p-s-300 rounded-sm">
						<p className="text-tiny text-txt-300">{t("projectedMonthly")}</p>
						<p
							className={cn(
								"text-body font-medium",
								data.projectedMonthlyProfit > 0 && "text-trade-buy",
								data.projectedMonthlyProfit < 0 && "text-trade-sell",
								data.projectedMonthlyProfit === 0 && "text-txt-100"
							)}
						>
							{formatCurrency(data.projectedMonthlyProfit)}
						</p>
					</div>

					{/* Projected Net */}
					<div className="bg-acc-100/10 p-s-300 rounded-sm">
						<p className="text-tiny text-txt-300">{t("projectedNet")}</p>
						<p
							className={cn(
								"text-body font-medium",
								data.projectedNetProfit > 0 && "text-trade-buy",
								data.projectedNetProfit < 0 && "text-trade-sell",
								data.projectedNetProfit === 0 && "text-txt-100"
							)}
						>
							{formatCurrency(data.projectedNetProfit)}
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
