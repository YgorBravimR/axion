"use client"

import {
	useState,
	useEffect,
	useTransition,
	useRef,
	useCallback,
	useMemo,
} from "react"
import { useTranslations } from "next-intl"
import {
	FilterPanel,
	useAnalyticsFilters,
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
	HoldingPeriodChart,
	type FilterState,
} from "@/components/analytics"
import { LoadingSpinner } from "@/components/shared"
import { Link } from "@/i18n/routing"
import { GitCompareArrows } from "lucide-react"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { analyticsGuide } from "@/components/ui/page-guide/guide-configs/analytics"
import { getAnalyticsDashboard } from "@/app/actions/analytics"
import { getTagStats } from "@/app/actions/tags"
import {
	getAnalyticsCacheEntry,
	setAnalyticsCacheEntry,
	clearAnalyticsCache,
} from "@/lib/cache/analytics-cache"
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
	HoldingPeriodBucket,
	AnalyticsDashboardData,
} from "@/types"

interface TimeframeOption {
	id: string
	name: string
}

interface AnalyticsContentProps {
	initialDashboard: AnalyticsDashboardData | null
	initialTagStats: TagStats[]
	availableAssets: string[]
	availableTimeframes: TimeframeOption[]
	accountCount?: number
}

/** Converts FilterState to the TradeFilters format expected by server actions */
const toTradeFilters = (f: FilterState, groupBy: string) => ({
	dateFrom: f.dateFrom || undefined,
	dateTo: f.dateTo || undefined,
	assets: f.assets.length > 0 ? f.assets : undefined,
	directions: f.directions.length > 0 ? f.directions : undefined,
	outcomes: f.outcomes.length > 0 ? f.outcomes : undefined,
	timeframeIds: f.timeframeIds.length > 0 ? f.timeframeIds : undefined,
	groupBy: groupBy as "asset" | "timeframe" | "hour" | "dayOfWeek" | "strategy",
})

/**
 * Creates a stable string key from filters + groupBy for change detection.
 * Dates are rounded to the nearest minute so that "Este Mês" clicked 30s apart
 * produces the same key — enabling client cache hits.
 */
const roundToMinute = (ms: number) => Math.floor(ms / 60_000) * 60_000

const toFilterKey = (f: FilterState, groupBy: string): string =>
	JSON.stringify({
		dateFrom: f.dateFrom ? roundToMinute(f.dateFrom.getTime()) : null,
		dateTo: f.dateTo ? roundToMinute(f.dateTo.getTime()) : null,
		assets: f.assets,
		directions: f.directions,
		outcomes: f.outcomes,
		timeframeIds: f.timeframeIds,
		groupBy,
	})

const EMPTY_DASHBOARD: AnalyticsDashboardData = {
	performance: [],
	expectedValue: {
		winRate: 0,
		avgWin: 0,
		avgLoss: 0,
		expectedValue: 0,
		projectedPnl100: 0,
		sampleSize: 0,
		avgWinR: 0,
		avgLossR: 0,
		expectedR: 0,
		projectedR100: 0,
		rSampleSize: 0,
	},
	rDistribution: [],
	equityCurve: [],
	hourlyPerformance: [],
	dayOfWeekPerformance: [],
	timeHeatmap: [],
	sessionPerformance: [],
	sessionAssetPerformance: [],
	holdingPeriodAnalysis: [],
}

/**
 * Main analytics dashboard component.
 * Filters, groupBy, and expectancyMode are driven by URL params.
 * Uses a single batch endpoint for optimal performance when filters change.
 */
const AnalyticsContent = ({
	initialDashboard,
	initialTagStats,
	availableAssets,
	availableTimeframes,
	accountCount,
}: AnalyticsContentProps) => {
	const t = useTranslations("analytics")
	const tComparison = useTranslations("accountComparison")
	const [isPending, startTransition] = useTransition()
	const { isPremium } = useFeatureAccess()
	const showComparisonLink = isPremium && (accountCount ?? 0) >= 2

	useRegisterPageGuide(analyticsGuide)

	// Read all filter state from URL params
	const { filters, groupBy, expectancyMode, setGroupBy } = useAnalyticsFilters()

	const dashboard = initialDashboard ?? EMPTY_DASHBOARD

	const [performanceData, setPerformanceData] = useState<PerformanceByGroup[]>(
		dashboard.performance
	)
	const [tagStats, setTagStats] = useState<TagStats[]>(initialTagStats)
	const [expectedValue, setExpectedValue] = useState<ExpectedValueData | null>(
		dashboard.expectedValue
	)
	const [rDistribution, setRDistribution] = useState<RDistributionBucket[]>(
		dashboard.rDistribution
	)
	const [equityCurve, setEquityCurve] = useState<EquityPoint[]>(
		dashboard.equityCurve
	)
	const [hourlyPerformance, setHourlyPerformance] = useState<
		HourlyPerformance[]
	>(dashboard.hourlyPerformance)
	const [dayOfWeekPerformance, setDayOfWeekPerformance] = useState<
		DayOfWeekPerformance[]
	>(dashboard.dayOfWeekPerformance)
	const [timeHeatmap, setTimeHeatmap] = useState<TimeHeatmapCell[]>(
		dashboard.timeHeatmap
	)
	const [sessionPerformance, setSessionPerformance] = useState<
		SessionPerformance[]
	>(dashboard.sessionPerformance)
	const [sessionAssetPerformance, setSessionAssetPerformance] = useState<
		SessionAssetPerformance[]
	>(dashboard.sessionAssetPerformance)
	const [holdingPeriodAnalysis, setHoldingPeriodAnalysis] = useState<
		HoldingPeriodBucket[]
	>(dashboard.holdingPeriodAnalysis)

	// Track account identity — clear cache only on account switch, not on every SSR re-render
	const accountKey = useMemo(() => availableAssets.join(","), [availableAssets])
	const lastAccountKey = useRef(accountKey)

	// Applies dashboard + tag data to all state variables — stable via useCallback so it's safe in deps arrays
	const applyDashboard = useCallback(
		(d: AnalyticsDashboardData, tags: TagStats[]) => {
			setPerformanceData(d.performance)
			setExpectedValue(d.expectedValue)
			setRDistribution(d.rDistribution)
			setEquityCurve(d.equityCurve)
			setHourlyPerformance(d.hourlyPerformance)
			setDayOfWeekPerformance(d.dayOfWeekPerformance)
			setTimeHeatmap(d.timeHeatmap)
			setSessionPerformance(d.sessionPerformance)
			setSessionAssetPerformance(d.sessionAssetPerformance)
			setHoldingPeriodAnalysis(d.holdingPeriodAnalysis)
			setTagStats(tags)
		},
		[]
	)

	// Reset analytics state when initial props change (SSR re-render)
	useEffect(() => {
		const d = initialDashboard ?? EMPTY_DASHBOARD
		applyDashboard(d, initialTagStats)

		// Only clear module cache on account switch (not filter/URL changes which also trigger SSR)
		if (lastAccountKey.current !== accountKey) {
			lastAccountKey.current = accountKey
			clearAnalyticsCache()
		}
	}, [initialDashboard, initialTagStats, accountKey, applyDashboard])

	// Stable key for current filters — drives refetch when URL params change
	const filterKey = toFilterKey(filters, groupBy)

	// Refetch data when URL params change (filterKey changes)
	// On first render with no URL filters, filterKey matches initial props, so we skip.
	const [lastFetchedKey, setLastFetchedKey] = useState(filterKey)

	useEffect(() => {
		if (filterKey === lastFetchedKey) {
			return
		}

		setLastFetchedKey(filterKey)

		// Check module-level cache first — persists across navigations
		const cached = getAnalyticsCacheEntry(filterKey)
		if (cached) {
			applyDashboard(cached.dashboard, cached.tags)
			return
		}

		startTransition(async () => {
			const tradeFilters = toTradeFilters(filters, groupBy)

			const [dashResult, tagResult] = await Promise.all([
				getAnalyticsDashboard(tradeFilters),
				getTagStats(tradeFilters),
			])

			const dashData =
				dashResult.status === "success" && dashResult.data
					? dashResult.data
					: null
			const tagData =
				tagResult.status === "success" ? (tagResult.data ?? []) : tagStats

			if (dashData) {
				// Store in module cache — persists across navigations
				setAnalyticsCacheEntry(filterKey, dashData, tagData)
				applyDashboard(dashData, tagData)
			}
		})
		// filterKey is the stable serialized representation of all filter state.
		// When it changes, filters/groupBy have changed — re-fetch is correct.
		// applyDashboard is stable (useCallback with no deps).
		// tagStats is intentionally excluded: we only want stale fallback in the rare cache-miss path,
		// not re-fetch every time tagStats changes as a side-effect of a fetch.
	}, [filterKey, applyDashboard])

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Compare Accounts Link (admin + 2+ accounts) */}
			{showComparisonLink && (
				<div className="flex justify-end">
					<Link
						href="/analytics/account-comparison"
						className="text-acc-100 hover:text-acc-100/80 gap-s-200 text-small focus-visible:ring-acc-100 flex items-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						aria-label={tComparison("title")}
					>
						<GitCompareArrows className="h-4 w-4" />
						{tComparison("title")}
					</Link>
				</div>
			)}

			{/* Filter Panel (includes ExpectancyModeToggle) */}
			<FilterPanel
				availableAssets={availableAssets}
				availableTimeframes={availableTimeframes}
			/>

			{/* Loading Indicator */}
			{isPending && (
				<LoadingSpinner size="sm" label={t("updating")} className="py-s-200" />
			)}

			{/* Variable Comparison - Full Width */}
			<VariableComparison
				data={performanceData}
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
			<div className="border-bg-300 border-t" />
			<div id="analytics-time-section">
				<h2 className="mb-s-300 sm:mb-m-400 text-body sm:text-h3 text-txt-100 font-semibold">
					{t("time.title")}
				</h2>

				{/* Heatmap + Session: stacked on small/medium, side-by-side on xl+ */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 xl:grid-cols-2">
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
				<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600 gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 md:grid-cols-2">
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

				{/* Holding Period Analysis - Full Width */}
				<div className="mt-m-400 sm:mt-m-500 lg:mt-m-600">
					<HoldingPeriodChart
						data={holdingPeriodAnalysis}
						expectancyMode={expectancyMode}
					/>
				</div>
			</div>
		</div>
	)
}

export { AnalyticsContent }
