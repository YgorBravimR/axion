"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,

	Cell,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { formatCompactCurrencyWithSign, formatR } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"
import { useChartConfig } from "@/hooks/use-chart-config"
import { useIsMobile } from "@/hooks/use-is-mobile"
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

/** Abbreviated session labels are now loaded from i18n (analytics.session.abbreviatedLabels) */

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
	const translatedLabel = tLabels(data.session)

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 px-m-400 py-s-300 shadow-lg">
			<p className="text-small font-semibold text-txt-100">
				{translatedLabel}
			</p>
			<p className="text-tiny text-txt-300">{timeRange}</p>
			<div className="mt-s-200 space-y-s-100">
				<p className="text-tiny">
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
				<p className="text-tiny">
					<span className="text-txt-300">{t("session.trades")}:</span>{" "}
					<span className="font-medium text-txt-100">
						{data.totalTrades}
					</span>
				</p>
				<p className="text-tiny">
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
				<p className="text-tiny">
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
				<p className="text-tiny">
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
const AXIS_TICK_SESSION_MOBILE = { fill: "var(--color-txt-300)", fontSize: 10 } as const
const AXIS_TICK = { fill: "var(--color-txt-300)", fontSize: 11 } as const

export const SessionPerformanceChart = memo(({
	data,
	expectancyMode,
}: SessionPerformanceChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const isMobile = useIsMobile()
	const t = useTranslations("analytics")
	const tCommon = useTranslations("common")
	const tLabels = useTranslations("analytics.session.labels")
	const tAbbr = useTranslations("analytics.session.abbreviatedLabels")

	const isRMode = expectancyMode === "edge"
	const metricKey = isRMode ? "avgR" : "totalPnl"

	const formatSessionTickLabel = (sessionKey: string): string =>
		isMobile
			? tAbbr(sessionKey)
			: tLabels(sessionKey)

	const formatMetric = (value: number): string =>
		isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")

	const { sessionsWithTrades, domainMax, bestSession, worstSession, totalPnl, totalTrades, weightedAvgR } = useMemo(() => {
		const withTrades = data.filter((s) => s.totalTrades > 0)
		const maxAbs = Math.max(
			...data.map((d) => Math.abs(d[metricKey])),
			isRMode ? 0.5 : 100
		)
		const dMax = isRMode
			? Math.ceil(maxAbs * 1.2 * 100) / 100
			: Math.ceil(maxAbs * 1.1)
		const sorted = withTrades.toSorted((a, b) => b[metricKey] - a[metricKey])
		const pnl = data.reduce((sum, s) => sum + s.totalPnl, 0)
		const trades = data.reduce((sum, s) => sum + s.totalTrades, 0)
		const avgR = trades > 0
			? data.reduce((sum, s) => sum + s.avgR * s.totalTrades, 0) / trades
			: 0
		return {
			sessionsWithTrades: withTrades,
			domainMax: dMax,
			bestSession: sorted[0],
			worstSession: sorted[sorted.length - 1],
			totalPnl: pnl,
			totalTrades: trades,
			weightedAvgR: avgR,
		}
	}, [data, metricKey, isRMode])

	if (sessionsWithTrades.length === 0) {
		return (
			<div id="analytics-session-chart" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
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
		<div id="analytics-session-chart" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-start justify-between">
				<div>
					<h3 className="text-small sm:text-body font-semibold text-txt-100">
						{t("session.title")}
					</h3>
					<p className="text-tiny text-txt-300 mt-s-100">
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
					<p className="text-tiny text-txt-300">
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
							dataKey="session"
							tickFormatter={formatSessionTickLabel}
							stroke="var(--color-txt-300)"
							tick={isMobile ? AXIS_TICK_SESSION_MOBILE : AXIS_TICK}
							tickLine={false}
							axisLine={{ stroke: "var(--color-bg-300)" }}
						/>
						<YAxis
							tickFormatter={(value: number) =>
								isRMode ? formatR(value) : formatCompactCurrencyWithSign(value, "R$")
							}
							stroke="var(--color-txt-300)"
							tick={AXIS_TICK}
							tickLine={false}
							axisLine={false}
							domain={[-domainMax, domainMax]}
							width={yAxisWidth}
						/>
						<ChartTooltip content={<CustomTooltip />} />
						<Bar dataKey={metricKey} radius={[4, 4, 0, 0]} maxBarSize={80}>
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
							<p className="text-tiny text-txt-300">
								{tLabels(session.session)}
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
									: "\u2014"}
							</p>
							{hasTrades && (
								<p className="text-tiny text-txt-300 mt-s-100">
									{session.winRate.toFixed(0)}% {tCommon("winRateAbbr")} ·{" "}
									{t("session.totalTrades", {
										count: session.totalTrades,
									})}
								</p>
							)}
						</div>
					)
				})}
			</div>

			{/* Actionable Insights — Best vs Worst table */}
			{bestSession && worstSession && (() => {
				const isSameSession = bestSession === worstSession
				const showBest = !isSameSession || bestSession[metricKey] >= 0
				const showWorst = !isSameSession || worstSession[metricKey] < 0

				return (
					<div className="mt-s-300 sm:mt-m-400">
						<div className="border-bg-300 rounded-lg border overflow-x-auto">
							<table className="w-full text-tiny">
								<thead>
									<tr className="border-bg-300 border-b">
										<th className="px-s-300 py-s-200 text-center font-medium" colSpan={3}>
											<div className="gap-s-100 flex items-center justify-center">
												<TrendingUp className="text-trade-buy h-3.5 w-3.5" aria-hidden="true" />
												<span className="text-trade-buy">{t("session.bestSession")}</span>
											</div>
										</th>
										<th className="px-s-300 py-s-200 text-center font-medium" colSpan={3}>
											<div className="gap-s-100 flex items-center justify-center">
												<TrendingDown className="text-trade-sell h-3.5 w-3.5" aria-hidden="true" />
												<span className="text-trade-sell">{t("session.worstSession")}</span>
											</div>
										</th>
									</tr>
									<tr className="border-bg-300 border-b">
										<th className="px-s-300 py-s-100 text-txt-300 text-center font-medium">{t("session.sessionCol")}</th>
										<th className="px-s-300 py-s-100 text-txt-300 text-center font-medium">{isRMode ? t("session.avgR") : t("session.pnl")}</th>
										<th className="px-s-300 py-s-100 text-txt-300 text-center font-medium">{t("session.winRate")}</th>
										<th className="px-s-300 py-s-100 text-txt-300 text-center font-medium">{t("session.sessionCol")}</th>
										<th className="px-s-300 py-s-100 text-txt-300 text-center font-medium">{isRMode ? t("session.avgR") : t("session.pnl")}</th>
										<th className="px-s-300 py-s-100 text-txt-300 text-center font-medium">{t("session.winRate")}</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										{showBest ? (
											<>
												<td className="px-s-300 py-s-200 text-trade-buy text-center font-semibold whitespace-nowrap">
													{tLabels(bestSession.session)}
												</td>
												<td className="px-s-300 py-s-200 text-trade-buy text-center font-semibold whitespace-nowrap">
													{formatMetric(bestSession[metricKey])}
												</td>
												<td className="px-s-300 py-s-200 text-txt-300 text-center whitespace-nowrap">
													{bestSession.winRate.toFixed(0)}% · {bestSession.totalTrades}
												</td>
											</>
										) : (
											<td colSpan={3} className="px-s-300 py-s-200 text-txt-300 text-center">\u2014</td>
										)}
										{showWorst ? (
											<>
												<td className="px-s-300 py-s-200 text-trade-sell text-center font-semibold whitespace-nowrap">
													{tLabels(worstSession.session)}
												</td>
												<td className="px-s-300 py-s-200 text-trade-sell text-center font-semibold whitespace-nowrap">
													{formatMetric(worstSession[metricKey])}
												</td>
												<td className="px-s-300 py-s-200 text-txt-300 text-center whitespace-nowrap">
													{worstSession.winRate.toFixed(0)}% · {worstSession.totalTrades}
												</td>
											</>
										) : (
											<td colSpan={3} className="px-s-300 py-s-200 text-txt-300 text-center">\u2014</td>
										)}
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				)
			})()}
		</div>
	)
})

SessionPerformanceChart.displayName = "SessionPerformanceChart"
