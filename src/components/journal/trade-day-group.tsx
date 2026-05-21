"use client"

import { useState, memo, useCallback } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import type { TradesByDay } from "@/types"
import { formatBrlWithSign } from "@/lib/formatting"
import { ColoredValue, WinRateBadge } from "@/components/shared"
import { TradeRow } from "./trade-row"
import { useRovingTabindex } from "./use-roving-tabindex"

interface TradeDayGroupProps {
	dayData: TradesByDay
	defaultExpanded?: boolean
	deletingTradeId: string | null
	onDeleteRequest: (_tradeId: string) => void
	onDeleteConfirm: (_tradeId: string) => void
	onDeleteCancel: () => void
	isDeleting: boolean
}

/**
 * Displays a collapsible group of trades for a single day.
 * Shows day summary (P&L, win rate) in the header and individual trades when expanded.
 */
export const TradeDayGroup = memo(
	({
		dayData,
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
		const { containerRef, focusedIndex } = useRovingTabindex()

		const { summary, trades, dateFormatted } = dayData

		const handleToggle = useCallback(() => {
			setIsExpanded((prev) => !prev)
		}, [])

		const formatBrl = useCallback((v: number) => formatBrlWithSign(v), [])

		return (
			<div
				ref={containerRef}
				className="border-bg-300 bg-bg-200 overflow-hidden rounded-lg border"
				role="listbox"
				aria-label={t("tradeDayGroupAriaLabel", {
					date: dateFormatted,
					count: summary.totalTrades,
					pnl: formatBrlWithSign(summary.netPnl),
				})}
			>
				{/* Header - Collapsible */}
				<button
					type="button"
					className="gap-s-300 border-bg-300 bg-bg-100 px-s-300 py-s-200 hover:bg-bg-200 focus-visible:ring-acc-100 flex w-full cursor-pointer items-center border-b text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
					onClick={handleToggle}
					aria-expanded={isExpanded}
				>
					{/* Expand/Collapse Icon */}
					{isExpanded ? (
						<ChevronDown
							className="text-txt-300 h-4 w-4 shrink-0"
							aria-hidden="true"
						/>
					) : (
						<ChevronRight
							className="text-txt-300 h-4 w-4 shrink-0"
							aria-hidden="true"
						/>
					)}

					{/* Date */}
					<span
						className="text-small text-txt-100 flex-1 font-medium"
						aria-hidden="true"
					>
						{dateFormatted}
					</span>

					{/* Summary Stats — visual only; aria-label on the button restates them */}
					<div
						className="gap-s-200 sm:gap-m-400 flex flex-wrap items-center"
						aria-hidden="true"
					>
						<ColoredValue
							value={summary.netPnl}
							showSign
							size="sm"
							formatFn={formatBrl}
							className="font-semibold"
						/>

						<span className="text-tiny text-txt-300 hidden sm:inline">
							{summary.wins}
							{tCommon("winAbbr")} {summary.losses}
							{tCommon("lossAbbr")}
							{summary.breakevens > 0
								? ` ${summary.breakevens}${tCommon("breakevenAbbr")}`
								: ""}
						</span>

						<WinRateBadge winRate={summary.winRate} size="sm" />
					</div>
				</button>

				{/* Trade Rows */}
				{isExpanded && (
					<div className="divide-bg-300 divide-y">
						{trades.length > 0 ? (
							trades.map((trade, index) => (
								<div key={trade.id} className="group/row">
									<TradeRow
										trade={trade}
										deletingTradeId={deletingTradeId}
										onDeleteRequest={onDeleteRequest}
										onDeleteConfirm={onDeleteConfirm}
										onDeleteCancel={onDeleteCancel}
										isDeleting={isDeleting}
										tabIndex={index === focusedIndex ? 0 : -1}
									/>
								</div>
							))
						) : (
							<div className="text-txt-300 flex h-[80px] items-center justify-center md:h-[60px]">
								{t("noTrades")}
							</div>
						)}
					</div>
				)}
			</div>
		)
	}
)

TradeDayGroup.displayName = "TradeDayGroup"
