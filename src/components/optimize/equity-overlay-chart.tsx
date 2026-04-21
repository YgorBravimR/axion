"use client"

import { useMemo } from "react"
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

interface OverlayDataPoint {
	tradeIndex: number
	[runId: string]: number
}

const EquityOverlayChart = ({ runs }: EquityOverlayChartProps) => {
	const { yAxisWidth, tickFontSize } = useChartConfig()

	// Build merged data: one row per trade index, one column per run
	const { chartData, maxTradeIndex } = useMemo(() => {
		if (runs.length === 0) return { chartData: [], maxTradeIndex: 0 }

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

		return { chartData: data, maxTradeIndex: maxIdx }
	}, [runs])

	if (chartData.length === 0) return null

	// Sort runs by profit factor descending so best gets gold
	const sortedRuns = [...runs].sort((a, b) => b.summary.profitFactor - a.summary.profitFactor)

	return (
		<ChartContainer id="equity-overlay" className="h-72">
			<LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
				<CartesianGrid
					strokeDasharray="3 3"
					stroke="var(--color-bg-300)"
					vertical={false}
				/>
				<XAxis
					dataKey="tradeIndex"
					tick={{ fontSize: tickFontSize, fill: "var(--color-txt-300)" }}
					axisLine={{ stroke: "var(--color-bg-300)" }}
					tickLine={false}
				/>
				<YAxis
					width={yAxisWidth}
					tickFormatter={(v: number) => formatCompactCurrency(v, "R$")}
					tick={{ fontSize: tickFontSize, fill: "var(--color-txt-300)" }}
					axisLine={false}
					tickLine={false}
				/>
				<ChartTooltip
					content={({ active, payload }) => {
						if (!active || !payload?.length) return null
						return (
							<div className="bg-bg-200 border-bg-300 rounded-lg border p-s-300 shadow-lg">
								<p className="text-tiny text-txt-300 mb-s-100">
									Trade #{payload[0]?.payload?.tradeIndex}
								</p>
								{payload.map((entry) => {
									const dataKey = String(entry.dataKey)
									const run = runs.find((r) => r.id === dataKey)
									if (!run) return null
									return (
										<p key={dataKey} className="font-mono text-small" style={{ color: entry.color }}>
											{run.label}: {formatCompactCurrency(entry.value as number, "R$")}
										</p>
									)
								})}
							</div>
						)
					}}
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
						const run = runs.find((r) => r.id === value)
						return <span className="text-tiny text-txt-200">{run?.label ?? value}</span>
					}}
				/>
			</LineChart>
		</ChartContainer>
	)
}

export { EquityOverlayChart }
