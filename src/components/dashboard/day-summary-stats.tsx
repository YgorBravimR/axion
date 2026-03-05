"use client"

import { useTranslations } from "next-intl"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { DaySummary } from "@/types"
import { formatBrlWithSign } from "@/lib/formatting"

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

	const stats = [
		{
			label: t("dayDetail.netPnl"),
			value: formatBrlWithSign(summary.netPnl),
			isPositive: summary.netPnl >= 0,
			showIcon: true,
		},
		{
			label: t("dayDetail.grossPnl"),
			value: formatBrlWithSign(summary.grossPnl),
			subValue: `${t("dayDetail.fees")}: R$ ${summary.totalFees.toFixed(2)}`,
			isPositive: summary.grossPnl >= 0,
		},
		{
			label: t("dayDetail.winRate"),
			value: `${summary.winRate.toFixed(0)}%`,
			subValue: `${summary.wins}W ${summary.losses}L`,
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
	]

	return (
		<div className="grid grid-cols-2 gap-s-300 md:grid-cols-4">
			{stats.map((stat) => (
				<div
					key={stat.label}
					className="rounded-lg border border-bg-300 bg-bg-100 p-s-300"
				>
					<p className="text-caption text-txt-300">{stat.label}</p>
					<div className="mt-s-100 flex items-center gap-s-100">
						{stat.showIcon &&
							(stat.isPositive ? (
								<TrendingUp className="h-4 w-4 text-trade-buy" />
							) : (
								<TrendingDown className="h-4 w-4 text-trade-sell" />
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
						<p className="mt-s-100 text-caption text-txt-300">{stat.subValue}</p>
					)}
				</div>
			))}
		</div>
	)
}
