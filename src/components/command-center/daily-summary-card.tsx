"use client"

import { TrendingUp, TrendingDown, BarChart3, Award, AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { DailySummary } from "@/app/actions/command-center"

interface DailySummaryCardProps {
	summary: DailySummary | null
	currency?: string
}

const formatCurrency = (value: number, currency = "$"): string => {
	const absValue = Math.abs(value)
	return `${value >= 0 ? "+" : "-"}${currency}${absValue.toFixed(2)}`
}

const formatPercent = (value: number): string => {
	return `${value.toFixed(1)}%`
}

export const DailySummaryCard = ({ summary, currency = "$" }: DailySummaryCardProps) => {
	const t = useTranslations("commandCenter.summary")

	if (!summary) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<div className="flex items-center gap-s-200">
					<BarChart3 className="h-5 w-5 text-txt-300" />
					<p className="text-small text-txt-300">{t("loading")}</p>
				</div>
			</div>
		)
	}

	const hasNoTrades = summary.tradesCount === 0

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center gap-s-200">
				<BarChart3 className="h-5 w-5 text-accent-primary" />
				<h3 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h3>
			</div>

			{hasNoTrades ? (
				<p className="text-small text-txt-300">{t("noTrades")}</p>
			) : (
				<div className="grid grid-cols-2 gap-s-300 sm:gap-m-400 md:grid-cols-3 lg:grid-cols-6">
					{/* Total P&L */}
					<div>
						<p className="text-tiny text-txt-200">{t("totalPnL")}</p>
						<p
							className={cn(
								"mt-s-100 text-h4 font-bold",
								summary.totalPnL >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{formatCurrency(summary.totalPnL, currency)}
						</p>
					</div>

					{/* Trades */}
					<div>
						<p className="text-tiny text-txt-200">{t("trades")}</p>
						<p className="mt-s-100 text-h4 font-bold text-txt-100">
							{summary.tradesCount}
						</p>
					</div>

					{/* Win Rate */}
					<div>
						<p className="text-tiny text-txt-200">{t("winRate")}</p>
						<div className="mt-s-100 flex items-center gap-s-100">
							<p className="text-h4 font-bold text-txt-100">
								{formatPercent(summary.winRate)}
							</p>
							<span className="text-tiny text-txt-200">
								({summary.winCount}W / {summary.lossCount}L)
							</span>
						</div>
					</div>

					{/* Best Trade */}
					<div>
						<p className="flex items-center gap-s-100 text-tiny text-txt-200">
							<Award className="h-3 w-3" />
							{t("bestTrade")}
						</p>
						<p
							className={cn(
								"mt-s-100 text-body font-semibold",
								summary.bestTrade > 0 ? "text-trade-buy" : "text-txt-200"
							)}
						>
							{summary.bestTrade > 0
								? formatCurrency(summary.bestTrade, currency)
								: "--"}
						</p>
					</div>

					{/* Worst Trade */}
					<div>
						<p className="flex items-center gap-s-100 text-tiny text-txt-200">
							<AlertTriangle className="h-3 w-3" />
							{t("worstTrade")}
						</p>
						<p
							className={cn(
								"mt-s-100 text-body font-semibold",
								summary.worstTrade < 0 ? "text-trade-sell" : "text-txt-200"
							)}
						>
							{summary.worstTrade < 0
								? formatCurrency(summary.worstTrade, currency)
								: "--"}
						</p>
					</div>

					{/* Consecutive Losses */}
					<div>
						<p className="text-tiny text-txt-200">{t("maxConsecutiveLosses")}</p>
						<p
							className={cn(
								"mt-s-100 text-body font-semibold",
								summary.consecutiveLosses >= 3 ? "text-trade-sell" : "text-txt-100"
							)}
						>
							{summary.consecutiveLosses}
						</p>
					</div>
				</div>
			)}
		</div>
	)
}
