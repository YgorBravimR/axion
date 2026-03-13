"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Info } from "lucide-react"
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatR, formatRatio } from "@/lib/formatting"
import type { SimulationStatistics } from "@/types/monte-carlo"

interface MetricsCardsProps {
	statistics: SimulationStatistics
}

interface MetricCardProps {
	title: string
	children: ReactNode
}

const MetricCard = ({ title, children }: MetricCardProps) => (
	<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
		<h4 className="mb-s-300 text-small text-txt-100 font-semibold">{title}</h4>
		<div className="space-y-s-200">{children}</div>
	</div>
)

interface MetricRowProps {
	label: string
	value: string
	valueClass?: string
	tooltip?: string
}

const MetricRow = ({ label, value, valueClass, tooltip }: MetricRowProps) => (
	<div className="flex min-w-0 items-center justify-between">
		{tooltip ? (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="gap-s-100 text-tiny sm:text-small text-txt-300 inline-flex cursor-help items-center">
						{label}
						<Info className="h-3 w-3" />
					</span>
				</TooltipTrigger>
				<TooltipContent
					id={`tooltip-metric-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
					side="top"
					className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
				>
					<p className="text-tiny leading-relaxed">{tooltip}</p>
				</TooltipContent>
			</Tooltip>
		) : (
			<span className="text-tiny sm:text-small text-txt-300">{label}</span>
		)}
		<span
			className={cn("text-small sm:text-body font-medium", valueClass || "text-txt-100")}
		>
			{value}
		</span>
	</div>
)

export const MetricsCards = ({ statistics }: MetricsCardsProps) => {
	const t = useTranslations("monteCarlo.metrics")
	const tTooltips = useTranslations("monteCarlo.tooltips")

	return (
		<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
			{/* Edge Summary */}
			<MetricCard title={t("edgeSummary")}>
				<MetricRow
					label={t("expectedRPerTrade")}
					value={formatR(statistics.expectedRPerTrade)}
					valueClass={
						statistics.expectedRPerTrade >= 0
							? "text-trade-buy"
							: "text-trade-sell"
					}
					tooltip={tTooltips("expectedRPerTrade")}
				/>
				<MetricRow
					label={t("medianFinalR")}
					value={formatR(statistics.medianFinalR)}
					valueClass={
						statistics.medianFinalR >= 0 ? "text-trade-buy" : "text-trade-sell"
					}
				/>
				<MetricRow
					label={t("meanFinalR")}
					value={formatR(statistics.meanFinalR)}
					valueClass={
						statistics.meanFinalR >= 0 ? "text-trade-buy" : "text-trade-sell"
					}
				/>
				<MetricRow
					label={t("profitFactor")}
					value={
						statistics.profitFactor === Infinity
							? "∞"
							: formatRatio(statistics.profitFactor)
					}
					valueClass={
						statistics.profitFactor >= 1 ? "text-trade-buy" : "text-trade-sell"
					}
					tooltip={tTooltips("profitFactor")}
				/>
			</MetricCard>

			{/* Risk-Adjusted Metrics */}
			<MetricCard title={t("riskAdjusted")}>
				<MetricRow
					label={t("sharpeRatio")}
					value={formatRatio(statistics.sharpeRatio)}
					valueClass={
						statistics.sharpeRatio >= 1 ? "text-trade-buy" : "text-txt-100"
					}
					tooltip={tTooltips("sharpeRatio")}
				/>
				<MetricRow
					label={t("sortinoRatio")}
					value={formatRatio(statistics.sortinoRatio)}
					valueClass={
						statistics.sortinoRatio >= 1 ? "text-trade-buy" : "text-txt-100"
					}
					tooltip={tTooltips("sortinoRatio")}
				/>
			</MetricCard>

			{/* Drawdown Analysis */}
			<MetricCard title={t("drawdown")}>
				<MetricRow
					label={t("medianMaxDrawdownR")}
					value={formatR(-statistics.medianMaxRDrawdown)}
					valueClass="text-trade-sell"
					tooltip={tTooltips("maxDrawdown")}
				/>
				<MetricRow
					label={t("avgDrawdownR")}
					value={formatR(-statistics.meanMaxRDrawdown)}
				/>
				<MetricRow
					label={t("worstDrawdownR")}
					value={formatR(-statistics.worstMaxRDrawdown)}
					valueClass="text-trade-sell"
				/>
			</MetricCard>

			{/* Streak Statistics */}
			<MetricCard title={t("streaks")}>
				<MetricRow
					label={t("maxWinsInRow")}
					value={Math.round(statistics.expectedMaxWinStreak).toString()}
					valueClass="text-trade-buy"
				/>
				<MetricRow
					label={t("maxLossesInRow")}
					value={Math.round(statistics.expectedMaxLossStreak).toString()}
					valueClass="text-trade-sell"
				/>
				<MetricRow
					label={t("avgWinStreak")}
					value={statistics.avgWinStreak.toFixed(1)}
				/>
				<MetricRow
					label={t("avgLossStreak")}
					value={statistics.avgLossStreak.toFixed(1)}
				/>
			</MetricCard>

			{/* Monte Carlo Outcomes */}
			<MetricCard title={t("monteCarloOutcomes")}>
				<MetricRow
					label={t("bestCase")}
					value={formatR(statistics.bestCaseFinalR)}
					valueClass="text-trade-buy"
				/>
				<MetricRow
					label={t("medianLabel")}
					value={formatR(statistics.medianFinalR)}
					valueClass={
						statistics.medianFinalR >= 0 ? "text-trade-buy" : "text-trade-sell"
					}
				/>
				<MetricRow
					label={t("worstCase")}
					value={formatR(statistics.worstCaseFinalR)}
					valueClass="text-trade-sell"
				/>
				<MetricRow
					label={t("profitableSimulations")}
					value={`${statistics.profitablePct.toFixed(0)}%`}
					valueClass={
						statistics.profitablePct >= 70 ? "text-trade-buy" : "text-txt-100"
					}
					tooltip={tTooltips("profitableSimulations")}
				/>
			</MetricCard>
		</div>
	)
}
