"use client"

import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { ColoredValue } from "@/components/shared/colored-value"
import { fromCents } from "@/lib/money"
import type { SimulationSummary } from "@/types/risk-simulation"

const formatPf = (value: number): string =>
	value >= 999 ? "∞" : value.toFixed(2)

const formatR = (value: number): string =>
	`${value >= 0 ? "+" : ""}${value.toFixed(2)}R`

interface SummaryCardsProps {
	summary: SimulationSummary
}

interface ComparisonRowProps {
	label: string
	originalValue: string
	simulatedValue: string
}

const ComparisonRow = ({
	label,
	originalValue,
	simulatedValue,
}: ComparisonRowProps) => (
	<div className="py-s-100 flex items-center justify-between">
		<span className="text-tiny text-txt-300">{label}</span>
		<div className="gap-s-200 sm:gap-s-300 flex items-center">
			<span className="text-tiny text-txt-300 whitespace-nowrap">
				{originalValue}
			</span>
			<span className="text-tiny text-txt-300">&rarr;</span>
			<span className="text-tiny sm:text-small text-txt-100 font-medium whitespace-nowrap">
				{simulatedValue}
			</span>
		</div>
	</div>
)

const SummaryCards = ({ summary }: SummaryCardsProps) => {
	const t = useTranslations("riskSimulation.summary")
	const { formatPercent } = useFormatting()

	return (
		<div className="space-y-s-300 sm:space-y-m-400">
			<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">
				{t("title")}
			</h2>

			{/* Top-level P&L comparison */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 [&_p]:truncate [&>div]:min-w-0">
				{/* Original P&L */}
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
					<p className="text-tiny text-txt-300 mb-s-100">{t("originalPnl")}</p>
					<ColoredValue
						value={fromCents(summary.originalTotalPnlCents)}
						type="currency"
						showSign
						size="lg"
					/>
				</div>

				{/* Simulated P&L */}
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
					<p className="text-tiny text-txt-300 mb-s-100">{t("simulatedPnl")}</p>
					<ColoredValue
						value={fromCents(summary.simulatedTotalPnlCents)}
						type="currency"
						showSign
						size="lg"
					/>
				</div>

				{/* Delta */}
				<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
					<p className="text-tiny text-txt-300 mb-s-100">{t("delta")}</p>
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
				<div className="border-bg-300 bg-bg-200 space-y-s-200 p-m-400 rounded-lg border">
					<h3 className="text-small text-txt-100 font-semibold">
						{t("performance")}
					</h3>
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
				<div className="border-bg-300 bg-bg-200 space-y-s-200 p-m-400 rounded-lg border">
					<h3 className="text-small text-txt-100 font-semibold">
						{t("tradeCounts")}
					</h3>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("totalTrades")}</span>
						<span className="text-small text-txt-100 font-medium">
							{summary.totalTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("executed")}</span>
						<span className="text-small text-txt-100 font-medium">
							{summary.executedTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("skipped")}</span>
						<span className="text-small text-txt-300 font-medium">
							{summary.totalTrades - summary.executedTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("daysHitLimit")}</span>
						<span className="text-small text-txt-100 font-medium">
							{summary.daysHitDailyLimit}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
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
