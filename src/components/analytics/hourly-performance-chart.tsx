"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import type { HourlyPerformance } from "@/types"
import type { ExpectancyMode } from "./expectancy-mode-toggle"

interface HourlyPerformanceChartProps {
	data: HourlyPerformance[]
	expectancyMode: ExpectancyMode
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: HourlyPerformance
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("analytics")

	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload
	const isProfit = data.totalPnl >= 0

	return (
		<div className="border-bg-300 bg-bg-200 px-s-300 py-s-200 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-semibold">{data.hourLabel}</p>
			<div className="mt-s-200 space-y-s-100">
				<p className="text-tiny">
					<span className="text-txt-300">{t("time.pnl")}:</span>{" "}
					<span
						className={`font-medium ${isProfit ? "text-trade-buy" : "text-trade-sell"}`}
					>
						{formatCompactCurrencyWithSign(data.totalPnl, "BRL")}
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{t("time.trades")}:</span>{" "}
					<span className="text-txt-100 font-medium">{data.totalTrades}</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{t("time.winRate")}:</span>{" "}
					<span className="text-txt-100 font-medium">
						{data.winRate.toFixed(0)}%
					</span>
				</p>
				<p className="text-tiny">
					<span className="text-txt-300">{t("time.avgR")}:</span>{" "}
					<span
						className={`font-medium ${data.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"}`}
					>
						{data.avgR >= 0 ? "+" : ""}
						{data.avgR.toFixed(2)}R
					</span>
				</p>
			</div>
		</div>
	)
}

const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const

export const HourlyPerformanceChart = memo(
	({ data, expectancyMode }: HourlyPerformanceChartProps) => {
		const { yAxisWidth } = useChartConfig()
		const t = useTranslations("analytics")
		const tCommon = useTranslations("common")

		const isRMode = expectancyMode === "edge"
		const metricKey = isRMode ? "avgR" : "totalPnl"

		const { domainMax, bestHour, worstHour } = useMemo(() => {
			const maxAbs = Math.max(
				...data.map((d) => Math.abs(d[metricKey])),
				isRMode ? 0.5 : 100
			)
			const dMax = isRMode
				? Math.ceil(maxAbs * 1.2 * 100) / 100
				: Math.ceil(maxAbs * 1.1)
			const sorted = data.toSorted((a, b) => b[metricKey] - a[metricKey])
			return {
				domainMax: dMax,
				bestHour: sorted[0],
				worstHour: sorted[sorted.length - 1],
			}
		}, [data, metricKey, isRMode])

		const formatMetric = (value: number): string =>
			isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "BRL")

		if (data.length === 0) {
			return (
				<div
					id="analytics-hourly"
					className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
				>
					<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
						{t("time.hourlyTitle")}
					</h3>
					<div className="text-txt-300 flex h-[180px] items-center justify-center sm:h-[250px]">
						{t("noData")}
					</div>
				</div>
			)
		}

		return (
			<div
				id="analytics-hourly"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
			>
				<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
					{t("time.hourlyTitle")}
				</h3>
				<ChartContainer
					id="chart-analytics-hourly-performance"
					className="h-[200px] w-full min-w-0 sm:h-[250px]"
				>
					<BarChart
						data={data}
						margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="hourLabel"
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={{ stroke: "var(--color-bg-300)" }}
							interval={1}
						/>
						<YAxis
							tickFormatter={(value: number) =>
								isRMode
									? formatR(value)
									: formatCompactCurrencyWithSign(value, "BRL")
							}
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={false}
							domain={[-domainMax, domainMax]}
							width={yAxisWidth}
						/>
						<ChartTooltip content={<CustomTooltip />} />
						<Bar dataKey={metricKey} radius={[4, 4, 0, 0]} maxBarSize={80}>
							{data.map((entry, index) => (
								<Cell
									key={`cell-${index}`}
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
						<p className="text-tiny text-txt-300">{t("time.bestHour")}</p>
						<p className="text-small text-txt-100 font-medium">
							{bestHour?.hourLabel} ({bestHour?.winRate.toFixed(0)}%{" "}
							{tCommon("winRateAbbr")},{" "}
							<span className="text-trade-buy">
								{formatMetric(bestHour?.[metricKey] ?? 0)}
							</span>
							, {bestHour?.totalTrades} {t("time.trades").toLowerCase()})
						</p>
					</div>
					<div>
						<p className="text-tiny text-txt-300">{t("time.worstHour")}</p>
						<p className="text-small text-txt-100 font-medium">
							{worstHour?.hourLabel} ({worstHour?.winRate.toFixed(0)}%{" "}
							{tCommon("winRateAbbr")},{" "}
							<span className="text-trade-sell">
								{formatMetric(worstHour?.[metricKey] ?? 0)}
							</span>
							, {worstHour?.totalTrades} {t("time.trades").toLowerCase()})
						</p>
					</div>
				</div>
			</div>
		)
	}
)

HourlyPerformanceChart.displayName = "HourlyPerformanceChart"
