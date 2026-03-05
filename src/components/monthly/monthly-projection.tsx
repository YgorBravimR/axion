"use client"

import { useTranslations, useLocale } from "next-intl"
import { TrendingUp, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MonthlyProjection as MonthlyProjectionData } from "@/app/actions/reports"

interface MonthlyProjectionProps {
	data: MonthlyProjectionData
}

export const MonthlyProjection = ({ data }: MonthlyProjectionProps) => {
	const t = useTranslations("monthly.projection")
	const locale = useLocale()

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
			style: "currency",
			currency: locale === "pt-BR" ? "BRL" : "USD",
			minimumFractionDigits: 2,
		}).format(value)
	}

	const progressPercent = Math.min(
		100,
		(data.daysTraded / data.totalTradingDays) * 100
	)

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			<h3 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
				<TrendingUp className="h-5 w-5 text-acc-100" />
				{t("title")}
			</h3>

			<div className="mt-m-400 sm:mt-m-500 space-y-s-300 sm:space-y-m-400">
				{/* Progress Bar */}
				<div className="space-y-s-200">
					<div className="flex items-center justify-between text-small">
						<div className="flex items-center gap-s-200 text-txt-200">
							<CalendarDays className="h-4 w-4" />
							<span>
								{t("daysTraded", {
									current: data.daysTraded,
									total: data.totalTradingDays,
								})}
							</span>
						</div>
						<span className="text-acc-100">
							{progressPercent.toFixed(0)}%
						</span>
					</div>
					<div className="h-3 w-full overflow-hidden rounded-full bg-bg-100">
						<div
							className="h-full rounded-full bg-acc-100 transition-[width] duration-500"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
				</div>

				{/* Stats Grid */}
				<div className="grid grid-cols-2 gap-s-300 sm:gap-m-400">
					{/* Daily Average */}
					<div className="rounded bg-bg-100 p-s-300">
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
					<div className="rounded bg-bg-100 p-s-300">
						<p className="text-tiny text-txt-300">{t("daysRemaining")}</p>
						<p className="text-body font-medium text-txt-100">
							{data.tradingDaysRemaining}
						</p>
					</div>

					{/* Projected Monthly */}
					<div className="rounded bg-bg-100 p-s-300">
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
					<div className="rounded bg-acc-100/10 p-s-300">
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
