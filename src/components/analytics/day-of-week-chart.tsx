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
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import type { DayOfWeekPerformance } from "@/types"
import type { ExpectancyMode } from "./expectancy-mode-toggle"

interface DayOfWeekChartProps {
	data: DayOfWeekPerformance[]
	expectancyMode: ExpectancyMode
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: DayOfWeekPerformance
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("analytics")
	const tDayNames = useTranslations("analytics.time.dayNames")

	if (!active || !payload || payload.length === 0) {
		return null
	}

	const data = payload[0].payload
	const isProfit = data.totalPnl >= 0

	// Translate day name
	const translatedDayName = tDayNames(data.dayName as "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday")

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 px-s-300 py-s-200 shadow-lg">
			<p className="text-small font-semibold text-txt-100">{translatedDayName}</p>
			<div className="mt-s-200 space-y-s-100">
				<p className="text-caption">
					<span className="text-txt-300">{t("time.pnl")}:</span>{" "}
					<span className={`font-medium ${isProfit ? "text-trade-buy" : "text-trade-sell"}`}>
						{formatCompactCurrencyWithSign(data.totalPnl, "R$")}
					</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">{t("time.trades")}:</span>{" "}
					<span className="font-medium text-txt-100">{data.totalTrades}</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">{t("time.winRate")}:</span>{" "}
					<span className={`font-medium ${data.winRate >= 50 ? "text-trade-buy" : "text-trade-sell"}`}>
						{data.winRate.toFixed(0)}%
					</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">{t("time.avgR")}:</span>{" "}
					<span className={`font-medium ${data.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"}`}>
						{data.avgR >= 0 ? "+" : ""}{data.avgR.toFixed(2)}R
					</span>
				</p>
				{data.bestHour !== undefined && (
					<p className="text-caption">
						<span className="text-txt-300">{t("time.bestHourOnDay")}:</span>{" "}
						<span className="font-medium text-trade-buy">{data.bestHour}:00</span>
					</p>
				)}
			</div>
		</div>
	)
}

export const DayOfWeekChart = ({ data, expectancyMode }: DayOfWeekChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("analytics")
	const tCommon = useTranslations("common")
	const tDays = useTranslations("analytics.time.heatmapDays")
	const tDayNames = useTranslations("analytics.time.dayNames")

	const isRMode = expectancyMode === "edge"
	const metricKey = isRMode ? "avgR" : "totalPnl"

	// Filter only trading days (Monday-Friday usually)
	const tradingDays = data.filter((d) => d.totalTrades > 0)

	// Calculate domain with padding
	const maxAbsMetric = Math.max(
		...tradingDays.map((d) => Math.abs(d[metricKey])),
		isRMode ? 0.5 : 100
	)
	const domainMax = isRMode
		? Math.ceil(maxAbsMetric * 1.2 * 100) / 100
		: Math.ceil(maxAbsMetric * 1.1)

	// Find best and worst days
	const sortedByMetric = tradingDays.toSorted((a, b) => b[metricKey] - a[metricKey])
	const bestDay = sortedByMetric[0]
	const worstDay = sortedByMetric[sortedByMetric.length - 1]

	const formatMetric = (value: number): string =>
		isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")

	if (tradingDays.length === 0) {
		return (
			<div id="analytics-day-of-week" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400">
				<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body font-semibold text-txt-100">
					{t("time.dayOfWeekTitle")}
				</h3>
				<div className="flex h-[180px] sm:h-[250px] items-center justify-center text-txt-300">
					{t("noData")}
				</div>
			</div>
		)
	}

	// Get translated short day names for display
	const getDayShort = (dayName: string): string => {
		const dayMap: Record<string, string> = {
			Sunday: tDays("sun"),
			Monday: tDays("mon"),
			Tuesday: tDays("tue"),
			Wednesday: tDays("wed"),
			Thursday: tDays("thu"),
			Friday: tDays("fri"),
			Saturday: tDays("sat"),
		}
		return dayMap[dayName] || dayName.substring(0, 3)
	}

	// Get translated full day name
	const getTranslatedDayName = (dayName: string): string => {
		return tDayNames(dayName as "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday")
	}

	return (
		<div id="analytics-day-of-week" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400">
			<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body font-semibold text-txt-100">
				{t("time.dayOfWeekTitle")}
			</h3>
			<ChartContainer id="chart-analytics-day-of-week" className="h-[200px] sm:h-[250px] w-full min-w-0">
					<BarChart data={tradingDays} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="dayName"
							tickFormatter={getDayShort}
							stroke="var(--color-txt-300)"
							tick={{ fill: "var(--color-txt-300)", fontSize: 12 }}
							tickLine={false}
							axisLine={{ stroke: "var(--color-bg-300)" }}
						/>
						<YAxis
							tickFormatter={(value: number) =>
								isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")
							}
							stroke="var(--color-txt-300)"
							tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
							tickLine={false}
							axisLine={false}
							domain={[-domainMax, domainMax]}
							width={yAxisWidth}
						/>
						<Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-bg-300)", opacity: 0.3 }} />
						<Bar dataKey={metricKey} radius={[4, 4, 0, 0]} maxBarSize={80}>
							{tradingDays.map((entry, index) => (
								<Cell
									key={`cell-${index}`}
									fill={entry[metricKey] >= 0 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"}
								/>
							))}
						</Bar>
					</BarChart>
			</ChartContainer>
			{/* Summary */}
			<div className="mt-s-300 sm:mt-m-400 grid grid-cols-1 sm:grid-cols-2 gap-s-300 sm:gap-m-400 border-t border-bg-300 pt-s-300 sm:pt-m-400">
				<div>
					<p className="text-caption text-txt-300">{t("time.bestDay")}</p>
					<p className="text-small font-medium text-trade-buy">
						{bestDay ? getTranslatedDayName(bestDay.dayName) : ""} ({bestDay?.winRate.toFixed(0)}% {tCommon("winRateAbbr")}, {formatMetric(bestDay?.[metricKey] ?? 0)})
					</p>
				</div>
				<div>
					<p className="text-caption text-txt-300">{t("time.worstDay")}</p>
					<p className="text-small font-medium text-trade-sell">
						{worstDay ? getTranslatedDayName(worstDay.dayName) : ""} ({worstDay?.winRate.toFixed(0)}% {tCommon("winRateAbbr")}, {formatMetric(worstDay?.[metricKey] ?? 0)})
					</p>
				</div>
			</div>
		</div>
	)
}
