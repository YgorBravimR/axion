"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import type { SimulationSummary } from "@/types/risk-simulation"

interface SkippedTradesWarningProps {
	summary: SimulationSummary
}

const SkippedTradesWarning = ({ summary }: SkippedTradesWarningProps) => {
	const t = useTranslations("riskSimulation.skipped")
	const [isExpanded, setIsExpanded] = useState(false)

	const totalSkipped = summary.totalTrades - summary.executedTrades

	const skipReasons = useMemo(
		() =>
			[
				{ key: "noSl", count: summary.skippedNoSl },
				{ key: "dailyLimit", count: summary.skippedDailyLimit },
				{ key: "dailyTarget", count: summary.skippedDailyTarget },
				{ key: "maxTrades", count: summary.skippedMaxTrades },
				{ key: "consecutiveLoss", count: summary.skippedConsecutiveLoss },
				{ key: "monthlyLimit", count: summary.skippedMonthlyLimit },
				{ key: "weeklyLimit", count: summary.skippedWeeklyLimit },
			].filter((r) => r.count > 0),
		[
			summary.skippedNoSl,
			summary.skippedDailyLimit,
			summary.skippedDailyTarget,
			summary.skippedMaxTrades,
			summary.skippedConsecutiveLoss,
			summary.skippedMonthlyLimit,
			summary.skippedWeeklyLimit,
		]
	)

	// Early return after hook calls — hooks cannot be called conditionally
	if (totalSkipped === 0) {
		return null
	}

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="p-s-300 flex w-full items-center justify-between"
				aria-expanded={isExpanded}
				aria-label={t("toggle")}
			>
				<div className="gap-s-200 flex items-center">
					<AlertTriangle
						className="text-warning h-4 w-4 shrink-0"
						aria-hidden="true"
					/>
					<span className="text-small text-txt-200">
						{t("title", { count: totalSkipped })}
					</span>
				</div>
				{isExpanded ? (
					<ChevronUp className="text-txt-300 h-4 w-4" aria-hidden="true" />
				) : (
					<ChevronDown className="text-txt-300 h-4 w-4" aria-hidden="true" />
				)}
			</button>

			{isExpanded && (
				<div className="border-bg-300 space-y-s-200 px-s-300 py-s-200 border-t">
					{skipReasons.map(({ key, count }) => (
						<div key={key} className="flex items-center justify-between">
							<span className="text-tiny text-txt-300">
								{t(`reasons.${key}`)}
							</span>
							<span className="text-small text-txt-200 font-medium">
								{count}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export { SkippedTradesWarning }
