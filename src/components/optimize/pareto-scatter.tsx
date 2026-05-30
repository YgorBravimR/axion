"use client"

import { useMemo, useState, useCallback, useEffect, memo } from "react"
import { useTranslations } from "next-intl"
import {
	ScatterChart,
	Scatter,
	XAxis,
	YAxis,
	CartesianGrid,
	ZAxis,
	Cell,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import {
	computeParetoFrontier,
	type ParetoPoint,
	type ParetoConstraints,
} from "@/lib/optimize/pareto"
import {
	METRIC_KEYS,
	DEFAULT_PARETO_AXES,
	isMetricKey,
	type MetricKey,
} from "@/lib/optimize/metric-keys"
import { formatCentsAsCurrency } from "@/lib/money"
import type { OptimizationRun } from "@/types/backtest"

interface ParetoScatterProps {
	runs: OptimizationRun[]
	onPointClick?: (_runId: string) => void
	onBreedSelected?: (_runIds: string[]) => void
	currency?: string
}

const CHART_MARGIN = { top: 12, right: 24, left: 12, bottom: 24 }
const MIN_POINTS_FOR_FRONTIER = 10

type FrontierSource = "IS" | "OOS"

const isCentsMetric = (key: MetricKey): boolean =>
	key === "maxDrawdown" || key === "maxDrawdownOOS"

const formatMetric = (
	value: number,
	key: MetricKey,
	currency: string
): string => {
	if (isCentsMetric(key)) {
		return formatCentsAsCurrency(value, currency)
	}
	if (key === "assertivity" || key === "matchRate") {
		const pct = key === "matchRate" ? value * 100 : value
		return `${pct.toFixed(1)}%`
	}
	if (key === "numTrades") {
		return value.toFixed(0)
	}
	return value.toFixed(2)
}

interface ScatterTooltipProps {
	active?: boolean
	payload?: Array<{ payload: ParetoPoint }>
	xKey: MetricKey
	yKey: MetricKey
	currency: string
	selectedIds: Set<string>
	tFrontier: string
	tSelected: string
}

const ScatterTooltip = ({
	active,
	payload,
	xKey,
	yKey,
	currency,
	selectedIds,
	tFrontier,
	tSelected,
}: ScatterTooltipProps) => {
	if (!active || !payload?.length) {
		return null
	}
	const point = payload[0]?.payload
	if (!point) {
		return null
	}
	return (
		<div className="bg-bg-200 border-bg-300 p-s-300 rounded-lg border shadow-lg">
			<p className="text-small text-txt-100 font-medium">{point.label}</p>
			<p className="text-tiny text-txt-300 mt-s-100">
				X:{" "}
				<span className="text-txt-100 font-mono">
					{formatMetric(point.x, xKey, currency)}
				</span>
			</p>
			<p className="text-tiny text-txt-300">
				Y:{" "}
				<span className="text-txt-100 font-mono">
					{formatMetric(point.y, yKey, currency)}
				</span>
			</p>
			{point.isFrontier && (
				<p className="text-tiny text-trade-buy mt-s-100">★ {tFrontier}</p>
			)}
			{selectedIds.has(point.runId) && (
				<p className="text-tiny text-accent">✓ {tSelected}</p>
			)}
		</div>
	)
}

const ParetoScatter = memo(
	({
		runs,
		onPointClick,
		onBreedSelected,
		currency = "BRL",
	}: ParetoScatterProps) => {
		const t = useTranslations("optimize.pareto")
		const tAxes = useTranslations("optimize.metricKeys")
		const tFilters = useTranslations("optimize.paretoFilters")

		const [xKey, setXKey] = useState<MetricKey>(DEFAULT_PARETO_AXES.x)
		const [yKey, setYKey] = useState<MetricKey>(DEFAULT_PARETO_AXES.y)
		const [source, setSource] = useState<FrontierSource>(() => {
			const anyOOS = runs.some((r) => r.summaryOOS)
			return anyOOS ? "OOS" : "IS"
		})
		const [minTradesOn, setMinTradesOn] = useState(false)
		const [minMatchRateOn, setMinMatchRateOn] = useState(false)
		const [robustOnly, setRobustOnly] = useState(false)
		const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

		const effectiveRuns = useMemo<OptimizationRun[]>(() => {
			if (source === "IS") {
				return runs
			}
			return runs
				.filter((r) => r.summaryOOS)
				.map((r) => ({
					...r,
					summary: r.summaryOOS!,
					matchRate: r.matchRateOOS ?? r.matchRate,
				}))
		}, [runs, source])

		const constraints = useMemo<ParetoConstraints>(
			() => ({
				profitOnly: true,
				minTrades: minTradesOn ? 30 : 0,
				minMatchRate: minMatchRateOn ? 0.5 : 0,
				robustOnly,
			}),
			[minTradesOn, minMatchRateOn, robustOnly]
		)

		const points = useMemo(
			() => computeParetoFrontier(effectiveRuns, xKey, yKey, constraints),
			[effectiveRuns, xKey, yKey, constraints]
		)

		const frontierPoints = useMemo(
			() => points.filter((p) => p.isFrontier),
			[points]
		)

		// Reset selections to all frontier points whenever the frontier identity changes
		// (axis change, filter toggle, source switch). Manual selections persist between
		// renders that don't change the frontier identity.
		const frontierIds = useMemo(
			() => frontierPoints.map((p) => p.runId).join("|"),
			[frontierPoints]
		)
		useEffect(() => {
			setSelectedIds(new Set(frontierIds ? frontierIds.split("|") : []))
		}, [frontierIds])

		const toggleSelection = useCallback((runId: string) => {
			setSelectedIds((prev) => {
				const next = new Set(prev)
				if (next.has(runId)) {
					next.delete(runId)
				} else {
					next.add(runId)
				}
				return next
			})
		}, [])

		const handlePointClick = useCallback(
			(point: ParetoPoint, ev?: { shiftKey?: boolean }) => {
				if (ev?.shiftKey) {
					toggleSelection(point.runId)
					return
				}
				onPointClick?.(point.runId)
			},
			[onPointClick, toggleSelection]
		)

		const oosAvailable = runs.some((r) => r.summaryOOS)
		const selectedCount = selectedIds.size
		const isDefaultAxes =
			xKey === DEFAULT_PARETO_AXES.x && yKey === DEFAULT_PARETO_AXES.y

		if (runs.length < MIN_POINTS_FOR_FRONTIER) {
			return (
				<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
					<p className="text-small text-txt-300">{t("emptyState")}</p>
				</div>
			)
		}

		return (
			<div className="border-bg-300 bg-bg-200 space-y-s-300 p-m-400 rounded-lg border">
				<div>
					<h3 className="text-h3 text-txt-100 font-semibold">{t("title")}</h3>
					<p className="text-small text-txt-300 mt-s-100">{t("subtitle")}</p>
				</div>

				<div className="gap-s-300 flex flex-wrap items-end">
					<label className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">{t("axisXLabel")}</span>
						<select
							value={xKey}
							onChange={(e) => {
								if (isMetricKey(e.target.value)) {
									setXKey(e.target.value)
								}
							}}
							className="border-bg-300 bg-bg-100 text-small text-txt-100 rounded-sm border px-2 py-1"
						>
							{Object.values(METRIC_KEYS).map((m) => (
								<option key={m.key} value={m.key}>
									{tAxes(m.labelKey)}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">{t("axisYLabel")}</span>
						<select
							value={yKey}
							onChange={(e) => {
								if (isMetricKey(e.target.value)) {
									setYKey(e.target.value)
								}
							}}
							className="border-bg-300 bg-bg-100 text-small text-txt-100 rounded-sm border px-2 py-1"
						>
							{Object.values(METRIC_KEYS).map((m) => (
								<option key={m.key} value={m.key}>
									{tAxes(m.labelKey)}
								</option>
							))}
						</select>
					</label>
					{isDefaultAxes && (
						<span className="bg-trade-buy text-tiny px-s-200 py-s-100 self-end rounded-sm text-white">
							{tAxes("recommended")}
						</span>
					)}
					<div className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">{t("sourceLabel")}</span>
						<div className="gap-s-200 flex">
							{(["IS", "OOS"] as const).map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => setSource(s)}
									disabled={s === "OOS" && !oosAvailable}
									className={`text-tiny px-s-200 py-s-100 rounded-sm border ${
										source === s
											? "bg-accent border-accent text-white"
											: "border-bg-300 text-txt-300"
									} disabled:opacity-40`}
								>
									{s}
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="gap-s-200 flex flex-wrap">
					<span className="text-tiny text-txt-300 self-center">
						{tFilters("filtersLabel")}:
					</span>
					<span className="text-tiny px-s-200 py-s-100 bg-trade-buy/20 border-trade-buy text-trade-buy rounded-sm border">
						{tFilters("profitOnlyLocked")}
					</span>
					<button
						type="button"
						onClick={() => setMinTradesOn((v) => !v)}
						className={`text-tiny px-s-200 py-s-100 rounded-sm border ${
							minTradesOn
								? "bg-accent border-accent text-white"
								: "border-bg-300 text-txt-300"
						}`}
					>
						{tFilters("minTrades30")}
					</button>
					<button
						type="button"
						onClick={() => setMinMatchRateOn((v) => !v)}
						className={`text-tiny px-s-200 py-s-100 rounded-sm border ${
							minMatchRateOn
								? "bg-accent border-accent text-white"
								: "border-bg-300 text-txt-300"
						}`}
					>
						{tFilters("minMatchRate50")}
					</button>
					<button
						type="button"
						onClick={() => setRobustOnly((v) => !v)}
						disabled={!oosAvailable}
						className={`text-tiny px-s-200 py-s-100 rounded-sm border ${
							robustOnly
								? "bg-accent border-accent text-white"
								: "border-bg-300 text-txt-300"
						} disabled:opacity-40`}
					>
						{tFilters("robustOnly")}
					</button>
				</div>

				{points.length === 0 ? (
					<div className="p-s-300 text-small text-txt-300 text-center">
						{tFilters("noPointsAfterFilters")}
					</div>
				) : (
					<ChartContainer id="pareto-scatter" className="aspect-[16/9] w-full">
						<ScatterChart margin={CHART_MARGIN}>
							<CartesianGrid strokeDasharray="3 3" opacity={0.2} />
							<XAxis
								type="number"
								dataKey="x"
								name={tAxes(METRIC_KEYS[xKey].labelKey)}
								tickFormatter={(v: number) => formatMetric(v, xKey, currency)}
								className="text-tiny"
							/>
							<YAxis
								type="number"
								dataKey="y"
								name={tAxes(METRIC_KEYS[yKey].labelKey)}
								tickFormatter={(v: number) => formatMetric(v, yKey, currency)}
								className="text-tiny"
							/>
							<ZAxis range={[80, 80]} />
							<ChartTooltip
								content={
									<ScatterTooltip
										xKey={xKey}
										yKey={yKey}
										currency={currency}
										selectedIds={selectedIds}
										tFrontier={t("frontierBadge")}
										tSelected={tFilters("selectedBadge")}
									/>
								}
								cursor={{ strokeDasharray: "3 3" }}
							/>
							<Scatter
								data={points}
								onClick={(p, _idx, ev) => {
									const point = p as unknown as ParetoPoint
									handlePointClick(point, ev as { shiftKey?: boolean })
								}}
							>
								{points.map((p) => {
									const isSelected = selectedIds.has(p.runId)
									const fill = isSelected
										? "var(--color-accent, #6366f1)"
										: p.isFrontier
											? p.isRobust === false
												? "var(--color-warning, #f59e0b)"
												: "var(--color-trade-buy, #22c55e)"
											: "var(--color-txt-300, #94a3b8)"
									return (
										<Cell
											key={p.runId}
											fill={fill}
											stroke={
												isSelected ? "var(--color-accent, #6366f1)" : undefined
											}
											strokeWidth={isSelected ? 2 : 0}
											opacity={p.isFrontier || isSelected ? 1 : 0.4}
										/>
									)
								})}
							</Scatter>
						</ScatterChart>
					</ChartContainer>
				)}

				{onBreedSelected && selectedCount > 0 && (
					<div className="gap-s-200 flex items-center justify-between">
						<span className="text-small text-txt-300">
							{tFilters("selectedCount", { count: selectedCount })}
						</span>
						<button
							type="button"
							onClick={() => onBreedSelected(Array.from(selectedIds))}
							className="bg-accent px-s-300 py-s-200 text-small rounded-sm font-medium text-white"
						>
							{tFilters("breedSelected", { count: selectedCount })}
						</button>
					</div>
				)}
				<p className="text-tiny text-txt-300">{tFilters("shiftClickHint")}</p>
			</div>
		)
	}
)
ParetoScatter.displayName = "ParetoScatter"

export { ParetoScatter }
