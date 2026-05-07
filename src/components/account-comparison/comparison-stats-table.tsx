"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { AccountComparisonMetrics } from "@/types"
import type { ExpectancyMode } from "@/components/analytics/expectancy-mode-toggle"
import { COMPARISON_COLORS } from "./comparison-colors"
import { formatBrlWithSign, formatR, formatRatio } from "@/lib/formatting"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

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

	const metrics = useMemo<MetricRow[]>(
		() => [
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
		],
		[t, expectancyMode]
	)

	const visibleMetrics = useMemo(
		() =>
			metrics.filter(
				(m) =>
					m.mode === "always" ||
					(m.mode === "capital" && expectancyMode === "capital") ||
					(m.mode === "edge" && expectancyMode === "edge")
			),
		[metrics, expectancyMode]
	)

	/**
	 * Pre-compute best/worst index sets for ALL visible metrics in a single pass.
	 * Map key: metric.key → { bestSet, worstSet }
	 * Uses a tolerance of 1% of the value range so near-equal values share rank.
	 */
	const bestWorstMap = useMemo(() => {
		const map = new Map<
			string,
			{ bestSet: Set<number>; worstSet: Set<number> }
		>()
		const empty = { bestSet: new Set<number>(), worstSet: new Set<number>() }

		for (const metric of visibleMetrics) {
			if (metric.direction === "neutral") {
				map.set(metric.key, empty)
				continue
			}

			const values = accounts.map((a) => metric.getValue(a))
			const min = Math.min(...values)
			const max = Math.max(...values)
			const range = max - min

			if (range < 0.01) {
				map.set(metric.key, empty)
				continue
			}

			const tolerance = Math.max(range * 0.01, 0.01)
			const bestVal = metric.direction === "higher-better" ? max : min
			const worstVal = metric.direction === "higher-better" ? min : max

			const bestSet = new Set<number>()
			const worstSet = new Set<number>()

			for (let i = 0; i < values.length; i++) {
				if (Math.abs(values[i] - bestVal) <= tolerance) {
					bestSet.add(i)
				} else if (Math.abs(values[i] - worstVal) <= tolerance) {
					worstSet.add(i)
				}
			}

			map.set(metric.key, { bestSet, worstSet })
		}

		return map
	}, [visibleMetrics, accounts])

	return (
		<div
			id="comparison-stats-table"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 overflow-x-auto rounded-lg border"
		>
			<Table className="text-small w-full">
				<TableHeader>
					<TableRow className="border-bg-300 border-b">
						<TableHead className="text-txt-300 py-s-200 pr-m-400 text-left font-medium">
							{t("metric")}
						</TableHead>
						{accounts.map((account, index) => (
							<TableHead
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right font-medium"
							>
								<div className="gap-s-200 flex items-center justify-end">
									<span
										className="inline-block h-2.5 w-2.5 rounded-full"
										style={{
											backgroundColor:
												COMPARISON_COLORS[index % COMPARISON_COLORS.length],
										}}
									/>
									{account.accountName}
								</div>
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{visibleMetrics.map((metric) => {
						const { bestSet, worstSet } = bestWorstMap.get(metric.key) ?? {
							bestSet: new Set<number>(),
							worstSet: new Set<number>(),
						}
						return (
							<TableRow
								key={metric.key}
								className="border-bg-300 border-b last:border-b-0"
							>
								<TableCell className="text-txt-300 py-s-200 pr-m-400 whitespace-nowrap">
									{metric.label}
								</TableCell>
								{accounts.map((account, index) => {
									const value = metric.getValue(account)
									const isBest = bestSet.has(index)
									const isWorst = worstSet.has(index)
									return (
										<TableCell
											key={account.accountId}
											className={cn(
												"py-s-200 px-s-300 text-right font-semibold whitespace-nowrap",
												isBest && "text-trade-buy",
												isWorst && "text-trade-sell",
												!isBest && !isWorst && "text-txt-100 font-normal"
											)}
										>
											{metric.format(value)}
										</TableCell>
									)
								})}
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}

export { ComparisonStatsTable }
