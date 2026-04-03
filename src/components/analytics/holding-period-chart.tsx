"use client"

import { useTranslations, useLocale } from "next-intl"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Cell,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
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

const formatDuration = (minutes: number, t: (key: string, params?: Record<string, string>) => string): string => {
	if (minutes < 1) return t("minutes", { value: "< 1" })
	if (minutes < 60) return t("minutes", { value: String(Math.round(minutes)) })
	const hours = minutes / 60
	return t("hours", { value: hours.toFixed(1) })
}

const CustomTooltip = ({ active, payload, labels }: CustomTooltipProps) => {
	if (!active || !payload || payload.length === 0 || !labels) return null

	const data = payload[0].payload
	const isProfit = data.totalPnl >= 0

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 px-s-300 py-s-200 shadow-lg">
			<p className="text-small font-semibold text-txt-100">{data.bucket}</p>
			<div className="mt-s-200 space-y-s-100">
				<p className="text-tiny">
					<span className="text-txt-300">{labels.duration}:</span>{" "}
					<span className="font-medium text-txt-100">
						{formatCompactCurrencyWithSign(data.avgDurationMinutes, "").replace(/[+\-]/, "").trim() || String(Math.round(data.avgDurationMinutes))}
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.trades}:</span>{" "}
					<span className="font-medium text-txt-100">{data.totalTrades}</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.winRate}:</span>{" "}
					<span className={cn("font-medium", data.winRate >= 50 ? "text-trade-buy" : "text-trade-sell")}>
						{data.winRate.toFixed(0)}%
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.avgPnl}:</span>{" "}
					<span className={cn("font-medium", isProfit ? "text-trade-buy" : "text-trade-sell")}>
						{formatCompactCurrencyWithSign(data.avgPnl, labels.currencySymbol)}
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.avgR}:</span>{" "}
					<span className={cn("font-medium", data.avgR >= 0 ? "text-trade-buy" : "text-trade-sell")}>
						{data.avgR >= 0 ? "+" : ""}{data.avgR.toFixed(2)}R
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{labels.profitFactor}:</span>{" "}
					<span className="font-medium text-txt-100">
						{data.profitFactor.toFixed(2)}
					</span>
				</p>
			</div>
		</div>
	)
}

const HoldingPeriodChart = ({ data, expectancyMode }: HoldingPeriodChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("analytics.holdingPeriod")
	const locale = useLocale()
	const currencySymbol = locale === "pt-BR" ? "R$" : "$"

	const isRMode = expectancyMode === "edge"
	const metricKey = isRMode ? "avgR" : "totalPnl"

	const activeBuckets = data.filter((d) => d.totalTrades > 0)

	// Pre-resolve tooltip labels to avoid calling useTranslations inside Recharts' render tree
	const tooltipLabels: TooltipLabels = {
		duration: t("duration"),
		trades: t("trades"),
		winRate: t("winRate"),
		avgPnl: t("avgPnl"),
		avgR: t("avgR"),
		profitFactor: t("profitFactor"),
		currencySymbol,
	}

	if (activeBuckets.length === 0) {
		return (
			<div id="analytics-holding-period" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400">
				<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body font-semibold text-txt-100">
					{t("title")}
				</h3>
				<div className="flex h-[180px] sm:h-[250px] flex-col items-center justify-center gap-s-200 text-center text-txt-300">
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

	// Best and worst buckets
	const sorted = activeBuckets.toSorted((a, b) => b[metricKey] - a[metricKey])
	const bestBucket = sorted[0]
	const worstBucket = sorted[sorted.length - 1]

	const formatMetric = (value: number): string =>
		isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, currencySymbol)

	return (
		<div
			id="analytics-holding-period"
			className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400"
			role="figure"
			aria-label={t("title")}
		>
			<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body font-semibold text-txt-100">
				{t("title")}
			</h3>
			<ChartContainer id="chart-analytics-holding-period" className="h-[200px] sm:h-[250px] w-full min-w-0">
				<BarChart data={activeBuckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>
					<XAxis
						dataKey="bucket"
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={{ stroke: "var(--color-bg-300)" }}
					/>
					<YAxis
						tickFormatter={(value: number) =>
							isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, currencySymbol)
						}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
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
								fill={entry[metricKey] >= 0 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>

			{/* Summary */}
			<div className="mt-s-300 sm:mt-m-400 grid grid-cols-1 sm:grid-cols-2 gap-s-300 sm:gap-m-400 border-t border-bg-300 pt-s-300 sm:pt-m-400">
				<div>
					<p className="text-tiny text-txt-300">{t("bestBucket")}</p>
					<p className="text-small font-medium text-trade-buy">
						{bestBucket.bucket} ({bestBucket.winRate.toFixed(0)}% WR, {formatMetric(bestBucket[metricKey])})
					</p>
				</div>
				<div>
					<p className="text-tiny text-txt-300">{t("worstBucket")}</p>
					<p className="text-small font-medium text-trade-sell">
						{worstBucket.bucket} ({worstBucket.winRate.toFixed(0)}% WR, {formatMetric(worstBucket[metricKey])})
					</p>
				</div>
			</div>
		</div>
	)
}

export { HoldingPeriodChart }
