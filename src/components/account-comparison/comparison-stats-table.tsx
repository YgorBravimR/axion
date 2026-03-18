"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { AccountComparisonMetrics } from "@/types"
import type { ExpectancyMode } from "@/components/analytics/expectancy-mode-toggle"
import { COMPARISON_COLORS } from "./comparison-colors"
import { formatBrlWithSign, formatR, formatRatio } from "@/lib/formatting"

interface ComparisonStatsTableProps {
	accounts: AccountComparisonMetrics[]
	expectancyMode: ExpectancyMode
}

type MetricDirection = "higher-better" | "lower-better" | "neutral"

interface MetricRow {
	key: string
	label: string
	getValue: (account: AccountComparisonMetrics) => number
	format: (value: number) => string
	direction: MetricDirection
	mode: "always" | "capital" | "edge"
}

const ComparisonStatsTable = ({
	accounts,
	expectancyMode,
}: ComparisonStatsTableProps) => {
	const t = useTranslations("accountComparison.table")

	const metrics: MetricRow[] = [
		{
			key: "netPnl",
			label: t("netPnl"),
			getValue: (a) => a.stats.netPnl,
			format: (v) => formatBrlWithSign(v),
			direction: "higher-better",
			mode: "always",
		},
		{
			key: "grossPnl",
			label: t("grossPnl"),
			getValue: (a) => a.stats.grossPnl,
			format: (v) => formatBrlWithSign(v),
			direction: "neutral",
			mode: "always",
		},
		{
			key: "totalFees",
			label: t("totalFees"),
			getValue: (a) => a.stats.totalFees,
			format: (v) => `R$ ${v.toFixed(2)}`,
			direction: "lower-better",
			mode: "always",
		},
		{
			key: "winRate",
			label: t("winRate"),
			getValue: (a) => a.stats.winRate,
			format: (v) => `${v.toFixed(1)}%`,
			direction: "higher-better",
			mode: "always",
		},
		{
			key: "profitFactor",
			label: t("profitFactor"),
			getValue: (a) => a.stats.profitFactor,
			format: (v) => formatRatio(v),
			direction: "higher-better",
			mode: "always",
		},
		{
			key: "expectedValue",
			label: t("expectedValue"),
			getValue: (a) => a.expectedValue.expectedValue,
			format: (v) => formatBrlWithSign(v),
			direction: "higher-better",
			mode: "capital",
		},
		{
			key: "expectedR",
			label: t("expectedR"),
			getValue: (a) => a.expectedValue.expectedR,
			format: (v) => formatR(v),
			direction: "higher-better",
			mode: "edge",
		},
		{
			key: "averageR",
			label: t("averageR"),
			getValue: (a) => a.stats.averageR,
			format: (v) => formatR(v),
			direction: "higher-better",
			mode: "edge",
		},
		{
			key: "avgWin",
			label: t("avgWin"),
			getValue: (a) => a.stats.avgWin,
			format: (v) => formatBrlWithSign(v),
			direction: "higher-better",
			mode: "capital",
		},
		{
			key: "avgLoss",
			label: t("avgLoss"),
			getValue: (a) => a.stats.avgLoss,
			format: (v) => `R$ ${v.toFixed(2)}`,
			direction: "lower-better",
			mode: "capital",
		},
		{
			key: "projectedPnl",
			label: t("projectedPnl"),
			getValue: (a) => a.expectedValue.projectedPnl100,
			format: (v) => formatBrlWithSign(v),
			direction: "higher-better",
			mode: "capital",
		},
		{
			key: "projectedR",
			label: t("projectedR"),
			getValue: (a) => a.expectedValue.projectedR100,
			format: (v) => formatR(v),
			direction: "higher-better",
			mode: "edge",
		},
		{
			key: "totalTrades",
			label: t("totalTrades"),
			getValue: (a) => a.stats.totalTrades,
			format: (v) => v.toString(),
			direction: "neutral",
			mode: "always",
		},
		{
			key: "maxDrawdown",
			label: t("maxDrawdown"),
			getValue: (a) => a.maxDrawdown,
			format: (v) => formatBrlWithSign(-v),
			direction: "lower-better",
			mode: "always",
		},
	]

	const visibleMetrics = metrics.filter(
		(m) =>
			m.mode === "always" ||
			(m.mode === "capital" && expectancyMode === "capital") ||
			(m.mode === "edge" && expectancyMode === "edge")
	)

	/**
	 * Returns sets of indices tied for best and worst.
	 * Uses a tolerance of 1% of the value range so near-equal values share rank.
	 */
	const findBestAndWorst = (
		metric: MetricRow
	): { bestSet: Set<number>; worstSet: Set<number> } => {
		const empty = { bestSet: new Set<number>(), worstSet: new Set<number>() }
		if (metric.direction === "neutral") return empty

		const values = accounts.map((a) => metric.getValue(a))

		const min = Math.min(...values)
		const max = Math.max(...values)
		const range = max - min

		// All values effectively identical — no highlighting
		if (range < 0.01) return empty

		// Tolerance: 1% of range, minimum 0.01 absolute
		const tolerance = Math.max(range * 0.01, 0.01)

		let bestVal: number
		let worstVal: number

		if (metric.direction === "higher-better") {
			bestVal = max
			worstVal = min
		} else {
			bestVal = min
			worstVal = max
		}

		const bestSet = new Set<number>()
		const worstSet = new Set<number>()

		for (let i = 0; i < values.length; i++) {
			if (Math.abs(values[i] - bestVal) <= tolerance) {
				bestSet.add(i)
			} else if (Math.abs(values[i] - worstVal) <= tolerance) {
				worstSet.add(i)
			}
		}

		return { bestSet, worstSet }
	}

	return (
		<div id="comparison-stats-table" className="border-bg-300 bg-bg-200 overflow-x-auto rounded-lg border p-s-300 sm:p-m-400">
			<table className="w-full text-small">
				<thead>
					<tr className="border-bg-300 border-b">
						<th className="text-txt-300 py-s-200 pr-m-400 text-left font-medium">
							{t("metric")}
						</th>
						{accounts.map((account, index) => (
							<th
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right font-medium"
							>
								<div className="flex items-center justify-end gap-s-200">
									<span
										className="inline-block h-2.5 w-2.5 rounded-full"
										style={{
											backgroundColor:
												COMPARISON_COLORS[
													index % COMPARISON_COLORS.length
												],
										}}
									/>
									{account.accountName}
								</div>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{visibleMetrics.map((metric) => {
						const { bestSet, worstSet } = findBestAndWorst(metric)
						return (
							<tr
								key={metric.key}
								className="border-bg-300 border-b last:border-b-0"
							>
								<td className="text-txt-300 py-s-200 pr-m-400 whitespace-nowrap">
									{metric.label}
								</td>
								{accounts.map((account, index) => {
									const value = metric.getValue(account)
									const isBest = bestSet.has(index)
									const isWorst = worstSet.has(index)
									return (
										<td
											key={account.accountId}
											className={cn(
												"py-s-200 px-s-300 text-right whitespace-nowrap font-semibold",
												isBest && "text-trade-buy",
												isWorst && "text-trade-sell",
												!isBest && !isWorst && "text-txt-100 font-normal"
											)}
										>
											{metric.format(value)}
										</td>
									)
								})}
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

export { ComparisonStatsTable }
