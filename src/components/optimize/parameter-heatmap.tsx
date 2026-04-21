"use client"

import { Fragment, useState, useMemo, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCentsAsCurrency } from "@/lib/money"
import { getNestedValue } from "@/lib/optimize/parameter-grid"
import {
	getVaryingParams,
	getMetricValue,
	getNestedStringValue,
	buildHeatmapData,
	getCellIntensityClass,
	cellKey,
	HEATMAP_METRICS,
} from "@/lib/optimize/heatmap-utils"
import type { HeatmapMetric, HeatmapCell, VaryingParam } from "@/lib/optimize/heatmap-utils"
import type { OptimizationRun } from "@/types/backtest"

interface ParameterHeatmapProps {
	runs: OptimizationRun[]
	onSelectRun: (runId: string) => void
}

// ── Metric formatting helpers ────────────────────────────────────

const formatMetricCompact = (value: number, metric: HeatmapMetric): string => {
	switch (metric) {
		case "profitFactor": return value.toFixed(2)
		case "sharpeRatio": return value.toFixed(2)
		case "winRate": return `${value.toFixed(0)}%`
		case "totalPnlCents": return formatCentsAsCurrency(value, "BRL")
		case "maxDrawdownCents": return formatCentsAsCurrency(value, "BRL")
		case "avgRMultiple": return `${value.toFixed(2)}R`
	}
}

const formatMetricLabel = (value: number, metric: HeatmapMetric): string => {
	switch (metric) {
		case "profitFactor": return value.toFixed(2)
		case "sharpeRatio": return value.toFixed(2)
		case "winRate": return `${value.toFixed(1)}%`
		case "totalPnlCents": return formatCentsAsCurrency(value, "BRL")
		case "maxDrawdownCents": return formatCentsAsCurrency(value, "BRL")
		case "avgRMultiple": return `${value.toFixed(2)}R`
	}
}

// ── Component ────────────────────────────────────────────────────

const ParameterHeatmap = ({ runs, onSelectRun }: ParameterHeatmapProps) => {
	const t = useTranslations("optimize")

	const [xParamPath, setXParamPath] = useState<string>("")
	const [yParamPath, setYParamPath] = useState<string>("")
	const [metric, setMetric] = useState<HeatmapMetric>("profitFactor")
	const [slices, setSlices] = useState<Record<string, number | string>>({})
	const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null)

	// Auto-detect varying params
	const varyingParams = useMemo(() => getVaryingParams(runs), [runs])

	// Check for mixed strategies
	const hasMixedStrategies = useMemo(() => {
		if (runs.length < 2) return false
		const firstType = runs[0].recipe.entry.type
		return runs.some((r) => r.recipe.entry.type !== firstType)
	}, [runs])

	// Find best run for slice defaults
	const bestRun = useMemo(() => {
		if (runs.length === 0) return null
		return runs.reduce((best, r) => r.summary.profitFactor > best.summary.profitFactor ? r : best)
	}, [runs])

	// Only numeric varying params can be used as heatmap axes
	const numericVaryingParams = useMemo(
		() => varyingParams.filter((p): p is VaryingParam & { kind: "numeric" } => p.kind === "numeric"),
		[varyingParams]
	)

	// Auto-initialize X/Y and slices when varying params change
	useEffect(() => {
		if (numericVaryingParams.length < 2) return

		setXParamPath(numericVaryingParams[0].path)
		setYParamPath(numericVaryingParams[1].path)

		// Default slices: all enum params + numeric params beyond the first 2
		if (bestRun) {
			const defaultSlices: Record<string, number | string> = {}
			// All enum params always go to slices
			for (const param of varyingParams) {
				if (param.kind === "enum") {
					defaultSlices[param.path] = getNestedStringValue(bestRun.recipe, param.path)
				}
			}
			// Numeric params beyond the first 2 also go to slices
			for (let i = 2; i < numericVaryingParams.length; i++) {
				defaultSlices[numericVaryingParams[i].path] = getNestedValue(bestRun.recipe, numericVaryingParams[i].path)
			}
			setSlices(defaultSlices)
		} else {
			setSlices({})
		}
	}, [varyingParams, numericVaryingParams, bestRun])

	// Build heatmap data
	const heatmapData = useMemo(() => {
		if (!xParamPath || !yParamPath || xParamPath === yParamPath) return null
		return buildHeatmapData(runs, xParamPath, yParamPath, metric, slices)
	}, [runs, xParamPath, yParamPath, metric, slices])

	// Need at least 2 numeric varying params for a 2D grid
	if (numericVaryingParams.length < 2) return null

	// Params not on axes: all enum params (always sliced) + numeric params not assigned to X/Y
	const sliceParams = varyingParams.filter(
		(p) => p.kind === "enum" || (p.path !== xParamPath && p.path !== yParamPath)
	)

	const handleXChange = (path: string) => {
		setXParamPath(path)
		// If new X was a slice param, remove from slices; if old X should become a slice, add it
		setSlices((prev) => {
			const next = { ...prev }
			delete next[path]
			// Add the previous X param as a numeric slice if it's not the Y axis
			if (xParamPath && xParamPath !== yParamPath && xParamPath !== path && bestRun) {
				next[xParamPath] = getNestedValue(bestRun.recipe, xParamPath)
			}
			return next
		})
	}

	const handleYChange = (path: string) => {
		setYParamPath(path)
		setSlices((prev) => {
			const next = { ...prev }
			delete next[path]
			if (yParamPath && yParamPath !== xParamPath && yParamPath !== path && bestRun) {
				next[yParamPath] = getNestedValue(bestRun.recipe, yParamPath)
			}
			return next
		})
	}

	const handleSliceChange = (path: string, value: string) => {
		const param = varyingParams.find((p) => p.path === path)
		// Enum slices stay as strings; numeric slices get parsed to numbers
		const parsed = param?.kind === "enum" ? value : parseFloat(value)
		setSlices((prev) => ({ ...prev, [path]: parsed }))
	}

	const xParam = numericVaryingParams.find((p) => p.path === xParamPath)
	const yParam = numericVaryingParams.find((p) => p.path === yParamPath)

	return (
		<div className="border-bg-300 bg-bg-200 space-y-m-300 rounded-lg border p-m-400">
			{/* Header */}
			<div>
				<h3 className="text-heading-3 font-semibold text-txt-100">{t("heatmap.title")}</h3>
				<p className="text-tiny text-txt-300 mt-s-100">{t("heatmap.subtitle")}</p>
			</div>

			{/* Mixed strategy warning */}
			{hasMixedStrategies && (
				<div className="border-acc-100/30 bg-acc-100/5 flex items-center gap-s-200 rounded-md border p-s-300">
					<AlertTriangle className="text-acc-100 h-4 w-4 shrink-0" aria-hidden="true" />
					<span className="text-small text-txt-200">{t("heatmap.mixedStrategies")}</span>
				</div>
			)}

			{/* Controls row */}
			<div className="grid grid-cols-3 gap-s-200">
				{/* X Axis */}
				<div className="space-y-s-100">
					<span className="text-tiny text-txt-300">{t("heatmap.xAxis")}</span>
					<Select value={xParamPath} onValueChange={handleXChange}>
						<SelectTrigger id="heatmap-x-axis">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{numericVaryingParams.map((p) => (
								<SelectItem
									key={p.path}
									value={p.path}
									disabled={p.path === yParamPath}
								>
									{t(`sweepParam.${p.labelKey}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Y Axis */}
				<div className="space-y-s-100">
					<span className="text-tiny text-txt-300">{t("heatmap.yAxis")}</span>
					<Select value={yParamPath} onValueChange={handleYChange}>
						<SelectTrigger id="heatmap-y-axis">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{numericVaryingParams.map((p) => (
								<SelectItem
									key={p.path}
									value={p.path}
									disabled={p.path === xParamPath}
								>
									{t(`sweepParam.${p.labelKey}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Metric */}
				<div className="space-y-s-100">
					<span className="text-tiny text-txt-300">{t("heatmap.metric")}</span>
					<Select value={metric} onValueChange={(v) => setMetric(v as HeatmapMetric)}>
						<SelectTrigger id="heatmap-metric">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{HEATMAP_METRICS.map((m) => (
								<SelectItem key={m} value={m}>
									{t(`heatmap.metrics.${m}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Slice selectors (when 3+ params vary) */}
			{sliceParams.length > 0 && (
				<div className="gap-s-200 flex flex-wrap items-end">
					{sliceParams.map((param) => (
						<div key={param.path} className="space-y-s-100">
							<span className="text-tiny text-txt-300">
								{t("heatmap.fixedAt")}: {t(`sweepParam.${param.labelKey}`)}
							</span>
							<Select
								value={String(slices[param.path] ?? param.values[0])}
								onValueChange={(v) => handleSliceChange(param.path, v)}
							>
								<SelectTrigger id={`heatmap-slice-${param.path}`} className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{param.values.map((val) => (
										<SelectItem key={String(val)} value={String(val)}>
											{param.kind === "enum"
												? t(`sweepParam.${param.optionLabelKeys[val]}`)
												: val}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}
				</div>
			)}

			{/* Heatmap grid */}
			{heatmapData && xParam && yParam && (
				<div className="flex justify-center overflow-x-auto">
					<div
						className="grid w-fit gap-1"
						style={{
							gridTemplateColumns: `auto repeat(${heatmapData.xValues.length}, minmax(36px, 56px))`,
						}}
					>
						{/* X-axis header row */}
						<div />
						{heatmapData.xValues.map((xVal) => (
							<div
								key={xVal}
								className="text-tiny text-txt-300 pb-s-100 text-center font-medium tabular-nums"
							>
								{xVal}
							</div>
						))}

						{/* Y rows */}
						{heatmapData.yValues.map((yVal) => (
							<Fragment key={yVal}>
								{/* Y-axis label */}
								<div className="text-small text-txt-200 pr-s-200 flex items-center justify-end font-medium tabular-nums">
									{yVal}
								</div>

								{/* Data cells */}
								{heatmapData.xValues.map((xVal) => {
									const cell = heatmapData.cells.get(cellKey(xVal, yVal))
									const isHovered = hoveredCell?.xVal === xVal && hoveredCell?.yVal === yVal

									if (!cell) {
										return (
											<div
												key={`${xVal}-${yVal}`}
												className="bg-bg-300/30 flex h-10 items-center justify-center rounded-md"
											/>
										)
									}

									const colorClass = getCellIntensityClass(
										cell.metricValue,
										heatmapData.minMetric,
										heatmapData.maxMetric,
										metric
									)

									return (
										<div
											key={`${xVal}-${yVal}`}
											className={cn(
												"relative flex h-10 items-center justify-center rounded-md transition-all",
												"hover:ring-acc-100 focus:ring-acc-100 cursor-pointer hover:ring-2 focus:ring-2 focus:outline-none",
												colorClass,
												isHovered && "ring-acc-100 scale-105 ring-2"
											)}
											onMouseEnter={() => setHoveredCell(cell)}
											onMouseLeave={() => setHoveredCell(null)}
											onFocus={() => setHoveredCell(cell)}
											onBlur={() => setHoveredCell(null)}
											onClick={() => onSelectRun(cell.run.id)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault()
													onSelectRun(cell.run.id)
												}
											}}
											tabIndex={0}
											role="button"
											aria-label={`${t(`sweepParam.${xParam.labelKey}`)} ${xVal} × ${t(`sweepParam.${yParam.labelKey}`)} ${yVal} — ${t(`heatmap.metrics.${metric}`)}: ${formatMetricLabel(cell.metricValue, metric)}`}
										>
											<span className="text-micro text-txt-100 font-semibold drop-shadow-sm tabular-nums">
												{formatMetricCompact(cell.metricValue, metric)}
											</span>
											{cell.count > 1 && (
												<span className="absolute top-0 right-0.5 text-[8px] text-txt-300">
													{cell.count}×
												</span>
											)}
										</div>
									)
								})}
							</Fragment>
						))}
					</div>
				</div>
			)}

			{/* Axis labels below grid */}
			{heatmapData && xParam && yParam && (
				<div className="text-tiny text-txt-300 flex items-center justify-center gap-m-400">
					<span>X: {t(`sweepParam.${xParam.labelKey}`)}</span>
					<span>Y: {t(`sweepParam.${yParam.labelKey}`)}</span>
				</div>
			)}

			{/* Hovered cell detail bar */}
			<div
				className={cn(
					"rounded-lg border px-m-400 py-s-200 transition-all",
					hoveredCell
						? "border-acc-100/30 bg-bg-100"
						: "border-bg-300 bg-bg-100/50"
				)}
			>
				{hoveredCell ? (
					<HoveredCellDetail cell={hoveredCell} metric={metric} t={t} />
				) : (
					<p className="text-tiny text-txt-300 text-center">
						{t("heatmap.subtitle")}
					</p>
				)}
			</div>

			{/* Legend */}
			<div className="text-tiny text-txt-300 flex flex-wrap items-center justify-center gap-m-500">
				<div className="gap-s-200 flex items-center">
					<div className="bg-trade-buy/70 h-3 w-3 rounded-sm" />
					<span>{t("heatmap.profitable")}</span>
				</div>
				<div className="gap-s-200 flex items-center">
					<div className="bg-trade-sell/70 h-3 w-3 rounded-sm" />
					<span>{t("heatmap.losing")}</span>
				</div>
				<div className="gap-s-200 flex items-center">
					<div className="bg-bg-300/30 h-3 w-3 rounded-sm" />
					<span>{t("heatmap.neutral")}</span>
				</div>
			</div>
		</div>
	)
}

// ── Hovered cell detail sub-component ────────────────────────────

interface HoveredCellDetailProps {
	cell: HeatmapCell
	metric: HeatmapMetric
	t: ReturnType<typeof useTranslations<"optimize">>
}

const HoveredCellDetail = ({ cell, metric, t }: HoveredCellDetailProps) => {
	const summary = cell.run.summary
	const metricColor = (value: number, positive: boolean) =>
		positive ? "text-trade-buy" : "text-trade-sell"

	return (
		<div className="gap-m-400 flex items-center justify-between">
			<div>
				<p className="text-small text-txt-100 font-semibold">
					{cell.run.label}
				</p>
				{cell.count > 1 && (
					<p className="text-tiny text-txt-300">
						{t("heatmap.multipleRuns", { count: cell.count })}
					</p>
				)}
			</div>
			<div className="gap-m-500 flex items-center">
				<MetricStat label="PF" value={summary.profitFactor.toFixed(2)} positive={summary.profitFactor >= 1} highlight={metric === "profitFactor"} />
				<MetricStat label="Win" value={`${summary.winRate.toFixed(0)}%`} positive={summary.winRate >= 50} highlight={metric === "winRate"} />
				<MetricStat label="Sharpe" value={summary.sharpeRatio.toFixed(2)} positive={summary.sharpeRatio >= 0} highlight={metric === "sharpeRatio"} />
				<MetricStat label="P&L" value={formatCentsAsCurrency(summary.totalPnlCents, "BRL")} positive={summary.totalPnlCents >= 0} highlight={metric === "totalPnlCents"} />
				<MetricStat label="Trades" value={String(summary.totalTrades)} positive={true} highlight={false} />
			</div>
		</div>
	)
}

interface MetricStatProps {
	label: string
	value: string
	positive: boolean
	highlight: boolean
}

const MetricStat = ({ label, value, positive, highlight }: MetricStatProps) => (
	<div className="text-right">
		<p className={cn("text-tiny", highlight ? "text-acc-100" : "text-txt-300")}>{label}</p>
		<p className={cn(
			"text-small font-semibold tabular-nums",
			positive ? "text-trade-buy" : "text-trade-sell"
		)}>
			{value}
		</p>
	</div>
)

export { ParameterHeatmap }
