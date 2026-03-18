"use client"

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
import { useTranslations, useLocale } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { useChartConfig } from "@/hooks/use-chart-config"
import { APP_TIMEZONE } from "@/lib/dates"
import type { AccountComparisonMetrics } from "@/types"
import { COMPARISON_COLORS } from "./comparison-colors"

interface ComparisonEquityChartProps {
	accounts: AccountComparisonMetrics[]
}

/** Merge all accounts' equity curves into a single array keyed by date */
const mergeEquityCurves = (
	accounts: AccountComparisonMetrics[]
): Record<string, unknown>[] => {
	const dateMap = new Map<string, Record<string, unknown>>()

	for (const account of accounts) {
		for (const point of account.equityCurve) {
			const existing = dateMap.get(point.date) ?? { date: point.date }
			existing[account.accountId] = point.equity
			dateMap.set(point.date, existing)
		}
	}

	return Array.from(dateMap.entries())
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([, data]) => data)
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
		name: string
		value: number
		color: string
	}>
	label?: string
	locale: string
	accountMap: Map<string, string>
}

const CustomTooltip = ({
	active,
	payload,
	label,
	locale,
	accountMap,
}: CustomTooltipProps) => {
	if (!active || !payload || payload.length === 0) return null

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 shadow-lg">
			<p className="text-tiny text-txt-300 mb-s-100">
				{formatDate(label || "", locale)}
			</p>
			{payload.map((entry) => {
				const sign = entry.value >= 0 ? "+" : ""
				return (
					<div
						key={entry.name}
						className="flex items-center gap-s-200 text-small"
					>
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="text-txt-300">
							{accountMap.get(entry.name) ?? entry.name}:
						</span>
						<span
							className={
								entry.value >= 0
									? "text-trade-buy font-semibold"
									: "text-trade-sell font-semibold"
							}
						>
							{sign}
							{formatCompactCurrency(entry.value, "R$")}
						</span>
					</div>
				)
			})}
		</div>
	)
}

const ComparisonEquityChart = ({
	accounts,
}: ComparisonEquityChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("accountComparison.chart")
	const locale = useLocale()

	const hasData = accounts.some((a) => a.equityCurve.length > 0)

	if (!hasData) {
		return (
			<div id="comparison-equity-chart" className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
				<div className="mt-s-300 sm:mt-m-400 text-txt-300 flex h-64 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	const mergedData = mergeEquityCurves(accounts)
	const accountMap = new Map(
		accounts.map((a) => [a.accountId, a.accountName])
	)

	// Compute Y axis domain from all equity values
	const allValues = accounts.flatMap((a) => a.equityCurve.map((p) => p.equity))
	const minVal = Math.min(0, ...allValues)
	const maxVal = Math.max(0, ...allValues)
	const padding = (maxVal - minVal) * 0.1 || 100

	return (
		<div id="comparison-equity-chart" className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
			<h3 className="text-small sm:text-body text-txt-100 font-semibold">
				{t("title")}
			</h3>
			<ChartContainer
				id="chart-comparison-equity"
				className="mt-s-300 sm:mt-m-400 h-48 min-w-0 sm:h-72"
			>
				<LineChart
					data={mergedData}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
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
						tickFormatter={(value: number) =>
							formatCompactCurrency(value, "R$")
						}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						domain={[minVal - padding, maxVal + padding]}
						width={yAxisWidth}
					/>
					<Tooltip
						content={
							<CustomTooltip locale={locale} accountMap={accountMap} />
						}
					/>
					<ReferenceLine
						y={0}
						stroke="var(--color-bg-300)"
						strokeWidth={2}
					/>
					{accounts.map((account, index) => (
						<Line
							key={account.accountId}
							type="monotone"
							dataKey={account.accountId}
							stroke={
								COMPARISON_COLORS[index % COMPARISON_COLORS.length]
							}
							strokeWidth={2}
							dot={false}
							connectNulls
							activeDot={{
								r: 4,
								stroke: "var(--color-bg-200)",
								strokeWidth: 2,
							}}
						/>
					))}
				</LineChart>
			</ChartContainer>
		</div>
	)
}

export { ComparisonEquityChart }
