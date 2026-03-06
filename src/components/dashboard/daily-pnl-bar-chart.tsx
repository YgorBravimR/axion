"use client"

import { useTranslations } from "next-intl"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Cell,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import { APP_TIMEZONE } from "@/lib/dates"
import { useChartConfig } from "@/hooks/use-chart-config"
import type { DailyPnL } from "@/types"

interface DailyPnLBarChartProps {
	data: DailyPnL[]
	onDayClick?: (date: string) => void
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: DailyPnL
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("dashboard")

	if (!active || !payload || payload.length === 0) {
		return null
	}

	const data = payload[0].payload
	const isProfit = data.pnl >= 0

	return (
		<div className="border-bg-300 bg-bg-100 px-s-300 py-s-200 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-medium">
				{new Date(data.date).toLocaleDateString("pt-BR", {
					weekday: "short",
					day: "numeric",
					month: "short",
					timeZone: APP_TIMEZONE,
				})}
			</p>
			<p
				className={`text-body font-semibold ${isProfit ? "text-trade-buy" : "text-trade-sell"}`}
			>
				{formatCompactCurrencyWithSign(data.pnl, "R$")}
			</p>
			<p className="text-caption text-txt-300">
				{data.tradeCount} {data.tradeCount === 1 ? t("trade") : t("trades")}
			</p>
		</div>
	)
}

export const DailyPnLBarChart = ({
	data,
	onDayClick,
}: DailyPnLBarChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("dashboard")

	// Sort by date (using toSorted for immutability)
	const sortedData = data.toSorted(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	)

	const formatDay = (date: string) => {
		const d = new Date(date)
		return d.getDate().toString()
	}

	const maxAbsPnl = Math.max(...data.map((d) => Math.abs(d.pnl)), 100)
	const domainMax = Math.ceil(maxAbsPnl * 1.1)

	const handleBarClick = (entry: DailyPnL) => {
		if (onDayClick) {
			onDayClick(entry.date)
		}
	}

	if (data.length === 0) {
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border sm:p-m-400">
				<h3 className="mb-s-300 text-small text-txt-100 font-semibold sm:mb-m-400 sm:text-body">
					{t("dailyPnL.title")}
				</h3>
				<div className="text-txt-300 flex h-[160px] sm:h-[200px] items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border sm:p-m-400">
			<h3 className="mb-s-300 text-small text-txt-100 font-semibold sm:mb-m-400 sm:text-body">
				{t("dailyPnL.title")}
			</h3>
			<ChartContainer
				id="chart-dashboard-daily-pnl"
				className="h-[160px] w-full sm:h-[200px]"
			>
				<BarChart
					data={sortedData}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>
					<XAxis
						dataKey="date"
						tickFormatter={formatDay}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 12 }}
						tickLine={false}
						axisLine={{ stroke: "var(--color-bg-300)" }}
					/>
					<YAxis
						tickFormatter={(value: number) =>
							formatCompactCurrencyWithSign(value, "R$")
						}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 12 }}
						tickLine={false}
						axisLine={false}
						domain={[-domainMax, domainMax]}
						width={yAxisWidth}
					/>
					<Tooltip
						content={<CustomTooltip />}
						cursor={{ fill: "var(--color-bg-300)", opacity: 0.3 }}
					/>
					<Bar
						dataKey="pnl"
						radius={[4, 4, 0, 0]}
						cursor={onDayClick ? "pointer" : "default"}
						onClick={(data) => handleBarClick(data as unknown as DailyPnL)}
					>
						{sortedData.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={
									entry.pnl >= 0
										? "var(--color-trade-buy)"
										: "var(--color-trade-sell)"
								}
								fillOpacity={0.85}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>
		</div>
	)
}
