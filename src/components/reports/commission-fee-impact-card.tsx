"use client"

import { useTranslations } from "next-intl"
import { Receipt, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"
import type { CommissionFeeImpact } from "@/app/actions/reports"

interface CommissionFeeImpactCardProps {
	data: CommissionFeeImpact | null
}

const CommissionFeeImpactCard = ({ data }: CommissionFeeImpactCardProps) => {
	const t = useTranslations("reports.commissionFees")
	const { formatCurrencyWithSign, formatCurrency } = useFormatting()

	if (!data || !data.hasData) {
		return (
			<div id="reports-commission-fees" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
					<Receipt className="h-5 w-5 text-txt-300" />
					{t("title")}
				</h2>
				<p className="mt-m-400 text-center text-txt-300">
					{t("noData")}
				</p>
			</div>
		)
	}

	const { summary, assetBreakdown, monthlyTrend } = data

	// Bar scaling for asset breakdown
	const maxAssetFee = assetBreakdown.length > 0
		? Math.max(...assetBreakdown.map((a) => a.totalFees))
		: 0

	// Bar scaling for monthly trend
	const maxMonthFee = monthlyTrend.length > 0
		? Math.max(...monthlyTrend.map((m) => m.totalFees))
		: 0

	// Insight severity
	const getInsightMessage = (): string => {
		if (summary.grossPnl <= 0 && summary.totalFees > 0) {
			return summary.grossPnl < 0
				? t("insightNegativeGross", { amount: formatCurrency(summary.totalFees) })
				: t("insightNoGross", { amount: formatCurrency(summary.totalFees) })
		}

		const percent = summary.feesAsPercentOfGross.toFixed(1)

		if (summary.feesAsPercentOfGross > 15) {
			return t("insightHigh", { percent })
		}

		if (summary.feesAsPercentOfGross > 5) {
			return t("insightModerate", { percent })
		}

		return t("insightLow", { percent })
	}

	const insightBorderClass = summary.feesAsPercentOfGross > 15
		? "border-trade-sell/20 bg-trade-sell/5"
		: summary.feesAsPercentOfGross > 5
			? "border-warning/20 bg-warning/5"
			: "border-bg-300 bg-bg-100"

	const insightLabelClass = summary.feesAsPercentOfGross > 15
		? "text-trade-sell"
		: summary.feesAsPercentOfGross > 5
			? "text-warning"
			: "text-txt-300"

	return (
		<div id="reports-commission-fees" className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="flex items-center gap-s-200 text-small sm:text-body font-semibold text-txt-100">
					<Receipt className="h-5 w-5 text-txt-300" />
					{t("title")}
				</h2>
			</div>

			{/* Summary */}
			<div className="mt-m-500 grid grid-cols-3 gap-s-300 sm:gap-m-400">
				<div className="rounded bg-trade-sell-muted px-s-300 py-s-200">
					<p className="text-tiny text-txt-300">{t("totalFees")}</p>
					<p className="text-body sm:text-h3 font-bold text-trade-sell">
						{formatCurrencyWithSign(-summary.totalFees)}
					</p>
				</div>
				<div className="rounded bg-bg-100 px-s-300 py-s-200">
					<p className="text-tiny text-txt-300">{t("feesPercentOfGross")}</p>
					<p className="text-body sm:text-h3 font-bold text-txt-100">
						{summary.grossPnl > 0
							? `${summary.feesAsPercentOfGross.toFixed(1)}%`
							: "—"}
					</p>
				</div>
				<div className="rounded bg-bg-100 px-s-300 py-s-200">
					<p className="text-tiny text-txt-300">{t("avgFeePerTrade")}</p>
					<p className="text-body sm:text-h3 font-bold text-txt-100">
						{formatCurrencyWithSign(-summary.avgFeePerTrade)}
					</p>
				</div>
			</div>

			{/* Asset Breakdown */}
			{assetBreakdown.length > 0 && (
				<div className="mt-m-500 space-y-s-300">
					<h3 className="text-small font-medium text-txt-100">
						{t("assetBreakdown")}
					</h3>
					{assetBreakdown.map((asset) => {
						const barWidth = maxAssetFee > 0
							? (asset.totalFees / maxAssetFee) * 100
							: 0

						return (
							<div key={asset.asset} className="space-y-s-100">
								<div className="flex items-center justify-between">
									<div className="min-w-0 flex items-center gap-s-200">
										<span className="text-small font-medium text-txt-100">
											{asset.asset}
										</span>
										<span className="min-w-0 truncate text-tiny text-txt-300">
											{t("trades", { count: asset.tradeCount })}
										</span>
									</div>
									<div className="flex shrink-0 items-center gap-m-400">
										<span className="text-tiny text-txt-300 whitespace-nowrap">
											{t("avgFeePerTrade")}: {formatCurrencyWithSign(-asset.avgFeePerTrade)}
										</span>
										<span className="text-small font-medium text-trade-sell whitespace-nowrap">
											{formatCurrencyWithSign(-asset.totalFees)}
										</span>
									</div>
								</div>
								<div className="h-2 w-full rounded-full bg-bg-100">
									<div
										className="h-full rounded-full bg-txt-300/40 transition-[width]"
										style={{ width: `${barWidth}%` }}
									/>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Monthly Trend */}
			{monthlyTrend.length > 0 && (
				<div className="mt-m-500 space-y-s-300">
					<h3 className="text-small font-medium text-txt-100">
						{t("monthlyTrend")}
					</h3>
					{monthlyTrend.map((month, index) => {
						const barWidth = maxMonthFee > 0
							? (month.totalFees / maxMonthFee) * 100
							: 0

						const prevMonth = index > 0 ? monthlyTrend[index - 1] : null
						const trendDirection = prevMonth
							? month.totalFees > prevMonth.totalFees
								? "up"
								: month.totalFees < prevMonth.totalFees
									? "down"
									: "flat"
							: null

						return (
							<div key={month.month} className="space-y-s-100">
								<div className="flex items-center justify-between">
									<div className="min-w-0 flex items-center gap-s-200">
										<span className="text-small text-txt-200 tabular-nums">
											{month.month}
										</span>
										{trendDirection && (
											<span className="shrink-0">
												{trendDirection === "up" && (
													<TrendingUp className="h-3 w-3 text-trade-sell" aria-label="Increasing" />
												)}
												{trendDirection === "down" && (
													<TrendingDown className="h-3 w-3 text-trade-buy" aria-label="Decreasing" />
												)}
												{trendDirection === "flat" && (
													<Minus className="h-3 w-3 text-txt-300" aria-label="Flat" />
												)}
											</span>
										)}
										<span className="text-tiny text-txt-300">
											{t("trades", { count: month.tradeCount })}
										</span>
									</div>
									<div className="flex shrink-0 items-center gap-m-400">
										{month.grossPnl > 0 && (
											<span className={cn(
												"text-tiny whitespace-nowrap",
												month.feesAsPercentOfGross > 15
													? "text-trade-sell"
													: month.feesAsPercentOfGross > 5
														? "text-warning"
														: "text-txt-300"
											)}>
												{month.feesAsPercentOfGross.toFixed(1)}%
											</span>
										)}
										<span className="text-small font-medium text-trade-sell whitespace-nowrap">
											{formatCurrencyWithSign(-month.totalFees)}
										</span>
									</div>
								</div>
								<div className="h-2 w-full rounded-full bg-bg-100">
									<div
										className="h-full rounded-full bg-txt-300/40 transition-[width]"
										style={{ width: `${barWidth}%` }}
									/>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Insight */}
			<div className={cn("mt-m-500 rounded border p-s-300", insightBorderClass)}>
				<p className="text-small text-txt-200">
					<span className={cn("font-medium", insightLabelClass)}>
						{t("insight")}:
					</span>{" "}
					{getInsightMessage()}
				</p>
			</div>
		</div>
	)
}

export { CommissionFeeImpactCard }
