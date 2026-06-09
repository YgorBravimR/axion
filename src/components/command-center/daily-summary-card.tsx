"use client"

import { BarChart3, Award, AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/ui/panel"
import { useFormatting } from "@/hooks/use-formatting"
import { getPnlSignClass } from "@/lib/formatting"
import type { DailySummary } from "@/app/actions/command-center.types"

interface DailySummaryCardProps {
	summary: DailySummary | null
}

export const DailySummaryCard = ({ summary }: DailySummaryCardProps) => {
	const t = useTranslations("commandCenter.summary")
	const tCommon = useTranslations("common")
	const { formatCurrencyWithSign, formatPercent } = useFormatting()

	if (!summary) {
		return (
			<Panel id="cc-daily-summary">
				<div className="gap-s-200 flex items-center">
					<BarChart3 className="text-txt-300 h-5 w-5" />
					<p className="text-small text-txt-300">{t("loading")}</p>
				</div>
			</Panel>
		)
	}

	const hasNoTrades = summary.tradesCount === 0

	return (
		<Panel id="cc-daily-summary">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 gap-s-200 flex items-center">
				<BarChart3 className="text-acc-100 h-5 w-5" />
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
			</div>

			{hasNoTrades ? (
				<p className="text-small text-txt-300">{t("noTrades")}</p>
			) : (
				<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
					{/* Total P&L */}
					<div>
						<p className="text-tiny sm:text-small text-txt-200">
							{t("totalPnL")}
						</p>
						<p
							className={cn(
								"mt-s-100 text-h2 sm:text-h1 font-bold",
								getPnlSignClass(summary.totalPnL)
							)}
						>
							{formatCurrencyWithSign(summary.totalPnL)}
						</p>
					</div>

					{/* Trades */}
					<div>
						<p className="text-tiny sm:text-small text-txt-200">
							{t("trades")}
						</p>
						<p className="mt-s-100 text-small sm:text-body text-txt-100 font-semibold">
							{summary.tradesCount}
						</p>
					</div>

					{/* Win Rate */}
					<div>
						<p className="text-tiny sm:text-small text-txt-200">
							{t("winRate")}
						</p>
						<div className="mt-s-100 gap-s-100 flex items-center">
							<p className="text-small sm:text-body text-txt-100 font-semibold">
								{formatPercent(summary.winRate)}
							</p>
							<span className="text-tiny sm:text-small text-txt-200">
								({summary.winCount}
								{tCommon("winAbbr")} / {summary.lossCount}
								{tCommon("lossAbbr")})
							</span>
						</div>
					</div>

					{/* Best Trade */}
					<div>
						<p className="gap-s-100 text-tiny sm:text-small text-txt-200 flex items-center">
							<Award className="h-3 w-3" />
							{t("bestTrade")}
						</p>
						<p
							className={cn(
								"mt-s-100 text-small sm:text-body font-semibold",
								summary.bestTrade > 0 ? "text-trade-buy" : "text-txt-200"
							)}
						>
							{summary.bestTrade > 0
								? formatCurrencyWithSign(summary.bestTrade)
								: "--"}
						</p>
					</div>

					{/* Worst Trade */}
					<div>
						<p className="gap-s-100 text-tiny sm:text-small text-txt-200 flex items-center">
							<AlertTriangle className="h-3 w-3" />
							{t("worstTrade")}
						</p>
						<p
							className={cn(
								"mt-s-100 text-small sm:text-body font-semibold",
								summary.worstTrade < 0 ? "text-trade-sell" : "text-txt-200"
							)}
						>
							{summary.worstTrade < 0
								? formatCurrencyWithSign(summary.worstTrade)
								: "--"}
						</p>
					</div>

					{/* Consecutive Losses */}
					<div>
						<p className="text-tiny sm:text-small text-txt-200">
							{t("maxConsecutiveLosses")}
						</p>
						<p
							className={cn(
								"mt-s-100 text-small sm:text-body font-semibold",
								summary.consecutiveLosses >= 3 ? "text-warning" : "text-txt-100"
							)}
						>
							{summary.consecutiveLosses}
						</p>
					</div>
				</div>
			)}
		</Panel>
	)
}
