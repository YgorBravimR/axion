"use client"

import { memo, useCallback } from "react"
import { ChevronRight, Trash2, Loader2, Target, ShieldX, Minus } from "lucide-react"
import { useTranslations } from "next-intl"
import type { DayTradeCompact } from "@/types"
import { formatBrlWithSign } from "@/lib/formatting"
import { ColoredValue, DirectionBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TradeRowProps {
	trade: DayTradeCompact
	onTradeClick?: (tradeId: string) => void
	deletingTradeId: string | null
	onDeleteRequest: (tradeId: string) => void
	onDeleteConfirm: (tradeId: string) => void
	onDeleteCancel: () => void
	isDeleting: boolean
}

/**
 * Displays a single trade row with asset, direction, time, P&L, R multiple,
 * and an inline delete action with two-step confirmation.
 *
 * @param trade - The compact trade data to display
 * @param onTradeClick - Optional callback when the trade row is clicked
 * @param deletingTradeId - ID of the trade currently being confirmed/deleted, or null
 * @param onDeleteRequest - Callback to initiate delete confirmation for a trade
 * @param onDeleteConfirm - Callback to confirm deletion
 * @param onDeleteCancel - Callback to cancel deletion
 * @param isDeleting - Whether a delete server action is in progress
 */
export const TradeRow = memo(({
	trade,
	onTradeClick,
	deletingTradeId,
	onDeleteRequest,
	onDeleteConfirm,
	onDeleteCancel,
	isDeleting,
}: TradeRowProps) => {
	const t = useTranslations("trade")
	const tCommon = useTranslations("common")

	const isThisDeleting = deletingTradeId === trade.id
	const isAnyDeleting = deletingTradeId !== null
	const isDisabled = isAnyDeleting && !isThisDeleting

	const handleClick = useCallback(() => {
		if (isAnyDeleting) return
		onTradeClick?.(trade.id)
	}, [onTradeClick, trade.id, isAnyDeleting])

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (isAnyDeleting) return
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault()
			onTradeClick?.(trade.id)
		}
	}, [onTradeClick, trade.id, isAnyDeleting])

	const handleDeleteClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		onDeleteRequest(trade.id)
	}, [onDeleteRequest, trade.id])

	const handleConfirmClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		onDeleteConfirm(trade.id)
	}, [onDeleteConfirm, trade.id])

	const handleCancelClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		onDeleteCancel()
	}, [onDeleteCancel])

	return (
		<div
			className={cn(
				"gap-s-200 px-s-300 py-s-200 flex items-center transition-colors border-l-2 min-w-0",
				trade.outcome === "win" && "border-l-trade-buy",
				trade.outcome === "loss" && "border-l-trade-sell",
				trade.outcome === "breakeven" && "border-l-txt-300",
				!trade.outcome && "border-l-transparent",
				isThisDeleting && "bg-fb-error/8",
				isDisabled && "pointer-events-none opacity-40",
				!isAnyDeleting && onTradeClick && "hover:bg-bg-100 cursor-pointer"
			)}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			tabIndex={!isAnyDeleting && onTradeClick ? 0 : undefined}
			role={!isAnyDeleting && onTradeClick ? "button" : undefined}
			aria-label={t("tradeRowAriaLabel", { asset: trade.asset, direction: trade.direction, time: trade.time })}
			aria-disabled={isDisabled}
		>
			{/* Outcome Icon */}
			{trade.outcome === "win" && (
				<Target className="h-3.5 w-3.5 shrink-0 text-trade-buy" aria-label={t("outcome.takeProfitAriaLabel")} />
			)}
			{trade.outcome === "loss" && (
				<ShieldX className="h-3.5 w-3.5 shrink-0 text-trade-sell" aria-label={t("outcome.stopLossAriaLabel")} />
			)}
			{trade.outcome === "breakeven" && (
				<Minus className="h-3.5 w-3.5 shrink-0 text-txt-300" aria-label={t("outcome.breakevenAriaLabel")} />
			)}

			{/* Direction Icon */}
			<DirectionBadge
				direction={trade.direction}
				showIcon
				showLabel={false}
				size="sm"
				className="shrink-0 bg-transparent p-0"
			/>

			{/* Asset */}
			<span className="text-small text-txt-100 min-w-[70px] shrink-0 font-semibold">
				{trade.asset}
			</span>

			{/* Direction Badge */}
			<DirectionBadge
				direction={trade.direction}
				showIcon={false}
				showLabel
				size="sm"
				className="hidden shrink-0 sm:inline-flex"
			/>

			{/* Timeframe */}
			{trade.timeframeName && (
				<span className="bg-bg-300 px-s-100 text-caption text-txt-300 hidden shrink-0 rounded py-px md:inline">
					{trade.timeframeName}
				</span>
			)}

			{/* Time */}
			<span className="text-small text-txt-300 shrink-0">{trade.time}</span>

			{/* Strategy (truncated) */}
			{trade.strategyName && (
				<span className="text-small text-txt-300 hidden max-w-[120px] shrink-0 truncate lg:inline">
					{trade.strategyName}
				</span>
			)}

			{/* Spacer */}
			<div className="flex-1" />

			{/* Delete Confirmation */}
			{isThisDeleting && (
				<div className="flex items-center gap-s-200 shrink-0">
					<span className="text-small text-fb-error font-medium">
						{t("deleteConfirm")}
					</span>
					<Button
						id={`trade-row-delete-confirm-${trade.id}`}
						variant="destructive"
						size="sm"
						onClick={handleConfirmClick}
						disabled={isDeleting}
						className="h-7 px-s-300 text-caption"
					>
						{isDeleting ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							tCommon("yes")
						)}
					</Button>
					<Button
						id={`trade-row-delete-cancel-${trade.id}`}
						variant="outline"
						size="sm"
						onClick={handleCancelClick}
						disabled={isDeleting}
						className="h-7 px-s-300 text-caption"
					>
						{tCommon("no")}
					</Button>
				</div>
			)}

			{/* P&L */}
			{!isThisDeleting && (
				<ColoredValue
					value={trade.pnl}
					showSign
					size="sm"
					formatFn={(v) => formatBrlWithSign(v)}
					className="min-w-[90px] shrink-0 text-right"
				/>
			)}

			{/* R Multiple */}
			{!isThisDeleting && (
				trade.rMultiple !== null ? (
					<ColoredValue
						value={trade.rMultiple}
						type="r-multiple"
						showSign
						size="sm"
						className="min-w-[50px] shrink-0 text-right"
					/>
				) : (
					<span className="text-small min-w-[50px] shrink-0 text-right text-txt-300">
						-
					</span>
				)
			)}

			{/* Delete Button / Chevron */}
			{!isThisDeleting && (
				<>
					{!isAnyDeleting && (
						<button
							type="button"
							onClick={handleDeleteClick}
							className="text-txt-300 hover:text-fb-error hover:bg-fb-error/10 shrink-0 rounded-md p-1 opacity-0 transition-all group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fb-error"
							aria-label={t("deleteTrade")}
							tabIndex={0}
						>
							<Trash2 className="h-4 w-4" />
						</button>
					)}
					{onTradeClick && !isAnyDeleting && (
						<ChevronRight className="text-txt-300 h-4 w-4 shrink-0" />
					)}
				</>
			)}
		</div>
	)
})

TradeRow.displayName = "TradeRow"
