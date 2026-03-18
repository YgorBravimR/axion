"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { useTranslations } from "next-intl"
import {
	FilterPanel,
	VariableComparison,
	TagCloud,
	ExpectedValue,
	RDistribution,
	CumulativePnlChart,
	HourlyPerformanceChart,
	DayOfWeekChart,
	TimeHeatmap,
	SessionPerformanceChart,
	SessionAssetTable,
	type FilterState,
} from "@/components/analytics"
import type { ExpectancyMode } from "./expectancy-mode-toggle"
import { LoadingSpinner } from "@/components/shared"
import { Link } from "@/i18n/routing"
import { GitCompareArrows } from "lucide-react"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { analyticsGuide } from "@/components/ui/page-guide/guide-configs/analytics"
import {
	getPerformanceByVariable,
	getExpectedValue,
	getRDistribution,
	getEquityCurve,
	getHourlyPerformance,
	getDayOfWeekPerformance,
	getTimeHeatmap,
	getSessionPerformance,
	getSessionAssetPerformance,
} from "@/app/actions/analytics"
import { getTagStats } from "@/app/actions/tags"
import type {
	PerformanceByGroup,
	TagStats,
	ExpectedValueData,
	RDistributionBucket,
	EquityPoint,
	HourlyPerformance,
	DayOfWeekPerformance,
	TimeHeatmapCell,
	SessionPerformance,
	SessionAssetPerformance,
} from "@/types"

interface TimeframeOption {
	id: string
	name: string
}

interface AnalyticsContentProps {
	initialPerformance: PerformanceByGroup[]
	initialTagStats: TagStats[]
	initialExpectedValue: ExpectedValueData | null
	initialRDistribution: RDistributionBucket[]
	initialEquityCurve: EquityPoint[]
	initialHourlyPerformance: HourlyPerformance[]
	initialDayOfWeekPerformance: DayOfWeekPerformance[]
	initialTimeHeatmap: TimeHeatmapCell[]
	initialSessionPerformance: SessionPerformance[]
	initialSessionAssetPerformance: SessionAssetPerformance[]
	availableAssets: string[]
	availableTimeframes: TimeframeOption[]
	accountCount?: number
}

/** Converts FilterState to the TradeFilters format expected by server actions */
const toTradeFilters = (f: FilterState) => ({
	dateFrom: f.dateFrom || undefined,
	dateTo: f.dateTo || undefined,
	assets: f.assets.length > 0 ? f.assets : undefined,
	directions: f.directions.length > 0 ? f.directions : undefined,
	outcomes: f.outcomes.length > 0 ? f.outcomes : undefined,
	timeframeIds: f.timeframeIds.length > 0 ? f.timeframeIds : undefined,
})

/**
 * Main analytics dashboard component.
 * Uses parallel data fetching for optimal performance when filters change.
 */
const AnalyticsContent = ({
	initialPerformance,
	initialTagStats,
	initialExpectedValue,
	initialRDistribution,
	initialEquityCurve,
	initialHourlyPerformance,
	initialDayOfWeekPerformance,
	initialTimeHeatmap,
	initialSessionPerformance,
	initialSessionAssetPerformance,
	availableAssets,
	availableTimeframes,
	accountCount,
}: AnalyticsContentProps) => {
	const t = useTranslations("analytics")
	const tComparison = useTranslations("accountComparison")
	const [isPending, startTransition] = useTransition()
	const { isAdmin } = useFeatureAccess()
	const showComparisonLink = isAdmin && (accountCount ?? 0) >= 2

	useRegisterPageGuide(analyticsGuide)

	const [filters, setFilters] = useState<FilterState>({
		dateFrom: null,
		dateTo: null,
		assets: [],
		directions: [],
		outcomes: [],
		timeframeIds: [],
	})

	const [groupBy, setGroupBy] = useState<
		"asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy"
	>("asset")

	// Skip the fetch effect on initial mount — data is already provided via server-side props
	const hasUserInteracted = useRef(false)

	const [expectancyMode, setExpectancyMode] = useState<ExpectancyMode>("edge")

	const [performance, setPerformance] =
		useState<PerformanceByGroup[]>(initialPerformance)
	const [tagStats, setTagStats] = useState<TagStats[]>(initialTagStats)
	const [expectedValue, setExpectedValue] = useState<ExpectedValueData | null>(
		initialExpectedValue
	)
	const [rDistribution, setRDistribution] =
		useState<RDistributionBucket[]>(initialRDistribution)
	const [equityCurve, setEquityCurve] =
		useState<EquityPoint[]>(initialEquityCurve)
	const [hourlyPerformance, setHourlyPerformance] = useState<
		HourlyPerformance[]
	>(initialHourlyPerformance)
	const [dayOfWeekPerformance, setDayOfWeekPerformance] = useState<
		DayOfWeekPerformance[]
	>(initialDayOfWeekPerformance)
	const [timeHeatmap, setTimeHeatmap] =
		useState<TimeHeatmapCell[]>(initialTimeHeatmap)
	const [sessionPerformance, setSessionPerformance] = useState<
		SessionPerformance[]
	>(initialSessionPerformance)
	const [sessionAssetPerformance, setSessionAssetPerformance] = useState<
		SessionAssetPerformance[]
	>(initialSessionAssetPerformance)

	// Reset all analytics state when initial props change (e.g., account switch)
	useEffect(() => {
		setPerformance(initialPerformance)
		setTagStats(initialTagStats)
		setExpectedValue(initialExpectedValue)
		setRDistribution(initialRDistribution)
		setEquityCurve(initialEquityCurve)
		setHourlyPerformance(initialHourlyPerformance)
		setDayOfWeekPerformance(initialDayOfWeekPerformance)
		setTimeHeatmap(initialTimeHeatmap)
		setSessionPerformance(initialSessionPerformance)
		setSessionAssetPerformance(initialSessionAssetPerformance)
	}, [
		initialPerformance,
		initialTagStats,
		initialExpectedValue,
		initialRDistribution,
		initialEquityCurve,
		initialHourlyPerformance,
		initialDayOfWeekPerformance,
		initialTimeHeatmap,
		initialSessionPerformance,
		initialSessionAssetPerformance,
	])

	// Refetch data when filters or groupBy change (skip initial mount — server already fetched)
	useEffect(() => {
		if (!hasUserInteracted.current) {
			hasUserInteracted.current = true
			return
		}

		startTransition(async () => {
			const tradeFilters = toTradeFilters(filters)

			const [
				perfResult,
				tagResult,
				evResult,
				rDistResult,
				equityResult,
				hourlyResult,
				dayOfWeekResult,
				heatmapResult,
				sessionResult,
				sessionAssetResult,
			] = await Promise.all([
				getPerformanceByVariable(groupBy, tradeFilters),
				getTagStats(tradeFilters),
				getExpectedValue(tradeFilters),
				getRDistribution(tradeFilters),
				getEquityCurve(tradeFilters.dateFrom, tradeFilters.dateTo),
				getHourlyPerformance(tradeFilters),
				getDayOfWeekPerformance(tradeFilters),
				getTimeHeatmap(tradeFilters),
				getSessionPerformance(tradeFilters),
				getSessionAssetPerformance(tradeFilters),
			])

			// Update state with successful results
			if (perfResult.status === "success") setPerformance(perfResult.data ?? [])
			if (tagResult.status === "success") setTagStats(tagResult.data ?? [])
			if (evResult.status === "success") setExpectedValue(evResult.data ?? null)
			if (rDistResult.status === "success")
				setRDistribution(rDistResult.data ?? [])
			if (equityResult.status === "success")
				setEquityCurve(equityResult.data ?? [])
			if (hourlyResult.status === "success")
				setHourlyPerformance(hourlyResult.data ?? [])
			if (dayOfWeekResult.status === "success")
				setDayOfWeekPerformance(dayOfWeekResult.data ?? [])
			if (heatmapResult.status === "success")
				setTimeHeatmap(heatmapResult.data ?? [])
			if (sessionResult.status === "success")
				setSessionPerformance(sessionResult.data ?? [])
			if (sessionAssetResult.status === "success")
				setSessionAssetPerformance(sessionAssetResult.data ?? [])
		})
	}, [filters, groupBy])

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Compare Accounts Link (admin + 2+ accounts) */}
			{showComparisonLink && (
				<div className="flex justify-end">
					<Link
						href="/analytics/account-comparison"
						className="text-acc-100 hover:text-acc-100/80 flex items-center gap-s-200 text-small transition-colors"
						aria-label={tComparison("title")}
					>
						<GitCompareArrows className="h-4 w-4" />
						{tComparison("title")}
					</Link>
				</div>
			)}

			{/* Filter Panel (includes ExpectancyModeToggle) */}
			<FilterPanel
				filters={filters}
				onFiltersChange={setFilters}
				availableAssets={availableAssets}
				availableTimeframes={availableTimeframes}
				expectancyMode={expectancyMode}
				onExpectancyModeChange={setExpectancyMode}
			/>

			{/* Loading Indicator */}
			{isPending && (
				<LoadingSpinner size="sm" label={t("updating")} className="py-s-200" />
			)}

			{/* Variable Comparison - Full Width */}
			<VariableComparison
				data={performance}
				groupBy={groupBy}
				onGroupByChange={setGroupBy}
			/>

			{/* Cumulative P&L Chart - Full Width */}
			<CumulativePnlChart data={equityCurve} />

			{/* Two Column Grid */}
			<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 lg:grid-cols-2">
				{/* Expected Value */}
				<ExpectedValue data={expectedValue} mode={expectancyMode} />

				{/* R Distribution */}
				<RDistribution data={rDistribution} />
			</div>

			{/* Tag Cloud - Full Width */}
			<TagCloud data={tagStats} expectancyMode={expectancyMode} />

			{/* Time-Based Analysis Section */}
			<div id="analytics-time-section" className="mt-m-400 sm:mt-m-500 lg:mt-m-600">
				<h2 className="mb-s-300 sm:mb-m-400 text-body sm:text-heading text-txt-100 font-semibold">
					{t("time.title")}
				</h2>

				{/* Heatmap + Session: stacked on small/medium, side-by-side on 2xl+ */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 2xl:grid-cols-2">
					<TimeHeatmap data={timeHeatmap} expectancyMode={expectancyMode} />
					<SessionPerformanceChart
						data={sessionPerformance}
						expectancyMode={expectancyMode}
					/>
				</div>

				{/* Session Asset Table - Full Width */}
				<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600">
					<SessionAssetTable
						data={sessionAssetPerformance}
						expectancyMode={expectancyMode}
					/>
				</div>

				{/* Two Column Grid for Charts */}
				<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600 gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 lg:grid-cols-2">
					{/* Hourly Performance */}
					<HourlyPerformanceChart
						data={hourlyPerformance}
						expectancyMode={expectancyMode}
					/>

					{/* Day of Week Performance */}
					<DayOfWeekChart
						data={dayOfWeekPerformance}
						expectancyMode={expectancyMode}
					/>
				</div>
			</div>
		</div>
	)
}

export { AnalyticsContent }
