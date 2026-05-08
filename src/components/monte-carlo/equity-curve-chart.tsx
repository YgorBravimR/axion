"use client"

import { useId, useMemo } from "react"
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { formatR } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import type { SimulatedTrade } from "@/types/monte-carlo"

interface EquityCurveChartProps {
	trades: SimulatedTrade[]
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: { tradeNumber: number; cumulativeR: number }
	}>
	tCharts: ReturnType<typeof useTranslations>
}

const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const
const CHART_MARGIN = { top: 10, right: 10, left: 0, bottom: 0 } as const

const CustomTooltip = ({ active, payload, tCharts }: CustomTooltipProps) => {
	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload
	const isPositive = data.cumulativeR >= 0

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">
				{tCharts("tradeNumber", { number: data.tradeNumber })}
			</p>
			<p
				className={`text-small font-semibold ${isPositive ? "text-trade-buy" : "text-trade-sell"}`}
			>
				{formatR(data.cumulativeR)}
			</p>
		</div>
	)
}

export const EquityCurveChart = ({ trades }: EquityCurveChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("monteCarlo.results")
	const tCharts = useTranslations("charts")
	const uid = useId()
	const gradientPositiveId = `equity-gradient-positive-${uid}`
	const gradientNegativeId = `equity-gradient-negative-${uid}`

	const chartData = useMemo(
		() => [
			{ tradeNumber: 0, cumulativeR: 0 },
			...trades.map((trade) => ({
				tradeNumber: trade.tradeNumber,
				cumulativeR: trade.cumulativeR,
			})),
		],
		[trades]
	)

	const { minValue, maxValue, padding } = useMemo(() => {
		const values = chartData.map((d) => d.cumulativeR)
		const min = Math.min(...values)
		const max = Math.max(...values)
		return { minValue: min, maxValue: max, padding: (max - min) * 0.1 || 1 }
	}, [chartData])

	const finalR = chartData[chartData.length - 1]?.cumulativeR || 0
	const isPositive = finalR >= 0

	const strokeColor = isPositive
		? "var(--color-trade-buy)"
		: "var(--color-trade-sell)"

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<div className="mb-m-400 flex items-center justify-between">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("equityCurve")}
				</h3>
				<span
					className={`text-small font-medium ${isPositive ? "text-trade-buy" : "text-trade-sell"}`}
				>
					{formatR(finalR)}
				</span>
			</div>

			<ChartContainer
				id="chart-monte-carlo-equity-curve"
				className="h-56 sm:h-64 lg:h-72"
			>
				<AreaChart data={chartData} margin={CHART_MARGIN}>
					<defs>
						<linearGradient id={gradientPositiveId} x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="5%"
								stopColor="var(--color-trade-buy)"
								stopOpacity={0.25}
							/>
							<stop
								offset="95%"
								stopColor="var(--color-trade-buy)"
								stopOpacity={0.02}
							/>
						</linearGradient>
						<linearGradient id={gradientNegativeId} x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="5%"
								stopColor="var(--color-trade-sell)"
								stopOpacity={0.25}
							/>
							<stop
								offset="95%"
								stopColor="var(--color-trade-sell)"
								stopOpacity={0.02}
							/>
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						strokeOpacity={0.5}
					/>
					<XAxis
						dataKey="tradeNumber"
						stroke="var(--color-txt-300)"
						fontSize={11}
						tickLine={false}
						axisLine={false}
						tick={AXIS_TICK}
					/>
					<YAxis
						stroke="var(--color-txt-300)"
						fontSize={11}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value) => formatR(value)}
						domain={[minValue - padding, maxValue + padding]}
						width={yAxisWidth}
						tick={AXIS_TICK}
					/>
					<ChartTooltip
						variant="line"
						content={<CustomTooltip tCharts={tCharts} />}
					/>
					<ReferenceLine
						y={0}
						stroke="var(--color-txt-300)"
						strokeDasharray="4 4"
						strokeOpacity={0.5}
					/>
					<Area
						type="monotone"
						dataKey="cumulativeR"
						stroke={strokeColor}
						strokeWidth={2}
						fill={
							isPositive
								? `url(#${gradientPositiveId})`
								: `url(#${gradientNegativeId})`
						}
					/>
				</AreaChart>
			</ChartContainer>

			<p className="mt-s-300 text-tiny text-txt-300 text-center">
				{t("tradeNumber")}
			</p>
		</div>
	)
}
