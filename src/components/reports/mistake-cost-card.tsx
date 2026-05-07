"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import { useFormatting } from "@/hooks/use-formatting"
import type { MistakeCostAnalysis } from "@/app/actions/reports.types"

interface MistakeCostCardProps {
	data: MistakeCostAnalysis | null
}

export const MistakeCostCard = ({ data }: MistakeCostCardProps) => {
	const t = useTranslations("reports.mistakeCost")
	const tStats = useTranslations("reports.stats")
	const { formatCurrencyWithSign, formatCurrency } = useFormatting()

	// Must be before any early return (Rules of Hooks)
	const maxLoss = useMemo(
		() =>
			data?.mistakes && data.mistakes.length > 0
				? Math.max(...data.mistakes.map((m) => m.totalLoss))
				: 0,
		[data?.mistakes]
	)

	if (!data || data.mistakes.length === 0) {
		return (
			<div
				id="reports-mistake-cost"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
					<AlertTriangle className="text-warning h-5 w-5" />
					{t("title")}
				</h2>
				<p className="mt-m-400 text-txt-300 text-center">{t("noData")}</p>
			</div>
		)
	}

	const { mistakes, totalMistakeCost, mostCostlyMistake } = data

	return (
		<div
			id="reports-mistake-cost"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
					<AlertTriangle className="text-warning h-5 w-5" />
					{t("title")}
				</h2>
			</div>

			{/* Summary */}
			<div className="mt-m-500 gap-m-400 grid grid-cols-2">
				<div className="bg-trade-sell-muted px-s-300 py-s-200 rounded-sm">
					<p className="text-tiny text-txt-300">{t("totalCost")}</p>
					<p className="text-h3 text-trade-sell min-w-0 font-bold break-all tabular-nums">
						{formatCurrencyWithSign(-totalMistakeCost)}
					</p>
				</div>
				<div className="bg-bg-100 px-s-300 py-s-200 rounded-sm">
					<p className="text-tiny text-txt-300">{t("mostCostlyMistake")}</p>
					<p className="text-body text-txt-100 font-medium">
						{mostCostlyMistake || "-"}
					</p>
				</div>
			</div>

			{/* Mistake Breakdown */}
			<div className="mt-m-500 space-y-s-300">
				<h3 className="text-small text-txt-100 font-medium">
					{t("costBreakdown")}
				</h3>
				{mistakes.map((mistake) => {
					const barWidth = maxLoss > 0 ? (mistake.totalLoss / maxLoss) * 100 : 0
					return (
						<div key={mistake.tagId} className="space-y-s-100">
							<div className="flex items-center justify-between">
								<div className="gap-s-200 flex min-w-0 items-center">
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
									<span className="text-tiny text-txt-300 min-w-0 truncate">
										{mistake.tradeCount} trades
									</span>
								</div>
								<div className="gap-m-400 flex shrink-0 items-center">
									<span className="text-tiny text-txt-300 whitespace-nowrap">
										{t("avg")}: {formatCurrencyWithSign(-mistake.avgLoss)}
									</span>
									<span className="text-small text-trade-sell font-medium whitespace-nowrap">
										{formatCurrencyWithSign(-mistake.totalLoss)}
									</span>
								</div>
							</div>
							{/* Cost bar */}
							<div className="bg-bg-100 h-2 w-full rounded-full">
								<div
									className="bg-trade-sell/50 h-full rounded-full transition-[width]"
									style={{ width: `${barWidth}%` }}
								/>
							</div>
						</div>
					)
				})}
			</div>

			{/* Insight */}
			<div className="mt-m-500 border-warning/20 bg-warning/5 p-s-300 rounded-sm border">
				<p className="text-small text-txt-200">
					<span className="text-warning font-medium">{t("insight")}:</span>{" "}
					{t("insightText", {
						mistake: mostCostlyMistake || "-",
						amount: mistakes[0]
							? formatCurrency(mistakes[0].totalLoss)
							: formatCurrency(0),
					})}
				</p>
			</div>
		</div>
	)
}
