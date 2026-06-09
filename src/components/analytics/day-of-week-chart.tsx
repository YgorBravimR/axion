"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import {
	formatCompactCurrencyWithSign,
	formatR,
	computeChartDomain,
} from "@/lib/formatting"
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

	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload
	const isProfit = data.totalPnl >= 0

	// Translate day name
	const translatedDayName = tDayNames(
		data.dayName as
			| "Monday"
			| "Tuesday"
			| "Wednesday"
			| "Thursday"
			| "Friday"
			| "Saturday"
			| "Sunday"
	)

	return (
		<div className="border-bg-300 bg-bg-200 px-s-300 py-s-200 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-semibold">
				{translatedDayName}
			</p>
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
				{data.bestHour !== undefined && (
					<p className="text-tiny">
						<span className="text-txt-300">{t("time.bestHourOnDay")}:</span>{" "}
						<span className="text-txt-100 font-medium">{data.bestHour}:00</span>
					</p>
				)}
			</div>
		</div>
	)
}

const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const

export const DayOfWeekChart = memo(
	({ data, expectancyMode }: DayOfWeekChartProps) => {
		const { yAxisWidth } = useChartConfig()
		const t = useTranslations("analytics")
		const tCommon = useTranslations("common")
		const tDays = useTranslations("analytics.time.heatmapDays")
		const tDayNames = useTranslations("analytics.time.dayNames")

		const isRMode = expectancyMode === "edge"
		const metricKey = isRMode ? "avgR" : "totalPnl"

		const { tradingDays, domain, bestDay, worstDay } = useMemo(() => {
			// B3 (Bovespa) is closed Saturday + Sunday, so weekend bars are noise.
			// Drop them defensively even if the dataset leaks weekend rows.
			const WEEKEND = new Set(["Saturday", "Sunday"])
			const days = data.filter(
				(d) => d.totalTrades > 0 && !WEEKEND.has(d.dayName)
			)
			const fallback = isRMode ? 0.5 : 100
			const domainTuple = computeChartDomain(
				days.map((d) => d[metricKey]),
				fallback
			)
			const sorted = days.toSorted((a, b) => b[metricKey] - a[metricKey])
			return {
				tradingDays: days,
				domain: domainTuple,
				bestDay: sorted[0],
				worstDay: sorted[sorted.length - 1],
			}
		}, [data, metricKey, isRMode])

		const formatMetric = (value: number): string =>
			isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "BRL")

		if (tradingDays.length === 0) {
			return (
				<div
					id="analytics-day-of-week"
					className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
				>
					<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
						{t("time.dayOfWeekTitle")}
					</h3>
					<div className="text-txt-300 h-empty-state-lg sm:h-chart-lg flex items-center justify-center">
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
			return tDayNames(
				dayName as
					| "Monday"
					| "Tuesday"
					| "Wednesday"
					| "Thursday"
					| "Friday"
					| "Saturday"
					| "Sunday"
			)
		}

		return (
			<div
				id="analytics-day-of-week"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border"
			>
				<h3 className="mb-s-300 sm:mb-m-400 text-small sm:text-body text-txt-100 font-semibold">
					{t("time.dayOfWeekTitle")}
				</h3>
				<ChartContainer
					id="chart-analytics-day-of-week"
					className="h-chart-md sm:h-chart-lg w-full min-w-0"
				>
					<BarChart
						data={tradingDays}
						margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="dayName"
							tickFormatter={getDayShort}
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={{ stroke: "var(--color-bg-300)" }}
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
							domain={domain}
							width={yAxisWidth}
						/>
						<ChartTooltip content={<CustomTooltip />} />
						<Bar dataKey={metricKey} radius={[4, 4, 0, 0]} maxBarSize={80}>
							{tradingDays.map((entry) => (
								<Cell
									key={`cell-${entry.dayOfWeek}`}
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
						<p className="text-tiny text-txt-300">{t("time.bestDay")}</p>
						<p className="text-small text-txt-100 font-medium">
							{bestDay ? getTranslatedDayName(bestDay.dayName) : ""} (
							{bestDay?.winRate.toFixed(0)}% {tCommon("winRateAbbr")},{" "}
							<span className="text-trade-buy">
								{formatMetric(bestDay?.[metricKey] ?? 0)}
							</span>
							)
						</p>
					</div>
					<div>
						<p className="text-tiny text-txt-300">{t("time.worstDay")}</p>
						<p className="text-small text-txt-100 font-medium">
							{worstDay ? getTranslatedDayName(worstDay.dayName) : ""} (
							{worstDay?.winRate.toFixed(0)}% {tCommon("winRateAbbr")},{" "}
							<span className="text-trade-sell">
								{formatMetric(worstDay?.[metricKey] ?? 0)}
							</span>
							)
						</p>
					</div>
				</div>
			</div>
		)
	}
)

DayOfWeekChart.displayName = "DayOfWeekChart"
