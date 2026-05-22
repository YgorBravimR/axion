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

const dateFormatterPtBR = new Intl.DateTimeFormat("pt-BR", {
	weekday: "short",
	month: "short",
	day: "numeric",
})

const dateFormatterEnUS = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
})

const formatDate = (dayKey: string, locale: string): string => {
	const date = new Date(`${dayKey}T12:00:00-03:00`)
	return (locale === "pt-BR" ? dateFormatterPtBR : dateFormatterEnUS).format(
		date
	)
}

interface TradeFlowItemProps {
	trade: SimulatedTrade
	isLast: boolean
}

const TradeFlowItem = ({ trade, isLast }: TradeFlowItemProps) => {
	const t = useTranslations("riskSimulation.trace")
	const tReasons = useTranslations("riskSimulation")
	const isSkipped = trade.status !== "executed"
	const pnl = trade.simulatedPnlCents ?? 0

	const badgeLabel = isSkipped
		? t("skipped")
		: pnl > 0
			? t("win")
			: pnl < 0
				? t("loss")
				: t("breakeven")

	const badgeClass = isSkipped
		? "bg-bg-300 text-txt-300"
		: pnl > 0
			? "bg-trade-buy/20 text-trade-buy"
			: pnl < 0
				? "bg-trade-sell/20 text-trade-sell"
				: "bg-bg-300 text-txt-300"

	return (
		<div className="gap-s-300 flex items-start">
			{/* Trade number */}
			<div className="flex flex-col items-center">
				<div
					className={cn(
						"text-tiny flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-semibold",
						isSkipped ? "bg-bg-300 text-txt-300" : "bg-acc-100/20 text-acc-100"
					)}
				>
					T{trade.dayTradeNumber}
				</div>
				{!isLast && <div className="bg-bg-300 my-s-100 h-4 w-px" />}
			</div>

			{/* Trade details */}
			<div className="pb-s-200 flex-1">
				<div className="gap-s-200 flex flex-wrap items-center">
					{!isSkipped && (
						<span className="text-tiny text-txt-200">
							{t("risk")} {formatCurrency(trade.riskAmountCents ?? 0)}
						</span>
					)}
					<ArrowRight
						className="text-txt-300 h-3 w-3 shrink-0"
						aria-hidden="true"
					/>
					<span
						className={cn(
							"text-tiny px-s-200 rounded-full py-0.5 font-medium whitespace-nowrap",
							badgeClass
						)}
					>
						{badgeLabel}
						{!isSkipped ? ` ${formatCurrency(pnl)}` : ""}
					</span>
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
		<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border">
			{/* Day header */}
			<div className="mb-s-300 flex items-center justify-between">
				<span className="text-small text-txt-100 font-medium">
					{formatDate(day.dayKey, locale)}
				</span>
				<div className="gap-s-200 flex items-center">
					<span
						className={cn(
							"text-tiny sm:text-small font-semibold whitespace-nowrap",
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
				<div className="border-bg-300 mt-s-200 gap-s-200 pt-s-200 flex items-center border-t">
					<StopCircle
						className="text-rule-blocked h-3.5 w-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span className="text-tiny text-rule-blocked font-medium">
						{t("dailyLimitHit")}
					</span>
				</div>
			)}
			{day.dayResult.hitDailyTarget && !day.dayResult.hitDailyLimit && (
				<div className="border-bg-300 mt-s-200 gap-s-200 pt-s-200 flex items-center border-t">
					<StopCircle
						className="text-rule-paused h-3.5 w-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span className="text-tiny text-rule-paused font-medium">
						{t("dailyTargetHit")}
					</span>
				</div>
			)}
		</div>
	)
}

export { DayTraceCard }
