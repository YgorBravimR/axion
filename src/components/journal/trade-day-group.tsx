"use client"

import { useState, memo, useCallback, type KeyboardEvent } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import type { TradesByDay } from "@/types"
import { formatBrlWithSign } from "@/lib/formatting"
import { ColoredValue, WinRateBadge } from "@/components/shared"
import { TradeRow } from "./trade-row"

interface TradeDayGroupProps {
	dayData: TradesByDay
	onTradeClick?: (tradeId: string) => void
	defaultExpanded?: boolean
	deletingTradeId: string | null
	onDeleteRequest: (tradeId: string) => void
	onDeleteConfirm: (tradeId: string) => void
	onDeleteCancel: () => void
	isDeleting: boolean
}

/**
 * Displays a collapsible group of trades for a single day.
 * Shows day summary (P&L, win rate) in the header and individual trades when expanded.
 *
 * @param dayData - Trade data grouped by day including summary and individual trades
 * @param onTradeClick - Optional callback when a trade row is clicked
 * @param defaultExpanded - Whether the group should be expanded by default
 * @param deletingTradeId - ID of the trade in delete-confirmation state, or null
 * @param onDeleteRequest - Callback to show delete confirmation for a trade
 * @param onDeleteConfirm - Callback to confirm deletion
 * @param onDeleteCancel - Callback to cancel deletion
 * @param isDeleting - Whether a delete action is in flight
 */
export const TradeDayGroup = memo(({
	dayData,
	onTradeClick,
	defaultExpanded = true,
	deletingTradeId,
	onDeleteRequest,
	onDeleteConfirm,
	onDeleteCancel,
	isDeleting,
}: TradeDayGroupProps) => {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)
	const t = useTranslations("journal")
	const tCommon = useTranslations("common")

	const { summary, trades, dateFormatted } = dayData

	const handleToggle = useCallback(() => {
		setIsExpanded((prev) => !prev)
	}, [])

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault()
			setIsExpanded((prev) => !prev)
		}
	}, [])

	return (
		<div className="border-bg-300 bg-bg-200 overflow-hidden rounded-lg border">
			{/* Header - Collapsible */}
			<div
				className="gap-s-300 border-bg-300 bg-bg-100 px-s-300 py-s-200 hover:bg-bg-200 flex cursor-pointer items-center border-b transition-colors"
				onClick={handleToggle}
				onKeyDown={handleKeyDown}
				tabIndex={0}
				role="button"
				aria-expanded={isExpanded}
				aria-label={t("tradeDayGroupAriaLabel", { date: dateFormatted, count: summary.totalTrades, pnl: formatBrlWithSign(summary.netPnl) })}
			>
				{/* Expand/Collapse Icon */}
				{isExpanded ? (
					<ChevronDown className="text-txt-300 h-4 w-4 shrink-0" />
				) : (
					<ChevronRight className="text-txt-300 h-4 w-4 shrink-0" />
				)}

				{/* Date */}
				<span className="text-small text-txt-100 flex-1 font-medium">
					{dateFormatted}
				</span>

				{/* Summary Stats */}
				<div className="gap-s-200 sm:gap-m-400 flex flex-wrap items-center">
					{/* P&L */}
					<ColoredValue
						value={summary.netPnl}
						showSign
						size="sm"
						formatFn={(v) => formatBrlWithSign(v)}
						className="font-semibold"
					/>

					{/* Win/Loss/Breakeven */}
					<span className="text-tiny text-txt-300 hidden sm:inline">
						{summary.wins}{tCommon("winAbbr")} {summary.losses}{tCommon("lossAbbr")}{summary.breakevens > 0 ? ` ${summary.breakevens}${tCommon("breakevenAbbr")}` : ""}
					</span>

					{/* Win Rate */}
					<WinRateBadge winRate={summary.winRate} size="sm" />
				</div>
			</div>

			{/* Trade Rows */}
			{isExpanded && (
				<div className="divide-bg-300 divide-y">
					{trades.length > 0 ? (
						trades.map((trade) => (
							<div key={trade.id} className="group/row">
								<TradeRow
									trade={trade}
									onTradeClick={onTradeClick}
									deletingTradeId={deletingTradeId}
									onDeleteRequest={onDeleteRequest}
									onDeleteConfirm={onDeleteConfirm}
									onDeleteCancel={onDeleteCancel}
									isDeleting={isDeleting}
								/>
							</div>
						))
					) : (
						<div className="text-txt-300 flex h-[60px] items-center justify-center">
							{t("noTrades")}
						</div>
					)}
				</div>
			)}
		</div>
	)
})

TradeDayGroup.displayName = "TradeDayGroup"
