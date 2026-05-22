"use client"

import { useState, useMemo, useCallback, type ReactNode } from "react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
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
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

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
				<Info className="text-txt-300 h-3 w-3" aria-hidden="true" />
			</span>
		</TooltipTrigger>
		<TooltipContent
			id="tooltip-variable-comparison-header"
			side="top"
			className="border-bg-300 bg-bg-100 text-txt-100 p-s-300 max-w-xs border shadow-lg"
		>
			{tooltip}
		</TooltipContent>
	</Tooltip>
)

interface VariableComparisonProps {
	data: PerformanceByGroup[]
	groupBy: "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"
	onGroupByChange: (
		_groupBy: "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"
	) => void
}

type MetricType = "pnl" | "winRate" | "avgR" | "tradeCount" | "profitFactor"
type GroupByType = "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"

const formatProfitFactor = (value: number): string => {
	if (!Number.isFinite(value)) {
		return "∞"
	}
	if (value === 0) {
		return "0.00"
	}
	return value.toFixed(2)
}

const formatMetricValue = (value: number, metric: MetricType): string => {
	switch (metric) {
		case "pnl":
			return formatCompactCurrency(value, "BRL")
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

const CustomTooltip = ({
	active,
	payload,
	metric: _metric,
}: CustomTooltipProps) => {
	const t = useTranslations("analytics.tableHeaders")
	const tDays = useTranslations("days")
	const tCommon = useTranslations("common")

	const translateLabel = (group: string): string => {
		const dayKey = DAY_KEY_MAP[group]
		if (dayKey) {
			return tDays(dayKey as "sunday")
		}
		if (group === "No Strategy") {
			return tCommon("noStrategy")
		}
		if (group === "Unknown") {
			return tCommon("unknown")
		}
		return group
	}

	const head = payload?.[0]
	if (active && head) {
		const data = head.payload
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border shadow-lg">
				<p className="text-small text-txt-100 font-semibold">
					{translateLabel(data.group)}
				</p>
				<div className="mt-s-200 space-y-s-100 text-tiny">
					<p className={data.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"}>
						{t("pnl")}: {formatCompactCurrency(data.pnl, "BRL")}
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

const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const

/** Map day name keys from analytics-helpers to translation keys */
const DAY_KEY_MAP: Record<string, string> = {
	Sunday: "sunday",
	Monday: "monday",
	Tuesday: "tuesday",
	Wednesday: "wednesday",
	Thursday: "thursday",
	Friday: "friday",
	Saturday: "saturday",
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
	const tDays = useTranslations("days")
	const tCommon = useTranslations("common")

	/** Translate group labels that come as English keys from pure computation functions */
	const translateGroup = useCallback(
		(group: string): string => {
			if (groupBy === "dayOfWeek" && DAY_KEY_MAP[group]) {
				return tDays(
					DAY_KEY_MAP[group] as
						| "sunday"
						| "monday"
						| "tuesday"
						| "wednesday"
						| "thursday"
						| "friday"
						| "saturday"
				)
			}
			if (group === "No Strategy") {
				return tCommon("noStrategy")
			}
			if (group === "Unknown") {
				return tCommon("unknown")
			}
			return group
		},
		[groupBy, tDays, tCommon]
	)

	const [metric, setMetric] = useState<MetricType>("pnl")

	const groupOptions = useMemo<{ value: GroupByType; label: string }[]>(
		() => [
			{ value: "asset", label: t("asset") },
			{ value: "timeframe", label: t("timeframe") },
			{ value: "hour", label: t("hour") },
			{ value: "dayOfWeek", label: t("dayOfWeek") },
			{ value: "strategy", label: t("strategy") },
		],
		[t]
	)

	const metricOptions = useMemo<{ value: MetricType; label: string }[]>(
		() => [
			{ value: "pnl", label: t("metrics.pnl") },
			{ value: "winRate", label: t("metrics.winRate") },
			{ value: "avgR", label: t("metrics.avgR") },
			{ value: "tradeCount", label: t("metrics.tradeCount") },
			{ value: "profitFactor", label: t("metrics.profitFactor") },
		],
		[t]
	)

	const getBarColor = useCallback(
		(value: number, metricArg: MetricType): string => {
			if (metricArg === "tradeCount") {
				return "var(--color-txt-200)"
			}
			if (metricArg === "profitFactor") {
				return value >= 1 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"
			}
			return value >= 0 ? "var(--color-trade-buy)" : "var(--color-trade-sell)"
		},
		[]
	)

	const chartData = useMemo(
		() =>
			data.map((item) => {
				let value = item[metric]
				// Cap Infinity profit factor at a visible value for chart display
				if (metric === "profitFactor" && !Number.isFinite(value)) {
					value = 10 // Cap at 10 for visualization
				}
				return {
					...item,
					value,
				}
			}),
		[data, metric]
	)

	return (
		<div
			id="analytics-variable-comparison"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			<div className="gap-m-400 flex flex-wrap items-center justify-between">
				<h3 className="text-body sm:text-h3 text-txt-100 font-semibold">
					{t("title")}
				</h3>
				<div className="gap-s-300 flex flex-wrap">
					{/* Group By Selector */}
					<Select
						value={groupBy}
						onValueChange={(value) => onGroupByChange(value as typeof groupBy)}
					>
						<SelectTrigger
							id="variable-comparison-group-by"
							className="border-bg-300 bg-bg-100 px-s-300 py-s-200 text-small text-txt-100 w-full sm:w-auto"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{groupOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{/* Metric Selector */}
					<Select
						value={metric}
						onValueChange={(value) => setMetric(value as MetricType)}
					>
						<SelectTrigger
							id="variable-comparison-metric"
							className="border-bg-300 bg-bg-100 px-s-300 py-s-200 text-small text-txt-100 w-full sm:w-auto"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{metricOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{data.length === 0 ? (
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-64 items-center justify-center">
					{t("noData")}
				</div>
			) : (
				<ChartContainer
					id="chart-analytics-variable-comparison"
					className="mt-s-300 sm:mt-m-400 pb-s-200 h-64 min-w-0 overflow-hidden sm:h-80"
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
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={false}
							angle={-45}
							textAnchor="end"
							height={60}
							tickFormatter={translateGroup}
						/>
						<YAxis
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={false}
							tickFormatter={(value) => formatMetricValue(value, metric)}
							width={yAxisWidth}
						/>
						<ChartTooltip content={<CustomTooltip metric={metric} />} />
						<Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
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
				<div className="mt-m-400 sm:mt-m-500">
					<Table className="w-full">
						<TableHeader>
							<TableRow className="border-bg-300 border-b">
								<TableHead className="px-s-300 py-s-200 text-tiny text-txt-300 text-left font-medium">
									{groupOptions.find((o) => o.value === groupBy)?.label}
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("trades")}
										tooltip={tTooltips("trades")}
									/>
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("pnl")}
										tooltip={tTooltips("pnl")}
									/>
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("winRate")}
										tooltip={tTooltips("winRate")}
									/>
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
									<HeaderWithTooltip
										label={tHeaders("avgR")}
										tooltip={tTooltips("avgR")}
									/>
								</TableHead>
								<TableHead className="px-s-300 py-s-200 text-tiny text-txt-300 text-right font-medium">
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
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((row) => (
								<TableRow key={row.group} className="border-bg-300/50 border-b">
									<TableCell className="px-s-300 py-s-200 text-small text-txt-100 font-medium">
										{translateGroup(row.group)}
									</TableCell>
									<TableCell className="px-s-300 py-s-200 text-small text-txt-200 text-right">
										{row.tradeCount}
									</TableCell>
									<TableCell
										className={`px-s-300 py-s-200 text-small text-right font-medium ${
											row.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
										}`}
									>
										{formatCompactCurrency(row.pnl, "BRL")}
									</TableCell>
									<TableCell className="px-s-300 py-s-200 text-small text-txt-200 text-right">
										{row.winRate.toFixed(1)}%
									</TableCell>
									<TableCell
										className={`px-s-300 py-s-200 text-small text-right ${
											row.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
										}`}
									>
										{row.avgR >= 0 ? "+" : ""}
										{row.avgR.toFixed(2)}R
									</TableCell>
									<TableCell
										className={`px-s-300 py-s-200 text-small text-right ${
											row.profitFactor >= 1
												? "text-trade-buy"
												: "text-trade-sell"
										}`}
									>
										{formatProfitFactor(row.profitFactor)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}
