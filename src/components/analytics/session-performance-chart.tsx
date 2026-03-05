"use client"

import { useTranslations } from "next-intl"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Cell,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { InsightCard, InsightCardPlaceholder } from "@/components/analytics/insight-card"
import type { SessionPerformance } from "@/types"
import type { ExpectancyMode } from "./expectancy-mode-toggle"

interface SessionPerformanceChartProps {
	data: SessionPerformance[]
	expectancyMode: ExpectancyMode
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: SessionPerformance
	}>
}

/** Map English session labels to translation keys */
const getSessionKey = (label: string): string => {
	const keyMap: Record<string, string> = {
		"Pre-Open": "preOpen",
		Morning: "morning",
		Afternoon: "afternoon",
		Close: "close",
	}
	return keyMap[label] || label.toLowerCase().replace("-", "")
}

/** Format decimal hour to HH:MM string */
const formatTime = (decimal: number): string => {
	const hours = Math.floor(decimal)
	const minutes = Math.round((decimal - hours) * 60)
	return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}

/**
 * Custom tooltip for the session performance bar chart.
 * Shows detailed metrics for the hovered session bar.
 */
const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const t = useTranslations("analytics")
	const tLabels = useTranslations("analytics.session.labels")

	if (!active || !payload || payload.length === 0) {
		return null
	}

	const data = payload[0].payload
	const isProfit = data.totalPnl >= 0
	const timeRange = `${formatTime(data.startHour)} - ${formatTime(data.endHour)}`
	const translatedLabel = tLabels(
		getSessionKey(data.sessionLabel) as
			| "preOpen"
			| "morning"
			| "afternoon"
			| "close"
	)

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 px-m-400 py-s-300 shadow-lg">
			<p className="text-small font-semibold text-txt-100">
				{translatedLabel}
			</p>
			<p className="text-caption text-txt-300">{timeRange}</p>
			<div className="mt-s-200 space-y-s-100">
				<p className="text-caption">
					<span className="text-txt-300">{t("session.pnl")}:</span>{" "}
					<span
						className={cn(
							"font-medium",
							isProfit ? "text-trade-buy" : "text-trade-sell"
						)}
					>
						{formatCompactCurrencyWithSign(data.totalPnl, "R$")}
					</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">{t("session.trades")}:</span>{" "}
					<span className="font-medium text-txt-100">
						{data.totalTrades}
					</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">{t("session.winRate")}:</span>{" "}
					<span
						className={cn(
							"font-medium",
							data.winRate >= 50
								? "text-trade-buy"
								: "text-trade-sell"
						)}
					>
						{data.winRate.toFixed(0)}%
					</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">{t("session.avgR")}:</span>{" "}
					<span
						className={cn(
							"font-medium",
							data.avgR >= 0
								? "text-trade-buy"
								: "text-trade-sell"
						)}
					>
						{data.avgR >= 0 ? "+" : ""}
						{data.avgR.toFixed(2)}R
					</span>
				</p>
				<p className="text-caption">
					<span className="text-txt-300">
						{t("session.profitFactor")}:
					</span>{" "}
					<span
						className={cn(
							"font-medium",
							data.profitFactor >= 1
								? "text-trade-buy"
								: "text-trade-sell"
						)}
					>
						{data.profitFactor.toFixed(2)}
					</span>
				</p>
			</div>
		</div>
	)
}

/**
 * Displays trading performance by market session as a bar chart
 * with session stat cards and actionable insights.
 *
 * @param data - Array of session performance data
 * @param expectancyMode - Whether to display R-multiples or $ P&L
 */
export const SessionPerformanceChart = ({
	data,
	expectancyMode,
}: SessionPerformanceChartProps) => {
	const t = useTranslations("analytics")
	const tLabels = useTranslations("analytics.session.labels")

	const isRMode = expectancyMode === "edge"
	const metricKey = isRMode ? "avgR" : "totalPnl"

	const translateSessionLabel = (label: string): string => {
		const key = getSessionKey(label) as
			| "preOpen"
			| "morning"
			| "afternoon"
			| "close"
		return tLabels(key)
	}

	const formatMetric = (value: number): string =>
		isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")

	// Filter out sessions with no trades
	const sessionsWithTrades = data.filter((s) => s.totalTrades > 0)

	// Calculate domain with padding
	const maxAbsMetric = Math.max(
		...data.map((d) => Math.abs(d[metricKey])),
		isRMode ? 0.5 : 100
	)
	const domainMax = isRMode
		? Math.ceil(maxAbsMetric * 1.2 * 100) / 100
		: Math.ceil(maxAbsMetric * 1.1)

	// Find best and worst sessions
	const sortedByMetric = sessionsWithTrades.toSorted(
		(a, b) => b[metricKey] - a[metricKey]
	)
	const bestSession = sortedByMetric[0]
	const worstSession = sortedByMetric[sortedByMetric.length - 1]

	// Totals
	const totalPnl = data.reduce((sum, s) => sum + s.totalPnl, 0)
	const totalTrades = data.reduce((sum, s) => sum + s.totalTrades, 0)

	// Weighted average R for header display
	const weightedAvgR = totalTrades > 0
		? data.reduce((sum, s) => sum + s.avgR * s.totalTrades, 0) / totalTrades
		: 0

	if (sessionsWithTrades.length === 0) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h3 className="text-small sm:text-body font-semibold text-txt-100">
					{t("session.title")}
				</h3>
				<div className="flex h-50 items-center justify-center text-txt-300">
					{t("noData")}
				</div>
			</div>
		)
	}

	const headerMetricValue = isRMode ? weightedAvgR : totalPnl

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-start justify-between">
				<div>
					<h3 className="text-small sm:text-body font-semibold text-txt-100">
						{t("session.title")}
					</h3>
					<p className="text-caption text-txt-300 mt-s-100">
						{t("session.description")}
					</p>
				</div>
				<div className="text-right">
					<p
						className={cn(
							"text-body font-semibold",
							headerMetricValue >= 0
								? "text-trade-buy"
								: "text-trade-sell"
						)}
					>
						{formatMetric(headerMetricValue)}
					</p>
					<p className="text-caption text-txt-300">
						{t("session.totalTrades", { count: totalTrades })}
					</p>
				</div>
			</div>

			{/* Bar Chart */}
			<ChartContainer id="chart-analytics-session-performance" className="h-48 sm:h-60 w-full min-w-0">
					<BarChart
						data={data}
						margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-bg-300)"
							vertical={false}
						/>
						<XAxis
							dataKey="sessionLabel"
							tickFormatter={translateSessionLabel}
							stroke="var(--color-txt-300)"
							tick={{
								fill: "var(--color-txt-300)",
								fontSize: 11,
							}}
							tickLine={false}
							axisLine={{ stroke: "var(--color-bg-300)" }}
						/>
						<YAxis
							tickFormatter={(value: number) =>
								isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")
							}
							stroke="var(--color-txt-300)"
							tick={{
								fill: "var(--color-txt-300)",
								fontSize: 11,
							}}
							tickLine={false}
							axisLine={false}
							domain={[-domainMax, domainMax]}
							width={65}
						/>
						<Tooltip
							content={<CustomTooltip />}
							cursor={{
								fill: "var(--color-bg-300)",
								opacity: 0.3,
							}}
						/>
						<Bar dataKey={metricKey} radius={[4, 4, 0, 0]}>
							{data.map((entry, index) => (
								<Cell
									key={`cell-${index}`}
									fill={
										entry[metricKey] >= 0
											? "var(--color-trade-buy)"
											: "var(--color-trade-sell)"
									}
									opacity={
										entry.totalTrades === 0 ? 0.3 : 1
									}
								/>
							))}
						</Bar>
					</BarChart>
			</ChartContainer>

			{/* Session Stats Cards */}
			<div className="mt-s-300 sm:mt-m-400 grid grid-cols-2 gap-s-200 sm:gap-s-300 sm:grid-cols-4">
				{data.map((session) => {
					const metricValue = session[metricKey]
					const isPositive = metricValue >= 0
					const hasTrades = session.totalTrades > 0
					return (
						<div
							key={session.session}
							className={cn(
								"rounded-lg border px-s-300 sm:px-m-400 py-s-200 sm:py-s-300",
								hasTrades
									? isPositive
										? "border-trade-buy/20 bg-trade-buy/5"
										: "border-trade-sell/20 bg-trade-sell/5"
									: "border-bg-300/50 bg-bg-300/20"
							)}
						>
							<p className="text-caption text-txt-300">
								{translateSessionLabel(session.sessionLabel)}
							</p>
							<p
								className={cn(
									"text-small font-semibold",
									hasTrades
										? isPositive
											? "text-trade-buy"
											: "text-trade-sell"
										: "text-txt-300"
								)}
							>
								{hasTrades
									? formatMetric(metricValue)
									: "—"}
							</p>
							{hasTrades && (
								<p className="text-caption text-txt-300 mt-s-100">
									{session.winRate.toFixed(0)}% WR ·{" "}
									{t("session.totalTrades", {
										count: session.totalTrades,
									})}
								</p>
							)}
						</div>
					)
				})}
			</div>

			{/* Actionable Insights */}
			{bestSession && worstSession && (() => {
				const isSameSession = bestSession === worstSession
				const showBestAsReal = !isSameSession || bestSession[metricKey] >= 0
				const showWorstAsReal = !isSameSession || worstSession[metricKey] < 0

				return (
					<div className="mt-s-300 sm:mt-m-400 grid grid-cols-1 gap-s-300 sm:grid-cols-2">
						{showBestAsReal ? (
							<InsightCard
								type="best"
								label={t("session.bestSession")}
								title={translateSessionLabel(bestSession.sessionLabel)}
								detail={`${bestSession.winRate.toFixed(0)}% WR · ${formatMetric(bestSession[metricKey])} · ${t("session.totalTrades", { count: bestSession.totalTrades })}`}
								action={t("session.bestSessionAction")}
							/>
						) : (
							<InsightCardPlaceholder
								type="best"
								label={t("session.bestSession")}
								placeholderText={t("session.bestSessionPlaceholder")}
							/>
						)}
						{showWorstAsReal ? (
							<InsightCard
								type="worst"
								label={t("session.worstSession")}
								title={translateSessionLabel(worstSession.sessionLabel)}
								detail={`${worstSession.winRate.toFixed(0)}% WR · ${formatMetric(worstSession[metricKey])} · ${t("session.totalTrades", { count: worstSession.totalTrades })}`}
								action={t("session.worstSessionAction")}
							/>
						) : (
							<InsightCardPlaceholder
								type="worst"
								label={t("session.worstSession")}
								placeholderText={t("session.worstSessionPlaceholder")}
							/>
						)}
					</div>
				)
			})()}
		</div>
	)
}
