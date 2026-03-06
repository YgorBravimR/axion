"use client"

import { useState, type ReactNode } from "react"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip as RechartsTooltip,
	Cell,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { Info } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCompactCurrency } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import type { PerformanceByGroup } from "@/types"

// Tooltip wrapper for column headers
const HeaderWithTooltip = ({
	label,
	tooltip,
}: {
	label: string
	tooltip: ReactNode
}) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<span className="gap-s-100 inline-flex cursor-help items-center">
				{label}
				<Info className="text-txt-400 h-3 w-3" />
			</span>
		</TooltipTrigger>
		<TooltipContent
			id="tooltip-variable-comparison-header"
			side="top"
			className="border-bg-300 bg-bg-100 text-acc-100 p-s-300 max-w-xs border shadow-lg"
		>
			{tooltip}
		</TooltipContent>
	</Tooltip>
)

interface VariableComparisonProps {
	data: PerformanceByGroup[]
	groupBy: "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"
	onGroupByChange: (
		groupBy: "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"
	) => void
}

type MetricType = "pnl" | "winRate" | "avgR" | "tradeCount" | "profitFactor"
type GroupByType = "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"

const formatProfitFactor = (value: number): string => {
	if (!Number.isFinite(value)) return "∞"
	if (value === 0) return "0.00"
	return value.toFixed(2)
}

const formatMetricValue = (value: number, metric: MetricType): string => {
	switch (metric) {
		case "pnl":
			return formatCompactCurrency(value)
		case "winRate":
			return `${value.toFixed(1)}%`
		case "avgR":
			return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`
		case "tradeCount":
			return value.toString()
		case "profitFactor":
			return formatProfitFactor(value)
		default:
			return value.toString()
	}
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		payload: PerformanceByGroup
	}>
	metric: MetricType
}

const CustomTooltip = ({ active, payload, metric }: CustomTooltipProps) => {
	const t = useTranslations("analytics.tableHeaders")
	if (active && payload && payload.length > 0) {
		const data = payload[0].payload
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border shadow-lg">
				<p className="text-small text-txt-100 font-semibold">{data.group}</p>
				<div className="mt-s-200 space-y-s-100 text-tiny">
					<p className={data.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"}>
						{t("pnl")}: {formatCompactCurrency(data.pnl)}
					</p>
					<p className="text-txt-200">
						{t("winRate")}: {data.winRate.toFixed(1)}%
					</p>
					<p className="text-txt-200">
						{t("avgR")}: {data.avgR >= 0 ? "+" : ""}
						{data.avgR.toFixed(2)}R
					</p>
					<p className="text-txt-200">
						{t("trades")}: {data.tradeCount}
					</p>
					<p className="text-txt-200">
						{t("pf")}: {formatProfitFactor(data.profitFactor)}
					</p>
				</div>
			</div>
		)
	}
	return null
}

export const VariableComparison = ({
	data,
	groupBy,
	onGroupByChange,
}: VariableComparisonProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("analytics.variableComparison")
	const tHeaders = useTranslations("analytics.tableHeaders")
	const tTooltips = useTranslations("analytics.tableTooltips")
	const [metric, setMetric] = useState<MetricType>("pnl")

	const groupOptions: { value: GroupByType; label: string }[] = [
		{ value: "asset", label: t("asset") },
		{ value: "timeframe", label: t("timeframe") },
		{ value: "hour", label: t("hour") },
		{ value: "dayOfWeek", label: t("dayOfWeek") },
		{ value: "strategy", label: t("strategy") },
	]

	const metricOptions: { value: MetricType; label: string }[] = [
		{ value: "pnl", label: t("metrics.pnl") },
		{ value: "winRate", label: t("metrics.winRate") },
		{ value: "avgR", label: t("metrics.avgR") },
		{ value: "tradeCount", label: t("metrics.tradeCount") },
		{ value: "profitFactor", label: t("metrics.profitFactor") },
	]

	const getBarColor = (value: number, metric: MetricType): string => {
		if (metric === "tradeCount") return "var(--color-acc-100)"
		if (metric === "profitFactor") {
			return value >= 1 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"
		}
		return value >= 0 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"
	}

	const chartData = data.map((item) => {
		let value = item[metric]
		// Cap Infinity profit factor at a visible value for chart display
		if (metric === "profitFactor" && !Number.isFinite(value)) {
			value = 10 // Cap at 10 for visualization
		}
		return {
			...item,
			value,
		}
	})

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			<div className="gap-m-400 flex flex-wrap items-center justify-between">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
				<div className="gap-s-300 flex flex-wrap">
					{/* Group By Selector */}
					<select
						value={groupBy}
						onChange={(e) => onGroupByChange(e.target.value as typeof groupBy)}
						className="border-bg-300 bg-bg-100 px-s-300 py-s-200 text-small text-txt-100 rounded-md border"
					>
						{groupOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>

					{/* Metric Selector */}
					<select
						value={metric}
						onChange={(e) => setMetric(e.target.value as MetricType)}
						className="border-bg-300 bg-bg-100 px-s-300 py-s-200 text-small text-txt-100 rounded-md border"
					>
						{metricOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>
			</div>

			{data.length === 0 ? (
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-64 items-center justify-center">
					{t("noData")}
				</div>
			) : (
				<ChartContainer
					id="chart-analytics-variable-comparison"
					className="mt-s-300 sm:mt-m-400 h-64 min-w-0 sm:h-80"
				>
					<BarChart
						data={chartData}
						margin={{ top: 10, right: 10, left: 10, bottom: 40 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="group"
							stroke="var(--color-txt-300)"
							tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
							tickLine={false}
							axisLine={false}
							angle={-45}
							textAnchor="end"
							height={60}
						/>
						<YAxis
							stroke="var(--color-txt-300)"
							tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
							tickLine={false}
							axisLine={false}
							tickFormatter={(value) => formatMetricValue(value, metric)}
							width={yAxisWidth}
						/>
						<RechartsTooltip content={<CustomTooltip metric={metric} />} />
						<Bar dataKey="value" radius={[4, 4, 0, 0]}>
							{chartData.map((entry, index) => (
								<Cell
									key={`cell-${index}`}
									fill={getBarColor(entry.value, metric)}
								/>
							))}
						</Bar>
					</BarChart>
				</ChartContainer>
			)}

			{/* Summary Table */}
			{data.length > 0 && (
				<div className="mt-m-400 sm:mt-m-500 overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-bg-300 border-b">
								<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-left font-medium">
									{groupOptions.find((o) => o.value === groupBy)?.label}
								</th>
								<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("trades")}
										tooltip={tTooltips("trades")}
									/>
								</th>
								<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("pnl")}
										tooltip={tTooltips("pnl")}
									/>
								</th>
								<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("winRate")}
										tooltip={tTooltips("winRate")}
									/>
								</th>
								<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("avgR")}
										tooltip={tTooltips("avgR")}
									/>
								</th>
								<th className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("pf")}
										tooltip={
											<div className="space-y-s-100 text-tiny">
												<p className="text-txt-100 font-medium">
													{tTooltips("pf")}
												</p>
												<ul className="text-txt-200 space-y-1">
													<li>
														<span className="text-trade-buy">
															{tHeaders("pf")} &gt; 1
														</span>{" "}
														= {tTooltips("pfProfitable")}
													</li>
													<li>
														<span className="text-txt-300">
															{tHeaders("pf")} = 1
														</span>{" "}
														= {tTooltips("pfBreakeven")}
													</li>
													<li>
														<span className="text-trade-sell">
															{tHeaders("pf")} &lt; 1
														</span>{" "}
														= {tTooltips("pfLosing")}
													</li>
													<li>
														<span className="text-trade-buy">
															{tHeaders("pf")} = ∞
														</span>{" "}
														= {tTooltips("pfNoLosses")}
													</li>
													<li>
														<span className="text-trade-sell">
															{tHeaders("pf")} = 0
														</span>{" "}
														= {tTooltips("pfNoWins")}
													</li>
												</ul>
											</div>
										}
									/>
								</th>
							</tr>
						</thead>
						<tbody>
							{data.map((row) => (
								<tr key={row.group} className="border-bg-300/50 border-b">
									<td className="px-s-300 py-s-200 text-small text-txt-100 font-medium">
										{row.group}
									</td>
									<td className="px-s-300 py-s-200 text-small text-txt-200 text-right">
										{row.tradeCount}
									</td>
									<td
										className={`px-s-300 py-s-200 text-small text-right font-medium ${
											row.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
										}`}
									>
										{formatCompactCurrency(row.pnl)}
									</td>
									<td className="px-s-300 py-s-200 text-small text-txt-200 text-right">
										{row.winRate.toFixed(1)}%
									</td>
									<td
										className={`px-s-300 py-s-200 text-small text-right ${
											row.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
										}`}
									>
										{row.avgR >= 0 ? "+" : ""}
										{row.avgR.toFixed(2)}R
									</td>
									<td
										className={`px-s-300 py-s-200 text-small text-right ${
											row.profitFactor >= 1
												? "text-trade-buy"
												: "text-trade-sell"
										}`}
									>
										{formatProfitFactor(row.profitFactor)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
