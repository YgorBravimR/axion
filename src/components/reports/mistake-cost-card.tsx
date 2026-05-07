"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import { useFormatting } from "@/hooks/use-formatting"
import type { MistakeCostAnalysis } from "@/app/actions/reports"

interface MistakeCostCardProps {
	data: MistakeCostAnalysis | null
}

export const MistakeCostCard = ({ data }: MistakeCostCardProps) => {
	const t = useTranslations("reports.mistakeCost")
	const tStats = useTranslations("reports.stats")
	const { formatCurrencyWithSign, formatCurrency } = useFormatting()

	if (!data || data.mistakes.length === 0) {
		return (
			<div id="reports-mistake-cost" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
					<AlertTriangle className="h-5 w-5 text-warning" />
					{t("title")}
				</h2>
				<p className="mt-m-400 text-center text-txt-300">
					{t("noData")}
				</p>
			</div>
		)
	}

	const { mistakes, totalMistakeCost, mostCostlyMistake } = data

	// Calculate max loss for bar width scaling
	const maxLoss = useMemo(
		() => Math.max(...mistakes.map((m) => m.totalLoss)),
		[mistakes]
	)

	return (
		<div id="reports-mistake-cost" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
					<AlertTriangle className="h-5 w-5 text-warning" />
					{t("title")}
				</h2>
			</div>

			{/* Summary */}
			<div className="mt-m-500 grid grid-cols-2 gap-m-400">
				<div className="rounded-sm bg-trade-sell-muted px-s-300 py-s-200">
					<p className="text-tiny text-txt-300">{t("totalCost")}</p>
					<p className="text-h3 font-bold text-trade-sell tabular-nums break-all min-w-0">
						{formatCurrencyWithSign(-totalMistakeCost)}
					</p>
				</div>
				<div className="rounded-sm bg-bg-100 px-s-300 py-s-200">
					<p className="text-tiny text-txt-300">{t("mostCostlyMistake")}</p>
					<p className="text-body font-medium text-txt-100">
						{mostCostlyMistake || "-"}
					</p>
				</div>
			</div>

			{/* Mistake Breakdown */}
			<div className="mt-m-500 space-y-s-300">
				<h3 className="text-small font-medium text-txt-100">
					{t("costBreakdown")}
				</h3>
				{mistakes.map((mistake) => {
					const barWidth =
						maxLoss > 0 ? (mistake.totalLoss / maxLoss) * 100 : 0
					return (
						<div key={mistake.tagId} className="space-y-s-100">
							<div className="flex items-center justify-between">
								<div className="min-w-0 flex items-center gap-s-200">
									<Badge
										id={`badge-mistake-cost-${mistake.tagId}`}
										variant="outline"
										className="text-tiny"
										style={{
											borderColor: mistake.color ?? undefined,
											color: mistake.color ?? undefined,
										}}
									>
										{mistake.tagName}
									</Badge>
									<span className="min-w-0 truncate text-tiny text-txt-300">
										{mistake.tradeCount} trades
									</span>
								</div>
								<div className="flex shrink-0 items-center gap-m-400">
									<span className="text-tiny text-txt-300 whitespace-nowrap">
										{t("avg")}: {formatCurrencyWithSign(-mistake.avgLoss)}
									</span>
									<span className="text-small font-medium text-trade-sell whitespace-nowrap">
										{formatCurrencyWithSign(-mistake.totalLoss)}
									</span>
								</div>
							</div>
							{/* Cost bar */}
							<div className="h-2 w-full rounded-full bg-bg-100">
								<div
									className="h-full rounded-full bg-trade-sell/50 transition-[width]"
									style={{ width: `${barWidth}%` }}
								/>
							</div>
						</div>
					)
				})}
			</div>

			{/* Insight */}
			<div className="mt-m-500 rounded-sm border border-warning/20 bg-warning/5 p-s-300">
				<p className="text-small text-txt-200">
					<span className="font-medium text-warning">{t("insight")}:</span>{" "}
					{t("insightText", {
						mistake: mostCostlyMistake || "-",
						amount: mistakes[0] ? formatCurrency(mistakes[0].totalLoss) : formatCurrency(0),
					})}
				</p>
			</div>
		</div>
	)
}
