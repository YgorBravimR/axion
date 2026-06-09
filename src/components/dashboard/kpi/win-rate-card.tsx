"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { formatChartPercent } from "@/lib/formatting"
import { StatCard } from "@/components/shared"
import { getThresholdColorClass } from "./helpers"

interface WinRateRingProps {
	rate: number
	colorClass: string
}

const STROKE_COLOR_MAP: Record<string, string> = {
	"text-trade-buy": "text-trade-buy",
	"text-trade-sell": "text-trade-sell",
}

/**
 * SVG donut ring that visualizes win rate as circular progress.
 * r=15.9155 makes circumference = 100, so strokeDasharray maps to percentage directly.
 */
const WinRateRing = ({ rate, colorClass }: WinRateRingProps) => {
	const strokeClass = STROKE_COLOR_MAP[colorClass] ?? "text-txt-300"

	return (
		<svg className="h-10 w-10" viewBox="0 0 36 36" aria-hidden="true">
			<path
				className="text-bg-300"
				d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
				fill="none"
				stroke="currentColor"
				strokeWidth="3"
			/>
			<path
				className={strokeClass}
				d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
				fill="none"
				stroke="currentColor"
				strokeDasharray={`${rate}, 100`}
				strokeLinecap="round"
				strokeWidth="3"
			/>
		</svg>
	)
}

interface WinRateCardProps {
	winRate: number | null
	winCount: number | null
	lossCount: number | null
	breakevenCount: number | null
}

const WinRateCard = ({
	winRate,
	winCount,
	lossCount,
	breakevenCount,
}: WinRateCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const colorClass = getThresholdColorClass(winRate, 50)
	const hasData = winRate !== null

	const subValue = useMemo(
		() =>
			hasData ? (
				<p className="gap-s-200 flex items-center">
					<span className="text-trade-buy">
						{winCount}
						{t("w")}
					</span>
					<span aria-hidden="true">·</span>
					<span className="text-trade-sell">
						{lossCount}
						{t("l")}
					</span>
					{(breakevenCount ?? 0) > 0 && (
						<>
							<span aria-hidden="true">·</span>
							<span>
								{breakevenCount}
								{t("be")}
							</span>
						</>
					)}
				</p>
			) : undefined,
		[hasData, winCount, lossCount, breakevenCount, t]
	)

	return (
		<StatCard
			label={t("winRate")}
			value={hasData ? formatChartPercent(winRate, false) : "--"}
			valueColorClass={colorClass}
			indicator={
				hasData ? (
					<WinRateRing rate={winRate} colorClass={colorClass} />
				) : undefined
			}
			subValue={subValue}
		/>
	)
}

export { WinRateCard }
