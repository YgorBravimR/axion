"use client"

import type { KeyboardEvent } from "react"
import { useTranslations } from "next-intl"
import { ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react"
import type { DayTrade } from "@/types"
import { formatBrlWithSign } from "@/lib/formatting"
import { ColoredValue } from "@/components/shared"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface DayTradesListProps {
	trades: DayTrade[]
	onTradeClick?: (tradeId: string) => void
}

const formatPrice = (value: number): string =>
	value.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})

export const DayTradesList = ({ trades, onTradeClick }: DayTradesListProps) => {
	const t = useTranslations("dashboard")

	if (trades.length === 0) {
		return (
			<div className="text-txt-300 flex h-[80px] sm:h-[100px] items-center justify-center">
				{t("dayDetail.noTrades")}
			</div>
		)
	}

	return (
		<div className="border-bg-300 overflow-x-auto rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow className="bg-bg-100 hover:bg-bg-100">
						<TableHead className="px-s-300 py-s-200">
							{t("dayDetail.time")}
						</TableHead>
						<TableHead className="px-s-300 py-s-200">
							{t("dayDetail.asset")}
						</TableHead>
						<TableHead className="px-s-300 py-s-200 hidden sm:table-cell">
							{t("dayDetail.dir")}
						</TableHead>
						<TableHead className="px-s-300 py-s-200 hidden text-right md:table-cell">
							{t("dayDetail.entry")}
						</TableHead>
						<TableHead className="px-s-300 py-s-200 hidden text-right md:table-cell">
							{t("dayDetail.exit")}
						</TableHead>
						<TableHead className="px-s-300 py-s-200 text-right">
							{t("dayDetail.pnl")}
						</TableHead>
						<TableHead className="px-s-300 py-s-200 text-right">R</TableHead>
						<TableHead className="px-s-200 py-s-200 w-8" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{trades.map((trade) => {
						const handleKeyDown = (e: KeyboardEvent) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault()
								onTradeClick?.(trade.id)
							}
						}

						return (
						<TableRow
							key={trade.id}
							className={cn(onTradeClick && "cursor-pointer")}
							onClick={() => onTradeClick?.(trade.id)}
							onKeyDown={onTradeClick ? handleKeyDown : undefined}
							tabIndex={onTradeClick ? 0 : undefined}
							role={onTradeClick ? "button" : undefined}
							aria-label={onTradeClick ? `${trade.asset} ${trade.direction} ${trade.time}` : undefined}
						>
							<TableCell className="px-s-300 py-s-200 text-small text-txt-100">
								{trade.time}
							</TableCell>
							<TableCell className="px-s-300 py-s-200">
								<div className="gap-s-100 flex items-center">
									{trade.direction === "long" ? (
										<ArrowUpRight className="text-action-buy h-3.5 w-3.5" />
									) : (
										<ArrowDownRight className="text-action-sell h-3.5 w-3.5" />
									)}
									<span className="text-small text-txt-100 font-medium">
										{trade.asset}
									</span>
								</div>
							</TableCell>
							<TableCell className="px-s-300 py-s-200 text-small text-txt-200 hidden sm:table-cell">
								{trade.direction === "long"
									? t("dayDetail.long")
									: t("dayDetail.short")}
							</TableCell>
							<TableCell className="px-s-300 py-s-200 text-small text-txt-200 hidden text-right md:table-cell">
								{formatPrice(trade.entryPrice)}
							</TableCell>
							<TableCell className="px-s-300 py-s-200 text-small text-txt-200 hidden text-right md:table-cell">
								{trade.exitPrice ? formatPrice(trade.exitPrice) : "-"}
							</TableCell>
							<TableCell className="px-s-300 py-s-200 text-right">
								<ColoredValue
									value={trade.pnl}
									showSign
									size="sm"
									formatFn={formatBrlWithSign}
								/>
							</TableCell>
							<TableCell className="px-s-300 py-s-200 text-right">
								{trade.rMultiple !== null ? (
									<ColoredValue
										value={trade.rMultiple}
										type="r-multiple"
										showSign
										size="sm"
									/>
								) : (
									<span className="text-small text-txt-300">-</span>
								)}
							</TableCell>
							<TableCell className="px-s-200 py-s-200">
								{onTradeClick && (
									<ChevronRight className="text-txt-300 h-4 w-4" />
								)}
							</TableCell>
						</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
