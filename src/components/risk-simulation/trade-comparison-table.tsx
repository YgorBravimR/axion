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
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

interface TradeComparisonTableProps {
	trades: SimulatedTrade[]
}

const PAGE_SIZE = 25

const formatCurrency = (cents: number | null): string => {
	if (cents === null) {
		return "—"
	}
	const value = fromCents(cents)
	const sign = value >= 0 ? "+" : ""
	return `${sign}R$${Math.abs(value).toFixed(2)}`
}

const formatR = (r: number | null): string => {
	if (r === null) {
		return "—"
	}
	return `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`
}

const statusDotColors: Record<SimulatedTradeStatus, string> = {
	executed: "bg-fb-success",
	skipped_no_sl: "bg-txt-300",
	skipped_daily_limit: "bg-fb-error",
	skipped_daily_target: "bg-warning",
	skipped_max_trades: "bg-txt-300",
	skipped_consecutive_loss: "bg-fb-error",
	skipped_monthly_limit: "bg-fb-error",
	skipped_weekly_limit: "bg-fb-error",
	skipped_recovery_complete: "bg-fb-success",
	skipped_gain_stop: "bg-warning",
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

	return (
		<div className="border-bg-300 overflow-hidden rounded-lg border">
			{/* Status color legend */}
			<div className="border-bg-300 gap-x-s-300 gap-y-s-100 px-s-300 py-s-200 flex flex-wrap border-b">
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
			<Table className="w-full" role="table" aria-label={t("title")}>
				<TableHeader>
					<TableRow className="bg-bg-200 border-bg-300 border-b">
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 text-left font-medium whitespace-nowrap">
							{t("day")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 text-left font-medium whitespace-nowrap">
							{t("trade")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 xs:table-cell hidden text-left font-medium whitespace-nowrap">
							{t("asset")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 text-left font-medium whitespace-nowrap">
							{t("status")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 hidden text-right font-medium whitespace-nowrap md:table-cell">
							{t("risk")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 hidden text-right font-medium whitespace-nowrap md:table-cell">
							{t("originalPnl")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 text-right font-medium whitespace-nowrap">
							{t("simulatedPnl")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 hidden text-right font-medium whitespace-nowrap lg:table-cell">
							{t("simR")}
						</TableHead>
						<TableHead className="text-tiny text-txt-300 px-s-300 py-s-200 hidden text-left font-medium whitespace-nowrap lg:table-cell">
							{t("riskReason")}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{paginatedTrades.map((trade, idx) => {
						const isSkipped = trade.status !== "executed"
						const rowIndex = page * PAGE_SIZE + idx

						return (
							<TableRow
								key={`${trade.tradeId}-${rowIndex}`}
								className={cn(
									"border-bg-300 border-b transition-colors",
									isSkipped ? "opacity-60" : "hover:bg-bg-stripe"
								)}
							>
								<TableCell className="text-tiny text-txt-300 px-s-300 py-s-200">
									{trade.dayKey}
								</TableCell>
								<TableCell className="text-small text-txt-100 px-s-300 py-s-200 font-medium">
									T{trade.dayTradeNumber}
								</TableCell>
								<TableCell className="text-tiny text-txt-200 px-s-300 py-s-200 xs:table-cell hidden">
									{trade.asset}
								</TableCell>
								<TableCell className="px-s-300 py-s-200">
									<span className="gap-s-100 flex items-center">
										<span
											role="img"
											className={cn(
												"block h-3 w-3 shrink-0 rounded-full",
												statusDotColors[trade.status]
											)}
											aria-label={t(`statuses.${trade.status}`)}
										/>
										<span className="text-tiny text-txt-300 sm:hidden">
											{t(`statuses.${trade.status}`)}
										</span>
									</span>
								</TableCell>
								<TableCell className="text-tiny text-txt-200 px-s-300 py-s-200 hidden text-right whitespace-nowrap md:table-cell">
									{formatCurrency(trade.riskAmountCents)}
								</TableCell>
								<TableCell className="px-s-300 py-s-200 hidden text-right md:table-cell">
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
								</TableCell>
								<TableCell className="px-s-300 py-s-200 text-right">
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
								</TableCell>
								<TableCell className="text-tiny text-txt-200 px-s-300 py-s-200 hidden text-right whitespace-nowrap lg:table-cell">
									{formatR(trade.simulatedRMultiple)}
								</TableCell>
								<TableCell className="text-tiny text-txt-300 px-s-300 py-s-200 hidden max-w-[200px] truncate lg:table-cell">
									{translateRiskReason(tReasons, trade.riskReason)}
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="bg-bg-200 border-bg-300 px-m-400 py-s-200 flex items-center justify-between border-t">
					<span className="text-tiny text-txt-300">
						{t("page", { current: page + 1, total: totalPages })}
					</span>
					<div className="gap-s-100 flex">
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
							<ChevronLeft className="h-4 w-4" aria-hidden="true" />
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
							<ChevronRight className="h-4 w-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export { TradeComparisonTable }
