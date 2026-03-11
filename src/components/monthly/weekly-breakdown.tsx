"use client"

import { useTranslations, useLocale } from "next-intl"
import { Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { format, parseISO } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import type { MonthlyReport } from "@/app/actions/reports"

interface WeeklyBreakdownProps {
	weeks: MonthlyReport["weeklyBreakdown"]
}

export const WeeklyBreakdown = ({ weeks }: WeeklyBreakdownProps) => {
	const t = useTranslations("monthly.weeklyBreakdown")
	const tCommon = useTranslations("common")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
			style: "currency",
			currency: locale === "pt-BR" ? "BRL" : "USD",
			minimumFractionDigits: 2,
		}).format(value)
	}

	if (weeks.length === 0) {
		return null
	}

	// Calculate max P&L for bar scaling
	const maxAbsPnl = Math.max(...weeks.map((w) => Math.abs(w.pnl)))
	const totalPnl = weeks.reduce((sum, w) => sum + w.pnl, 0)

	const formatDateRange = (start: string, end: string) => {
		const startDate = parseISO(start)
		const endDate = parseISO(end)
		const startDay = format(startDate, "dd", { locale: dateLocale })
		const endDay = format(endDate, "dd", { locale: dateLocale })
		return `${startDay}-${endDay}`
	}

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			<h3 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
				<Calendar className="h-5 w-5 text-acc-100" />
				{t("title")}
			</h3>

			<div className="mt-m-400 sm:mt-m-500 space-y-s-200 sm:space-y-s-300">
				{weeks.map((week, index) => {
					const barWidth = maxAbsPnl > 0 ? (Math.abs(week.pnl) / maxAbsPnl) * 100 : 0
					const isPositive = week.pnl > 0
					const pnlContribution =
						totalPnl !== 0 ? (week.pnl / totalPnl) * 100 : 0

					return (
						<div key={week.weekStart} className="space-y-s-100">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-s-200">
									<span className="text-small font-medium text-txt-100">
										{t("week", { number: index + 1 })}
									</span>
									<span className="text-tiny text-txt-300">
										({formatDateRange(week.weekStart, week.weekEnd)})
									</span>
								</div>
								<div className="flex items-center gap-s-200 sm:gap-m-400">
									<span className="hidden sm:inline text-tiny text-txt-300">
										{t("tradesCount", { count: week.tradeCount })}
									</span>
									<span className="hidden sm:inline text-tiny text-txt-300">
										{t("winRateSummary", { rate: week.winRate.toFixed(0), abbr: tCommon("winRateAbbr") })}
									</span>
									<span
										className={cn(
											"text-small font-medium",
											isPositive && "text-trade-buy",
											!isPositive && week.pnl < 0 && "text-trade-sell",
											week.pnl === 0 && "text-txt-100"
										)}
									>
										{formatCurrency(week.pnl)}
									</span>
								</div>
							</div>
							{/* P&L Bar */}
							<div className="relative h-3 w-full overflow-hidden rounded-full bg-bg-100">
								<div
									className={cn(
										"h-full rounded-full transition-[width]",
										isPositive && "bg-trade-buy/50",
										!isPositive && week.pnl < 0 && "bg-trade-sell/50",
										week.pnl === 0 && "bg-bg-300"
									)}
									style={{ width: `${barWidth}%` }}
								/>
								{pnlContribution !== 0 && (
									<span
										className={cn(
											"absolute right-2 top-1/2 -translate-y-1/2 text-micro font-medium",
											Math.abs(pnlContribution) > 20
												? "text-bg-100"
												: "text-txt-300"
										)}
									>
										{pnlContribution > 0 ? "+" : ""}
										{pnlContribution.toFixed(0)}%
									</span>
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
