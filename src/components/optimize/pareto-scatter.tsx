"use client"

import { useMemo, memo } from "react"
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
import { computeParetoFrontier, type ParetoPoint } from "@/lib/optimize/pareto"
import { formatCentsAsCurrency } from "@/lib/money"
import type { OptimizationRun } from "@/types/backtest"

interface ParetoScatterProps {
	runs: OptimizationRun[]
	onPointClick?: (_runId: string) => void
	currency?: string
}

const CHART_MARGIN = { top: 12, right: 24, left: 12, bottom: 24 }
const MIN_POINTS_FOR_FRONTIER = 10

interface ScatterTooltipProps {
	active?: boolean
	payload?: Array<{
		payload: ParetoPoint
	}>
	currency: string
}

const ScatterTooltip = ({ active, payload, currency }: ScatterTooltipProps) => {
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
				PF: <span className="text-txt-100 font-mono">{point.y.toFixed(2)}</span>
			</p>
			<p className="text-tiny text-txt-300">
				DD:{" "}
				<span className="text-txt-100 font-mono">
					{formatCentsAsCurrency(point.x, currency)}
				</span>
			</p>
			{point.isFrontier && (
				<p className="text-tiny text-trade-buy mt-s-100">★ Frontier</p>
			)}
		</div>
	)
}

const ParetoScatter = memo(
	({ runs, onPointClick, currency = "BRL" }: ParetoScatterProps) => {
		const t = useTranslations("optimize.pareto")

		const points = useMemo(() => computeParetoFrontier(runs), [runs])

		if (points.length < MIN_POINTS_FOR_FRONTIER) {
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

				<ChartContainer config={{}} className="aspect-[16/9] w-full">
					<ScatterChart margin={CHART_MARGIN}>
						<CartesianGrid strokeDasharray="3 3" opacity={0.2} />
						<XAxis
							type="number"
							dataKey="x"
							name={t("axisX")}
							tickFormatter={(v) => formatCentsAsCurrency(v, currency)}
							className="text-tiny"
						/>
						<YAxis
							type="number"
							dataKey="y"
							name={t("axisY")}
							tickFormatter={(v) => v.toFixed(2)}
							className="text-tiny"
						/>
						<ZAxis range={[80, 80]} />
						<ChartTooltip
							content={<ScatterTooltip currency={currency} />}
							cursor={{ strokeDasharray: "3 3" }}
						/>
						<Scatter
							data={points}
							onClick={(p) => {
								const point = p as unknown as ParetoPoint
								onPointClick?.(point.runId)
							}}
						>
							{points.map((p) => (
								<Cell
									key={p.runId}
									fill={
										p.isFrontier
											? p.isRobust === false
												? "var(--color-warning, #f59e0b)"
												: "var(--color-trade-buy, #22c55e)"
											: "var(--color-txt-300, #94a3b8)"
									}
									opacity={p.isFrontier ? 1 : 0.4}
								/>
							))}
						</Scatter>
					</ScatterChart>
				</ChartContainer>
			</div>
		)
	}
)
ParetoScatter.displayName = "ParetoScatter"

export { ParetoScatter }
