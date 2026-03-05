"use client"

import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip as RechartsTooltip,
	Cell,
	ReferenceLine,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { BarChart3, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import type { RDistributionBucket } from "@/types"

const StatLabel = ({
	label,
	tooltip,
}: {
	label: string
	tooltip: string
}) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<p className="inline-flex cursor-help items-center gap-s-100 text-tiny text-txt-300">
				{label}
				<Info className="h-3 w-3" />
			</p>
		</TooltipTrigger>
		<TooltipContent
			id="tooltip-r-distribution-stat"
			side="top"
			className="border-bg-300 bg-bg-100 text-txt-200 max-w-xs border p-s-300 shadow-lg"
		>
			{tooltip}
		</TooltipContent>
	</Tooltip>
)

interface RDistributionProps {
	data: RDistributionBucket[]
}


interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: RDistributionBucket
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("analytics.rDistribution")

	if (active && payload && payload.length > 0) {
		const data = payload[0].payload
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 shadow-lg">
				<p className="text-small font-semibold text-txt-100">{data.range}</p>
				<div className="mt-s-200 space-y-s-100 text-tiny">
					<p className="text-txt-200">{t("tooltipTrades")}: {data.count}</p>
					<p className={data.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"}>
						{t("tooltipPnl")}: {formatCompactCurrencyWithSign(data.pnl)}
					</p>
				</div>
			</div>
		)
	}
	return null
}

export const RDistribution = ({ data }: RDistributionProps) => {
	const t = useTranslations("analytics.rDistribution")

	if (data.length === 0) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<div className="flex items-center gap-s-200">
					<BarChart3 className="h-5 w-5 text-txt-300" />
					<h3 className="text-small sm:text-body font-semibold text-txt-100">
						{t("title")}
					</h3>
				</div>
				<div className="mt-s-300 sm:mt-m-400 flex h-48 items-center justify-center text-txt-300">
					{t("noData")}
				</div>
			</div>
		)
	}

	// Calculate stats
	const totalTrades = data.reduce((sum, b) => sum + b.count, 0)
	const totalPnl = data.reduce((sum, b) => sum + b.pnl, 0)
	const positiveBuckets = data.filter((b) => b.rangeMin >= 0)
	const negativeBuckets = data.filter((b) => b.rangeMax <= 0)
	const positiveCount = positiveBuckets.reduce((sum, b) => sum + b.count, 0)
	const negativeCount = negativeBuckets.reduce((sum, b) => sum + b.count, 0)

	// Find mode (most common R range)
	const mode = data.reduce((max, b) => (b.count > max.count ? b : max), data[0])

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			<div className="flex items-center gap-s-200">
				<BarChart3 className="h-5 w-5 text-txt-300" />
				<h3 className="text-small sm:text-body font-semibold text-txt-100">
					{t("title")}
				</h3>
			</div>

			{/* Summary Stats */}
			<div className="mt-s-300 sm:mt-m-400 grid grid-cols-2 gap-s-300 sm:gap-m-400 md:grid-cols-4">
				<div className="rounded-lg bg-bg-100 p-s-200 sm:p-s-300 text-center">
					<StatLabel
						label={t("totalTrades")}
						tooltip={t("totalTradesDesc")}
					/>
					<p className="mt-s-100 text-body font-bold text-txt-100">
						{totalTrades}
					</p>
				</div>
				<div className="rounded-lg bg-bg-100 p-s-200 sm:p-s-300 text-center">
					<StatLabel
						label={t("positiveR")}
						tooltip={t("positiveRDesc")}
					/>
					<p className="mt-s-100 text-body font-bold text-trade-buy">
						{positiveCount} ({((positiveCount / totalTrades) * 100).toFixed(0)}%)
					</p>
				</div>
				<div className="rounded-lg bg-bg-100 p-s-200 sm:p-s-300 text-center">
					<StatLabel
						label={t("negativeR")}
						tooltip={t("negativeRDesc")}
					/>
					<p className="mt-s-100 text-body font-bold text-trade-sell">
						{negativeCount} ({((negativeCount / totalTrades) * 100).toFixed(0)}%)
					</p>
				</div>
				<div className="rounded-lg bg-bg-100 p-s-200 sm:p-s-300 text-center">
					<StatLabel
						label={t("mostCommon")}
						tooltip={t("mostCommonDesc")}
					/>
					<p className="mt-s-100 text-body font-bold text-acc-100">
						{mode.range}
					</p>
				</div>
			</div>

			{/* Chart */}
			<ChartContainer id="chart-analytics-r-distribution" className="mt-m-400 sm:mt-m-500 h-48 sm:h-64 min-w-0">
					<BarChart
						data={data}
						margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="range"
							stroke="var(--color-txt-300)"
							tick={{ fill: "var(--color-txt-300)", fontSize: 10 }}
							tickLine={false}
							axisLine={false}
							angle={-45}
							textAnchor="end"
							height={50}
						/>
						<YAxis
							stroke="var(--color-txt-300)"
							tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
							tickLine={false}
							axisLine={false}
							allowDecimals={false}
						/>
						<RechartsTooltip content={<CustomTooltip />} />
						<ReferenceLine x="0R to 0.5R" stroke="var(--color-txt-300)" strokeDasharray="3 3" />
						<Bar dataKey="count" radius={[4, 4, 0, 0]}>
							{data.map((entry, index) => (
								<Cell
									key={`cell-${index}`}
									fill={
										entry.rangeMin >= 0
											? "var(--color-trade-buy)"
											: "var(--color-trade-sell)"
									}
									opacity={0.8}
								/>
							))}
						</Bar>
					</BarChart>
			</ChartContainer>

			{/* Insight */}
			<div className="mt-s-300 sm:mt-m-400 rounded-lg bg-bg-100 p-s-300 sm:p-m-400">
				<p className="text-small text-txt-200">
					{positiveCount > negativeCount ? (
						t("achievedPositiveR", {
							percent: ((positiveCount / totalTrades) * 100).toFixed(0),
							range: mode.range,
							count: mode.count,
						})
					) : (
						t("achievedNegativeR", {
							percent: ((negativeCount / totalTrades) * 100).toFixed(0),
						})
					)}
				</p>
			</div>
		</div>
	)
}
