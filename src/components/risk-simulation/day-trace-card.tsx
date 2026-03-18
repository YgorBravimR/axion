"use client"

import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import { ArrowRight, StopCircle } from "lucide-react"
import { translateRiskReason } from "@/lib/risk-reason-i18n"
import type { DayTrace, SimulatedTrade } from "@/types/risk-simulation"

interface DayTraceCardProps {
	day: DayTrace
}

const formatCurrency = (cents: number): string => {
	const value = fromCents(cents)
	const sign = value >= 0 ? "+" : ""
	return `${sign}R$${Math.abs(value).toFixed(2)}`
}

const formatDate = (dayKey: string, locale: string): string => {
	const date = new Date(`${dayKey}T12:00:00-03:00`)
	return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(date)
}

interface TradeFlowItemProps {
	trade: SimulatedTrade
	isLast: boolean
}

const TradeFlowItem = ({ trade, isLast }: TradeFlowItemProps) => {
	const t = useTranslations("riskSimulation.trace")
	const tReasons = useTranslations("riskSimulation")
	const isSkipped = trade.status !== "executed"

	const outcomeBadge = () => {
		if (isSkipped) {
			return (
				<span className="text-tiny bg-bg-300 text-txt-300 rounded-full px-2 py-0.5 font-medium">
					{t("skipped")}
				</span>
			)
		}

		const pnl = trade.simulatedPnlCents ?? 0
		if (pnl > 0) {
			return (
				<span className="text-tiny bg-trade-buy/20 text-trade-buy whitespace-nowrap rounded-full px-2 py-0.5 font-medium">
					WIN {formatCurrency(pnl)}
				</span>
			)
		}
		if (pnl < 0) {
			return (
				<span className="text-tiny bg-trade-sell/20 text-trade-sell whitespace-nowrap rounded-full px-2 py-0.5 font-medium">
					LOSS {formatCurrency(pnl)}
				</span>
			)
		}
		return (
			<span className="text-tiny bg-bg-300 text-txt-300 rounded-full px-2 py-0.5 font-medium">
				BE {formatCurrency(pnl)}
			</span>
		)
	}

	return (
		<div className="flex items-start gap-3">
			{/* Trade number */}
			<div className="flex flex-col items-center">
				<div
					className={cn(
						"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
						isSkipped
							? "bg-bg-300 text-txt-300"
							: "bg-acc-100/20 text-acc-100"
					)}
				>
					T{trade.dayTradeNumber}
				</div>
				{!isLast && (
					<div className="bg-bg-300 my-1 h-4 w-px" />
				)}
			</div>

			{/* Trade details */}
			<div className="flex-1 pb-2">
				<div className="flex flex-wrap items-center gap-2">
					{!isSkipped && (
						<span className="text-tiny text-txt-200">
							Risk {formatCurrency(trade.riskAmountCents ?? 0)}
						</span>
					)}
					<ArrowRight className="text-txt-300 h-3 w-3 shrink-0" aria-hidden="true" />
					{outcomeBadge()}
				</div>
				<p className="text-tiny text-txt-300 mt-0.5">
					{translateRiskReason(tReasons, trade.riskReason)}
				</p>
			</div>
		</div>
	)
}

const DayTraceCard = ({ day }: DayTraceCardProps) => {
	const t = useTranslations("riskSimulation.trace")
	const locale = useLocale()
	const dayPnl = day.dayResult.totalPnlCents

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border p-3">
			{/* Day header */}
			<div className="mb-s-300 flex items-center justify-between">
				<span className="text-small text-txt-100 font-medium">
					{formatDate(day.dayKey, locale)}
				</span>
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"text-tiny sm:text-small whitespace-nowrap font-semibold",
							dayPnl > 0
								? "text-trade-buy"
								: dayPnl < 0
									? "text-trade-sell"
									: "text-txt-300"
						)}
					>
						{formatCurrency(dayPnl)}
					</span>
				</div>
			</div>

			{/* Trade flow */}
			<div>
				{day.trades.map((trade, idx) => (
					<TradeFlowItem
						key={`${trade.tradeId}-${idx}`}
						trade={trade}
						isLast={idx === day.trades.length - 1}
					/>
				))}
			</div>

			{/* Stop reasons */}
			{day.dayResult.hitDailyLimit && (
				<div className="border-bg-300 mt-s-200 flex items-center gap-2 border-t pt-2">
					<StopCircle className="text-trade-sell h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span className="text-tiny text-trade-sell font-medium">
						{t("dailyLimitHit")}
					</span>
				</div>
			)}
			{day.dayResult.hitDailyTarget && !day.dayResult.hitDailyLimit && (
				<div className="border-bg-300 mt-s-200 flex items-center gap-2 border-t pt-2">
					<StopCircle className="text-acc-100 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span className="text-tiny text-acc-100 font-medium">
						{t("dailyTargetHit")}
					</span>
				</div>
			)}
		</div>
	)
}

export { DayTraceCard }
