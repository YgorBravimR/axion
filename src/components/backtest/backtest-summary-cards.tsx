"use client"

import { useMemo, memo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { formatCentsAsCurrency } from "@/lib/money"
import type { BacktestSummary } from "@/types/backtest"

interface BacktestSummaryCardsProps {
	summary: BacktestSummary
	engineVersion?: string
	currency?: string
}

const BacktestSummaryCards = memo(
	({ summary, engineVersion, currency = "BRL" }: BacktestSummaryCardsProps) => {
		const t = useTranslations("backtest.results")

		const metrics = useMemo<
			Array<{
				label: string
				value: string
				tone: "neutral" | "money-pos" | "money-neg" | "loss"
			}>
		>(
			() => [
				{
					label: t("totalTrades"),
					value: String(summary.totalTrades),
					tone: "neutral",
				},
				{ label: t("winRate"), value: `${summary.winRate}%`, tone: "neutral" },
				{
					label: t("profitFactor"),
					value:
						summary.profitFactor === Infinity
							? "∞"
							: String(summary.profitFactor),
					tone: "neutral",
				},
				{
					label: t("totalPnl"),
					value: formatCentsAsCurrency(summary.totalPnlCents, currency),
					tone:
						summary.totalPnlCents > 0
							? "money-pos"
							: summary.totalPnlCents < 0
								? "money-neg"
								: "neutral",
				},
				{
					label: t("maxDrawdown"),
					value: formatCentsAsCurrency(summary.maxDrawdownCents, currency),
					tone: "loss",
				},
				{
					label: t("avgR"),
					value: `${summary.avgRMultiple}R`,
					tone:
						summary.avgRMultiple > 0
							? "money-pos"
							: summary.avgRMultiple < 0
								? "money-neg"
								: "neutral",
				},
				{
					label: t("sharpe"),
					value: String(summary.sharpeRatio),
					tone: "neutral",
				},
				{
					label: t("tradingDays"),
					value: `${summary.tradingDays} / ${summary.totalDays}`,
					tone: "neutral",
				},
			],
			[summary, t]
		)

		const secondaryMetrics = useMemo(
			() => [
				{ label: t("wins"), value: String(summary.wins) },
				{ label: t("losses"), value: String(summary.losses) },
				{
					label: t("avgWin"),
					value: formatCentsAsCurrency(summary.avgWinCents, currency),
				},
				{
					label: t("avgLoss"),
					value: formatCentsAsCurrency(summary.avgLossCents, currency),
				},
				{ label: t("maxConsecWin"), value: String(summary.maxConsecutiveWins) },
				{
					label: t("maxConsecLoss"),
					value: String(summary.maxConsecutiveLosses),
				},
			],
			[summary, t]
		)

		return (
			<div className="space-y-m-400">
				{/* Primary metrics */}
				<div className="gap-s-300 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 [&_p]:truncate [&>div]:min-w-0">
					{metrics.map((metric) => (
						<div
							key={metric.label}
							className="border-bg-300 bg-bg-200 space-y-s-200 p-m-400 rounded-lg border"
						>
							<p className="text-small text-txt-300">{metric.label}</p>
							<p
								className={`text-h3 font-mono font-semibold ${
									metric.tone === "money-pos"
										? "text-trade-buy"
										: metric.tone === "money-neg" || metric.tone === "loss"
											? "text-trade-sell"
											: "text-txt-100"
								}`}
							>
								{metric.value}
							</p>
						</div>
					))}
				</div>

				{/* Secondary metrics + engine version */}
				<div className="gap-s-200 flex flex-wrap">
					{secondaryMetrics.map((metric) => (
						<Badge
							key={metric.label}
							id={`badge-${metric.label}`}
							variant="outline"
							className="text-small gap-s-200"
						>
							<span className="text-txt-300">{metric.label}:</span>
							<span className="text-txt-100 font-mono font-medium">
								{metric.value}
							</span>
						</Badge>
					))}
					{engineVersion && (
						<Badge
							id="badge-engine-version"
							variant="outline"
							className="text-small gap-s-200"
						>
							<span className="text-txt-300">{t("engineVersion")}:</span>
							<span className="text-txt-100 font-mono font-medium">
								{engineVersion}
							</span>
						</Badge>
					)}
				</div>
			</div>
		)
	}
)
BacktestSummaryCards.displayName = "BacktestSummaryCards"

export { BacktestSummaryCards }
