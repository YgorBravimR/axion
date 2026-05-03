"use client"

import { useMemo, memo } from "react"
import { useTranslations } from "next-intl"
import {
	RadarChart,
	Radar,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,

} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useIsMobile } from "@/hooks/use-is-mobile"
import type { RadarChartData } from "@/types"

interface PerformanceRadarChartProps {
	data: RadarChartData[]
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: RadarChartData
	}>
}

// Static tick config — hoisted to avoid new object identity each render
const RADIUS_AXIS_TICK = false as const

const CustomTooltip = memo(({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("dashboard")

	if (!active || !payload || payload.length === 0) {
		return null
	}

	const data = payload[0].payload

	const formatValue = (key: string, value: number): string => {
		switch (key) {
			case "winRate":
			case "discipline":
			case "consistency":
				return `${value.toFixed(1)}%`
			case "avgR":
				return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`
			case "profitFactor":
				return value.toFixed(2)
			default:
				return value.toFixed(1)
		}
	}

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 px-s-300 py-s-200 shadow-lg">
			<p className="text-small font-medium text-txt-100">
				{t(`radar.${data.metricKey}`)}
			</p>
			<p className="text-body font-semibold text-acc-100">
				{formatValue(data.metricKey, data.value)}
			</p>
			<p className="text-tiny text-txt-300">
				{t("radar.normalized")}: {data.normalized.toFixed(0)}%
			</p>
		</div>
	)
})
CustomTooltip.displayName = "PerformanceRadarTooltip"

export const PerformanceRadarChart = ({ data }: PerformanceRadarChartProps) => {
	const t = useTranslations("dashboard")
	const tCharts = useTranslations("charts")
	const isMobile = useIsMobile()

	// Angle axis tick depends on isMobile — wrapped in useMemo
	const angleAxisTick = useMemo(
		() => ({ fill: "var(--color-txt-300)", fontSize: isMobile ? 9 : 11 }),
		[isMobile]
	)

	const chartData = useMemo(
		() =>
			data.map((item) => ({
				...item,
				metric: t(`radar.${item.metricKey}`),
			})),
		[data, t]
	)

	// Stable tooltip element — avoids new JSX element identity each render
	const tooltipContent = useMemo(() => <CustomTooltip />, [])

	if (data.length === 0) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400">
				<h3 className="mb-s-300 text-small font-semibold text-txt-100 sm:mb-m-400 sm:text-body">
					{t("radar.title")}
				</h3>
				<div className="flex h-[200px] sm:h-[250px] items-center justify-center text-txt-300">
					{t("noData")}
				</div>
			</div>
		)
	}

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400" role="region" aria-label={t("radar.title")}>
			<h3 className="mb-s-300 text-small font-semibold text-txt-100 sm:mb-m-400 sm:text-body">
				{t("radar.title")}
			</h3>
			<ChartContainer id="chart-dashboard-performance-radar" className="h-[180px] sm:h-[200px] w-full" suppressHydrationWarning>
					<RadarChart data={chartData} cx="50%" cy="50%" outerRadius={isMobile ? "55%" : "70%"}>
						<PolarGrid stroke="var(--color-bg-300)" />
						<PolarAngleAxis
							dataKey="metric"
							tick={angleAxisTick}
						/>
						<PolarRadiusAxis
							angle={90}
							domain={[0, 100]}
							tick={RADIUS_AXIS_TICK}
							axisLine={false}
						/>
						<ChartTooltip content={tooltipContent} />
						<Radar
							name={tCharts("performance")}
							dataKey="normalized"
							stroke="var(--color-acc-100)"
							fill="var(--color-acc-100)"
							fillOpacity={0.3}
							strokeWidth={2}
						/>
					</RadarChart>
			</ChartContainer>
		</div>
	)
}
