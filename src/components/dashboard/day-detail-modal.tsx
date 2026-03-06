"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DaySummaryStats } from "./day-summary-stats"
import { DayEquityCurve } from "./day-equity-curve"
import { DayTradesList } from "./day-trades-list"
import {
	getDaySummary,
	getDayTrades,
	getDayEquityCurve,
} from "@/app/actions/analytics"
import type { DaySummary, DayTrade, DayEquityPoint } from "@/types"
import { APP_TIMEZONE } from "@/lib/dates"
import { LoadingSpinner } from "@/components/shared"

interface DayDetailModalProps {
	date: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
}

export const DayDetailModal = ({
	date,
	open,
	onOpenChange,
}: DayDetailModalProps) => {
	const t = useTranslations("dashboard")
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [summary, setSummary] = useState<DaySummary | null>(null)
	const [trades, setTrades] = useState<DayTrade[]>([])
	const [equityCurve, setEquityCurve] = useState<DayEquityPoint[]>([])

	useEffect(() => {
		if (date && open) {
			startTransition(async () => {
				const dateObj = new Date(date)

				const [summaryResult, tradesResult, equityResult] = await Promise.all([
					getDaySummary(dateObj),
					getDayTrades(dateObj),
					getDayEquityCurve(dateObj),
				])

				if (summaryResult.status === "success" && summaryResult.data) {
					setSummary(summaryResult.data)
				}
				if (tradesResult.status === "success" && tradesResult.data) {
					setTrades(tradesResult.data)
				}
				if (equityResult.status === "success" && equityResult.data) {
					setEquityCurve(equityResult.data)
				}
			})
		}
	}, [date, open])

	const handleTradeClick = (tradeId: string) => {
		onOpenChange(false)
		router.push(`/journal/${tradeId}`)
	}

	const formatDate = (dateStr: string) => {
		const d = new Date(dateStr)
		return d.toLocaleDateString("pt-BR", {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
			timeZone: APP_TIMEZONE,
		})
	}

	const dayName = date ? formatDate(date) : ""

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				id="day-detail-dialog"
				className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden sm:w-full"
			>
				<ScrollArea className="max-h-[calc(90dvh-3rem)] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="capitalize">{dayName}</DialogTitle>
				</DialogHeader>

				{isPending ? (
					<LoadingSpinner size="lg" className="h-[300px]" />
				) : summary ? (
					<div className="space-y-m-400">
						{/* Summary Stats */}
						<DaySummaryStats summary={summary} />

						{/* Equity Curve */}
						<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border sm:p-m-400">
							<h4 className="mb-s-300 text-small text-txt-100 font-medium">
								{t("dayDetail.equityCurve")}
							</h4>
							<DayEquityCurve
								data={equityCurve}
								onPointClick={handleTradeClick}
							/>
						</div>

						{/* Trades List */}
						<div>
							<h4 className="mb-s-300 text-small text-txt-100 font-medium">
								{t("dayDetail.tradesTitle")}
							</h4>
							<DayTradesList trades={trades} onTradeClick={handleTradeClick} />
							<p className="mt-s-200 text-caption text-txt-300">
								{t("dayDetail.clickHint")}
							</p>
						</div>
					</div>
				) : (
					<div className="text-txt-300 flex h-[150px] sm:h-[200px] items-center justify-center">
						{t("dayDetail.noData")}
					</div>
				)}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}
