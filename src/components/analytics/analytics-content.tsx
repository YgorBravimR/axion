"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
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
import { AccountComparisonContent } from "@/components/account-comparison"
import type { AccountOption } from "@/components/account-comparison/account-selector"
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
	accounts: AccountOption[]
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
	accounts,
}: AnalyticsContentProps) => {
	const t = useTranslations("analytics")
	const [isPending, setIsPending] = useState(false)
	const { isPremium } = useFeatureAccess()
	const showAccountComparison = isPremium && accounts.length >= 2

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
	// Memoized to avoid expensive JSON.stringify on every render
	const filterKey = useMemo(
		() => toFilterKey(filters, groupBy),
		[filters, groupBy]
	)

	// Memoize trade filters to avoid recreating object on every effect run
	const tradeFilters = useMemo(
		() => toTradeFilters(filters, groupBy),
		[filters, groupBy]
	)

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

		setIsPending(true)
		const capturedKey = filterKey
		void (async () => {
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
				setAnalyticsCacheEntry(capturedKey, dashData, tagData)
				applyDashboard(dashData, tagData)
			}
			setIsPending(false)
		})()
		// filterKey is the stable serialized representation of all filter state.
		// When it changes, filters/groupBy have changed — re-fetch is correct.
		// applyDashboard is stable (useCallback with no deps).
		// tagStats is intentionally excluded: we only want stale fallback in the rare cache-miss path,
		// not re-fetch every time tagStats changes as a side-effect of a fetch.
		// lastFetchedKey is state from same hook, tracked implicitly via filterKey comparison.
	}, [filterKey, filters, groupBy, lastFetchedKey, tagStats, applyDashboard])

	return (
		<div className="space-y-l-800">
			{/* Filter Panel (includes ExpectancyModeToggle) */}
			<FilterPanel
				availableAssets={availableAssets}
				availableTimeframes={availableTimeframes}
			/>

			{/* Loading Indicator */}
			{isPending && (
				<LoadingSpinner size="sm" label={t("updating")} className="py-s-200" />
			)}

			{/* ═══════════════════════════════════════════════════════════════
			    ANCHOR: Cumulative P&L Chart (Promoted)
			    ═══════════════════════════════════════════════════════════════ */}
			<div
				id="analytics-anchor-equity"
				className="border-bg-300 bg-bg-200 p-m-500 sm:p-l-700 lg:p-l-800 rounded-lg border"
			>
				<h2 className="text-h2 sm:text-h1 text-txt-100 font-semibold">
					{t("cumulativePnLTitle")}
				</h2>
				<div className="mt-m-500 sm:mt-l-700">
					<CumulativePnlChart data={equityCurve} />
				</div>
			</div>

			{/* ═══════════════════════════════════════════════════════════════
			    BAND 1: EDGE — Is my edge real?
			    (Variable Comparison, Expected Value, R-Distribution)
			    ═══════════════════════════════════════════════════════════════ */}
			<section
				id="analytics-edge-band"
				className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
			>
				{/* Variable Comparison - Full Width */}
				<VariableComparison
					data={performanceData}
					groupBy={groupBy}
					onGroupByChange={setGroupBy}
				/>

				{/* Two Column Grid: EV + R-Distribution */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 lg:grid-cols-2">
					<ExpectedValue data={expectedValue} mode={expectancyMode} />
					<RDistribution data={rDistribution} />
				</div>
			</section>

			{/* ═══════════════════════════════════════════════════════════════
			    BAND 2: PATTERN — Where do I make/lose money?
			    (Tags, Heatmap, Session Performance, Session Asset Table,
			     Hourly Performance, Day-of-Week)
			    ═══════════════════════════════════════════════════════════════ */}
			<section
				id="analytics-pattern-band"
				className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
			>
				{/* Tag Cloud - Full Width */}
				<TagCloud data={tagStats} expectancyMode={expectancyMode} />

				{/* Heatmap + Session Performance: stacked on small/medium, side-by-side on xl+ */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 xl:grid-cols-2">
					<TimeHeatmap data={timeHeatmap} expectancyMode={expectancyMode} />
					<SessionPerformanceChart
						data={sessionPerformance}
						expectancyMode={expectancyMode}
					/>
				</div>

				{/* Session Asset Table - Full Width */}
				<SessionAssetTable
					data={sessionAssetPerformance}
					expectancyMode={expectancyMode}
				/>

				{/* Hourly Performance + Day-of-Week: Two Column Grid */}
				<div className="gap-m-400 sm:gap-m-500 lg:gap-m-600 grid grid-cols-1 md:grid-cols-2">
					<HourlyPerformanceChart
						data={hourlyPerformance}
						expectancyMode={expectancyMode}
					/>
					<DayOfWeekChart
						data={dayOfWeekPerformance}
						expectancyMode={expectancyMode}
					/>
				</div>
			</section>

			{/* ═══════════════════════════════════════════════════════════════
			    BAND 3: BEHAVIOR — How do I trade?
			    (Holding Period)
			    ═══════════════════════════════════════════════════════════════ */}
			<section
				id="analytics-behavior-band"
				className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600"
			>
				<HoldingPeriodChart
					data={holdingPeriodAnalysis}
					expectancyMode={expectancyMode}
				/>
			</section>

			{/* Account Comparison section — only when admin + 2+ accounts */}
			{showAccountComparison && (
				<>
					<div className="border-bg-300 border-t" />
					<AccountComparisonContent accounts={accounts} />
				</>
			)}
		</div>
	)
}

export { AnalyticsContent }
