"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { DaySummary } from "@/types"
import { useFormatting } from "@/hooks/use-formatting"

interface DaySummaryStatsProps {
	summary: DaySummary
}

/**
 * Displays summary statistics for a single trading day.
 * Shows net P&L, gross P&L, win rate, and trade count with color coding.
 *
 * @param summary - The day summary data
 */
export const DaySummaryStats = ({ summary }: DaySummaryStatsProps) => {
	const t = useTranslations("dashboard")
	const tCommon = useTranslations("common")
	const { formatBrlWithSign, accountCurrency } = useFormatting()

	const stats = useMemo(
		() => [
			{
				label: t("dayDetail.netPnl"),
				value: formatBrlWithSign(summary.netPnl),
				isPositive: summary.netPnl >= 0,
				showIcon: true,
			},
			{
				label: t("dayDetail.grossPnl"),
				value: formatBrlWithSign(summary.grossPnl),
				subValue: `${t("dayDetail.fees")}: ${accountCurrency} ${summary.totalFees.toFixed(2)}`,
				isPositive: summary.grossPnl >= 0,
			},
			{
				label: t("dayDetail.winRate"),
				value: `${summary.winRate.toFixed(0)}%`,
				subValue: `${summary.wins}${tCommon("winAbbr")} ${summary.losses}${tCommon("lossAbbr")}`,
				isPositive: summary.winRate >= 50,
			},
			{
				label: t("dayDetail.trades"),
				value: summary.totalTrades.toString(),
				subValue:
					summary.avgR !== 0
						? `${t("dayDetail.avgR")}: ${summary.avgR >= 0 ? "+" : ""}${summary.avgR.toFixed(1)}R`
						: undefined,
				isPositive: null,
			},
		],
		[
			t,
			tCommon,
			summary.netPnl,
			summary.grossPnl,
			summary.totalFees,
			summary.winRate,
			summary.wins,
			summary.losses,
			summary.totalTrades,
			summary.avgR,
			accountCurrency,
		]
	)

	return (
		<div className="gap-s-300 grid grid-cols-2 md:grid-cols-4">
			{stats.map((stat) => (
				<div
					key={stat.label}
					className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border"
				>
					<p className="text-tiny text-txt-300">{stat.label}</p>
					<div className="mt-s-100 gap-s-100 flex items-center">
						{stat.showIcon &&
							(stat.isPositive ? (
								<TrendingUp className="text-trade-buy h-4 w-4" />
							) : (
								<TrendingDown className="text-trade-sell h-4 w-4" />
							))}
						<p
							className={`text-body font-semibold ${
								stat.isPositive === null
									? "text-txt-100"
									: stat.isPositive
										? "text-trade-buy"
										: "text-trade-sell"
							}`}
						>
							{stat.value}
						</p>
					</div>
					{stat.subValue && (
						<p className="mt-s-100 text-tiny text-txt-300">{stat.subValue}</p>
					)}
				</div>
			))}
		</div>
	)
}
