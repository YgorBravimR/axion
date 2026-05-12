"use client"

import {
	useState,
	useEffect,
	useTransition,
	useCallback,
	useMemo,
	useRef,
} from "react"
import { useTranslations } from "next-intl"
import { Search } from "lucide-react"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { useUrlParams } from "@/hooks/use-url-params"
import { parseDateParam, serializeDateParam } from "@/lib/url-params"
import type { JournalPeriod, TradesByDay } from "@/types"
import { getTradesGroupedByDay, deleteTrade } from "@/app/actions/trades"
import {
	getStartOfDay,
	getEndOfDay,
	getMonthBoundaries,
	formatDateKey,
	parseDateKey,
	BRT_OFFSET,
} from "@/lib/dates"
import { formatBrlWithSign } from "@/lib/formatting"
import { LoadingSpinner, EmptyState, ColoredValue } from "@/components/shared"
import { useToast } from "@/components/ui/toast"
import { PeriodFilter } from "./period-filter"
import { SmartSearch } from "./smart-search"
import { TradeDayGroup } from "./trade-day-group"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { journalGuide } from "@/components/ui/page-guide/guide-configs/journal"

/**
 * Calculates the date range based on the selected period.
 * All boundaries are computed in BRT (America/Sao_Paulo) so that day/week/month
 * edges align with the B3 trading day regardless of the user's browser timezone.
 *
 * @param period - The journal period type (day, week, month, custom)
 * @param now - The effective "today" date (supports replay accounts)
 * @param customRange - Optional custom date range when period is "custom"
 * @returns Object containing from and to Date objects (UTC instants representing BRT boundaries)
 */
const getDateRange = (
	period: JournalPeriod,
	now: Date,
	customRange?: { from: Date; to: Date }
): { from: Date; to: Date } => {
	switch (period) {
		case "day":
			return { from: getStartOfDay(now), to: getEndOfDay(now) }
		case "week": {
			// Get BRT date components and compute Monday-based week
			const { year, month, day } = parseDateKey(formatDateKey(now))
			const tempDate = new Date(year, month - 1, day)
			const dayOfWeek = tempDate.getDay()
			const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
			const monday = new Date(year, month - 1, day + diffToMonday)
			const sunday = new Date(year, month - 1, day + diffToMonday + 6)
			const pad = (n: number) => String(n).padStart(2, "0")
			const mondayKey = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
			const sundayKey = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`
			return {
				from: new Date(`${mondayKey}T00:00:00${BRT_OFFSET}`),
				to: new Date(`${sundayKey}T23:59:59.999${BRT_OFFSET}`),
			}
		}
		case "month": {
			const { start, end } = getMonthBoundaries(now)
			return { from: start, to: end }
		}
		case "all": {
			const from = new Date(2000, 0, 1)
			const to = new Date(2099, 11, 31, 23, 59, 59, 999)
			return { from, to }
		}
		case "custom": {
			if (customRange) {
				return {
					from: getStartOfDay(customRange.from),
					to: getEndOfDay(customRange.to),
				}
			}
			const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
			return { from: getStartOfDay(from), to: getEndOfDay(now) }
		}
		default:
			return { from: getStartOfDay(now), to: getEndOfDay(now) }
	}
}

const VALID_PERIODS: JournalPeriod[] = ["day", "week", "month", "all", "custom"]

/**
 * Main content component for the trading journal page.
 * Handles period filtering, data fetching, and displays trades grouped by day.
 * Manages inline trade deletion with two-step confirmation.
 * Period and custom date range are persisted in URL params.
 */
const JournalContent = () => {
	useRegisterPageGuide(journalGuide)
	const t = useTranslations("journal")
	const tTrade = useTranslations("trade")
	const { showToast } = useToast()
	const effectiveDate = useEffectiveDate()
	const [, startTransition] = useTransition()
	const urlParams = useUrlParams()
	const latestRequestRef = useRef(0)

	// Read period from URL, default to "week"
	const periodParam = urlParams.get("period") ?? "week"
	const period: JournalPeriod = VALID_PERIODS.includes(
		periodParam as JournalPeriod
	)
		? (periodParam as JournalPeriod)
		: "week"

	// Read custom date range from URL (only relevant when period=custom)
	const customFrom =
		period === "custom" ? parseDateParam(urlParams.get("from")) : null
	const customTo =
		period === "custom" ? parseDateParam(urlParams.get("to")) : null
	const customDateRange =
		customFrom && customTo ? { from: customFrom, to: customTo } : undefined

	const [tradesByDay, setTradesByDay] = useState<TradesByDay[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [totalTrades, setTotalTrades] = useState(0)

	// Extended filters (smart search) — read from URL params for persistence
	const outcomesParam = urlParams.getArray("outcomes")
	const directionsParam = urlParams.getArray("directions")
	const assetsParam = urlParams.getArray("assets")
	const ratingParam = urlParams.getArray("rating")
	const followedPlanParam = urlParams.get("followedPlan")
	const hourFromParam = urlParams.get("hourFrom")
	const hourToParam = urlParams.get("hourTo")
	const pnlMinParam = urlParams.get("pnlMin")
	const pnlMaxParam = urlParams.get("pnlMax")
	const quickFilterParam = urlParams.get("qf")

	const extendedFilters = useMemo(() => {
		const filters: Record<string, string | string[]> = {}
		if (outcomesParam.length > 0) {
			filters.outcomes = outcomesParam
		}
		if (directionsParam.length > 0) {
			filters.directions = directionsParam
		}
		if (assetsParam.length > 0) {
			filters.assets = assetsParam
		}
		if (ratingParam.length > 0) {
			filters.rating = ratingParam
		}
		if (followedPlanParam) {
			filters.followedPlan = followedPlanParam
		}
		if (hourFromParam) {
			filters.hourFrom = hourFromParam
		}
		if (hourToParam) {
			filters.hourTo = hourToParam
		}
		if (pnlMinParam) {
			filters.pnlMin = pnlMinParam
		}
		if (pnlMaxParam) {
			filters.pnlMax = pnlMaxParam
		}
		if (quickFilterParam) {
			filters._qf = quickFilterParam
		}
		return filters
	}, [
		outcomesParam.join(","),
		directionsParam.join(","),
		assetsParam.join(","),
		ratingParam.join(","),
		followedPlanParam,
		hourFromParam,
		hourToParam,
		pnlMinParam,
		pnlMaxParam,
		quickFilterParam,
	])
	const extendedFilterCount = Object.keys(extendedFilters).filter(
		(k) => k !== "_qf"
	).length

	const handleFiltersChange = useCallback(
		(filters: Record<string, string | string[]>) => {
			// Write to URL params
			const updates: Record<string, string | string[] | null> = {
				outcomes: (filters.outcomes as string[]) ?? null,
				directions: (filters.directions as string[]) ?? null,
				assets: (filters.assets as string[]) ?? null,
				rating: (filters.rating as string[]) ?? null,
				followedPlan: (filters.followedPlan as string) ?? null,
				hourFrom: (filters.hourFrom as string) ?? null,
				hourTo: (filters.hourTo as string) ?? null,
				pnlMin: (filters.pnlMin as string) ?? null,
				pnlMax: (filters.pnlMax as string) ?? null,
			}
			urlParams.set(updates)
		},
		[urlParams]
	)

	const handleFiltersClear = useCallback(() => {
		urlParams.set({
			outcomes: null,
			directions: null,
			assets: null,
			rating: null,
			followedPlan: null,
			hourFrom: null,
			hourTo: null,
			pnlMin: null,
			pnlMax: null,
			qf: null,
		})
	}, [urlParams])

	// Delete state — lifted here so it applies across all day groups
	const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Fetch trades when period or custom range changes.
	// Uses a request-id sentinel so a slow response from an outdated period (e.g.
	// "all" fired right before user switched to "day") cannot overwrite the
	// current period's data.
	useEffect(() => {
		const fetchTrades = async () => {
			const requestId = ++latestRequestRef.current
			setIsLoading(true)
			const { from, to } = getDateRange(period, effectiveDate, customDateRange)

			// Build extended filter params for the server action
			const ext =
				Object.keys(extendedFilters).length > 0
					? {
							rating: extendedFilters.rating as
								| Array<"A" | "B" | "C" | "D" | "F">
								| undefined,
							outcomes: extendedFilters.outcomes as
								| Array<"win" | "loss" | "breakeven">
								| undefined,
							directions: extendedFilters.directions as
								| Array<"long" | "short">
								| undefined,
							assets: extendedFilters.assets as string[] | undefined,
							followedPlan:
								extendedFilters.followedPlan === "true"
									? true
									: extendedFilters.followedPlan === "false"
										? false
										: undefined,
							hourFrom: extendedFilters.hourFrom
								? parseInt(extendedFilters.hourFrom as string, 10)
								: undefined,
							hourTo: extendedFilters.hourTo
								? parseInt(extendedFilters.hourTo as string, 10)
								: undefined,
							pnlMin: extendedFilters.pnlMin
								? parseFloat(extendedFilters.pnlMin as string)
								: undefined,
							pnlMax: extendedFilters.pnlMax
								? parseFloat(extendedFilters.pnlMax as string)
								: undefined,
						}
					: undefined

			const result = await getTradesGroupedByDay(from, to, ext)

			if (requestId !== latestRequestRef.current) {
				return
			}

			if (result.status === "success" && result.data) {
				setTradesByDay(result.data)
				const total = result.data.reduce(
					(sum, day) => sum + day.trades.length,
					0
				)
				setTotalTrades(total)
			} else {
				setTradesByDay([])
				setTotalTrades(0)
			}

			setIsLoading(false)
		}

		startTransition(() => {
			void fetchTrades()
		})
	}, [
		period,
		customDateRange?.from?.getTime(),
		customDateRange?.to?.getTime(),
		effectiveDate,
		extendedFilters,
	])

	// Memoized handlers to prevent unnecessary re-renders in child components
	const handlePeriodChange = useCallback(
		(newPeriod: JournalPeriod, dateRange?: { from: Date; to: Date }) => {
			if (newPeriod === "custom" && dateRange) {
				urlParams.set({
					period: "custom",
					from: serializeDateParam(dateRange.from),
					to: serializeDateParam(dateRange.to),
				})
			} else {
				urlParams.set({
					period: newPeriod === "week" ? null : newPeriod,
					from: null,
					to: null,
				})
			}
		},
		[urlParams]
	)

	// Delete handlers
	const handleDeleteRequest = useCallback((tradeId: string) => {
		setDeletingTradeId(tradeId)
	}, [])

	const handleDeleteCancel = useCallback(() => {
		setDeletingTradeId(null)
	}, [])

	const handleDeleteConfirm = useCallback(
		async (tradeId: string) => {
			setIsDeleting(true)
			const result = await deleteTrade(tradeId)

			if (result.status === "success") {
				showToast("success", tTrade("deleteSuccess"))
				// Remove trade from local state for instant UI feedback
				setTradesByDay((prev) =>
					prev
						.map((day) => ({
							...day,
							trades: day.trades.filter((trade) => trade.id !== tradeId),
							summary: {
								...day.summary,
								totalTrades:
									day.summary.totalTrades -
									(day.trades.some((trade) => trade.id === tradeId) ? 1 : 0),
							},
						}))
						.filter((day) => day.trades.length > 0)
				)
				setTotalTrades((prev) => prev - 1)
			} else {
				showToast("error", result.message || tTrade("deleteError"))
			}

			setIsDeleting(false)
			setDeletingTradeId(null)
		},
		[showToast, tTrade]
	)

	// Calculate period summary
	const periodSummary = useMemo(
		() =>
			tradesByDay.reduce(
				(acc, day) => {
					acc.netPnl += day.summary.netPnl
					acc.wins += day.summary.wins
					acc.losses += day.summary.losses
					acc.breakevens += day.summary.breakevens
					return acc
				},
				{ netPnl: 0, wins: 0, losses: 0, breakevens: 0 }
			),
		[tradesByDay]
	)
	const periodWinRate = useMemo(
		() =>
			periodSummary.wins + periodSummary.losses > 0
				? (periodSummary.wins / (periodSummary.wins + periodSummary.losses)) *
					100
				: 0,
		[periodSummary]
	)

	const availableAssets = useMemo(
		() => [
			...new Set(
				tradesByDay.flatMap((d) => d.trades.map((trade) => trade.asset))
			),
		],
		[tradesByDay]
	)

	const formatBrl = useCallback((v: number) => formatBrlWithSign(v), [])

	const handleQuickFilterChange = useCallback(
		(key: string | null) => {
			urlParams.set({ qf: key ?? null })
		},
		[urlParams]
	)

	return (
		<div className="gap-s-300 sm:gap-m-400 flex flex-col">
			{/* Period Filter */}
			<div
				id="journal-period-filter"
				className="gap-s-300 sm:gap-m-400 flex flex-wrap items-start justify-between"
			>
				<PeriodFilter
					value={period}
					onChange={handlePeriodChange}
					customDateRange={customDateRange}
				/>

				{/* Period Summary */}
				{!isLoading && totalTrades > 0 && (
					<div
						id="journal-period-summary"
						className="gap-s-300 sm:gap-m-400 text-small border-bg-300 pt-s-200 flex flex-wrap items-center border-t sm:border-t-0 sm:pt-0"
					>
						<span className="text-txt-300">
							{totalTrades} {t("tradesCount")}
						</span>
						<ColoredValue
							value={periodSummary.netPnl}
							showSign
							formatFn={formatBrl}
							className="font-medium"
						/>
						<span className="text-txt-300">
							{t("periodResultSummary", {
								wins: periodSummary.wins,
								losses: periodSummary.losses,
								breakevens: periodSummary.breakevens,
								rate: periodWinRate.toFixed(0),
							})}
						</span>
					</div>
				)}
			</div>

			{/* Smart Search */}
			<SmartSearch
				availableAssets={availableAssets}
				onFiltersChange={handleFiltersChange}
				onClear={handleFiltersClear}
				activeFilterCount={extendedFilterCount}
				activeQuickFilterKey={extendedFilters._qf as string | undefined}
				onQuickFilterChange={handleQuickFilterChange}
			/>

			{/* Loading State */}
			{isLoading && <LoadingSpinner size="md" className="h-50" />}

			{/* Empty State */}
			{!isLoading && tradesByDay.length === 0 && (
				<div className="border-bg-300 bg-bg-200 p-m-500 sm:p-m-600 lg:p-l-700 rounded-lg border">
					<EmptyState
						icon={Search}
						title={t("noTradesInPeriod")}
						description={t("tryDifferentPeriod")}
					/>
				</div>
			)}

			{/* Trade Groups by Day */}
			{!isLoading && tradesByDay.length > 0 && (
				<div
					id="journal-trade-groups"
					className="space-y-s-300 sm:space-y-m-400"
				>
					{tradesByDay.map((dayData) => (
						<TradeDayGroup
							key={dayData.date}
							dayData={dayData}
							deletingTradeId={deletingTradeId}
							onDeleteRequest={handleDeleteRequest}
							onDeleteConfirm={handleDeleteConfirm}
							onDeleteCancel={handleDeleteCancel}
							isDeleting={isDeleting}
						/>
					))}
				</div>
			)}
		</div>
	)
}

export { JournalContent }
