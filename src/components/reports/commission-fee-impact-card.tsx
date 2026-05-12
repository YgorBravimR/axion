"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Receipt, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"
import type { CommissionFeeImpact } from "@/app/actions/reports.types"

interface CommissionFeeImpactCardProps {
	data: CommissionFeeImpact | null
}

// ==========================================
// PURE HELPERS — module scope
// ==========================================

const getInsightMessage = (
	summary: CommissionFeeImpact["summary"],
	formatCurrency: (_v: number) => string,
	t: (_key: string, _params?: Record<string, string>) => string
): string => {
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

const getFeeSeverityClasses = (
	percent: number
): { border: string; label: string } => {
	if (percent > 15) {
		return {
			border: "border-trade-sell/20 bg-trade-sell/5",
			label: "text-trade-sell",
		}
	}
	if (percent > 5) {
		return { border: "border-warning/20 bg-warning/5", label: "text-warning" }
	}
	return { border: "border-bg-300 bg-bg-100", label: "text-txt-300" }
}

// ==========================================
// COMPONENT
// ==========================================

const CommissionFeeImpactCard = ({ data }: CommissionFeeImpactCardProps) => {
	const t = useTranslations("reports.commissionFees")
	const { formatCurrencyWithSign, formatCurrency } = useFormatting()

	// All memos must be before any early return (Rules of Hooks)
	const maxAssetFee = useMemo(
		() =>
			data?.assetBreakdown && data.assetBreakdown.length > 0
				? Math.max(...data.assetBreakdown.map((a) => a.totalFees))
				: 0,
		[data?.assetBreakdown]
	)

	const maxMonthFee = useMemo(
		() =>
			data?.monthlyTrend && data.monthlyTrend.length > 0
				? Math.max(...data.monthlyTrend.map((m) => m.totalFees))
				: 0,
		[data?.monthlyTrend]
	)

	// Insight message and severity — memoized
	const insightMessage = useMemo(
		() =>
			data?.summary
				? getInsightMessage(
						data.summary,
						formatCurrency,
						t as (_key: string, _params?: Record<string, string>) => string
					)
				: "",
		[data?.summary, formatCurrency, t]
	)

	const feeSeverity = useMemo(
		() => getFeeSeverityClasses(data?.summary?.feesAsPercentOfGross ?? 0),
		[data?.summary?.feesAsPercentOfGross]
	)

	if (!data || !data.hasData) {
		return (
			<div
				id="reports-commission-fees"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h2 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
					<Receipt className="text-txt-300 h-5 w-5" aria-hidden="true" />
					{t("title")}
				</h2>
				<p className="mt-m-400 text-txt-300 text-center">{t("noData")}</p>
			</div>
		)
	}

	const { summary, assetBreakdown, monthlyTrend } = data

	return (
		<div
			id="reports-commission-fees"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="gap-s-200 text-small sm:text-body text-txt-100 flex items-center font-semibold">
					<Receipt className="text-txt-300 h-5 w-5" aria-hidden="true" />
					{t("title")}
				</h2>
			</div>

			{/* Summary */}
			<div className="mt-m-500 gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3">
				<div className="bg-trade-sell-muted border-trade-sell/40 px-s-300 py-s-200 rounded-sm border">
					<p className="text-tiny text-txt-300">{t("totalFees")}</p>
					<p className="text-body sm:text-h3 text-trade-sell font-bold">
						{formatCurrencyWithSign(-summary.totalFees)}
					</p>
				</div>
				<div className="bg-bg-100 px-s-300 py-s-200 rounded-sm">
					<p className="text-tiny text-txt-300">{t("feesPercentOfGross")}</p>
					<p className="text-body sm:text-h3 text-txt-100 font-semibold">
						{summary.grossPnl > 0
							? `${summary.feesAsPercentOfGross.toFixed(1)}%`
							: "—"}
					</p>
				</div>
				<div className="bg-bg-100 px-s-300 py-s-200 rounded-sm">
					<p className="text-tiny text-txt-300">{t("avgFeePerTrade")}</p>
					<p className="text-body sm:text-h3 text-txt-100 font-semibold">
						{formatCurrencyWithSign(-summary.avgFeePerTrade)}
					</p>
				</div>
			</div>

			{/* Asset Breakdown */}
			{assetBreakdown.length > 0 && (
				<div
					className="mt-m-500 space-y-s-300"
					role="list"
					aria-label={t("assetBreakdown")}
				>
					<h3 className="text-small text-txt-100 font-medium">
						{t("assetBreakdown")}
					</h3>
					{assetBreakdown.map((asset) => {
						const barScale = maxAssetFee > 0 ? asset.totalFees / maxAssetFee : 0

						return (
							<div key={asset.asset} className="space-y-s-100" role="listitem">
								<div className="flex items-center justify-between">
									<div className="gap-s-200 flex min-w-0 items-center">
										<span className="text-small text-txt-100 font-medium">
											{asset.asset}
										</span>
										<span className="text-tiny text-txt-300 min-w-0 truncate">
											{t("trades", { count: asset.tradeCount })}
										</span>
									</div>
									<div className="gap-m-400 flex shrink-0 flex-wrap items-center">
										<span className="text-tiny text-txt-300 hidden whitespace-nowrap sm:inline">
											{t("avgFeePerTrade")}:{" "}
											{formatCurrencyWithSign(-asset.avgFeePerTrade)}
										</span>
										<span className="text-small text-trade-sell font-medium whitespace-nowrap">
											{formatCurrencyWithSign(-asset.totalFees)}
										</span>
									</div>
								</div>
								<div
									className="bg-bg-100 h-2 w-full rounded-full"
									role="meter"
									aria-valuenow={asset.totalFees}
									aria-valuemin={0}
									aria-valuemax={maxAssetFee}
									aria-label={`${asset.asset}: ${formatCurrencyWithSign(-asset.totalFees)}`}
								>
									<div
										className="bg-txt-300/40 h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
										style={{ transform: `scaleX(${barScale})` }}
									/>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Monthly Trend */}
			{monthlyTrend.length > 0 && (
				<div
					className="mt-m-500 space-y-s-300"
					role="list"
					aria-label={t("monthlyTrend")}
				>
					<h3 className="text-small text-txt-100 font-medium">
						{t("monthlyTrend")}
					</h3>
					{monthlyTrend.map((month, index) => {
						const barScale = maxMonthFee > 0 ? month.totalFees / maxMonthFee : 0

						const prevMonth = index > 0 ? monthlyTrend[index - 1] : null
						const trendDirection = prevMonth
							? month.totalFees > prevMonth.totalFees
								? "up"
								: month.totalFees < prevMonth.totalFees
									? "down"
									: "flat"
							: null

						return (
							<div key={month.month} className="space-y-s-100" role="listitem">
								<div className="flex items-center justify-between">
									<div className="gap-s-200 flex min-w-0 items-center">
										<span className="text-small text-txt-200 tabular-nums">
											{month.month}
										</span>
										{trendDirection && (
											<span className="shrink-0">
												{trendDirection === "up" && (
													<TrendingUp
														className="text-trade-sell h-3 w-3"
														aria-label={t("trendUp")}
													/>
												)}
												{trendDirection === "down" && (
													<TrendingDown
														className="text-trade-buy h-3 w-3"
														aria-label={t("trendDown")}
													/>
												)}
												{trendDirection === "flat" && (
													<Minus
														className="text-txt-300 h-3 w-3"
														aria-label={t("trendFlat")}
													/>
												)}
											</span>
										)}
										<span className="text-tiny text-txt-300">
											{t("trades", { count: month.tradeCount })}
										</span>
									</div>
									<div className="gap-m-400 flex shrink-0 flex-wrap items-center">
										{month.grossPnl > 0 && (
											<span
												className={cn(
													"text-tiny whitespace-nowrap",
													getFeeSeverityClasses(month.feesAsPercentOfGross)
														.label
												)}
											>
												{month.feesAsPercentOfGross.toFixed(1)}%
											</span>
										)}
										<span className="text-small text-trade-sell font-medium whitespace-nowrap">
											{formatCurrencyWithSign(-month.totalFees)}
										</span>
									</div>
								</div>
								<div
									className="bg-bg-100 h-2 w-full rounded-full"
									role="meter"
									aria-valuenow={month.totalFees}
									aria-valuemin={0}
									aria-valuemax={maxMonthFee}
									aria-label={`${month.month}: ${formatCurrencyWithSign(-month.totalFees)}`}
								>
									<div
										className="bg-txt-300/40 h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
										style={{ transform: `scaleX(${barScale})` }}
									/>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Insight */}
			<div
				className={cn("mt-m-500 p-s-300 rounded-sm border", feeSeverity.border)}
			>
				<p className="text-small text-txt-200">
					<span className={cn("font-medium", feeSeverity.label)}>
						{t("insight")}:
					</span>{" "}
					{insightMessage}
				</p>
			</div>
		</div>
	)
}

export { CommissionFeeImpactCard }
