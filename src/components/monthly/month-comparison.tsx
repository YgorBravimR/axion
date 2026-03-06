"use client"

import { useTranslations, useLocale } from "next-intl"
import { ArrowUp, ArrowDown, Minus, GitCompare } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import type { MonthlyResultsWithProp } from "@/app/actions/reports"

interface MonthComparisonProps {
	current: MonthlyResultsWithProp
	previous: MonthlyResultsWithProp | null
	changes: {
		profitChange: number
		profitChangePercent: number
		winRateChange: number
		avgRChange: number
		tradeCountChange: number
	}
}

export const MonthComparison = ({
	current,
	previous,
	changes,
}: MonthComparisonProps) => {
	const t = useTranslations("monthly.comparison")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
			style: "currency",
			currency: locale === "pt-BR" ? "BRL" : "USD",
			minimumFractionDigits: 2,
		}).format(value)
	}

	const formatChange = (
		value: number,
		type: "currency" | "percent" | "number" | "r"
	) => {
		const prefix = value > 0 ? "+" : ""
		switch (type) {
			case "currency":
				return prefix + formatCurrency(value)
			case "percent":
				return prefix + value.toFixed(1) + "pp"
			case "r":
				return prefix + value.toFixed(2) + "R"
			default:
				return prefix + value.toString()
		}
	}

	const ChangeIndicator = ({ value }: { value: number }) => {
		if (value > 0) {
			return <ArrowUp className="h-4 w-4 text-trade-buy" />
		}
		if (value < 0) {
			return <ArrowDown className="h-4 w-4 text-trade-sell" />
		}
		return <Minus className="h-4 w-4 text-txt-300" />
	}

	if (!previous) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h3 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
					<GitCompare className="h-5 w-5 text-acc-100" />
					{t("title")}
				</h3>
				<p className="mt-m-400 text-center text-small text-txt-300">
					{t("noPreviousData")}
				</p>
			</div>
		)
	}

	const previousMonthName = format(new Date(previous.monthStart), "MMMM", {
		locale: dateLocale,
	})

	const comparisonRows = [
		{
			label: t("profit"),
			current: formatCurrency(current.report.netPnl),
			previous: formatCurrency(previous.report.netPnl),
			change: changes.profitChange,
			changeFormatted: formatChange(changes.profitChange, "currency"),
			percentChange: changes.profitChangePercent,
		},
		{
			label: t("winRate"),
			current: current.report.winRate.toFixed(1) + "%",
			previous: previous.report.winRate.toFixed(1) + "%",
			change: changes.winRateChange,
			changeFormatted: formatChange(changes.winRateChange, "percent"),
		},
		{
			label: t("avgR"),
			current: current.report.avgR.toFixed(2) + "R",
			previous: previous.report.avgR.toFixed(2) + "R",
			change: changes.avgRChange,
			changeFormatted: formatChange(changes.avgRChange, "r"),
		},
		{
			label: t("trades"),
			current: current.report.totalTrades.toString(),
			previous: previous.report.totalTrades.toString(),
			change: changes.tradeCountChange,
			changeFormatted: formatChange(changes.tradeCountChange, "number"),
		},
	]

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			<h3 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
				<GitCompare className="h-5 w-5 text-acc-100" />
				{t("titleWithMonth", { month: previousMonthName })}
			</h3>

			<div className="mt-s-300 sm:mt-m-500 space-y-s-200 sm:space-y-s-300">
				{comparisonRows.map((row) => (
					<div
						key={row.label}
						className="flex items-center justify-between rounded bg-bg-100 px-s-300 py-s-200 sm:px-m-400 sm:py-s-300"
					>
						<span className="text-small text-txt-200">{row.label}</span>
						<div className="flex items-center gap-s-100 sm:gap-m-400">
							<span className="hidden sm:inline text-tiny text-txt-300">{row.previous}</span>
							<span className="hidden sm:inline text-small text-txt-100">→</span>
							<span className="text-small font-medium text-txt-100">
								{row.current}
							</span>
							<div
								className={cn(
									"flex items-center gap-s-100 rounded px-s-200 py-s-100",
									row.change > 0 && "bg-trade-buy/10",
									row.change < 0 && "bg-trade-sell/10",
									row.change === 0 && "bg-bg-300"
								)}
							>
								<ChangeIndicator value={row.change} />
								<span
									className={cn(
										"text-tiny font-medium",
										row.change > 0 && "text-trade-buy",
										row.change < 0 && "text-trade-sell",
										row.change === 0 && "text-txt-300"
									)}
								>
									{row.changeFormatted}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
