"use client"

import { useMemo } from "react"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ReferenceLine,
	Cell,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import type { DistributionBucket } from "@/types/monte-carlo"

interface V2DistributionHistogramProps {
	buckets: DistributionBucket[]
	medianBalance: number
	initialBalance: number
	currency?: string
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: DistributionBucket & { midPoint: number }
	}>
	currency: string
}

const CustomTooltip = ({ active, payload, currency }: CustomTooltipProps) => {
	if (!active || !payload || payload.length === 0) return null

	const data = payload[0].payload
	const isProfit = data.midPoint >= 0

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">
				{formatCompactCurrency(data.rangeStart, currency)} –{" "}
				{formatCompactCurrency(data.rangeEnd, currency)}
			</p>
			<p
				className={`text-small font-semibold ${isProfit ? "text-trade-buy" : "text-trade-sell"}`}
			>
				{data.count} simulations ({data.percentage.toFixed(1)}%)
			</p>
		</div>
	)
}

export const V2DistributionHistogram = ({
	buckets,
	medianBalance,
	initialBalance,
	currency = "$",
}: V2DistributionHistogramProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("monteCarlo.results")

	const chartData = useMemo(
		() =>
			buckets.map((bucket) => ({
				...bucket,
				midPoint: (bucket.rangeStart + bucket.rangeEnd) / 2,
			})),
		[buckets]
	)

	const maxCount = useMemo(
		() => Math.max(...chartData.map((d) => d.count)),
		[chartData]
	)

	return (
		<div className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border">
			<div className="mb-m-400 flex items-center justify-between">
				<h3 className="text-body text-txt-100 font-semibold">
					{t("distribution")}
				</h3>
				<span className="text-tiny text-txt-300">
					{t("median")}:{" "}
					<span className="text-txt-100 font-medium">
						{formatCompactCurrency(medianBalance, currency)}
					</span>
				</span>
			</div>

			<ChartContainer
				id="chart-monte-carlo-v2-distribution-histogram"
				className="h-72"
			>
				<BarChart
					data={chartData}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						strokeOpacity={0.5}
						vertical={false}
					/>
					<XAxis
						dataKey="midPoint"
						stroke="var(--color-txt-300)"
						fontSize={10}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value) =>
							formatCompactCurrency(value, currency)
						}
						interval="preserveStartEnd"
					/>
					<YAxis
						stroke="var(--color-txt-300)"
						fontSize={11}
						tickLine={false}
						axisLine={false}
						domain={[0, maxCount * 1.1]}
						width={yAxisWidth}
					/>
					<Tooltip
						content={<CustomTooltip currency={currency} />}
					/>
					<ReferenceLine
						x={initialBalance}
						stroke="var(--color-acc-100)"
						strokeDasharray="4 4"
						strokeWidth={1.5}
						label={{
							value: formatCompactCurrency(initialBalance, currency),
							position: "top",
							fill: "var(--color-acc-100)",
							fontSize: 10,
							fontWeight: 500,
						}}
					/>
					<Bar dataKey="count" radius={[3, 3, 0, 0]}>
						{chartData.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={
									entry.midPoint >= initialBalance
										? "var(--color-trade-buy)"
										: "var(--color-trade-sell)"
								}
								fillOpacity={0.75}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>

			<p className="mt-s-300 text-tiny text-txt-300 text-center">
				{t("finalBalance")}
			</p>
		</div>
	)
}
