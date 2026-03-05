"use client"

import { useState, useTransition, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	ChevronLeft,
	ChevronRight,
	TrendingUp,
	TrendingDown,
	Loader2,
} from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { getWeeklyReport, type WeeklyReport } from "@/app/actions/reports"
import { format, parseISO } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { Link } from "@/i18n/routing"

interface WeeklyReportCardProps {
	initialReport: WeeklyReport | null
}

export const WeeklyReportCard = ({ initialReport }: WeeklyReportCardProps) => {
	const t = useTranslations("reports.weekly")
	const tStats = useTranslations("reports.stats")
	const tCommon = useTranslations("common")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS

	const [report, setReport] = useState<WeeklyReport | null>(initialReport)
	const [weekOffset, setWeekOffset] = useState(0)
	const [isPending, startTransition] = useTransition()
	const [isExpanded, setIsExpanded] = useState(false)

	// Reset state when initialReport changes (e.g., account switch)
	useEffect(() => {
		setReport(initialReport)
		setWeekOffset(0)
		setIsExpanded(false)
	}, [initialReport])

	const handleWeekChange = (offset: number) => {
		startTransition(async () => {
			const result = await getWeeklyReport(offset)
			if (result.status === "success" && result.data) {
				setReport(result.data)
				setWeekOffset(offset)
			}
		})
	}

	if (!report) {
		return (
			<div className="border-bg-300 bg-bg-200 p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">{t("title")}</h2>
				<p className="mt-m-400 text-txt-300">{tCommon("noData")}</p>
			</div>
		)
	}

	const { summary, dailyBreakdown, topWins, topLosses } = report
	const weekLabel =
		weekOffset === 0
			? t("thisWeek")
			: weekOffset === 1
				? t("lastWeek")
				: t("weeksAgo", { n: weekOffset })

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h2>
					<p className="text-tiny text-txt-200">
						{format(parseISO(report.weekStart), "MMM d", {
							locale: dateLocale,
						})}{" "}
						-{" "}
						{format(parseISO(report.weekEnd), "MMM d, yyyy", {
							locale: dateLocale,
						})}
					</p>
				</div>
				<div className="gap-s-200 flex items-center">
					<Button
						id="weekly-report-previous-week"
						variant="ghost"
						size="sm"
						onClick={() => handleWeekChange(weekOffset + 1)}
						disabled={isPending}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-small text-txt-200">{weekLabel}</span>
					<Button
						id="weekly-report-next-week"
						variant="ghost"
						size="sm"
						onClick={() => handleWeekChange(Math.max(0, weekOffset - 1))}
						disabled={isPending || weekOffset === 0}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					{isPending && (
						<Loader2 className="text-txt-300 h-4 w-4 animate-spin" />
					)}
				</div>
			</div>

			{/* Summary Stats */}
			{summary.totalTrades > 0 ? (
				<>
					<div className="mt-m-500 gap-m-400 grid grid-cols-2 sm:grid-cols-4">
						<div>
							<p className="text-tiny text-txt-200">{tStats("netPnl")}</p>
							<p
								className={cn(
									"text-h3 font-bold",
									summary.netPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
								)}
							>
								{summary.netPnl >= 0 ? "+" : ""}
								{summary.netPnl.toFixed(2)}
							</p>
							{summary.totalFees > 0 && (
								<p className="mt-s-100 text-tiny text-txt-200">
									<span className="text-txt-200">{tStats("grossPnl")}:</span>{" "}
									<span
										className={cn(
											summary.grossPnl >= 0
												? "text-trade-buy"
												: "text-trade-sell"
										)}
									>
										{summary.grossPnl >= 0 ? "+" : ""}
										{summary.grossPnl.toFixed(2)}
									</span>{" "}
									<span className="text-txt-300">
										({tStats("fees")}: -{summary.totalFees.toFixed(2)})
									</span>
								</p>
							)}
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("winRate")}</p>
							<p className="text-h3 text-txt-100 font-bold">
								{summary.winRate.toFixed(0)}%
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("trades")}</p>
							<p className="text-h3 text-txt-100 font-bold">
								{summary.totalTrades}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("profitFactor")}</p>
							<p className="text-h3 text-txt-100 font-bold">
								{summary.profitFactor === Infinity
									? "∞"
									: summary.profitFactor.toFixed(2)}
							</p>
						</div>
					</div>

					{/* Secondary Stats */}
					<div className="mt-m-400 gap-m-400 border-bg-300 pt-m-400 grid grid-cols-3 border-t sm:grid-cols-6">
						<div>
							<p className="text-tiny text-txt-200">{tStats("wins")}</p>
							<p className="text-small text-trade-buy font-medium">
								{summary.winCount}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("losses")}</p>
							<p className="text-small text-trade-sell font-medium">
								{summary.lossCount}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("avgWin")}</p>
							<p className="text-small text-trade-buy">
								+{summary.avgWin.toFixed(2)}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("avgLoss")}</p>
							<p className="text-small text-trade-sell">
								{summary.avgLoss.toFixed(2)}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("bestTrade")}</p>
							<p className="text-small text-trade-buy">
								+{summary.bestTrade.toFixed(2)}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("worstTrade")}</p>
							<p className="text-small text-trade-sell">
								{summary.worstTrade.toFixed(2)}
							</p>
						</div>
					</div>

					{/* Expand/Collapse */}
					<Button
						id="weekly-report-toggle-details"
						variant="ghost"
						size="sm"
						className="mt-m-400 w-full"
						onClick={() => setIsExpanded(!isExpanded)}
					>
						{isExpanded ? tCommon("hideDetails") : tCommon("showDetails")}
					</Button>

					{isExpanded && (
						<div className="mt-m-400 space-y-m-500">
							{/* Daily Breakdown */}
							<div>
								<h3 className="text-small text-txt-100 font-medium">
									{t("dailyBreakdown")}
								</h3>
								<div className="mt-s-300 space-y-s-200">
									{dailyBreakdown
										.filter((d) => d.tradeCount > 0)
										.map((day) => (
											<div
												key={day.date}
												className="bg-bg-100 px-s-300 py-s-200 flex items-center justify-between rounded"
											>
												<span className="text-small text-txt-200">
													{format(parseISO(day.date), "EEE, MMM d", {
														locale: dateLocale,
													})}
												</span>
												<div className="gap-m-400 flex items-center">
													<span className="text-tiny text-txt-200">
														{day.tradeCount} trades
													</span>
													<span
														className={cn(
															"text-small",
															day.pnl >= 0
																? "text-trade-buy"
																: "text-trade-sell"
														)}
													>
														{day.pnl >= 0 ? "+" : ""}
														{day.pnl.toFixed(2)}
													</span>
												</div>
											</div>
										))}
								</div>
							</div>

							{/* Top Wins */}
							{topWins.length > 0 && (
								<div>
									<h3 className="gap-s-200 text-small text-txt-100 flex items-center font-medium">
										<TrendingUp className="text-trade-buy h-4 w-4" />
										{t("topWins")}
									</h3>
									<div className="mt-s-300 space-y-s-200">
										{topWins.map((trade) => (
											<Link
												key={trade.id}
												href={`/journal/${trade.id}`}
												className="bg-bg-100 px-s-300 py-s-200 hover:bg-bg-300 flex items-center justify-between rounded transition-colors"
											>
												<div className="gap-s-200 flex items-center">
													<Badge
														id={`badge-weekly-win-${trade.id}`}
														variant="outline"
														className="text-tiny"
													>
														{trade.asset}
													</Badge>
													<span className="text-tiny text-txt-200">
														{format(parseISO(trade.date), "MMM d", {
															locale: dateLocale,
														})}
													</span>
												</div>
												<span className="text-small text-trade-buy">
													+{trade.pnl.toFixed(2)}
													{trade.r && (
														<span className="text-txt-300 ml-1">
															({trade.r.toFixed(1)}R)
														</span>
													)}
												</span>
											</Link>
										))}
									</div>
								</div>
							)}

							{/* Top Losses */}
							{topLosses.length > 0 && (
								<div>
									<h3 className="gap-s-200 text-small text-txt-100 flex items-center font-medium">
										<TrendingDown className="text-trade-sell h-4 w-4" />
										{t("topLosses")}
									</h3>
									<div className="mt-s-300 space-y-s-200">
										{topLosses.map((trade) => (
											<Link
												key={trade.id}
												href={`/journal/${trade.id}`}
												className="bg-bg-100 px-s-300 py-s-200 hover:bg-bg-300 flex items-center justify-between rounded transition-colors"
											>
												<div className="gap-s-200 flex items-center">
													<Badge
														id={`badge-weekly-loss-${trade.id}`}
														variant="outline"
														className="text-tiny"
													>
														{trade.asset}
													</Badge>
													<span className="text-tiny text-txt-200">
														{format(parseISO(trade.date), "MMM d", {
															locale: dateLocale,
														})}
													</span>
												</div>
												<span className="text-small text-trade-sell">
													{trade.pnl.toFixed(2)}
													{trade.r && (
														<span className="text-txt-300 ml-1">
															({trade.r.toFixed(1)}R)
														</span>
													)}
												</span>
											</Link>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</>
			) : (
				<p className="mt-m-400 text-txt-300 text-center">{t("noTrades")}</p>
			)}
		</div>
	)
}
