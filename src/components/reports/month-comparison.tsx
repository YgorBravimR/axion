"use client"

import { useMemo, useCallback } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ArrowUp, ArrowDown, Minus, GitCompare } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { useFormatting } from "@/hooks/use-formatting"
import type { MonthlyResultsWithProp } from "@/app/actions/reports.types"

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

const ChangeIndicator = ({
	value,
	isMoney,
}: {
	value: number
	isMoney: boolean
}) => {
	if (value > 0) {
		return (
			<ArrowUp
				className={cn("h-4 w-4", isMoney ? "text-trade-buy" : "text-txt-200")}
				aria-hidden="true"
			/>
		)
	}
	if (value < 0) {
		return (
			<ArrowDown
				className={cn("h-4 w-4", isMoney ? "text-trade-sell" : "text-txt-300")}
				aria-hidden="true"
			/>
		)
	}
	return <Minus className="text-txt-300 h-4 w-4" aria-hidden="true" />
}

export const MonthComparison = ({
	current,
	previous,
	changes,
}: MonthComparisonProps) => {
	const t = useTranslations("monthly.comparison")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS
	const { formatCurrency } = useFormatting()

	const formatChange = useCallback(
		(value: number, type: "currency" | "percent" | "number" | "r") => {
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
		},
		[formatCurrency]
	)

	const previousMonthName = previous
		? format(new Date(previous.monthStart), "MMMM", { locale: dateLocale })
		: ""

	const comparisonRows = useMemo(() => {
		if (!previous) {
			return []
		}
		return [
			{
				label: t("profit"),
				current: formatCurrency(current.report.netPnl),
				previous: formatCurrency(previous.report.netPnl),
				change: changes.profitChange,
				changeFormatted: formatChange(changes.profitChange, "currency"),
				percentChange: changes.profitChangePercent,
				isMoney: true,
			},
			{
				label: t("winRate"),
				current: current.report.winRate.toFixed(1) + "%",
				previous: previous.report.winRate.toFixed(1) + "%",
				change: changes.winRateChange,
				changeFormatted: formatChange(changes.winRateChange, "percent"),
				isMoney: false,
			},
			{
				label: t("avgR"),
				current: current.report.avgR.toFixed(2) + "R",
				previous: previous.report.avgR.toFixed(2) + "R",
				change: changes.avgRChange,
				changeFormatted: formatChange(changes.avgRChange, "r"),
				isMoney: false,
			},
			{
				label: t("trades"),
				current: current.report.totalTrades.toString(),
				previous: previous.report.totalTrades.toString(),
				change: changes.tradeCountChange,
				changeFormatted: formatChange(changes.tradeCountChange, "number"),
				isMoney: false,
			},
		]
	}, [previous, current, changes, formatCurrency, formatChange, t])

	if (!previous) {
		return (
			<div
				id="monthly-comparison"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h3 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
					<GitCompare className="text-acc-100 h-5 w-5" aria-hidden="true" />
					{t("title")}
				</h3>
				<p className="mt-m-400 text-small text-txt-300 text-center">
					{t("noPreviousData")}
				</p>
			</div>
		)
	}

	return (
		<div
			id="monthly-comparison"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<h3 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
				<GitCompare className="text-acc-100 h-5 w-5" aria-hidden="true" />
				{t("titleWithMonth", { month: previousMonthName })}
			</h3>

			<div className="mt-s-300 sm:mt-m-500 space-y-s-200 sm:space-y-s-300">
				{comparisonRows.map((row) => (
					<div
						key={row.label}
						className="bg-bg-100 px-s-300 py-s-200 sm:px-m-400 sm:py-s-300 flex items-center justify-between rounded-sm"
					>
						<span className="text-small text-txt-200">{row.label}</span>
						<div className="gap-s-100 sm:gap-m-400 flex min-w-0 items-center">
							<span className="text-tiny text-txt-300 hidden sm:inline">
								{row.previous}
							</span>
							<span className="text-small text-txt-100 hidden sm:inline">
								→
							</span>
							<span className="text-tiny sm:text-small text-txt-100 font-medium whitespace-nowrap">
								{row.current}
							</span>
							<div
								className={cn(
									"gap-s-100 px-s-200 py-s-100 flex items-center rounded-sm whitespace-nowrap",
									row.isMoney && row.change > 0 && "bg-trade-buy/10",
									row.isMoney && row.change < 0 && "bg-trade-sell/10",
									(!row.isMoney || row.change === 0) && "bg-bg-300"
								)}
							>
								<ChangeIndicator value={row.change} isMoney={row.isMoney} />
								<span
									className={cn(
										"text-tiny font-medium",
										row.isMoney && row.change > 0 && "text-trade-buy",
										row.isMoney && row.change < 0 && "text-trade-sell",
										(!row.isMoney || row.change === 0) && "text-txt-300"
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
