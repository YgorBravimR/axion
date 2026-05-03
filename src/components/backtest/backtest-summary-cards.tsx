"use client"

import { useMemo, memo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { formatCentsAsCurrency } from "@/lib/money"
import type { BacktestSummary } from "@/types/backtest"

interface BacktestSummaryCardsProps {
	summary: BacktestSummary
}

const BacktestSummaryCards = memo(({ summary }: BacktestSummaryCardsProps) => {
	const t = useTranslations("backtest.results")

	const metrics = useMemo(() => [
		{ label: t("totalTrades"), value: String(summary.totalTrades), accent: false },
		{
			label: t("winRate"),
			value: `${summary.winRate}%`,
			accent: summary.winRate >= 50,
			negative: summary.winRate < 40,
		},
		{
			label: t("profitFactor"),
			value: summary.profitFactor === Infinity ? "∞" : String(summary.profitFactor),
			accent: summary.profitFactor >= 1.5,
			negative: summary.profitFactor < 1,
		},
		{
			label: t("totalPnl"),
			value: formatCentsAsCurrency(summary.totalPnlCents, "BRL"),
			accent: summary.totalPnlCents > 0,
			negative: summary.totalPnlCents < 0,
		},
		{
			label: t("maxDrawdown"),
			value: formatCentsAsCurrency(summary.maxDrawdownCents, "BRL"),
			negative: true,
		},
		{
			label: t("avgR"),
			value: `${summary.avgRMultiple}R`,
			accent: summary.avgRMultiple > 0,
			negative: summary.avgRMultiple < 0,
		},
		{
			label: t("sharpe"),
			value: String(summary.sharpeRatio),
			accent: summary.sharpeRatio >= 1,
		},
		{
			label: t("tradingDays"),
			value: `${summary.tradingDays} / ${summary.totalDays}`,
			accent: false,
		},
	], [summary, t])

	const secondaryMetrics = useMemo(() => [
		{ label: t("wins"), value: String(summary.wins) },
		{ label: t("losses"), value: String(summary.losses) },
		{ label: t("avgWin"), value: formatCentsAsCurrency(summary.avgWinCents, "BRL") },
		{ label: t("avgLoss"), value: formatCentsAsCurrency(summary.avgLossCents, "BRL") },
		{ label: t("maxConsecWin"), value: String(summary.maxConsecutiveWins) },
		{ label: t("maxConsecLoss"), value: String(summary.maxConsecutiveLosses) },
	], [summary, t])

	return (
		<div className="space-y-m-400">
			{/* Primary metrics */}
			<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 [&>div]:min-w-0 [&_p]:truncate">
				{metrics.map((metric) => (
					<div
						key={metric.label}
						className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400"
					>
						<p className="text-small text-txt-300">{metric.label}</p>
						<p className={`text-h3 font-semibold font-mono ${
							metric.negative ? "text-fb-error" : metric.accent ? "text-acc-100" : "text-txt-100"
						}`}>
							{metric.value}
						</p>
					</div>
				))}
			</div>

			{/* Secondary metrics */}
			<div className="gap-s-200 flex flex-wrap">
				{secondaryMetrics.map((metric) => (
					<Badge
						key={metric.label}
						id={`badge-${metric.label}`}
						variant="outline"
						className="text-small gap-s-200"
					>
						<span className="text-txt-300">{metric.label}:</span>
						<span className="font-mono font-medium text-txt-100">{metric.value}</span>
					</Badge>
				))}
			</div>
		</div>
	)
})
BacktestSummaryCards.displayName = "BacktestSummaryCards"

export { BacktestSummaryCards }
