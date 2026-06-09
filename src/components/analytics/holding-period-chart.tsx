"use client"

import { memo, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import {
	formatCompactCurrencyWithSign,
	formatFinite,
	formatR,
} from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import { cn } from "@/lib/utils"
import type { HoldingPeriodBucket } from "@/types"
import type { ExpectancyMode } from "./expectancy-mode-toggle"

interface HoldingPeriodChartProps {
	data: HoldingPeriodBucket[]
	expectancyMode: ExpectancyMode
}

interface TooltipLabels {
	duration: string
	trades: string
	winRate: string
	avgPnl: string
	avgR: string
	profitFactor: string
	currencySymbol: string
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: HoldingPeriodBucket
	}>
	labels?: TooltipLabels
}

const CustomTooltip = ({ active, payload, labels }: CustomTooltipProps) => {
	const head = payload?.[0]
	if (!active || !head || !labels) {
		return null
	}

	const data = head.payload
	const isProfit = data.totalPnl >= 0

	return (
		<div className="border-bg-300 bg-bg-200 px-s-300 py-s-200 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-semibold">{data.bucket}</p>
			<div className="mt-s-200 space-y-s-100">
				<p className="text-tiny">
					<span className="text-txt-300">{labels.duration}:</span>{" "}
					<span className="text-txt-100 font-medium">
						{data.avgDurationMinutes < 60
							? `${Math.round(data.avgDurationMinutes)}min`
							: `${(data.avgDurationMinutes / 60).toFixed(1)}h`}
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.trades}:</span>{" "}
					<span className="text-txt-100 font-medium">{data.totalTrades}</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.winRate}:</span>{" "}
					<span className="text-txt-100 font-medium">
						{data.winRate.toFixed(0)}%
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.avgPnl}:</span>{" "}
					<span
						className={cn(
							"font-medium",
							isProfit ? "text-trade-buy" : "text-trade-sell"
						)}
					>
						{formatCompactCurrencyWithSign(data.avgPnl, labels.currencySymbol)}
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.avgR}:</span>{" "}
					<span
						className={cn(
							"font-medium",
							data.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
						)}
					>
						{data.avgR >= 0 ? "+" : ""}
						{data.avgR.toFixed(2)}R
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.profitFactor}:</span>{" "}
					<span className="text-txt-100 font-medium">
						{formatFinite(data.profitFactor, 2)}
					</span>
				</p>
			</div>
		</div>
	)
}

const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const

const HoldingPeriodChart = memo(
	({ data, expectancyMode }: HoldingPeriodChartProps) => {
		const { yAxisWidth } = useChartConfig()
		const t = useTranslations("analytics.holdingPeriod")
		const locale = useLocale()
		const currencySymbol = locale === "pt-BR" ? "BRL" : "$"

		const isRMode = expectancyMode === "edge"
		const metricKey = isRMode ? "avgR" : "totalPnl"

		const activeBuckets = data.filter((d) => d.totalTrades > 0)

		const tooltipLabels = useMemo<TooltipLabels>(
			() => ({
				duration: t("duration"),
				trades: t("trades"),
				winRate: t("winRate"),
				avgPnl: t("avgPnl"),
				avgR: t("avgR"),
				profitFactor: t("profitFactor"),
				currencySymbol,
			}),
			[t, currencySymbol]
		)

		if (activeBuckets.length === 0) {
			return (
				<div
					id="analytics-holding-period"
					className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
				>
					<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
					<div className="gap-s-200 text-txt-300 h-empty-state-lg sm:h-chart-lg flex flex-col items-center justify-center text-center">
						<p>{t("noData")}</p>
					</div>
				</div>
			)
		}

		// Domain with padding
		const maxAbsMetric = Math.max(
			...activeBuckets.map((d) => Math.abs(d[metricKey])),
			isRMode ? 0.5 : 100
		)
		const domainMax = isRMode
			? Math.ceil(maxAbsMetric * 1.2 * 100) / 100
			: Math.ceil(maxAbsMetric * 1.1)

		// Best and worst buckets (only show worst if different from best)
		const sorted = activeBuckets.toSorted((a, b) => b[metricKey] - a[metricKey])
		const [bestBucket] = sorted
		const worstBucket = sorted.length > 1 ? sorted[sorted.length - 1] : null
		if (!bestBucket) {
			return null
		}

		const formatMetric = (value: number): string =>
			isRMode
				? formatR(value)
				: formatCompactCurrencyWithSign(value, currencySymbol)

		return (
			<div
				id="analytics-holding-period"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
				role="figure"
				aria-label={t("title")}
			>
				<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
				<ChartContainer
					id="chart-analytics-holding-period"
					className="h-chart-md sm:h-chart-lg w-full min-w-0"
				>
					<BarChart
						data={activeBuckets}
						margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="bucket"
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							interval={0}
							axisLine={{ stroke: "var(--color-bg-300)" }}
						/>
						<YAxis
							tickFormatter={(value: number) =>
								isRMode
									? formatR(value)
									: formatCompactCurrencyWithSign(value, currencySymbol)
							}
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							interval={0}
							axisLine={false}
							domain={[-domainMax, domainMax]}
							width={yAxisWidth}
						/>
						<ChartTooltip content={<CustomTooltip labels={tooltipLabels} />} />
						<Bar
							dataKey={metricKey}
							radius={[4, 4, 0, 0]}
							maxBarSize={80}
							animationDuration={400}
							animationEasing="ease-out"
						>
							{activeBuckets.map((entry) => (
								<Cell
									key={entry.bucket}
									fill={
										entry[metricKey] >= 0
											? "var(--color-trade-buy)"
											: "var(--color-trade-sell)"
									}
								/>
							))}
						</Bar>
					</BarChart>
				</ChartContainer>

				{/* Summary */}
				<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 border-bg-300 pt-s-300 sm:pt-m-400 grid grid-cols-1 border-t sm:grid-cols-2">
					<div>
						<p className="text-tiny text-txt-300">{t("bestBucket")}</p>
						<p className="text-small text-txt-100 font-medium">
							{bestBucket.bucket} ({bestBucket.winRate.toFixed(0)}% WR,{" "}
							<span className="text-trade-buy">
								{formatMetric(bestBucket[metricKey])}
							</span>
							)
						</p>
					</div>
					{worstBucket && (
						<div>
							<p className="text-tiny text-txt-300">{t("worstBucket")}</p>
							<p className="text-small text-txt-100 font-medium">
								{worstBucket.bucket} ({worstBucket.winRate.toFixed(0)}% WR,{" "}
								<span className="text-trade-sell">
									{formatMetric(worstBucket[metricKey])}
								</span>
								)
							</p>
						</div>
					)}
				</div>
			</div>
		)
	}
)

HoldingPeriodChart.displayName = "HoldingPeriodChart"

export { HoldingPeriodChart }
