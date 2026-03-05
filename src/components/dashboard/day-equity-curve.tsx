"use client"

import { useTranslations } from "next-intl"
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ReferenceLine,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import type { DayEquityPoint } from "@/types"

interface DayEquityCurveProps {
	data: DayEquityPoint[]
	onPointClick?: (tradeId: string) => void
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: DayEquityPoint
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("dashboard")

	if (!active || !payload || payload.length === 0) {
		return null
	}

	const data = payload[0].payload
	const isProfit = data.cumulativePnl >= 0

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 px-s-300 py-s-200 shadow-lg">
			<p className="text-small font-medium text-txt-100">{data.time}</p>
			<p className={`text-body font-semibold ${isProfit ? "text-trade-buy" : "text-trade-sell"}`}>
				{formatCompactCurrencyWithSign(data.cumulativePnl, "R$")}
			</p>
			{data.tradeId && (
				<p className="mt-s-100 text-caption text-acc-100">
					{t("dayDetail.clickToView")}
				</p>
			)}
		</div>
	)
}

export const DayEquityCurve = ({ data, onPointClick }: DayEquityCurveProps) => {
	const t = useTranslations("dashboard")

	if (data.length === 0) {
		return (
			<div className="flex h-[120px] sm:h-[150px] items-center justify-center text-txt-300">
				{t("noData")}
			</div>
		)
	}

	// Calculate domain with padding
	const pnlValues = data.map((d) => d.cumulativePnl)
	const minPnl = Math.min(...pnlValues, 0)
	const maxPnl = Math.max(...pnlValues, 0)
	const padding = Math.max(Math.abs(maxPnl - minPnl) * 0.15, 50)

	// Determine line color based on final P&L
	const finalPnl = data[data.length - 1]?.cumulativePnl ?? 0
	const lineColor = finalPnl >= 0 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"

	const handleClick = (point: DayEquityPoint) => {
		if (onPointClick && point.tradeId) {
			onPointClick(point.tradeId)
		}
	}

	return (
		<ChartContainer id="chart-dashboard-day-equity-curve" className="h-[120px] sm:h-[150px] w-full">
				<LineChart
					data={data}
					margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
					onClick={(e) => {
						const payload = (e as unknown as { activePayload?: Array<{ payload: DayEquityPoint }> })?.activePayload?.[0]?.payload
						if (payload) {
							handleClick(payload)
						}
					}}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>
					<XAxis
						dataKey="time"
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 10 }}
						tickLine={false}
						axisLine={{ stroke: "var(--color-bg-300)" }}
					/>
					<YAxis
						tickFormatter={(value: number) => formatCompactCurrencyWithSign(value, "R$")}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 10 }}
						tickLine={false}
						axisLine={false}
						domain={[minPnl - padding, maxPnl + padding]}
						width={60}
					/>
					<ReferenceLine y={0} stroke="var(--color-bg-300)" strokeDasharray="3 3" />
					<Tooltip content={<CustomTooltip />} />
					<Line
						type="stepAfter"
						dataKey="cumulativePnl"
						stroke={lineColor}
						strokeWidth={2}
						dot={{
							r: 4,
							fill: lineColor,
							stroke: "var(--color-bg-100)",
							strokeWidth: 2,
							cursor: onPointClick ? "pointer" : "default",
						}}
						activeDot={{
							r: 6,
							fill: lineColor,
							stroke: "var(--color-bg-100)",
							strokeWidth: 2,
							cursor: onPointClick ? "pointer" : "default",
						}}
					/>
				</LineChart>
		</ChartContainer>
	)
}
