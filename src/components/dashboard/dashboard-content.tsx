"use client"

import { useState, useEffect, useTransition, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { KpiCards } from "./kpi-cards"
import { TradingCalendar } from "./trading-calendar"
import { EquityCurve } from "./equity-curve"
import { QuickStats } from "./quick-stats"
import { DailyPnLBarChart } from "./daily-pnl-bar-chart"
import { PerformanceRadarChart } from "./performance-radar-chart"
import { DayDetailModal } from "./day-detail-modal"
import { LoadingSpinner } from "@/components/shared"
import {
	getDailyPnL,
	getOverallStats,
	getDisciplineScore,
	getEquityCurve,
	getStreakData,
	getRadarChartData,
} from "@/app/actions/analytics"
import { cn } from "@/lib/utils"
import type {
	OverallStats,
	DisciplineData,
	EquityPoint,
	StreakData,
	DailyPnL,
	RadarChartData,
} from "@/types"

type DashboardPeriod = "month" | "year" | "allTime"

interface DashboardContentProps {
	initialStats: OverallStats | null
	initialDiscipline: DisciplineData | null
	initialEquityCurve: EquityPoint[]
	initialStreakData: StreakData | null
	initialDailyPnL: DailyPnL[]
	initialRadarData: RadarChartData[]
	initialYear: number
	initialMonthIndex: number
}

/** Compute dateFrom/dateTo for a given dashboard period */
const getDateRangeForPeriod = (
	period: DashboardPeriod,
	now: Date
): { dateFrom?: Date; dateTo?: Date } => {
	if (period === "allTime") {
		return {}
	}

	if (period === "month") {
		const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1)
		const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
		return { dateFrom, dateTo }
	}

	// year
	const dateFrom = new Date(now.getFullYear(), 0, 1)
	const dateTo = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
	return { dateFrom, dateTo }
}

interface PeriodToggleProps {
	period: DashboardPeriod
	onChange: (period: DashboardPeriod) => void
	disabled?: boolean
}

const PeriodToggle = ({ period, onChange, disabled }: PeriodToggleProps) => {
	const t = useTranslations("dashboard.period")

	const options: { value: DashboardPeriod; label: string }[] = [
		{ value: "month", label: t("month") },
		{ value: "year", label: t("year") },
		{ value: "allTime", label: t("allTime") },
	]

	return (
		<div className="flex rounded-lg border border-bg-300 bg-bg-100 p-s-100">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					disabled={disabled}
					className={cn(
						"rounded-md px-s-200 py-s-100 text-tiny font-medium transition-colors sm:px-s-300 sm:text-small",
						period === option.value
							? "bg-acc-100 text-bg-100"
							: "text-txt-300 hover:text-txt-100",
						disabled && "cursor-not-allowed opacity-50"
					)}
					aria-pressed={period === option.value}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}

export const DashboardContent = ({
	initialStats,
	initialDiscipline,
	initialEquityCurve,
	initialStreakData,
	initialDailyPnL,
	initialRadarData,
	initialYear,
	initialMonthIndex,
}: DashboardContentProps) => {
	const effectiveDate = useEffectiveDate()
	// Calendar month state (independent of the period filter)
	const [currentMonth, setCurrentMonth] = useState(() => new Date(initialYear, initialMonthIndex, 1))
	const [dailyPnL, setDailyPnL] = useState<DailyPnL[]>(initialDailyPnL)

	// Period-filtered data
	const [period, setPeriod] = useState<DashboardPeriod>("allTime")
	const [stats, setStats] = useState<OverallStats | null>(initialStats)
	const [discipline, setDiscipline] = useState<DisciplineData | null>(initialDiscipline)
	const [equityCurve, setEquityCurve] = useState<EquityPoint[]>(initialEquityCurve)
	const [streakData, setStreakData] = useState<StreakData | null>(initialStreakData)
	const [radarData, setRadarData] = useState<RadarChartData[]>(initialRadarData)

	const [isPending, startTransition] = useTransition()
	const [isPeriodLoading, startPeriodTransition] = useTransition()

	// Day detail modal state
	const [selectedDate, setSelectedDate] = useState<string | null>(null)
	const [isDayModalOpen, setIsDayModalOpen] = useState(false)

	// Reset all state when initial props change (e.g., account switch)
	useEffect(() => {
		setDailyPnL(initialDailyPnL)
		setStats(initialStats)
		setDiscipline(initialDiscipline)
		setEquityCurve(initialEquityCurve)
		setStreakData(initialStreakData)
		setRadarData(initialRadarData)
		setPeriod("allTime")
	}, [
		initialDailyPnL,
		initialStats,
		initialDiscipline,
		initialEquityCurve,
		initialStreakData,
		initialRadarData,
	])

	// Memoized handlers
	const handleDayClick = useCallback((date: string) => {
		setSelectedDate(date)
		setIsDayModalOpen(true)
	}, [])

	const handleDayModalChange = useCallback((open: boolean) => {
		setIsDayModalOpen(open)
		if (!open) {
			setSelectedDate(null)
		}
	}, [])

	const handleMonthChange = useCallback((newMonth: Date) => {
		setCurrentMonth(newMonth)
		startTransition(async () => {
			const result = await getDailyPnL(newMonth.getFullYear(), newMonth.getMonth())
			if (result.status === "success" && result.data) {
				setDailyPnL(result.data)
			}
		})
	}, [])

	const handlePeriodChange = useCallback((newPeriod: DashboardPeriod) => {
		setPeriod(newPeriod)
		const { dateFrom, dateTo } = getDateRangeForPeriod(newPeriod, effectiveDate)

		startPeriodTransition(async () => {
			const [statsResult, disciplineResult, equityCurveResult, streakResult, radarResult] =
				await Promise.all([
					getOverallStats(dateFrom, dateTo),
					getDisciplineScore(dateFrom, dateTo),
					getEquityCurve(dateFrom, dateTo),
					getStreakData(dateFrom, dateTo),
					getRadarChartData(
						dateFrom || dateTo
							? { dateFrom, dateTo }
							: undefined
					),
				])

			if (statsResult.status === "success") setStats(statsResult.data ?? null)
			if (disciplineResult.status === "success") setDiscipline(disciplineResult.data ?? null)
			if (equityCurveResult.status === "success") setEquityCurve(equityCurveResult.data ?? [])
			if (streakResult.status === "success") setStreakData(streakResult.data ?? null)
			if (radarResult.status === "success") setRadarData(radarResult.data ?? [])
		})
	}, [effectiveDate])

	return (
		<div className="grid grid-cols-1 gap-m-400 sm:gap-m-500 md:grid-cols-2 lg:grid-cols-3 lg:gap-m-600">
			{/* Period Toggle + Loading */}
			<div className="md:col-span-2 lg:col-span-3 flex items-center gap-m-400">
				<PeriodToggle
					period={period}
					onChange={handlePeriodChange}
					disabled={isPeriodLoading}
				/>
				{isPeriodLoading && <LoadingSpinner size="sm" />}
			</div>

			{/* KPI Cards */}
			<div className="md:col-span-2 lg:col-span-3">
				<KpiCards stats={stats} discipline={discipline} />
			</div>

			{/* Calendar */}
			<div className="md:col-span-2 lg:col-span-2">
				<TradingCalendar
					data={dailyPnL}
					month={currentMonth}
					onMonthChange={handleMonthChange}
					onDayClick={handleDayClick}
				/>
			</div>

			{/* Quick Stats */}
			<div className="md:col-span-2 lg:col-span-1">
				<QuickStats streakData={streakData} stats={stats} />
			</div>

			{/* Daily P&L Bar Chart */}
			<div className="md:col-span-2 lg:col-span-2">
				<DailyPnLBarChart data={dailyPnL} onDayClick={handleDayClick} />
			</div>

			{/* Performance Radar */}
			<div className="md:col-span-2 lg:col-span-1">
				<PerformanceRadarChart data={radarData} />
			</div>

			{/* Equity Curve */}
			<div className="md:col-span-2 lg:col-span-3">
				<EquityCurve data={equityCurve} calendarMonth={currentMonth} />
			</div>

			{/* Day Detail Modal */}
			<DayDetailModal
				date={selectedDate}
				open={isDayModalOpen}
				onOpenChange={handleDayModalChange}
			/>
		</div>
	)
}
