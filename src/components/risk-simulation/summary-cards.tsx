"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { ColoredValue } from "@/components/shared/colored-value"
import { fromCents } from "@/lib/money"
import type { SimulationSummary } from "@/types/risk-simulation"

interface SummaryCardsProps {
	summary: SimulationSummary
}

interface ComparisonRowProps {
	label: string
	originalValue: string
	simulatedValue: string
	delta?: string
	deltaPositive?: boolean
}

const ComparisonRow = ({
	label,
	originalValue,
	simulatedValue,
	delta,
	deltaPositive,
}: ComparisonRowProps) => (
	<div className="flex items-center justify-between py-1">
		<span className="text-tiny text-txt-300">{label}</span>
		<div className="flex items-center gap-3">
			<span className="text-tiny text-txt-300">{originalValue}</span>
			<span className="text-tiny text-txt-300">&rarr;</span>
			<span className="text-small text-txt-100 font-medium">{simulatedValue}</span>
			{delta && (
				<span
					className={cn(
						"text-tiny font-medium",
						deltaPositive ? "text-trade-buy" : "text-trade-sell"
					)}
				>
					{delta}
				</span>
			)}
		</div>
	</div>
)

const SummaryCards = ({ summary }: SummaryCardsProps) => {
	const t = useTranslations("riskSimulation.summary")

	const formatCurrency = (cents: number): string => {
		const value = fromCents(cents)
		const sign = value >= 0 ? "+" : ""
		return `${sign}R$${Math.abs(value).toFixed(2)}`
	}

	const formatPercent = (value: number): string => `${value.toFixed(1)}%`
	const formatPf = (value: number): string =>
		value >= 999 ? "∞" : value.toFixed(2)
	const formatR = (value: number): string =>
		`${value >= 0 ? "+" : ""}${value.toFixed(2)}R`

	return (
		<div className="space-y-s-300 sm:space-y-m-400">
			<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">{t("title")}</h2>

			{/* Top-level P&L comparison */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
				{/* Original P&L */}
				<div className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
					<p className="text-tiny text-txt-300 mb-1">{t("originalPnl")}</p>
					<ColoredValue
						value={fromCents(summary.originalTotalPnlCents)}
						type="currency"
						showSign
						size="lg"
					/>
				</div>

				{/* Simulated P&L */}
				<div className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
					<p className="text-tiny text-txt-300 mb-1">{t("simulatedPnl")}</p>
					<ColoredValue
						value={fromCents(summary.simulatedTotalPnlCents)}
						type="currency"
						showSign
						size="lg"
					/>
				</div>

				{/* Delta */}
				<div className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
					<p className="text-tiny text-txt-300 mb-1">{t("delta")}</p>
					<ColoredValue
						value={fromCents(summary.pnlDeltaCents)}
						type="currency"
						showSign
						size="lg"
					/>
				</div>
			</div>

			{/* Detailed comparisons */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 md:grid-cols-2">
				{/* Performance */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400">
					<h4 className="text-small text-txt-100 font-semibold">{t("performance")}</h4>
					<ComparisonRow
						label={t("winRate")}
						originalValue={formatPercent(summary.originalWinRate)}
						simulatedValue={formatPercent(summary.simulatedWinRate)}
					/>
					<ComparisonRow
						label={t("profitFactor")}
						originalValue={formatPf(summary.originalProfitFactor)}
						simulatedValue={formatPf(summary.simulatedProfitFactor)}
					/>
					<ComparisonRow
						label={t("avgR")}
						originalValue={formatR(summary.originalAvgR)}
						simulatedValue={formatR(summary.simulatedAvgR)}
					/>
					<ComparisonRow
						label={t("maxDrawdown")}
						originalValue={formatPercent(summary.originalMaxDrawdownPercent)}
						simulatedValue={formatPercent(summary.simulatedMaxDrawdownPercent)}
					/>
				</div>

				{/* Trade counts */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400">
					<h4 className="text-small text-txt-100 font-semibold">{t("tradeCounts")}</h4>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("totalTrades")}</span>
						<span className="text-small text-txt-100 font-medium">{summary.totalTrades}</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("executed")}</span>
						<span className="text-small text-trade-buy font-medium">{summary.executedTrades}</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("skipped")}</span>
						<span className="text-small text-txt-300 font-medium">
							{summary.totalTrades - summary.executedTrades}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("daysHitLimit")}</span>
						<span className="text-small text-txt-100 font-medium">
							{summary.daysHitDailyLimit}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("daysHitTarget")}</span>
						<span className="text-small text-txt-100 font-medium">
							{summary.daysHitDailyTarget}
						</span>
					</div>
				</div>
			</div>
		</div>
	)
}

export { SummaryCards }
