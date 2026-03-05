"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MistakeCostAnalysis } from "@/app/actions/reports"

interface MistakeCostCardProps {
	data: MistakeCostAnalysis | null
}

export const MistakeCostCard = ({ data }: MistakeCostCardProps) => {
	const t = useTranslations("reports.mistakeCost")
	const tStats = useTranslations("reports.stats")

	if (!data || data.mistakes.length === 0) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
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
	const maxLoss = Math.max(...mistakes.map((m) => m.totalLoss))

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
					<AlertTriangle className="h-5 w-5 text-warning" />
					{t("title")}
				</h2>
			</div>

			{/* Summary */}
			<div className="mt-m-500 grid grid-cols-2 gap-m-400">
				<div className="rounded bg-trade-sell-muted px-s-300 py-s-200">
					<p className="text-tiny text-txt-300">{t("totalCost")}</p>
					<p className="text-h3 font-bold text-trade-sell">
						-{totalMistakeCost.toFixed(2)}
					</p>
				</div>
				<div className="rounded bg-bg-100 px-s-300 py-s-200">
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
								<div className="flex items-center gap-s-200">
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
									<span className="text-tiny text-txt-300">
										{mistake.tradeCount} trades
									</span>
								</div>
								<div className="flex items-center gap-m-400">
									<span className="text-tiny text-txt-300">
										{t("avg")}: -{mistake.avgLoss.toFixed(2)}
									</span>
									<span className="text-small font-medium text-trade-sell">
										-{mistake.totalLoss.toFixed(2)}
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
			<div className="mt-m-500 rounded border border-warning/20 bg-warning/5 p-s-300">
				<p className="text-small text-txt-200">
					<span className="font-medium text-warning">{t("insight")}:</span>{" "}
					{t("insightText", {
						mistake: mostCostlyMistake || "-",
						amount: mistakes[0]?.totalLoss.toFixed(2) || "0.00",
					})}
				</p>
			</div>
		</div>
	)
}
