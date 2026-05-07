"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import type { AccountComparisonMetrics } from "@/types"
import { COMPARISON_COLORS } from "./comparison-colors"
import { formatBrlWithSign, formatRatio } from "@/lib/formatting"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

interface ComparisonNormalizedTableProps {
	accounts: AccountComparisonMetrics[]
}

interface NormalizedMetric {
	key: string
	label: string
	/** Raw R-based value per account */
	getRValue: (a: AccountComparisonMetrics) => number
	direction: "higher-better" | "lower-better"
}

/**
 * Shows monetary metrics normalized to a common reference risk.
 *
 * The math: each account has an avgRiskPerTrade (the average $ risked per trade).
 * To compare accounts on equal footing, we scale all $ metrics by:
 *   normFactor = referenceRisk / accountAvgRisk
 *
 * Alternatively, since R-multiples already normalize away position size:
 *   normalized $ value = R-value × referenceRisk
 *
 * We use the R-based approach as it's more precise.
 */
const ComparisonNormalizedTable = ({
	accounts,
}: ComparisonNormalizedTableProps) => {
	const t = useTranslations("accountComparison.normalized")

	// Default reference risk: median avgRiskPerTrade across accounts that have it
	const risksWithData = useMemo(
		() =>
			accounts
				.map((a) => a.avgRiskPerTrade)
				.filter((r) => r > 0)
				.toSorted((a, b) => a - b),
		[accounts]
	)

	const defaultRisk =
		risksWithData.length > 0
			? risksWithData[Math.floor(risksWithData.length / 2)]
			: 100

	const [referenceRisk, setReferenceRisk] = useState(
		Math.round(defaultRisk * 100) / 100
	)

	const handleRiskChange = (value: string) => {
		const parsed = parseFloat(value)
		if (!isNaN(parsed) && parsed > 0) {
			setReferenceRisk(parsed)
		}
	}

	const metrics = useMemo<NormalizedMetric[]>(
		() => [
			{
				key: "normalizedEV",
				label: t("expectedValue"),
				getRValue: (a) => a.expectedValue.expectedR,
				direction: "higher-better",
			},
			{
				key: "normalizedAvgWin",
				label: t("avgWin"),
				getRValue: (a) => a.expectedValue.avgWinR,
				direction: "higher-better",
			},
			{
				key: "normalizedAvgLoss",
				label: t("avgLoss"),
				getRValue: (a) => a.expectedValue.avgLossR,
				direction: "lower-better",
			},
			{
				key: "normalizedProjected",
				label: t("projectedPnl"),
				getRValue: (a) => a.expectedValue.projectedR100,
				direction: "higher-better",
			},
		],
		[t]
	)

	const getNormalizedValue = (rValue: number): number => rValue * referenceRisk

	/**
	 * Pre-compute best/worst index sets for ALL metrics in a single pass.
	 * Map key: metric.key → { bestSet, worstSet }
	 */
	const bestWorstMap = useMemo(() => {
		const map = new Map<
			string,
			{ bestSet: Set<number>; worstSet: Set<number> }
		>()
		const empty = { bestSet: new Set<number>(), worstSet: new Set<number>() }

		for (const metric of metrics) {
			const values = accounts.map((a) =>
				getNormalizedValue(metric.getRValue(a))
			)
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
	}, [metrics, accounts, referenceRisk])

	// Show each account's actual avg risk for reference
	const hasRiskData = accounts.some((a) => a.avgRiskPerTrade > 0)

	return (
		<div
			id="comparison-normalized-table"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 overflow-x-auto rounded-lg border"
		>
			<div className="mb-s-300 gap-s-200 flex flex-col sm:flex-row sm:items-center sm:justify-between">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("title")}
				</h3>
				<div className="gap-s-200 flex items-center">
					<label
						htmlFor="reference-risk"
						className="text-tiny text-txt-300 whitespace-nowrap"
					>
						{t("referenceRisk")}:
					</label>
					<div className="gap-s-100 flex items-center">
						<span className="text-tiny text-txt-300">R$</span>
						<Input
							id="reference-risk"
							type="number"
							min="1"
							step="10"
							value={referenceRisk}
							onChange={(e) => handleRiskChange(e.target.value)}
							className="border-bg-300 bg-bg-100 text-txt-100 text-small px-s-200 py-s-100 w-24 rounded-sm border"
						/>
					</div>
				</div>
			</div>

			<p className="text-tiny text-txt-300 mb-s-300">{t("description")}</p>

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
					{/* Actual avg risk row for context */}
					{hasRiskData && (
						<TableRow className="border-bg-300 border-b">
							<TableCell className="text-txt-300 py-s-200 pr-m-400 whitespace-nowrap italic">
								{t("actualAvgRisk")}
							</TableCell>
							{accounts.map((account) => (
								<TableCell
									key={account.accountId}
									className="text-txt-300 py-s-200 px-s-300 text-right whitespace-nowrap italic"
								>
									{account.avgRiskPerTrade > 0
										? `R$ ${account.avgRiskPerTrade.toFixed(2)}`
										: "—"}
								</TableCell>
							))}
						</TableRow>
					)}

					{metrics.map((metric) => {
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
									const normalized = getNormalizedValue(
										metric.getRValue(account)
									)
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
											{formatBrlWithSign(normalized)}
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

export { ComparisonNormalizedTable }
