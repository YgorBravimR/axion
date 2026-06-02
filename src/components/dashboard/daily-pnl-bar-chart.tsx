"use client"

import { useMemo, useCallback } from "react"
import { useTranslations, useLocale } from "next-intl"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"
import { APP_TIMEZONE } from "@/lib/dates"
import { useChartConfig } from "@/hooks/use-chart-config"
import { useFormatting } from "@/hooks/use-formatting"
import type { DailyPnL } from "@/types"

const formatDay = (date: string): string => new Date(date).getDate().toString()

interface DailyPnLBarChartProps {
	data: DailyPnL[]
	onDayClick?: (_date: string) => void
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
	const locale = useLocale()
	const { formatCompactCurrencyWithSign } = useFormatting()

	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload
	const isProfit = data.pnl >= 0

	return (
		<div className="border-bg-300 bg-bg-100 px-s-300 py-s-200 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-medium">
				{new Date(data.date).toLocaleDateString(locale, {
					weekday: "short",
					day: "numeric",
					month: "short",
					timeZone: APP_TIMEZONE,
				})}
			</p>
			<p
				className={cn(
					"text-body font-semibold",
					isProfit ? "text-trade-buy" : "text-trade-sell"
				)}
			>
				{formatCompactCurrencyWithSign(data.pnl)}
			</p>
			<p className="text-tiny text-txt-300">
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
	const { formatCompactCurrencyWithSign } = useFormatting()

	const sortedData = useMemo(
		() =>
			data.toSorted(
				(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
			),
		[data]
	)

	const domainMax = useMemo(() => {
		const maxAbsPnl = Math.max(...data.map((d) => Math.abs(d.pnl)), 100)
		return Math.ceil(maxAbsPnl * 1.1)
	}, [data])

	const handleBarClick = useCallback(
		(entry: DailyPnL) => {
			if (onDayClick) {
				onDayClick(entry.date)
			}
		},
		[onDayClick]
	)

	if (data.length === 0) {
		return (
			<Panel padding="md">
				<h3 className="mb-s-300 text-small text-txt-100 sm:mb-m-400 sm:text-body font-semibold">
					{t("dailyPnL.title")}
				</h3>
				<div className="text-txt-300 h-chart-sm sm:h-empty-state-xl flex items-center justify-center">
					{t("noData")}
				</div>
			</Panel>
		)
	}

	return (
		<Panel padding="md">
			<h3 className="mb-s-300 text-small text-txt-100 sm:mb-m-400 sm:text-body font-semibold">
				{t("dailyPnL.title")}
			</h3>
			<ChartContainer
				id="chart-dashboard-daily-pnl"
				className="h-chart-sm sm:h-chart-md w-full"
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
							formatCompactCurrencyWithSign(value)
						}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 12 }}
						tickLine={false}
						axisLine={false}
						domain={[-domainMax, domainMax]}
						width={yAxisWidth}
					/>
					<ChartTooltip content={<CustomTooltip />} />
					<Bar
						dataKey="pnl"
						radius={[4, 4, 0, 0]}
						cursor={onDayClick ? "pointer" : "default"}
						// @see Recharts Bar onClick types `data` as `any`; narrow to DailyPnL
						onClick={(data) => handleBarClick(data as unknown as DailyPnL)}
					>
						{sortedData.map((entry) => (
							<Cell
								key={entry.date}
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
		</Panel>
	)
}
