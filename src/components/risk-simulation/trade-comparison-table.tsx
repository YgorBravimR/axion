"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { translateRiskReason } from "@/lib/risk-reason-i18n"
import { useUrlParams } from "@/hooks/use-url-params"
import type {
	SimulatedTrade,
	SimulatedTradeStatus,
} from "@/types/risk-simulation"

interface TradeComparisonTableProps {
	trades: SimulatedTrade[]
}

const PAGE_SIZE = 25

const statusDotColors: Record<SimulatedTradeStatus, string> = {
	executed: "bg-trade-buy",
	skipped_no_sl: "bg-txt-300",
	skipped_daily_limit: "bg-trade-sell",
	skipped_daily_target: "bg-acc-100",
	skipped_max_trades: "bg-txt-300",
	skipped_consecutive_loss: "bg-trade-sell",
	skipped_monthly_limit: "bg-trade-sell",
	skipped_weekly_limit: "bg-trade-sell",
	skipped_recovery_complete: "bg-acc-200",
	skipped_gain_stop: "bg-acc-100",
}

const TradeComparisonTable = ({ trades }: TradeComparisonTableProps) => {
	const t = useTranslations("riskSimulation.table")
	const tReasons = useTranslations("riskSimulation")
	const urlParams = useUrlParams()

	// URL param is 1-based for user-friendliness, internal logic is 0-based
	const page = urlParams.getNumber("page", 1) - 1
	const setPage = (newPage: number) => {
		urlParams.set({ page: newPage + 1 })
	}

	const totalPages = Math.ceil(trades.length / PAGE_SIZE)
	const paginatedTrades = useMemo(
		() => trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
		[trades, page]
	)

	const activeStatuses = useMemo(
		() => [...new Set(trades.map((trade) => trade.status))],
		[trades]
	)

	const formatCurrency = (cents: number | null): string => {
		if (cents === null) return "—"
		const value = fromCents(cents)
		const sign = value >= 0 ? "+" : ""
		return `${sign}R$${Math.abs(value).toFixed(2)}`
	}

	const formatR = (r: number | null): string => {
		if (r === null) return "—"
		return `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`
	}

	return (
		<div className="border-bg-300 overflow-hidden rounded-lg border">
			{/* Status color legend */}
			<div className="border-bg-300 gap-x-s-300 gap-y-s-100 flex flex-wrap border-b px-3 py-2">
				{activeStatuses.map((status) => (
					<div key={status} className="gap-s-100 flex items-center">
						<span
							className={cn(
								"h-2.5 w-2.5 shrink-0 rounded-full",
								statusDotColors[status]
							)}
						/>
						<span className="text-tiny text-txt-300">
							{t(`statuses.${status}`)}
						</span>
					</div>
				))}
			</div>
			<div className="overflow-x-auto">
				<table className="w-full" role="table" aria-label={t("title")}>
					<thead>
						<tr className="bg-bg-200 border-bg-300 border-b">
							<th className="text-tiny text-txt-300 px-3 py-2 text-left font-medium whitespace-nowrap">
								{t("day")}
							</th>
							<th className="text-tiny text-txt-300 px-3 py-2 text-left font-medium whitespace-nowrap">
								{t("trade")}
							</th>
							<th className="text-tiny text-txt-300 px-3 py-2 text-left font-medium whitespace-nowrap">
								{t("asset")}
							</th>
							<th className="text-tiny text-txt-300 px-3 py-2 text-left font-medium whitespace-nowrap">
								{t("status")}
							</th>
							<th className="text-tiny text-txt-300 hidden px-3 py-2 text-right font-medium whitespace-nowrap md:table-cell">
								{t("risk")}
							</th>
							<th className="text-tiny text-txt-300 hidden px-3 py-2 text-right font-medium whitespace-nowrap md:table-cell">
								{t("originalPnl")}
							</th>
							<th className="text-tiny text-txt-300 px-3 py-2 text-right font-medium whitespace-nowrap">
								{t("simulatedPnl")}
							</th>
							<th className="text-tiny text-txt-300 hidden px-3 py-2 text-right font-medium whitespace-nowrap lg:table-cell">
								{t("simR")}
							</th>
							<th className="text-tiny text-txt-300 hidden px-3 py-2 text-left font-medium whitespace-nowrap lg:table-cell">
								{t("riskReason")}
							</th>
						</tr>
					</thead>
					<tbody>
						{paginatedTrades.map((trade, idx) => {
							const isSkipped = trade.status !== "executed"
							const rowIndex = page * PAGE_SIZE + idx

							return (
								<tr
									key={`${trade.tradeId}-${rowIndex}`}
									className={cn(
										"border-bg-300 border-b transition-colors",
										isSkipped ? "opacity-60" : "hover:bg-bg-stripe"
									)}
								>
									<td className="text-tiny text-txt-300 px-3 py-2">
										{trade.dayKey}
									</td>
									<td className="text-small text-txt-100 px-3 py-2 font-medium">
										T{trade.dayTradeNumber}
									</td>
									<td className="text-tiny text-txt-200 px-3 py-2">
										{trade.asset}
									</td>
									<td className="px-3 py-2">
										<span
											className={cn(
												"block h-2.5 w-2.5 rounded-full",
												statusDotColors[trade.status]
											)}
											aria-label={t(`statuses.${trade.status}`)}
										/>
									</td>
									<td className="text-tiny text-txt-200 hidden px-3 py-2 text-right whitespace-nowrap md:table-cell">
										{formatCurrency(trade.riskAmountCents)}
									</td>
									<td className="hidden px-3 py-2 text-right md:table-cell">
										<span
											className={cn(
												"text-small font-medium whitespace-nowrap",
												trade.originalPnlCents > 0
													? "text-trade-buy"
													: trade.originalPnlCents < 0
														? "text-trade-sell"
														: "text-txt-300"
											)}
										>
											{formatCurrency(trade.originalPnlCents)}
										</span>
									</td>
									<td className="px-3 py-2 text-right">
										<span
											className={cn(
												"text-small font-medium whitespace-nowrap",
												(trade.simulatedPnlCents ?? 0) > 0
													? "text-trade-buy"
													: (trade.simulatedPnlCents ?? 0) < 0
														? "text-trade-sell"
														: "text-txt-300"
											)}
										>
											{formatCurrency(trade.simulatedPnlCents)}
										</span>
									</td>
									<td className="text-tiny text-txt-200 hidden px-3 py-2 text-right whitespace-nowrap lg:table-cell">
										{formatR(trade.simulatedRMultiple)}
									</td>
									<td className="text-tiny text-txt-300 hidden max-w-50 truncate px-3 py-2 lg:table-cell">
										{translateRiskReason(tReasons, trade.riskReason)}
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="bg-bg-200 border-bg-300 flex items-center justify-between border-t px-4 py-2">
					<span className="text-tiny text-txt-300">
						{t("page", { current: page + 1, total: totalPages })}
					</span>
					<div className="flex gap-1">
						<Button
							id="comparison-prev-page"
							type="button"
							variant="ghost"
							size="icon"
							onClick={() => setPage(Math.max(0, page - 1))}
							disabled={page === 0}
							className="text-txt-200"
							aria-label={t("prevPage")}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<Button
							id="comparison-next-page"
							type="button"
							variant="ghost"
							size="icon"
							onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
							disabled={page >= totalPages - 1}
							className="text-txt-200"
							aria-label={t("nextPage")}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export { TradeComparisonTable }
