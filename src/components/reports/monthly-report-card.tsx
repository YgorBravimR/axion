"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Loader2, Calendar, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMonthlyReport, type MonthlyReport } from "@/app/actions/reports"
import { format, parseISO } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"

interface MonthlyReportCardProps {
	initialReport: MonthlyReport | null
}

export const MonthlyReportCard = ({ initialReport }: MonthlyReportCardProps) => {
	const t = useTranslations("reports.monthly")
	const tStats = useTranslations("reports.stats")
	const tCommon = useTranslations("common")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS
	const [report, setReport] = useState<MonthlyReport | null>(initialReport)
	const [monthOffset, setMonthOffset] = useState(0)
	const [isPending, startTransition] = useTransition()
	const [isExpanded, setIsExpanded] = useState(false)

	// Reset state when initialReport changes (e.g., account switch)
	useEffect(() => {
		setReport(initialReport)
		setMonthOffset(0)
		setIsExpanded(false)
	}, [initialReport])

	const handleMonthChange = (offset: number) => {
		startTransition(async () => {
			const result = await getMonthlyReport(offset)
			if (result.status === "success" && result.data) {
				setReport(result.data)
				setMonthOffset(offset)
			}
		})
	}

	if (!report) {
		return (
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h2>
				<p className="mt-m-400 text-txt-300">{tCommon("noData")}</p>
			</div>
		)
	}

	const { summary, weeklyBreakdown, assetBreakdown } = report
	const monthLabel =
		monthOffset === 0
			? t("thisMonth")
			: monthOffset === 1
			? t("lastMonth")
			: t("monthsAgo", { n: monthOffset })

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h2>
					<p className="text-tiny text-txt-200">
						{format(parseISO(report.monthStart), "MMMM yyyy", { locale: dateLocale })}
					</p>
				</div>
				<div className="flex items-center gap-s-200">
					<Button id="monthly-report-previous-month"
						variant="ghost"
						size="sm"
						onClick={() => handleMonthChange(monthOffset + 1)}
						disabled={isPending}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-small text-txt-200">{monthLabel}</span>
					<Button id="monthly-report-next-month"
						variant="ghost"
						size="sm"
						onClick={() => handleMonthChange(Math.max(0, monthOffset - 1))}
						disabled={isPending || monthOffset === 0}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					{isPending && <Loader2 className="h-4 w-4 animate-spin text-txt-300" />}
				</div>
			</div>

			{/* Summary Stats */}
			{summary.totalTrades > 0 ? (
				<>
					<div className="mt-m-500 grid grid-cols-2 gap-m-400 sm:grid-cols-4">
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
									<span className={cn(
										"font-mono",
										summary.grossPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
									)}>
										{summary.grossPnl >= 0 ? "+" : ""}{summary.grossPnl.toFixed(2)}
									</span>
									{" "}
									<span className="text-txt-300">
										({tStats("fees")}: -{summary.totalFees.toFixed(2)})
									</span>
								</p>
							)}
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("winRate")}</p>
							<p className="text-h3 font-bold text-txt-100">
								{summary.winRate.toFixed(0)}%
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{tStats("trades")}</p>
							<p className="text-h3 font-bold text-txt-100">
								{summary.totalTrades}
							</p>
						</div>
						<div>
							<p className="text-tiny text-txt-200">{t("avgR")}</p>
							<p
								className={cn(
									"text-h3 font-bold",
									summary.avgR >= 0 ? "text-trade-buy" : "text-trade-sell"
								)}
							>
								{summary.avgR >= 0 ? "+" : ""}
								{summary.avgR.toFixed(2)}R
							</p>
						</div>
					</div>

					{/* Best/Worst Day */}
					<div className="mt-m-400 grid grid-cols-2 gap-m-400">
						{summary.bestDay && (
							<div className="flex items-center gap-s-200 rounded bg-trade-buy-muted px-s-300 py-s-200">
								<TrendingUp className="h-4 w-4 text-trade-buy" />
								<div>
									<p className="text-tiny text-txt-200">{t("bestDay")}</p>
									<p className="text-small">
										<span className="text-txt-200">
											{format(parseISO(summary.bestDay.date), "MMM d", { locale: dateLocale })}:
										</span>{" "}
										<span className="font-medium text-trade-buy">
											+{summary.bestDay.pnl.toFixed(2)}
										</span>
									</p>
								</div>
							</div>
						)}
						{summary.worstDay && (
							<div className="flex items-center gap-s-200 rounded bg-trade-sell-muted px-s-300 py-s-200">
								<TrendingDown className="h-4 w-4 text-trade-sell" />
								<div>
									<p className="text-tiny text-txt-200">{t("worstDay")}</p>
									<p className="text-small">
										<span className="text-txt-200">
											{format(parseISO(summary.worstDay.date), "MMM d", { locale: dateLocale })}:
										</span>{" "}
										<span className="font-medium text-trade-sell">
											{summary.worstDay.pnl.toFixed(2)}
										</span>
									</p>
								</div>
							</div>
						)}
					</div>

					{/* Expand/Collapse */}
					<Button id="monthly-report-toggle-details"
						variant="ghost"
						size="sm"
						className="mt-m-400 w-full"
						onClick={() => setIsExpanded(!isExpanded)}
					>
						{isExpanded ? tCommon("hideDetails") : tCommon("showDetails")}
					</Button>

					{isExpanded && (
						<div className="mt-m-400 space-y-m-500">
							{/* Weekly Breakdown */}
							{weeklyBreakdown.length > 0 && (
								<div>
									<h3 className="flex items-center gap-s-200 text-small font-medium text-txt-100">
										<Calendar className="h-4 w-4" />
										{t("weeklyBreakdown")}
									</h3>
									<div className="mt-s-300 space-y-s-200">
										{weeklyBreakdown.map((week) => (
											<div
												key={week.weekStart}
												className="flex items-center justify-between rounded bg-bg-100 px-s-300 py-s-200"
											>
												<span className="text-small text-txt-200">
													{format(parseISO(week.weekStart), "MMM d", { locale: dateLocale })} -{" "}
													{format(parseISO(week.weekEnd), "MMM d", { locale: dateLocale })}
												</span>
												<div className="flex items-center gap-m-400">
													<span className="text-tiny text-txt-200">
														{week.tradeCount} {t("trades")}
													</span>
													<span className="text-tiny text-txt-200">
														{week.winRate.toFixed(0)}% {t("wr")}
													</span>
													<span
														className={cn(
															"text-small",
															week.pnl >= 0
																? "text-trade-buy"
																: "text-trade-sell"
														)}
													>
														{week.pnl >= 0 ? "+" : ""}
														{week.pnl.toFixed(2)}
													</span>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Asset Breakdown */}
							{assetBreakdown.length > 0 && (
								<div>
									<h3 className="text-small font-medium text-txt-100">
										{t("assetBreakdown")}
									</h3>
									<div className="mt-s-300 space-y-s-200">
										{assetBreakdown.slice(0, 5).map((asset) => (
											<div
												key={asset.asset}
												className="flex items-center justify-between rounded bg-bg-100 px-s-300 py-s-200"
											>
												<div className="flex items-center gap-s-200">
													<Badge id={`badge-monthly-asset-${asset.asset}`} variant="outline" className="text-tiny">
														{asset.asset}
													</Badge>
													<span className="text-tiny text-txt-200">
														{asset.tradeCount} {t("trades")}
													</span>
												</div>
												<div className="flex items-center gap-m-400">
													<span className="text-tiny text-txt-200">
														{asset.winRate.toFixed(0)}% {t("wr")}
													</span>
													<span
														className={cn(
															"text-small",
															asset.pnl >= 0
																? "text-trade-buy"
																: "text-trade-sell"
														)}
													>
														{asset.pnl >= 0 ? "+" : ""}
														{asset.pnl.toFixed(2)}
													</span>
												</div>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</>
			) : (
				<p className="mt-m-400 text-center text-txt-300">
					{t("noTrades")}
				</p>
			)}
		</div>
	)
}
