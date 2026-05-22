"use client"

import { memo, useMemo } from "react"
import { PieChart, Pie, Cell } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import type { SimulationStatisticsV2 } from "@/types/monte-carlo"

interface ModeDistributionChartProps {
	statistics: SimulationStatisticsV2
}

interface DistributionSlice {
	name: string
	value: number
	color: string
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: DistributionSlice & { percent: number }
	}>
}

const CustomTooltip = memo(({ active, payload }: CustomTooltipProps) => {
	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">{data.name}</p>
			<p className="text-small text-txt-100 font-semibold">
				{data.value.toFixed(1)} days ({(data.percent * 100).toFixed(0)}%)
			</p>
		</div>
	)
})

const ModeDistributionChart = ({ statistics }: ModeDistributionChartProps) => {
	const t = useTranslations("monteCarlo.v2.charts")

	const data = useMemo<DistributionSlice[]>(() => {
		const slices: DistributionSlice[] = []

		if (statistics.avgDaysInLossRecovery > 0) {
			slices.push({
				name: t("lossRecovery"),
				value: statistics.avgDaysInLossRecovery,
				color: "var(--color-chart-1)",
			})
		}
		if (statistics.avgDaysInGainCompounding > 0) {
			slices.push({
				name: t("gainCompounding"),
				value: statistics.avgDaysInGainCompounding,
				color: "var(--color-chart-2)",
			})
		}
		if (statistics.avgDaysSkippedWeeklyLimit > 0) {
			slices.push({
				name: t("skipped") + " (Weekly)",
				value: statistics.avgDaysSkippedWeeklyLimit,
				color: "var(--color-chart-4)",
			})
		}
		if (statistics.avgDaysSkippedMonthlyLimit > 0) {
			slices.push({
				name: t("skipped") + " (Monthly)",
				value: statistics.avgDaysSkippedMonthlyLimit,
				color: "var(--color-chart-5)",
			})
		}

		return slices
	}, [statistics, t])

	const totalDays = useMemo(
		() => data.reduce((sum, d) => sum + d.value, 0),
		[data]
	)

	const tooltipContent = useMemo(() => <CustomTooltip />, [])

	return (
		<div className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border">
			<h3 className="mb-m-400 text-body text-txt-100 font-semibold">
				{t("modeDistribution")}
			</h3>

			<div className="gap-m-500 flex flex-col items-center sm:flex-row">
				<div className="p-s-200 mx-auto sm:p-0">
					<ChartContainer
						id="chart-monte-carlo-v2-mode-distribution"
						className="h-40 w-40 sm:h-52 sm:w-52"
					>
						<PieChart>
							<Pie
								data={data}
								dataKey="value"
								nameKey="name"
								cx="50%"
								cy="50%"
								innerRadius={35}
								outerRadius={70}
								paddingAngle={2}
							>
								{data.map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={entry.color}
										fillOpacity={0.75}
										stroke="var(--color-bg-200)"
										strokeWidth={2}
									/>
								))}
							</Pie>
							<ChartTooltip content={tooltipContent} />
						</PieChart>
					</ChartContainer>
				</div>

				{/* Legend */}
				<div className="space-y-s-300 flex-1">
					{data.map((slice) => (
						<div key={slice.name} className="flex items-center justify-between">
							<div className="gap-s-200 flex items-center">
								<div
									className="h-3 w-3 rounded-full"
									style={{ backgroundColor: slice.color, opacity: 0.75 }}
								/>
								<span className="text-tiny text-txt-300">{slice.name}</span>
							</div>
							<span className="text-tiny text-txt-100 font-medium">
								{slice.value.toFixed(1)}d (
								{totalDays > 0
									? ((slice.value / totalDays) * 100).toFixed(0)
									: 0}
								%)
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

export { ModeDistributionChart }
