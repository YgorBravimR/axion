"use client"

import { useMemo } from "react"
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ReferenceLine,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { formatR } from "@/lib/formatting"
import type { SimulatedTrade } from "@/types/monte-carlo"

interface DrawdownChartProps {
	trades: SimulatedTrade[]
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: { tradeNumber: number; rDrawdown: number }
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	if (!active || !payload || payload.length === 0) return null

	const data = payload[0].payload
	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">Trade #{data.tradeNumber}</p>
			<p className="text-small text-trade-sell font-semibold">
				-{data.rDrawdown.toFixed(2)}R
			</p>
		</div>
	)
}

export const DrawdownChart = ({ trades }: DrawdownChartProps) => {
	const t = useTranslations("monteCarlo.results")

	const chartData = useMemo(
		() => [
			{ tradeNumber: 0, rDrawdown: 0 },
			...trades.map((trade) => ({
				tradeNumber: trade.tradeNumber,
				rDrawdown: trade.rDrawdown,
			})),
		],
		[trades]
	)

	const { maxDrawdown, padding } = useMemo(() => {
		const max = Math.max(...chartData.map((d) => d.rDrawdown))
		return { maxDrawdown: max, padding: max * 0.1 || 0.5 }
	}, [chartData])

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<div className="mb-m-400 flex items-center justify-between">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("drawdownCurve")}
				</h3>
				<span className="text-small text-trade-sell font-medium">
					Max: -{maxDrawdown.toFixed(2)}R
				</span>
			</div>

			<ChartContainer
				id="chart-monte-carlo-drawdown"
				className="h-56 sm:h-64 lg:h-72"
			>
				<AreaChart
					data={chartData}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<defs>
						<linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
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
					/>
					<YAxis
						stroke="var(--color-txt-300)"
						fontSize={11}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value) => `-${value.toFixed(1)}R`}
						domain={[0, maxDrawdown + padding]}
						reversed
						width={50}
					/>
					<Tooltip content={<CustomTooltip />} />
					<ReferenceLine
						y={0}
						stroke="var(--color-txt-300)"
						strokeDasharray="4 4"
						strokeOpacity={0.5}
					/>
					<Area
						type="monotone"
						dataKey="rDrawdown"
						stroke="var(--color-trade-sell)"
						strokeWidth={2}
						fill="url(#drawdownGradient)"
					/>
				</AreaChart>
			</ChartContainer>

			<p className="mt-s-300 text-tiny text-txt-300 text-center">
				{t("tradeNumber")}
			</p>
		</div>
	)
}
