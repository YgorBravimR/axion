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
import type { SimulatedDay } from "@/types/monte-carlo"

interface DailyPnlChartProps {
	days: SimulatedDay[]
	monthsToTrade?: number
}

interface ChartDataPoint {
	dayNumber: number
	pnl: number // in currency units (not cents)
	mode: SimulatedDay["mode"] | "skipped"
	targetHit: boolean
}

const MODE_COLORS: Record<string, string> = {
	lossRecovery: "var(--color-trade-sell)",
	gainCompounding: "var(--color-trade-buy)",
	mixed: "var(--color-acc-100)",
	skipped: "var(--color-bg-300)",
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: ChartDataPoint
	}>
}

const DailyPnlChart = ({ days, monthsToTrade = 1 }: DailyPnlChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("monteCarlo.v2.charts")
	const tCharts = useTranslations("charts")

	const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
		if (!active || !payload || payload.length === 0) return null

		const data = payload[0].payload
		const isPositive = data.pnl >= 0

		return (
			<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
				<p className="text-tiny text-txt-300">{tCharts("dayNumber", { number: data.dayNumber })}</p>
				<p
					className={`text-small font-semibold ${isPositive ? "text-trade-buy" : "text-trade-sell"}`}
				>
					{formatCompactCurrency(data.pnl, "R$")}
				</p>
				<p className="text-tiny text-txt-300 capitalize">
					{data.mode === "skipped" ? tCharts("skipped") : data.mode.replace(/([A-Z])/g, " $1").trim()}
					{data.targetHit ? ` ${tCharts("target")}` : ""}
				</p>
			</div>
		)
	}
	const isMultiMonth = monthsToTrade > 1

	const chartData = useMemo<ChartDataPoint[]>(
		() =>
			days.map((day) => ({
				dayNumber: day.dayNumber,
				pnl: day.dayPnl / 100, // cents to currency
				mode: day.skipped ? "skipped" : day.mode,
				targetHit: day.targetHit,
			})),
		[days]
	)

	const { maxPnl, minPnl, padding } = useMemo(() => {
		const pnls = chartData.map((d) => d.pnl)
		const max = Math.max(...pnls, 0)
		const min = Math.min(...pnls, 0)
		const range = max - min
		return { maxPnl: max, minPnl: min, padding: range * 0.1 || 100 }
	}, [chartData])

	return (
		<div className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border">
			<div className="mb-m-400 flex items-center justify-between">
				<h3 className="text-body text-txt-100 font-semibold">
					{isMultiMonth ? t("dailyPnlPeriod", { months: monthsToTrade }) : t("dailyPnl")}
				</h3>
			</div>

			<ChartContainer id="chart-monte-carlo-v2-daily-pnl" className="h-72">
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
						dataKey="dayNumber"
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
						tickFormatter={(value) => formatCompactCurrency(value, "R$")}
						domain={[minPnl - padding, maxPnl + padding]}
						width={yAxisWidth}
					/>
					<Tooltip content={<CustomTooltip />} />
					<ReferenceLine
						y={0}
						stroke="var(--color-txt-300)"
						strokeDasharray="4 4"
						strokeOpacity={0.5}
					/>
					<Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
						{chartData.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={MODE_COLORS[entry.mode] ?? "var(--color-acc-100)"}
								fillOpacity={entry.mode === "skipped" ? 0.3 : 0.75}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>

			<p className="mt-s-300 text-tiny text-txt-300 text-center">
				{t("dayNumber")}
			</p>

			{/* Legend */}
			<div className="mt-m-400 pt-s-300 border-bg-300 border-t">
				<div className="gap-m-400 flex flex-wrap items-center justify-center">
					<div className="gap-s-200 flex items-center">
						<div
							className="h-3 w-6 rounded-sm"
							style={{ backgroundColor: MODE_COLORS.lossRecovery, opacity: 0.75 }}
						/>
						<span className="text-tiny text-txt-300">{t("lossRecovery")}</span>
					</div>
					<div className="gap-s-200 flex items-center">
						<div
							className="h-3 w-6 rounded-sm"
							style={{ backgroundColor: MODE_COLORS.gainCompounding, opacity: 0.75 }}
						/>
						<span className="text-tiny text-txt-300">{t("gainCompounding")}</span>
					</div>
					<div className="gap-s-200 flex items-center">
						<div
							className="h-3 w-6 rounded-sm"
							style={{ backgroundColor: MODE_COLORS.skipped, opacity: 0.3 }}
						/>
						<span className="text-tiny text-txt-300">{t("skipped")}</span>
					</div>
				</div>
			</div>
		</div>
	)
}

export { DailyPnlChart }
