"use client"

import { useTranslations } from "next-intl"
import {
	TrendingUp,
	TrendingDown,
	Building2,
	Landmark,
	Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useFormatting } from "@/hooks/use-formatting"
import type { PropProfitCalculation } from "@/app/actions/reports.types"

interface PropProfitSummaryProps {
	data: PropProfitCalculation
	isPropAccount: boolean
	propFirmName: string | null
	profitSharePercentage: number
	taxRate: number
	showBreakdown?: boolean
}

export const PropProfitSummary = ({
	data,
	isPropAccount,
	propFirmName,
	profitSharePercentage,
	taxRate,
	showBreakdown = true,
}: PropProfitSummaryProps) => {
	const t = useTranslations("monthly")
	const { formatCurrency } = useFormatting()

	const isPositive = data.grossProfit > 0
	const isNegative = data.grossProfit < 0

	return (
		<div id="monthly-profit-summary" className="space-y-s-300 sm:space-y-m-400">
			{/* Main Summary Cards */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3">
				{/* Gross Profit */}
				<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
					<div className="gap-s-200 text-txt-300 flex items-center">
						{isPositive ? (
							<TrendingUp
								className="text-trade-buy h-4 w-4"
								aria-hidden="true"
							/>
						) : isNegative ? (
							<TrendingDown
								className="text-trade-sell h-4 w-4"
								aria-hidden="true"
							/>
						) : null}
						<span className="text-small">{t("grossProfit")}</span>
					</div>
					<p
						className={cn(
							"mt-s-200 text-h2 font-bold",
							isPositive && "text-trade-buy",
							isNegative && "text-trade-sell",
							!isPositive && !isNegative && "text-txt-100"
						)}
					>
						{formatCurrency(data.grossProfit)}
					</p>
				</div>

				{/* Trader Share */}
				<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
					<div className="gap-s-200 text-txt-300 flex items-center">
						<Wallet className="text-txt-300 h-4 w-4" aria-hidden="true" />
						<span className="text-small">{t("traderShare")}</span>
					</div>
					<p
						className={cn(
							"mt-s-200 text-h2 font-bold",
							data.traderShare > 0 && "text-trade-buy",
							data.traderShare < 0 && "text-trade-sell",
							data.traderShare === 0 && "text-txt-100"
						)}
					>
						{formatCurrency(data.traderShare)}
					</p>
					{isPropAccount && isPositive && (
						<p className="mt-s-100 text-tiny text-txt-300">
							({profitSharePercentage}%)
						</p>
					)}
				</div>

				{/* Net Profit */}
				<div className="border-acc-100/20 bg-acc-100/5 p-m-400 rounded-lg border">
					<div className="gap-s-200 text-txt-300 flex items-center">
						<Landmark className="text-txt-300 h-4 w-4" aria-hidden="true" />
						<span className="text-small">{t("netProfit")}</span>
					</div>
					<p
						className={cn(
							"mt-s-200 text-h2 font-bold",
							data.netProfit > 0 && "text-trade-buy",
							data.netProfit < 0 && "text-trade-sell",
							data.netProfit === 0 && "text-txt-100"
						)}
					>
						{formatCurrency(data.netProfit)}
					</p>
					{isPositive && (
						<p className="mt-s-100 text-tiny text-txt-300">
							{t("afterTax", { taxRate })}
						</p>
					)}
				</div>
			</div>

			{/* Breakdown Details */}
			{showBreakdown && isPositive && isPropAccount && (
				<div className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg border">
					<h3 className="gap-s-200 text-small text-txt-100 flex items-center font-medium">
						<Building2 className="text-acc-100 h-4 w-4" aria-hidden="true" />
						{t("breakdown")}
					</h3>
					<div className="mt-m-400 space-y-s-300">
						{/* Gross Profit Row */}
						<div className="text-small flex items-center justify-between">
							<span className="text-txt-200">{t("grossProfit")}</span>
							<span className="text-txt-100">
								{formatCurrency(data.grossProfit)}
							</span>
						</div>

						{/* Prop Firm Share */}
						{isPropAccount && data.propFirmShare > 0 && (
							<div className="text-small flex items-center justify-between">
								<span className="text-txt-300">
									- {propFirmName || t("propShare")} (
									{100 - profitSharePercentage}%)
								</span>
								<span className="text-trade-sell">
									-{formatCurrency(data.propFirmShare)}
								</span>
							</div>
						)}

						{/* Trader Share Subtotal */}
						{isPropAccount && (
							<div className="border-bg-300 pt-s-300 text-small flex items-center justify-between border-t">
								<span className="text-txt-200">{t("traderShare")}</span>
								<span className="text-txt-100">
									{formatCurrency(data.traderShare)}
								</span>
							</div>
						)}

						{/* Tax */}
						{data.estimatedTax > 0 && (
							<div className="text-small flex items-center justify-between">
								<span className="text-txt-300">
									- {t("estimatedTax")} ({taxRate}%)
								</span>
								<span className="text-trade-sell">
									-{formatCurrency(data.estimatedTax)}
								</span>
							</div>
						)}

						{/* Net Profit */}
						<div className="border-bg-300 pt-s-300 text-small flex items-center justify-between border-t font-medium">
							<span className="text-txt-100">{t("netProfit")}</span>
							<span className="text-trade-buy">
								{formatCurrency(data.netProfit)}
							</span>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
