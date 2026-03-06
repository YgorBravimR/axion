"use client"

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
import { useTranslations, useLocale } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import { APP_TIMEZONE } from "@/lib/dates"
import type { EquityPoint } from "@/types"

interface CumulativePnlChartProps {
	data: EquityPoint[]
}

const formatDate = (dateStr: string, locale: string): string => {
	const date = new Date(dateStr)
	return date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
		month: "short",
		day: "numeric",
		timeZone: APP_TIMEZONE,
	})
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: EquityPoint
	}>
	label?: string
	locale: string
}

const CustomTooltip = ({
	active,
	payload,
	label,
	locale,
}: CustomTooltipProps) => {
	if (active && payload && payload.length > 0) {
		const data = payload[0].payload
		const sign = data.equity >= 0 ? "+" : ""
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border shadow-lg">
				<p className="text-tiny text-txt-300">
					{formatDate(label || "", locale)}
				</p>
				<p
					className={`text-small font-semibold ${data.equity >= 0 ? "text-trade-buy" : "text-trade-sell"}`}
				>
					{sign}
					{formatCompactCurrency(data.equity)}
				</p>
			</div>
		)
	}
	return null
}

export const CumulativePnlChart = ({ data }: CumulativePnlChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("dashboard.equity")
	const locale = useLocale()

	if (data.length === 0) {
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("cumulative")}
				</h2>
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-64 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	const minEquity = Math.min(...data.map((d) => d.equity))
	const maxEquity = Math.max(...data.map((d) => d.equity))
	const padding = (maxEquity - minEquity) * 0.1 || 100

	const lastEquity = data[data.length - 1]?.equity ?? 0
	const isPositive = lastEquity >= 0
	const strokeColor = isPositive
		? "var(--color-trade-buy)"
		: "var(--color-trade-sell)"
	const gradientColor = isPositive ? "0, 255, 150" : "128, 128, 255"

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<h2 className="text-small sm:text-body text-txt-100 font-semibold">
				{t("cumulative")}
			</h2>
			<ChartContainer
				id="chart-analytics-cumulative-pnl"
				className="mt-s-300 sm:mt-m-400 h-48 min-w-0 sm:h-64"
			>
				<AreaChart
					data={data}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<defs>
						<linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="5%"
								stopColor={`rgb(${gradientColor})`}
								stopOpacity={0.3}
							/>
							<stop
								offset="95%"
								stopColor={`rgb(${gradientColor})`}
								stopOpacity={0}
							/>
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>
					<XAxis
						dataKey="date"
						tickFormatter={(dateStr) => formatDate(dateStr, locale)}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tickFormatter={(value: number) => formatCompactCurrency(value)}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						domain={[minEquity - padding, maxEquity + padding]}
						width={yAxisWidth}
					/>
					<Tooltip content={<CustomTooltip locale={locale} />} />
					<ReferenceLine y={0} stroke="var(--color-bg-300)" strokeWidth={2} />
					<Area
						type="monotone"
						dataKey="equity"
						stroke={strokeColor}
						strokeWidth={2}
						fill="url(#pnlGradient)"
						dot={false}
						activeDot={{
							r: 4,
							fill: strokeColor,
							stroke: "var(--color-bg-200)",
							strokeWidth: 2,
						}}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	)
}
