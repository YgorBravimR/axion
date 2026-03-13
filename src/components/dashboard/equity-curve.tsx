"use client"

import { useState, useTransition, useEffect } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { formatCompactCurrency } from "@/lib/formatting"
import { getEquityCurve, type EquityCurveMode } from "@/app/actions/analytics"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { useChartConfig } from "@/hooks/use-chart-config"
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
	onChange: (period: Period) => void
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
		<div className="border-bg-300 bg-bg-100 p-s-100 flex rounded-lg border">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					disabled={disabled}
					className={cn(
						"px-s-300 py-s-100 text-tiny rounded-md font-medium transition-colors",
						period === option.value
							? "bg-acc-100 text-bg-100"
							: "text-txt-300 hover:text-txt-100",
						disabled && "cursor-not-allowed opacity-50"
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}

interface ViewModeToggleProps {
	mode: ViewMode
	onChange: (mode: ViewMode) => void
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
		<div className="border-bg-300 bg-bg-100 p-s-100 flex rounded-lg border">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					disabled={disabled}
					className={cn(
						"px-s-300 py-s-100 text-tiny rounded-md font-medium transition-colors",
						mode === option.value
							? "bg-acc-100 text-bg-100"
							: "text-txt-300 hover:text-txt-100",
						disabled && "cursor-not-allowed opacity-50"
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}

interface TooltipContextProps {
	viewMode: ViewMode
	locale: string
	drawdownLabel: string
	tradeNumberLabel: (number: number) => string
}

const createCustomTooltip = ({
	viewMode,
	locale,
	drawdownLabel,
	tradeNumberLabel,
}: TooltipContextProps) => {
	const formatDateLocale = (dateStr: string): string => {
		const date = new Date(dateStr)
		return date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
			month: "short",
			day: "numeric",
			timeZone: APP_TIMEZONE,
		})
	}

	const CustomTooltipInner = ({
		active,
		payload,
		label,
	}: CustomTooltipProps) => {
		if (active && payload && payload.length > 0) {
			const data = payload[0].payload
			// Calculate drawdown value: if we're X% down from peak, the dollar amount is
			// accountEquity * (drawdown / (100 - drawdown))
			const drawdownValue =
				data.drawdown > 0
					? data.accountEquity * (data.drawdown / (100 - data.drawdown))
					: 0

			const labelDisplay =
				viewMode === "trades" && data.tradeNumber
					? tradeNumberLabel(data.tradeNumber)
					: formatDateLocale(label || "")

			return (
				<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border shadow-lg">
					<p className="text-tiny text-txt-300">{labelDisplay}</p>
					{viewMode === "trades" && (
						<p className="text-tiny text-txt-300">
							{formatDateLocale(data.date)}
						</p>
					)}
					<p className="text-small text-txt-100 font-semibold">
						{formatCompactCurrency(data.accountEquity, "R$")}
					</p>
					{data.drawdown > 0 && (
						<p className="text-tiny text-trade-sell">
							{drawdownLabel}: {formatCompactCurrency(drawdownValue, "R$")} (
							{data.drawdown.toFixed(1)}%)
						</p>
					)}
				</div>
			)
		}
		return null
	}
	return CustomTooltipInner
}

export const EquityCurve = ({
	data: initialData,
	calendarMonth,
}: EquityCurveProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("dashboard.equity")
	const tCharts = useTranslations("charts")
	const locale = useLocale()
	const effectiveDate = useEffectiveDate()
	const [period, setPeriod] = useState<Period>("all")
	const [viewMode, setViewMode] = useState<ViewMode>("days")
	const [data, setData] = useState<EquityPoint[]>(initialData)
	const [isPending, startTransition] = useTransition()

	// Refetch when calendar month changes and period is "month"
	useEffect(() => {
		if (period === "month") {
			fetchData("month", viewMode)
		}
	}, [calendarMonth]) // eslint-disable-line react-hooks/exhaustive-deps

	const periodLabels = {
		month: t("period.month"),
		year: t("period.year"),
		all: t("period.all"),
	}

	const viewModeLabels = {
		days: t("viewMode.days"),
		trades: t("viewMode.trades"),
	}

	const formatDateLocale = (dateStr: string): string => {
		const date = new Date(dateStr)
		return date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
			month: "short",
			day: "numeric",
			timeZone: APP_TIMEZONE,
		})
	}

	const fetchData = (newPeriod: Period, newMode: ViewMode) => {
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
	}

	const handlePeriodChange = (newPeriod: Period) => {
		setPeriod(newPeriod)
		fetchData(newPeriod, viewMode)
	}

	const handleViewModeChange = (newMode: ViewMode) => {
		setViewMode(newMode)
		fetchData(period, newMode)
	}

	if (data.length === 0 && !isPending) {
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border sm:p-m-400 lg:p-m-500">
				<div className="flex flex-col gap-s-200 sm:flex-row sm:items-center sm:justify-between">
					<h2 className="text-small text-txt-100 font-semibold sm:text-body">{t("title")}</h2>
					<div className="gap-s-200 flex items-center">
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
				<div className="mt-s-300 text-txt-300 flex h-48 items-center justify-center sm:mt-m-400 sm:h-64">
					{t("noData")}
				</div>
			</div>
		)
	}

	const minEquity = Math.min(...data.map((d) => d.accountEquity))
	const maxEquity = Math.max(...data.map((d) => d.accountEquity))
	const padding = (maxEquity - minEquity) * 0.1 || 100

	const CustomTooltip = createCustomTooltip({
		viewMode,
		locale,
		drawdownLabel: t("drawdown"),
		tradeNumberLabel: (number: number) => tCharts("tradeNumber", { number }),
	})

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border sm:p-m-400 lg:p-m-500">
			<div className="flex flex-col gap-s-200 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-small text-txt-100 font-semibold sm:text-body">{t("title")}</h2>
				<div className="gap-s-200 flex items-center">
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
				className={cn("mt-s-300 h-48 sm:mt-m-400 sm:h-64", isPending && "opacity-50")}
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
						tickFormatter={(value: number) => formatCompactCurrency(value, "R$")}
						stroke="var(--color-txt-300)"
						tick={{ fill: "var(--color-txt-300)", fontSize: 11 }}
						tickLine={false}
						axisLine={false}
						domain={[minEquity - padding, maxEquity + padding]}
						width={yAxisWidth}
					/>
					<Tooltip content={<CustomTooltip />} />
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
		</div>
	)
}
