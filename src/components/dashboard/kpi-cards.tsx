"use client"

import { useTranslations } from "next-intl"
import type { OverallStats, DisciplineData } from "@/types"
import { formatCompactCurrency, formatChartPercent } from "@/lib/formatting"
import { formatRMultiple } from "@/lib/calculations"
import { StatCard, type TrendType } from "@/components/shared"

interface KpiCardsProps {
	stats: OverallStats | null
	discipline: DisciplineData | null
}

/**
 * Determines the color class for a numeric value based on positive/negative state.
 *
 * @param value - The numeric value to evaluate
 * @returns The appropriate Tailwind color class
 */
const getValueColorClass = (value: number | null | undefined): string => {
	if (value === null || value === undefined) return "text-txt-100"
	if (value > 0) return "text-trade-buy"
	if (value < 0) return "text-trade-sell"
	return "text-txt-100"
}

/**
 * Displays key performance indicator cards for the trading dashboard.
 * Shows gross P&L, net P&L, win rate, profit factor, average R, and discipline score.
 *
 * @param stats - Overall trading statistics
 * @param discipline - Discipline tracking data
 */
export const KpiCards = ({ stats, discipline }: KpiCardsProps) => {
	const t = useTranslations("dashboard.kpi")

	return (
		<div className="grid grid-cols-2 gap-s-300 sm:grid-cols-3 sm:gap-m-400 lg:grid-cols-6 lg:gap-m-500 [&>*]:min-w-0">
			<StatCard
				label={t("grossPnl")}
				value={stats ? formatCompactCurrency(stats.grossPnl) : "--"}
				subValue={stats ? `${stats.totalTrades} ${t("trades")}` : undefined}
				valueColorClass={getValueColorClass(stats?.grossPnl)}
			/>
			<StatCard
				label={t("netPnl")}
				value={stats ? formatCompactCurrency(stats.netPnl) : "--"}
				subValue={
					stats?.totalFees
						? `${t("fees")}: ${formatCompactCurrency(stats.totalFees)}`
						: undefined
				}
				valueColorClass={getValueColorClass(stats?.netPnl)}
			/>
			<StatCard
				label={t("winRate")}
				value={stats ? formatChartPercent(stats.winRate, false) : "--"}
				subValue={
					stats
						? `${stats.winCount}${t("w")} / ${stats.lossCount}${t("l")}${stats.breakevenCount > 0 ? ` / ${stats.breakevenCount}${t("be")}` : ""}`
						: undefined
				}
			/>
			<StatCard
				label={t("profitFactor")}
				value={stats ? stats.profitFactor.toFixed(2) : "--"}
				subValue={
					stats
						? `${t("avgWin")}: ${formatCompactCurrency(stats.avgWin)} | ${t("avgLoss")}: ${formatCompactCurrency(stats.avgLoss)}`
						: undefined
				}
			/>
			<StatCard
				label={t("avgR")}
				value={stats ? formatRMultiple(stats.averageR) : "--"}
				valueColorClass={getValueColorClass(stats?.averageR)}
			/>
			<StatCard
				label={t("discipline")}
				value={discipline ? formatChartPercent(discipline.score, false) : "--"}
				subValue={
					discipline
						? `${discipline.followedCount}/${discipline.totalTrades} ${t("followed")}`
						: undefined
				}
				trend={discipline?.trend as TrendType | undefined}
			/>
		</div>
	)
}
