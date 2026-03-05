"use client"

import { useMemo } from "react"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ReferenceLine,
	Cell,
	Rectangle,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { formatR } from "@/lib/formatting"
import type { DistributionBucket } from "@/types/monte-carlo"

interface DistributionHistogramProps {
	buckets: DistributionBucket[]
	medianFinalR: number
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: DistributionBucket & { midPoint: number; percentileZone: string }
	}>
}

interface PercentileBoundaries {
	p5: number
	p15: number
	p40: number
	p60: number
	p85: number
	p95: number
	min: number
	max: number
}

type PercentileZone = "outer" | "middle" | "center" | "core"

const calculatePercentileBoundaries = (
	buckets: Array<{ midPoint: number; count: number }>
): PercentileBoundaries => {
	if (buckets.length === 0) {
		return { p5: 0, p15: 0, p40: 0, p60: 0, p85: 0, p95: 0, min: 0, max: 0 }
	}

	const totalCount = buckets.reduce((sum, b) => sum + b.count, 0)
	let cumulative = 0

	const sortedBuckets = buckets.toSorted((a, b) => a.midPoint - b.midPoint)
	const min = sortedBuckets[0].midPoint
	const max = sortedBuckets[sortedBuckets.length - 1].midPoint

	let p5 = min
	let p15 = min
	let p40 = min
	let p60 = max
	let p85 = max
	let p95 = max

	for (const bucket of sortedBuckets) {
		const prevCumulative = cumulative
		cumulative += bucket.count
		const prevPct = (prevCumulative / totalCount) * 100
		const currentPct = (cumulative / totalCount) * 100

		if (prevPct < 5 && currentPct >= 5) {
			p5 = bucket.midPoint
		}
		if (prevPct < 15 && currentPct >= 15) {
			p15 = bucket.midPoint
		}
		if (prevPct < 40 && currentPct >= 40) {
			p40 = bucket.midPoint
		}
		if (prevPct < 60 && currentPct >= 60) {
			p60 = bucket.midPoint
		}
		if (prevPct < 85 && currentPct >= 85) {
			p85 = bucket.midPoint
		}
		if (prevPct < 95 && currentPct >= 95) {
			p95 = bucket.midPoint
		}
	}

	return { p5, p15, p40, p60, p85, p95, min, max }
}

const getPercentileZone = (
	midPoint: number,
	boundaries: PercentileBoundaries
): PercentileZone => {
	if (midPoint < boundaries.p5 || midPoint > boundaries.p95) {
		return "outer"
	}
	if (midPoint < boundaries.p15 || midPoint > boundaries.p85) {
		return "middle"
	}
	if (midPoint < boundaries.p40 || midPoint > boundaries.p60) {
		return "center"
	}
	return "core"
}

const ZONE_COLORS: Record<PercentileZone, string> = {
	core: "rgba(255, 50, 0, 0.2)",
	center: "rgba(255, 153, 0, 0.2)",
	middle: "rgba(255, 238, 0, 0.2)",
	outer: "transparent",
}

interface CustomBarBackgroundProps {
	x?: number
	y?: number
	width?: number
	height?: number
	payload?: { percentileZone: PercentileZone }
}

const CustomBarBackground = (props: CustomBarBackgroundProps) => {
	const { x, y, width, height, payload } = props
	if (
		x === undefined ||
		y === undefined ||
		width === undefined ||
		height === undefined
	) {
		return null
	}

	const zone = payload?.percentileZone ?? "outer"
	const fill = ZONE_COLORS[zone]

	if (fill === "transparent") return null

	return (
		<Rectangle
			x={x}
			y={0}
			width={width}
			height={y + height}
			fill={fill}
			radius={0}
		/>
	)
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	if (!active || !payload || payload.length === 0) return null

	const data = payload[0].payload
	const isProfit = data.midPoint >= 0

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">
				{formatR(data.rangeStart)} – {formatR(data.rangeEnd)}
			</p>
			<p
				className={`text-small font-semibold ${isProfit ? "text-trade-buy" : "text-trade-sell"}`}
			>
				{data.count} simulations ({data.percentage.toFixed(1)}%)
			</p>
		</div>
	)
}

export const DistributionHistogram = ({
	buckets,
	medianFinalR,
}: DistributionHistogramProps) => {
	const t = useTranslations("monteCarlo.results")

	const chartData = useMemo(() => {
		const data = buckets.map((bucket) => ({
			...bucket,
			label: formatR((bucket.rangeStart + bucket.rangeEnd) / 2),
			midPoint: (bucket.rangeStart + bucket.rangeEnd) / 2,
		}))

		const boundaries = calculatePercentileBoundaries(data)

		return data.map((item) => ({
			...item,
			percentileZone: getPercentileZone(item.midPoint, boundaries),
		}))
	}, [buckets])

	const maxCount = useMemo(
		() => Math.max(...chartData.map((d) => d.count)),
		[chartData]
	)

	const profitableCount = useMemo(
		() =>
			chartData
				.filter((d) => d.midPoint >= 0)
				.reduce((sum, d) => sum + d.count, 0),
		[chartData]
	)

	const totalCount = useMemo(
		() => chartData.reduce((sum, d) => sum + d.count, 0),
		[chartData]
	)

	const profitablePct = ((profitableCount / totalCount) * 100).toFixed(0)

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<div className="mb-m-400 flex items-center justify-between">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("distribution")}
				</h3>
				<div className="gap-m-400 flex items-center">
					<span className="text-tiny text-txt-300">
						{t("median")}:{" "}
						<span className="text-txt-100 font-medium">
							{formatR(medianFinalR)}
						</span>
					</span>
					<span className="text-tiny text-txt-300">
						{t("profitable")}:{" "}
						<span className="text-trade-buy font-medium">{profitablePct}%</span>
					</span>
				</div>
			</div>

			<ChartContainer
				id="chart-monte-carlo-distribution-histogram"
				className="h-56 sm:h-64 lg:h-72"
			>
				<BarChart
					data={chartData}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						strokeOpacity={0.5}
						vertical={false}
					/>
					<XAxis
						dataKey="midPoint"
						stroke="var(--color-txt-300)"
						fontSize={10}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value) => formatR(value)}
						interval="preserveStartEnd"
					/>
					<YAxis
						stroke="var(--color-txt-300)"
						fontSize={11}
						tickLine={false}
						axisLine={false}
						domain={[0, maxCount * 1.1]}
						width={40}
					/>
					<Tooltip content={<CustomTooltip />} />
					<ReferenceLine
						x={0}
						stroke="var(--color-acc-100)"
						strokeDasharray="4 4"
						strokeWidth={1.5}
						label={{
							value: "0R",
							position: "top",
							fill: "var(--color-acc-100)",
							fontSize: 10,
							fontWeight: 500,
						}}
					/>
					<Bar
						dataKey="count"
						radius={[3, 3, 0, 0]}
						background={<CustomBarBackground />}
					>
						{chartData.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={
									entry.midPoint >= 0
										? "var(--color-trade-buy)"
										: "var(--color-trade-sell)"
								}
								fillOpacity={0.75}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>

			<p className="mt-s-300 text-tiny text-txt-300 text-center">
				{t("finalCumulativeR")}
			</p>

			{/* Percentile Zone Legend */}
			<div className="mt-m-400 pt-s-300 border-bg-300 border-t">
				<div className="gap-m-400 flex flex-wrap items-center justify-center">
					<div className="gap-s-200 flex items-center">
						<div
							className="h-3 w-6 rounded-sm"
							style={{ backgroundColor: ZONE_COLORS.core }}
						/>
						<span className="text-tiny text-txt-300">{t("legendCore")}</span>
					</div>
					<div className="gap-s-200 flex items-center">
						<div
							className="h-3 w-6 rounded-sm"
							style={{ backgroundColor: ZONE_COLORS.center }}
						/>
						<span className="text-tiny text-txt-300">{t("legendCenter")}</span>
					</div>
					<div className="gap-s-200 flex items-center">
						<div
							className="h-3 w-6 rounded-sm"
							style={{ backgroundColor: ZONE_COLORS.middle }}
						/>
						<span className="text-tiny text-txt-300">{t("legendMiddle")}</span>
					</div>
					<div className="gap-s-200 flex items-center">
						<div className="border-bg-300 h-3 w-6 rounded-sm border bg-transparent" />
						<span className="text-tiny text-txt-300">{t("legendOuter")}</span>
					</div>
				</div>
			</div>
		</div>
	)
}
