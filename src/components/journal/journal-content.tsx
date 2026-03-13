"use client"

import { useState, useEffect, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Search } from "lucide-react"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import type { JournalPeriod, TradesByDay } from "@/types"
import { getTradesGroupedByDay, deleteTrade } from "@/app/actions/trades"
import {
	getStartOfDay,
	getEndOfDay,
	getMonthBoundaries,
	formatDateKey,
	BRT_OFFSET,
} from "@/lib/dates"
import { formatBrlWithSign } from "@/lib/formatting"
import { LoadingSpinner, EmptyState, ColoredValue } from "@/components/shared"
import { useToast } from "@/components/ui/toast"
import { PeriodFilter } from "./period-filter"
import { TradeDayGroup } from "./trade-day-group"

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
			const brtKey = formatDateKey(now)
			const [year, month, day] = brtKey.split("-").map(Number)
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

interface JournalContentProps {
	initialPeriod?: JournalPeriod
}

/**
 * Main content component for the trading journal page.
 * Handles period filtering, data fetching, and displays trades grouped by day.
 * Manages inline trade deletion with two-step confirmation.
 *
 * @param initialPeriod - The initial period to display (defaults to "week")
 */
export const JournalContent = ({
	initialPeriod = "week",
}: JournalContentProps) => {
	const router = useRouter()
	const t = useTranslations("journal")
	const tTrade = useTranslations("trade")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const effectiveDate = useEffectiveDate()
	const [isPending, startTransition] = useTransition()

	const [period, setPeriod] = useState<JournalPeriod>(initialPeriod)
	const [customDateRange, setCustomDateRange] = useState<
		{ from: Date; to: Date } | undefined
	>()
	const [tradesByDay, setTradesByDay] = useState<TradesByDay[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [totalTrades, setTotalTrades] = useState(0)

	// Delete state — lifted here so it applies across all day groups
	const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Fetch trades when period or custom range changes
	useEffect(() => {
		const fetchTrades = async () => {
			setIsLoading(true)
			const { from, to } = getDateRange(period, effectiveDate, customDateRange)

			const result = await getTradesGroupedByDay(from, to)

			if (result.status === "success" && result.data) {
				setTradesByDay(result.data)
				// Calculate total trades
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
			fetchTrades()
		})
	}, [period, customDateRange, effectiveDate])

	// Memoized handlers to prevent unnecessary re-renders in child components
	const handlePeriodChange = useCallback(
		(newPeriod: JournalPeriod, dateRange?: { from: Date; to: Date }) => {
			setPeriod(newPeriod)
			if (newPeriod === "custom" && dateRange) {
				setCustomDateRange(dateRange)
			}
		},
		[]
	)

	const handleTradeClick = useCallback(
		(tradeId: string) => {
			router.push(`/journal/${tradeId}`)
		},
		[router]
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
	const periodSummary = tradesByDay.reduce(
		(acc, day) => {
			acc.netPnl += day.summary.netPnl
			acc.wins += day.summary.wins
			acc.losses += day.summary.losses
			acc.breakevens += day.summary.breakevens
			return acc
		},
		{ netPnl: 0, wins: 0, losses: 0, breakevens: 0 }
	)
	const periodWinRate =
		periodSummary.wins + periodSummary.losses > 0
			? (periodSummary.wins / (periodSummary.wins + periodSummary.losses)) * 100
			: 0

	return (
		<div className="gap-s-300 sm:gap-m-400 flex flex-col">
			{/* Period Filter */}
			<div className="gap-s-300 sm:gap-m-400 flex flex-wrap items-start justify-between">
				<PeriodFilter
					value={period}
					onChange={handlePeriodChange}
					customDateRange={customDateRange}
				/>

				{/* Period Summary */}
				{!isLoading && totalTrades > 0 && (
					<div className="gap-s-300 sm:gap-m-400 text-small flex flex-wrap items-center">
						<span className="text-txt-300">
							{totalTrades} {t("tradesCount")}
						</span>
						<ColoredValue
							value={periodSummary.netPnl}
							showSign
							formatFn={(v) => formatBrlWithSign(v)}
							className="font-medium"
						/>
						<span className="text-txt-300">
							{periodSummary.wins}{tCommon("winAbbr")} {periodSummary.losses}{tCommon("lossAbbr")}
							{periodSummary.breakevens > 0
								? ` ${periodSummary.breakevens}${tCommon("breakevenAbbr")}`
								: ""}{" "}
							({periodWinRate.toFixed(0)}%)
						</span>
					</div>
				)}
			</div>

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
				<div className="space-y-s-300 sm:space-y-m-400">
					{tradesByDay.map((dayData) => (
						<TradeDayGroup
							key={dayData.date}
							dayData={dayData}
							onTradeClick={handleTradeClick}
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
