"use client"

import { useTranslations } from "next-intl"
import { AlertCircle } from "lucide-react"
import type { SimulationSummary } from "@/types/risk-simulation"

interface InsightsCalloutsProps {
	summary: SimulationSummary
}

interface Insight {
	title: string
	body: string
}

const InsightsCallouts = ({ summary }: InsightsCalloutsProps) => {
	const t = useTranslations("riskSimulation.insights")

	const insights: Insight[] = []

	const skipPct =
		summary.totalTrades > 0
			? Math.round(
					((summary.totalTrades - summary.executedTrades) /
						summary.totalTrades) *
						100
				)
			: 0

	// Trigger 1: Cap selection bias
	if (skipPct > 25 && summary.simulatedWinRate < summary.originalWinRate) {
		insights.push({
			title: t("capSelectionBias.title"),
			body: t("capSelectionBias.body", { skipPct }),
		})
	}

	// Trigger 2: Same edge, different size
	if (
		Math.abs(summary.simulatedReturnPercent - summary.originalReturnPercent) <
			1 &&
		Math.abs(summary.simulatedTotalPnlCents - summary.originalTotalPnlCents) >=
			500000
	) {
		const origPct = summary.originalReturnPercent.toFixed(1)
		const simPct = summary.simulatedReturnPercent.toFixed(1)
		insights.push({
			title: t("sameEdge.title"),
			body: t("sameEdge.body", { origPct, simPct }),
		})
	}

	// Trigger 3: Drawdown tradeoff
	if (
		summary.originalMaxDrawdownPercent > 0 &&
		summary.simulatedMaxDrawdownPercent >
			3 * summary.originalMaxDrawdownPercent &&
		summary.simulatedTotalPnlCents > summary.originalTotalPnlCents
	) {
		const origDd = summary.originalMaxDrawdownPercent.toFixed(1)
		const simDd = summary.simulatedMaxDrawdownPercent.toFixed(1)
		insights.push({
			title: t("drawdownTradeoff.title"),
			body: t("drawdownTradeoff.body", { origDd, simDd }),
		})
	}

	// Trigger 4: Cap too tight
	const capPct =
		summary.totalTradingDays > 0
			? Math.round((summary.daysHitDailyLimit / summary.totalTradingDays) * 100)
			: 0

	if (summary.daysHitDailyLimit > 0 && capPct > 10) {
		insights.push({
			title: t("capTooTight.title"),
			body: t("capTooTight.body", { capPct }),
		})
	}

	if (insights.length === 0) {
		return null
	}

	return (
		<div className="space-y-s-300">
			{insights.map((insight) => (
				<div
					key={insight.title}
					className="border-warning/30 bg-warning/5 p-m-400 gap-m-400 flex rounded-lg border"
				>
					<AlertCircle
						className="text-warning h-5 w-5 shrink-0"
						aria-hidden="true"
					/>
					<div className="min-w-0 flex-1">
						<h4 className="text-small text-txt-100 mb-s-100 font-semibold">
							{insight.title}
						</h4>
						<p className="text-tiny text-txt-300">{insight.body}</p>
					</div>
				</div>
			))}
		</div>
	)
}

export { InsightsCallouts }
