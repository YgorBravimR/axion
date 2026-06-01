"use client"

import { useMemo, useCallback, memo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useChartConfig } from "@/hooks/use-chart-config"
import { useFormatting } from "@/hooks/use-formatting"
import type { DayEquityPoint } from "@/types"

// Static Recharts config objects — hoisted to avoid new object identity each render
const CHART_MARGIN = { top: 5, right: 5, left: 0, bottom: 5 }
const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 10 }

interface DayEquityCurveProps {
	data: DayEquityPoint[]
	onPointClick?: (_tradeId: string) => void
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: DayEquityPoint
	}>
}

const CustomTooltip = memo(({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("dashboard")
	const { formatCompactCurrencyWithSign } = useFormatting()

	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload
	const isProfit = data.cumulativePnl >= 0

	return (
		<div className="border-bg-300 bg-bg-200 px-s-300 py-s-200 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-medium">{data.time}</p>
			<p
				className={cn(
					"text-body font-semibold",
					isProfit ? "text-trade-buy" : "text-trade-sell"
				)}
			>
				{formatCompactCurrencyWithSign(data.cumulativePnl)}
			</p>
			{data.tradeId && (
				<p className="mt-s-100 text-tiny text-txt-300">
					{t("dayDetail.clickToView")}
				</p>
			)}
		</div>
	)
})
CustomTooltip.displayName = "DayEquityCurveTooltip"

export const DayEquityCurve = ({ data, onPointClick }: DayEquityCurveProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("dashboard")
	const { formatCompactCurrencyWithSign } = useFormatting()

	const tickFormatter = (value: number) => formatCompactCurrencyWithSign(value)

	// Derived chart values — recomputed only when data changes (must be before early return)
	const { minPnl, maxPnl, padding, finalPnl, lineColor } = useMemo(() => {
		if (data.length === 0) {
			return {
				minPnl: 0,
				maxPnl: 0,
				padding: 50,
				finalPnl: 0,
				lineColor: "var(--color-trade-buy)",
			}
		}

		const pnlValues = data.map((d) => d.cumulativePnl)
		const min = Math.min(...pnlValues, 0)
		const max = Math.max(...pnlValues, 0)
		const pad = Math.max(Math.abs(max - min) * 0.15, 50)
		const last = data[data.length - 1]?.cumulativePnl ?? 0
		return {
			minPnl: min,
			maxPnl: max,
			padding: pad,
			finalPnl: last,
			lineColor:
				last >= 0 ? "var(--color-trade-buy)" : "var(--color-trade-sell)",
		}
	}, [data])

	// dot/activeDot depend on lineColor
	const { dot, activeDot } = useMemo(
		() => ({
			dot: {
				r: 4,
				fill: lineColor,
				stroke: "var(--color-bg-100)",
				strokeWidth: 2,
				cursor: onPointClick ? "pointer" : "default",
			},
			activeDot: {
				r: 6,
				fill: lineColor,
				stroke: "var(--color-bg-100)",
				strokeWidth: 2,
				cursor: onPointClick ? "pointer" : "default",
			},
		}),
		[lineColor, onPointClick]
	)

	const handleClick = useCallback(
		(e: unknown) => {
			const payload = (
				e as { activePayload?: Array<{ payload: DayEquityPoint }> }
			)?.activePayload?.[0]?.payload
			if (payload && onPointClick && payload.tradeId) {
				onPointClick(payload.tradeId)
			}
		},
		[onPointClick]
	)

	if (data.length === 0) {
		return (
			<div className="text-txt-300 flex h-[120px] items-center justify-center sm:h-[150px]">
				{t("noData")}
			</div>
		)
	}

	// Silence unused-variable warning — finalPnl is consumed inside useMemo above
	void finalPnl

	return (
		<ChartContainer
			id="chart-dashboard-day-equity-curve"
			className="h-chart-xs sm:h-chart-xs w-full"
		>
			<LineChart
				data={data}
				margin={CHART_MARGIN}
				// @see Recharts lacks typed onClick payloads — cast is required
				onClick={handleClick}
			>
				<CartesianGrid
					strokeDasharray="3 3"
					stroke="var(--color-bg-300)"
					vertical={false}
				/>
				<XAxis
					dataKey="time"
					stroke="var(--color-txt-300)"
					tick={AXIS_TICK}
					tickLine={false}
					axisLine={{ stroke: "var(--color-bg-300)" }}
				/>
				<YAxis
					tickFormatter={tickFormatter}
					stroke="var(--color-txt-300)"
					tick={AXIS_TICK}
					tickLine={false}
					axisLine={false}
					domain={[minPnl - padding, maxPnl + padding]}
					width={yAxisWidth}
				/>
				<ReferenceLine
					y={0}
					stroke="var(--color-bg-300)"
					strokeDasharray="3 3"
				/>
				<ChartTooltip variant="line" content={<CustomTooltip />} />
				<Line
					type="stepAfter"
					dataKey="cumulativePnl"
					stroke={lineColor}
					strokeWidth={2}
					dot={dot}
					activeDot={activeDot}
				/>
			</LineChart>
		</ChartContainer>
	)
}
