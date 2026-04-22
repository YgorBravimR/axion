"use client"

import { useMemo, memo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Legend } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useChartConfig } from "@/hooks/use-chart-config"
import { formatCompactCurrency } from "@/lib/formatting"
import type { OptimizationRun } from "@/types/backtest"

interface EquityOverlayChartProps {
	runs: OptimizationRun[]
}

/** Rotating palette — gold first (best run), then distinct hues */
const LINE_COLORS = [
	"var(--color-acc-100)",  // gold — first/best
	"#2196F3",              // blue
	"#26a69a",              // teal
	"#FF9800",              // orange
	"#AB47BC",              // purple
	"#EC407A",              // pink
	"#66BB6A",              // green
	"#78909C",              // slate
]

const CHART_MARGIN = { top: 5, right: 5, left: 0, bottom: 0 }

interface OverlayDataPoint {
	tradeIndex: number
	[runId: string]: number
}

interface OverlayTooltipProps {
	active?: boolean
	payload?: Array<{ dataKey: string | number; value: unknown; color: string; payload: OverlayDataPoint }>
	runsMap: Map<string, OptimizationRun>
}

const OverlayTooltip = ({ active, payload, runsMap }: OverlayTooltipProps) => {
	if (!active || !payload?.length) return null
	return (
		<div className="bg-bg-200 border-bg-300 rounded-lg border p-s-300 shadow-lg">
			<p className="text-tiny text-txt-300 mb-s-100">
				Trade #{payload[0]?.payload?.tradeIndex}
			</p>
			{payload.map((entry) => {
				const dataKey = String(entry.dataKey)
				const run = runsMap.get(dataKey)
				if (!run) return null
				return (
					<p key={dataKey} className="font-mono text-small" style={{ color: entry.color }}>
						{run.label}: {formatCompactCurrency(entry.value as number, "R$")}
					</p>
				)
			})}
		</div>
	)
}

const EquityOverlayChart = memo(({ runs }: EquityOverlayChartProps) => {
	const { yAxisWidth, tickFontSize } = useChartConfig()

	const runsMap = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs])

	// Build merged data: one row per trade index, one column per run
	const { chartData } = useMemo(() => {
		if (runs.length === 0) return { chartData: [] }

		const maxIdx = Math.max(...runs.map((r) => r.equityCurve.length))
		const data: OverlayDataPoint[] = []

		for (let i = 0; i < maxIdx; i++) {
			const point: OverlayDataPoint = { tradeIndex: i + 1 }
			for (const run of runs) {
				const curvePoint = run.equityCurve[i]
				if (curvePoint) {
					point[run.id] = curvePoint.cumulativePnlCents / 100
				}
			}
			data.push(point)
		}

		return { chartData: data }
	}, [runs])

	// Sort runs by profit factor descending so best gets gold
	const sortedRuns = useMemo(
		() => [...runs].sort((a, b) => b.summary.profitFactor - a.summary.profitFactor),
		[runs]
	)

	if (chartData.length === 0) return null

	const axisTick = { fontSize: tickFontSize, fill: "var(--color-txt-300)" }

	return (
		<ChartContainer id="equity-overlay" className="h-72">
			<LineChart data={chartData} margin={CHART_MARGIN}>
				<CartesianGrid
					strokeDasharray="3 3"
					stroke="var(--color-bg-300)"
					vertical={false}
				/>
				<XAxis
					dataKey="tradeIndex"
					tick={axisTick}
					axisLine={{ stroke: "var(--color-bg-300)" }}
					tickLine={false}
				/>
				<YAxis
					width={yAxisWidth}
					tickFormatter={(v: number) => formatCompactCurrency(v, "R$")}
					tick={axisTick}
					axisLine={false}
					tickLine={false}
				/>
				<ChartTooltip
					content={(props) => (
						<OverlayTooltip
							active={props.active}
							payload={props.payload as unknown as OverlayTooltipProps["payload"]}
							runsMap={runsMap}
						/>
					)}
				/>
				<ReferenceLine y={0} stroke="var(--color-txt-300)" strokeDasharray="3 3" strokeOpacity={0.5} />
				{sortedRuns.map((run, i) => (
					<Line
						key={run.id}
						type="monotone"
						dataKey={run.id}
						name={run.label}
						stroke={LINE_COLORS[i % LINE_COLORS.length]}
						strokeWidth={i === 0 ? 2 : 1.5}
						dot={false}
						animationDuration={300}
						connectNulls
					/>
				))}
				<Legend
					formatter={(value) => {
						const run = runsMap.get(value)
						return <span className="text-tiny text-txt-200">{run?.label ?? value}</span>
					}}
				/>
			</LineChart>
		</ChartContainer>
	)
})
EquityOverlayChart.displayName = "EquityOverlayChart"

export { EquityOverlayChart }
