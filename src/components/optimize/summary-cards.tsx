"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import type { OptimizationRun } from "@/types/backtest"

interface SummaryCardsProps {
	runs: OptimizationRun[]
}

const SummaryCards = ({ runs }: SummaryCardsProps) => {
	const t = useTranslations("optimize")

	const stats = useMemo(() => {
		if (runs.length === 0) return null

		const profitable = runs.filter((r) => r.summary.totalPnlCents > 0).length
		const losing = runs.length - profitable
		const bestPF = Math.max(...runs.map((r) => r.summary.profitFactor))
		const bestSharpe = Math.max(...runs.map((r) => r.summary.sharpeRatio))

		return { profitable, losing, bestPF, bestSharpe }
	}, [runs])

	if (!stats) return null

	const cards = [
		{
			label: t("summary.totalVariations"),
			value: String(runs.length),
			colorClass: "text-txt-100",
		},
		{
			label: t("summary.profitable"),
			value: String(stats.profitable),
			colorClass: "text-trade-buy",
		},
		{
			label: t("summary.losing"),
			value: String(stats.losing),
			colorClass: "text-trade-sell",
		},
		{
			label: t("summary.bestPF"),
			value: stats.bestPF.toFixed(2),
			colorClass: "text-acc-100",
		},
		{
			label: t("summary.bestSharpe"),
			value: stats.bestSharpe.toFixed(2),
			colorClass: "text-acc-100",
		},
	]

	return (
		<div className="grid grid-cols-2 gap-s-300 sm:grid-cols-3 lg:grid-cols-5">
			{cards.map((card) => (
				<div
					key={card.label}
					className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 text-center"
				>
					<p className="text-tiny text-txt-300 mb-s-100">{card.label}</p>
					<p className={`text-h2 font-semibold tabular-nums ${card.colorClass}`}>
						{card.value}
					</p>
				</div>
			))}
		</div>
	)
}

export { SummaryCards }
