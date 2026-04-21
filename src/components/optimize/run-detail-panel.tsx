"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { BacktestSummaryCards } from "@/components/backtest/backtest-summary-cards"
import { BacktestTradesTable } from "@/components/backtest/backtest-trades-table"
import { BacktestEquityChart } from "@/components/backtest/backtest-equity-chart"
import { LoadingSpinner } from "@/components/shared"
import type { OptimizationRun } from "@/types/backtest"

interface RunDetailPanelProps {
	run: OptimizationRun
	onRecomputeTrades?: (runId: string) => void
}

const RunDetailPanel = ({ run, onRecomputeTrades }: RunDetailPanelProps) => {
	const t = useTranslations("optimize")

	const needsRecompute = run.trades.length === 0

	// Trigger re-computation when a sweep run (empty trades) is expanded
	useEffect(() => {
		if (needsRecompute && onRecomputeTrades) {
			onRecomputeTrades(run.id)
		}
	}, [run.id, needsRecompute, onRecomputeTrades])

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-400 rounded-lg border p-m-400">
			<div className="flex items-center justify-between">
				<h3 className="text-heading-3 font-semibold text-txt-100">
					{run.label}
				</h3>
				<span className="text-small text-txt-300">
					{run.recipe.entry.type === "orb_breakout" ? "ORB" : "10K"}
					{" — "}
					{run.recipe.displayName}
				</span>
			</div>

			{/* Recipe snapshot — key config values */}
			<div className="bg-bg-100/50 gap-m-300 grid grid-cols-2 rounded-lg p-s-300 sm:grid-cols-4">
				<ConfigItem label={t("configStop")} value={formatStopConfig(run)} />
				<ConfigItem label={t("configTarget")} value={formatTargetConfig(run)} />
				<ConfigItem label={t("configSizing")} value={formatSizingConfig(run)} />
				<ConfigItem label={t("configSlippage")} value={`${run.recipe.slippageTicks} ticks`} />
			</div>

			<BacktestSummaryCards summary={run.summary} />
			<BacktestEquityChart equityCurve={run.equityCurve} />

			{/* Show trades table or loading state while recomputing */}
			{needsRecompute ? (
				<LoadingSpinner size="sm" label={t("recomputingTrades")} className="py-m-500" />
			) : (
				<BacktestTradesTable trades={run.trades} />
			)}
		</div>
	)
}

// ── Config formatting helpers ──────────────────────────────────

interface ConfigItemProps {
	label: string
	value: string
}

const ConfigItem = ({ label, value }: ConfigItemProps) => (
	<div>
		<p className="text-tiny text-txt-300">{label}</p>
		<p className="text-small text-txt-100 font-medium">{value}</p>
	</div>
)

const formatStopConfig = (run: OptimizationRun): string => {
	const stop = run.recipe.stop.initial
	switch (stop.type) {
		case "pct_range": return `${stop.pct}% range`
		case "fixed_points": return stop.points === 0 ? "Pivot ref" : `${stop.points} pts`
		case "full_range": return `Full range +${stop.ticksBuffer}t`
	}
}

const formatTargetConfig = (run: OptimizationRun): string => {
	if (run.recipe.target.type !== "fixed_levels") return "—"
	const levels = run.recipe.target.levels
	return levels.map((l) => `${l.value}${l.mode === "r_multiple" ? "R" : "pts"}`).join(" / ")
}

const formatSizingConfig = (run: OptimizationRun): string => {
	const sizing = run.recipe.sizing
	if (sizing.type === "fixed_lots") return `${sizing.lots} lots`
	return `R$${(sizing.riskAmountCents / 100).toFixed(0)} risk`
}

export { RunDetailPanel }
