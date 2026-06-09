"use client"

import { useState, useEffect, useTransition, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { KpiCards } from "./kpi-cards"
import { CoachingInsightsCard } from "./coaching-insights-card"
import { HawksCoachingInsightsCard } from "@/components/hawks"
import { TradingCalendar } from "./trading-calendar"
import { EquityCurve } from "./equity-curve"
import { QuickStats } from "./quick-stats"
import { DailyPnLBarChart } from "./daily-pnl-bar-chart"
import { AxionScoreCard } from "./axion-score-card"
import { DayDetailModal } from "./day-detail-modal"
import { LoadingSpinner, ModeVariant } from "@/components/shared"
import {
	getDailyPnL,
	getOverallStats,
	getDisciplineScore,
	getEquityCurve,
	getStreakData,
	getRadarChartData,
} from "@/app/actions/analytics"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import {
	DashboardStrategyFilter,
	type DashboardStrategyFilterValue,
} from "./dashboard-strategy-filter"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { dashboardGuide } from "@/components/ui/page-guide/guide-configs/dashboard"
import type {
	OverallStats,
	DisciplineData,
	EquityPoint,
	StreakData,
	DailyPnL,
	RadarChartData,
	TradeFilters,
} from "@/types"
import type { HawksCoachingResult } from "@/app/actions/hawks-coaching.types"

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
	initialHawksContext?: HawksCoachingResult | null
	/**
	 * Sum of starting balances across the accounts in scope, in cents.
	 * Stays bound to the initial all-time view — does NOT follow the
	 * period toggle, so the Capital cards stay stable across Month/Year/AllTime.
	 */
	initialCapitalCents: number
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
		const dateTo = new Date(
			now.getFullYear(),
			now.getMonth() + 1,
			0,
			23,
			59,
			59,
			999
		)
		return { dateFrom, dateTo }
	}

	// year
	const dateFrom = new Date(now.getFullYear(), 0, 1)
	const dateTo = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
	return { dateFrom, dateTo }
}

interface PeriodToggleProps {
	period: DashboardPeriod
	onChange: (_period: DashboardPeriod) => void
	disabled?: boolean
}

const PeriodToggle = ({ period, onChange, disabled }: PeriodToggleProps) => {
	const t = useTranslations("dashboard.period")

	// Options are static locale-independent labels
	const options = useMemo<{ value: DashboardPeriod; label: string }[]>(
		() => [
			{ value: "month", label: t("month") },
			{ value: "year", label: t("year") },
			{ value: "allTime", label: t("allTime") },
		],
		[t]
	)

	return (
		<SegmentedToggle
			value={period}
			options={options}
			onChange={onChange}
			disabled={disabled}
			aria-label={t("filterAriaLabel")}
		/>
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
	initialHawksContext,
	initialCapitalCents,
}: DashboardContentProps) => {
	const effectiveDate = useEffectiveDate()
	const { canAccess } = useFeatureAccess()
	useRegisterPageGuide(dashboardGuide)
	// Calendar month state (independent of the period filter)
	const [currentMonth, setCurrentMonth] = useState(
		() => new Date(initialYear, initialMonthIndex, 1)
	)
	const [dailyPnL, setDailyPnL] = useState<DailyPnL[]>(initialDailyPnL)

	// Period-filtered data
	const [period, setPeriod] = useState<DashboardPeriod>("allTime")
	const [strategyFilter, setStrategyFilter] =
		useState<DashboardStrategyFilterValue>({
			strategyId: null,
			strategyVersionId: null,
		})
	const [stats, setStats] = useState<OverallStats | null>(initialStats)
	const [discipline, setDiscipline] = useState<DisciplineData | null>(
		initialDiscipline
	)
	const [equityCurve, setEquityCurve] =
		useState<EquityPoint[]>(initialEquityCurve)
	const [streakData, setStreakData] = useState<StreakData | null>(
		initialStreakData
	)
	const [radarData, setRadarData] = useState<RadarChartData[]>(initialRadarData)

	const [isCalendarLoading, startTransition] = useTransition()
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
		setStrategyFilter({ strategyId: null, strategyVersionId: null })
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
			const result = await getDailyPnL(
				newMonth.getFullYear(),
				newMonth.getMonth()
			)
			if (result.status === "success" && result.data) {
				setDailyPnL(result.data)
			}
		})
	}, [])

	const fetchFilteredData = useCallback(
		(
			nextPeriod: DashboardPeriod,
			nextStrategyFilter: DashboardStrategyFilterValue
		) => {
			const { dateFrom, dateTo } = getDateRangeForPeriod(
				nextPeriod,
				effectiveDate
			)
			const cohortFilters: TradeFilters | undefined =
				nextStrategyFilter.strategyId
					? {
							strategyIds: [nextStrategyFilter.strategyId],
							...(nextStrategyFilter.strategyVersionId
								? { strategyVersionIds: [nextStrategyFilter.strategyVersionId] }
								: {}),
						}
					: undefined

			startPeriodTransition(async () => {
				const [
					statsResult,
					disciplineResult,
					equityCurveResult,
					streakResult,
					radarResult,
				] = await Promise.all([
					getOverallStats(dateFrom, dateTo, cohortFilters),
					getDisciplineScore(dateFrom, dateTo, cohortFilters),
					getEquityCurve(dateFrom, dateTo, "daily", cohortFilters),
					getStreakData(dateFrom, dateTo, cohortFilters),
					getRadarChartData(
						dateFrom || dateTo || cohortFilters
							? { dateFrom, dateTo, ...cohortFilters }
							: undefined
					),
				])

				if (statsResult.status === "success") {
					setStats(statsResult.data ?? null)
				}
				if (disciplineResult.status === "success") {
					setDiscipline(disciplineResult.data ?? null)
				}
				if (equityCurveResult.status === "success") {
					setEquityCurve(equityCurveResult.data ?? [])
				}
				if (streakResult.status === "success") {
					setStreakData(streakResult.data ?? null)
				}
				if (radarResult.status === "success") {
					setRadarData(radarResult.data ?? [])
				}
			})
		},
		[effectiveDate]
	)

	const handlePeriodChange = useCallback(
		(newPeriod: DashboardPeriod) => {
			setPeriod(newPeriod)
			fetchFilteredData(newPeriod, strategyFilter)
		},
		[fetchFilteredData, strategyFilter]
	)

	const handleStrategyFilterChange = useCallback(
		(next: DashboardStrategyFilterValue) => {
			setStrategyFilter(next)
			fetchFilteredData(period, next)
		},
		[fetchFilteredData, period]
	)

	// JSX literals are optimized by React 19 — no need to memoize
	const coachingVariants = {
		hawks: <HawksCoachingInsightsCard initialContext={initialHawksContext} />,
	}

	return (
		<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 flex flex-col">
			{/* Period Toggle + Strategy Filter + Loading */}
			<div
				id="dashboard-toolbar"
				className="gap-m-400 flex flex-wrap items-center"
			>
				<PeriodToggle
					period={period}
					onChange={handlePeriodChange}
					disabled={isPeriodLoading}
				/>
				<DashboardStrategyFilter
					value={strategyFilter}
					onChange={handleStrategyFilterChange}
					disabled={isPeriodLoading}
				/>
				{isPeriodLoading && <LoadingSpinner size="sm" />}
			</div>

			{/* KPI Cards — dense single-row strip */}
			<div id="dashboard-kpi-cards">
				<KpiCards
					stats={stats}
					discipline={discipline}
					initialCapitalCents={initialCapitalCents}
					allTimeNetPnl={initialStats?.netPnl ?? 0}
					equityCurve={initialEquityCurve}
				/>
			</div>

			{/* Two-column masonry: left column stacks the big visuals, right column
			    stacks coaching + performance + quick stats. Each column flows
			    independently so item heights don't have to align row-by-row. */}
			<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3">
				{/* Left column (col-span-2) */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 flex flex-col lg:col-span-2">
					<div id="dashboard-calendar">
						<TradingCalendar
							data={dailyPnL}
							month={currentMonth}
							onMonthChange={handleMonthChange}
							onDayClick={handleDayClick}
							isLoading={isCalendarLoading}
						/>
					</div>
					<div id="dashboard-equity-curve">
						<EquityCurve data={equityCurve} calendarMonth={currentMonth} />
					</div>
					<div id="dashboard-daily-pnl">
						<DailyPnLBarChart data={dailyPnL} onDayClick={handleDayClick} />
					</div>
				</div>

				{/* Right column (col-span-1) */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 flex flex-col lg:col-span-1">
					{canAccess("dashboard:coaching-insights") && (
						<div id="dashboard-coaching">
							<ModeVariant
								default={<CoachingInsightsCard />}
								variants={coachingVariants}
							/>
						</div>
					)}
					<div id="dashboard-axion-score">
						<AxionScoreCard data={radarData} />
					</div>
					<div id="dashboard-quick-stats">
						<QuickStats streakData={streakData} stats={stats} />
					</div>
				</div>
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
