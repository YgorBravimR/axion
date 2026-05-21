"use client"

import { memo, useMemo } from "react"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Cell,
	ReferenceLine,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { BarChart3, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import type { RDistributionBucket } from "@/types"

const StatLabel = ({ label, tooltip }: { label: string; tooltip: string }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<p className="gap-s-100 text-tiny text-txt-300 inline-flex cursor-help items-center">
				{label}
				<Info className="h-3 w-3" aria-hidden="true" />
			</p>
		</TooltipTrigger>
		<TooltipContent
			id="tooltip-r-distribution-stat"
			side="top"
			className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
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

	const head = payload?.[0]
	if (active && head) {
		const data = head.payload
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border shadow-lg">
				<p className="text-small text-txt-100 font-semibold">{data.range}</p>
				<div className="mt-s-200 space-y-s-100 text-tiny">
					<p className="text-txt-200">
						{t("tooltipTrades")}: {data.count}
					</p>
					<p className={data.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"}>
						{t("tooltipPnl")}: {formatCompactCurrencyWithSign(data.pnl, "BRL")}
					</p>
				</div>
			</div>
		)
	}
	return null
}

const AXIS_TICK_10 = { fill: "var(--color-txt-300)", fontSize: 10 } as const
const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const

export const RDistribution = memo(({ data }: RDistributionProps) => {
	const t = useTranslations("analytics.rDistribution")

	const { totalTrades, positiveCount, negativeCount, mode } = useMemo(() => {
		if (data.length === 0) {
			return {
				totalTrades: 0,
				totalPnl: 0,
				positiveCount: 0,
				negativeCount: 0,
				mode: null as (typeof data)[0] | null,
			}
		}
		const trades = data.reduce((sum, b) => sum + b.count, 0)
		const pnl = data.reduce((sum, b) => sum + b.pnl, 0)
		const posBuckets = data.filter((b) => b.rangeMin >= 0)
		const negBuckets = data.filter((b) => b.rangeMax <= 0)
		const [seed, ...rest] = data
		const mode = seed
			? rest.reduce((max, b) => (b.count > max.count ? b : max), seed)
			: null
		return {
			totalTrades: trades,
			totalPnl: pnl,
			positiveCount: posBuckets.reduce((sum, b) => sum + b.count, 0),
			negativeCount: negBuckets.reduce((sum, b) => sum + b.count, 0),
			mode,
		}
	}, [data])

	if (data.length === 0) {
		return (
			<div
				id="analytics-r-distribution"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<div className="gap-s-200 flex items-center">
					<BarChart3 className="text-txt-300 h-5 w-5" aria-hidden="true" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
				</div>
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-48 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	return (
		<div
			id="analytics-r-distribution"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<div className="gap-s-200 flex items-center">
				<BarChart3 className="text-txt-300 h-5 w-5" aria-hidden="true" />
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
			</div>

			{/* Summary Stats */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 grid grid-cols-2 md:grid-cols-4 [&_p]:truncate [&>div]:min-w-0">
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("totalTrades")} tooltip={t("totalTradesDesc")} />
					<p className="mt-s-100 text-body text-txt-100 font-bold">
						{totalTrades}
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("positiveR")} tooltip={t("positiveRDesc")} />
					<p className="mt-s-100 text-body text-trade-buy font-bold">
						{positiveCount} ({((positiveCount / totalTrades) * 100).toFixed(0)}
						%)
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("negativeR")} tooltip={t("negativeRDesc")} />
					<p className="mt-s-100 text-body text-trade-sell font-bold">
						{negativeCount} ({((negativeCount / totalTrades) * 100).toFixed(0)}
						%)
					</p>
				</div>
				<div className="bg-bg-100 p-s-200 sm:p-s-300 rounded-lg text-center">
					<StatLabel label={t("mostCommon")} tooltip={t("mostCommonDesc")} />
					<p className="mt-s-100 text-body text-txt-100 font-bold">
						{mode?.range}
					</p>
				</div>
			</div>

			{/* Chart */}
			<ChartContainer
				id="chart-analytics-r-distribution"
				className="mt-m-400 sm:mt-m-500 h-48 min-w-0 sm:h-64"
			>
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
						tick={AXIS_TICK_10}
						tickLine={false}
						axisLine={false}
						angle={-45}
						textAnchor="end"
						height={50}
					/>
					<YAxis
						stroke="var(--color-txt-300)"
						tick={AXIS_TICK}
						tickLine={false}
						axisLine={false}
						allowDecimals={false}
					/>
					<ChartTooltip content={<CustomTooltip />} />
					<ReferenceLine
						x="0R to 0.5R"
						stroke="var(--color-txt-300)"
						strokeDasharray="3 3"
					/>
					<Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={80}>
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
			<div className="mt-s-300 sm:mt-m-400 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg">
				<p className="text-small text-txt-200">
					{positiveCount > negativeCount
						? t("achievedPositiveR", {
								percent: ((positiveCount / totalTrades) * 100).toFixed(0),
								range: mode?.range ?? "",
								count: mode?.count ?? 0,
							})
						: t("achievedNegativeR", {
								percent: ((negativeCount / totalTrades) * 100).toFixed(0),
							})}
				</p>
			</div>
		</div>
	)
})

RDistribution.displayName = "RDistribution"
