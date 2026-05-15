"use client"

import { useState, useTransition, useEffect, useCallback, useMemo } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { Panel } from "@/components/ui/panel"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { getEquityCurve } from "@/app/actions/analytics"
import type { EquityCurveMode } from "@/app/actions/analytics.types"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { useChartConfig } from "@/hooks/use-chart-config"
import { useFormatting } from "@/hooks/use-formatting"
import { APP_TIMEZONE } from "@/lib/dates"
import type { EquityPoint } from "@/types"

type Period = "month" | "year" | "all"
type ViewMode = "days" | "trades"

interface EquityCurveProps {
	data: EquityPoint[]
	calendarMonth: Date
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: EquityPoint
	}>
	label?: string
}

interface PeriodToggleProps {
	period: Period
	onChange: (_period: Period) => void
	disabled?: boolean
	labels: { month: string; year: string; all: string }
}

const PeriodToggle = ({
	period,
	onChange,
	disabled,
	labels,
}: PeriodToggleProps) => {
	const options: { value: Period; label: string }[] = [
		{ value: "month", label: labels.month },
		{ value: "year", label: labels.year },
		{ value: "all", label: labels.all },
	]

	return (
		<SegmentedToggle
			value={period}
			options={options}
			onChange={onChange}
			disabled={disabled}
		/>
	)
}

interface ViewModeToggleProps {
	mode: ViewMode
	onChange: (_mode: ViewMode) => void
	disabled?: boolean
	labels: { days: string; trades: string }
}

const ViewModeToggle = ({
	mode,
	onChange,
	disabled,
	labels,
}: ViewModeToggleProps) => {
	const options: { value: ViewMode; label: string }[] = [
		{ value: "days", label: labels.days },
		{ value: "trades", label: labels.trades },
	]

	return (
		<SegmentedToggle
			value={mode}
			options={options}
			onChange={onChange}
			disabled={disabled}
		/>
	)
}

interface EquityTooltipProps extends CustomTooltipProps {
	viewMode: ViewMode
	locale: string
	drawdownLabel: string
	tradeNumberLabel: (_number: number) => string
}

const EquityTooltip = ({
	active,
	payload,
	label,
	viewMode,
	locale,
	drawdownLabel,
	tradeNumberLabel,
}: EquityTooltipProps) => {
	const { formatCompactCurrency } = useFormatting()

	const head = payload?.[0]
	if (!active || !head) {
		return null
	}

	const data = head.payload
	// Calculate drawdown value: if we're X% down from peak, the dollar amount is
	// accountEquity * (drawdown / (100 - drawdown))
	const drawdownValue =
		data.drawdown > 0
			? data.accountEquity * (data.drawdown / (100 - data.drawdown))
			: 0

	const formatDateStr = (dateStr: string): string => {
		const date = new Date(dateStr)
		return date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
			month: "short",
			day: "numeric",
			timeZone: APP_TIMEZONE,
		})
	}

	const labelDisplay =
		viewMode === "trades" && data.tradeNumber
			? tradeNumberLabel(data.tradeNumber)
			: formatDateStr(label || "")

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">{labelDisplay}</p>
			{viewMode === "trades" && (
				<p className="text-tiny text-txt-300">{formatDateStr(data.date)}</p>
			)}
			<p className="text-small text-txt-100 font-semibold">
				{formatCompactCurrency(data.accountEquity)}
			</p>
			{data.drawdown > 0 && (
				<p className="text-tiny text-trade-sell">
					{drawdownLabel}: {formatCompactCurrency(drawdownValue)} (
					{data.drawdown.toFixed(1)}%)
				</p>
			)}
		</div>
	)
}

export const EquityCurve = ({
	data: initialData,
	calendarMonth,
}: EquityCurveProps) => {
	const { yAxisWidth } = useChartConfig()
	const { formatCompactCurrency } = useFormatting()
	const t = useTranslations("dashboard.equity")
	const tCharts = useTranslations("charts")
	const locale = useLocale()
	const effectiveDate = useEffectiveDate()
	const [period, setPeriod] = useState<Period>("all")
	const [viewMode, setViewMode] = useState<ViewMode>("days")
	const [data, setData] = useState<EquityPoint[]>(initialData)
	const [isPending, startTransition] = useTransition()

	const fetchData = useCallback(
		(newPeriod: Period, newMode: ViewMode) => {
			startTransition(async () => {
				let dateFrom: Date | undefined
				let dateTo: Date | undefined

				if (newPeriod === "month") {
					// Use calendar month instead of current month
					dateFrom = new Date(
						calendarMonth.getFullYear(),
						calendarMonth.getMonth(),
						1
					)
					dateTo = new Date(
						calendarMonth.getFullYear(),
						calendarMonth.getMonth() + 1,
						0
					)
				} else if (newPeriod === "year") {
					dateFrom = new Date(effectiveDate.getFullYear(), 0, 1)
					dateTo = new Date(effectiveDate.getFullYear(), 11, 31)
				}
				// "all" leaves both undefined

				const mode: EquityCurveMode = newMode === "trades" ? "trade" : "daily"
				const result = await getEquityCurve(dateFrom, dateTo, mode)
				if (result.status === "success" && result.data) {
					setData(result.data)
				}
			})
		},
		[calendarMonth, effectiveDate]
	)

	// Refetch when calendar month changes and period is "month"
	useEffect(() => {
		if (period === "month") {
			fetchData("month", viewMode)
		}
	}, [calendarMonth, fetchData, period, viewMode])

	const periodLabels = useMemo(
		() => ({
			month: t("period.month"),
			year: t("period.year"),
			all: t("period.all"),
		}),
		[t]
	)

	const viewModeLabels = useMemo(
		() => ({
			days: t("viewMode.days"),
			trades: t("viewMode.trades"),
		}),
		[t]
	)

	const formatDateLocale = useCallback(
		(dateStr: string): string => {
			const date = new Date(dateStr)
			return date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
				month: "short",
				day: "numeric",
				timeZone: APP_TIMEZONE,
			})
		},
		[locale]
	)

	const handlePeriodChange = useCallback(
		(newPeriod: Period) => {
			setPeriod(newPeriod)
			fetchData(newPeriod, viewMode)
		},
		[fetchData, viewMode]
	)

	const handleViewModeChange = useCallback(
		(newMode: ViewMode) => {
			setViewMode(newMode)
			fetchData(period, newMode)
		},
		[fetchData, period]
	)

	const { minEquity, maxEquity, padding } = useMemo(() => {
		if (data.length === 0) {
			return { minEquity: 0, maxEquity: 0, padding: 100 }
		}
		const min = Math.min(...data.map((d) => d.accountEquity))
		const max = Math.max(...data.map((d) => d.accountEquity))
		return { minEquity: min, maxEquity: max, padding: (max - min) * 0.1 || 100 }
	}, [data])

	const drawdownLabel = t("drawdown")
	const handleTradeNumberLabel = useCallback(
		(number: number) => tCharts("tradeNumber", { number }),
		[tCharts]
	)

	if (data.length === 0 && !isPending) {
		return (
			<Panel padding="lg">
				<div className="gap-s-200 flex flex-col sm:flex-row sm:items-center sm:justify-between">
					<h2 className="text-small text-txt-100 sm:text-body font-semibold">
						{t("title")}
					</h2>
					<div className="gap-s-200 flex flex-wrap items-center">
						<ViewModeToggle
							mode={viewMode}
							onChange={handleViewModeChange}
							labels={viewModeLabels}
						/>
						<PeriodToggle
							period={period}
							onChange={handlePeriodChange}
							labels={periodLabels}
						/>
					</div>
				</div>
				<div className="mt-s-300 text-txt-300 sm:mt-m-400 flex h-48 items-center justify-center sm:h-64">
					{t("noData")}
				</div>
			</Panel>
		)
	}

	return (
		<Panel padding="lg" role="region" aria-label={t("title")}>
			<div className="gap-s-200 flex flex-col sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-small text-txt-100 sm:text-body font-semibold">
					{t("title")}
				</h2>
				<div className="gap-s-200 flex flex-wrap items-center">
					<ViewModeToggle
						mode={viewMode}
						onChange={handleViewModeChange}
						disabled={isPending}
						labels={viewModeLabels}
					/>
					<PeriodToggle
						period={period}
						onChange={handlePeriodChange}
						disabled={isPending}
						labels={periodLabels}
					/>
				</div>
			</div>
			<ChartContainer
				id="chart-dashboard-equity-curve"
				className={cn(
					"mt-s-300 sm:mt-m-400 h-48 max-h-80 transition-opacity duration-200 sm:h-64",
					isPending && "opacity-50"
				)}
			>
				<AreaChart
					data={data}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<defs>
						<linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="5%"
								stopColor="var(--color-acc-100)"
								stopOpacity={0.3}
							/>
							<stop
								offset="95%"
								stopColor="var(--color-acc-100)"
								stopOpacity={0}
							/>
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>
					<XAxis
						dataKey={viewMode === "trades" ? "tradeNumber" : "date"}
						tickFormatter={
							viewMode === "trades" ? (v) => `#${v}` : formatDateLocale
						}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tickFormatter={(value: number) => formatCompactCurrency(value)}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						domain={[minEquity - padding, maxEquity + padding]}
						width={yAxisWidth}
					/>
					<ChartTooltip
						variant="line"
						content={
							<EquityTooltip
								viewMode={viewMode}
								locale={locale}
								drawdownLabel={drawdownLabel}
								tradeNumberLabel={handleTradeNumberLabel}
							/>
						}
					/>
					<Area
						type="monotone"
						dataKey="accountEquity"
						stroke="var(--color-acc-100)"
						strokeWidth={2}
						fill="url(#equityGradient)"
						dot={false}
						activeDot={{
							r: 4,
							fill: "var(--color-acc-100)",
							stroke: "var(--color-bg-200)",
							strokeWidth: 2,
						}}
					/>
				</AreaChart>
			</ChartContainer>
		</Panel>
	)
}
