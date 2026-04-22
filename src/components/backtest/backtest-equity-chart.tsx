"use client"

import { useMemo } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { useChartConfig } from "@/hooks/use-chart-config"
import { formatCompactCurrency } from "@/lib/formatting"
import type { EquityCurvePoint } from "@/types/backtest"

const CHART_MARGIN = { top: 5, right: 5, left: 0, bottom: 0 }

interface BacktestEquityChartProps {
	equityCurve: EquityCurvePoint[]
}

interface ChartDataPoint {
	label: string
	equity: number
	drawdown: number
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{
		value: number
		dataKey: string
		payload: ChartDataPoint
	}>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	if (!active || !payload?.length) return null

	const data = payload[0].payload

	return (
		<div className="bg-bg-200 border-bg-300 rounded-lg border p-s-300 shadow-lg">
			<p className="text-tiny text-txt-300">{data.label}</p>
			<p className="font-mono text-small font-medium text-acc-100">
				{formatCompactCurrency(data.equity, "R$")}
			</p>
			{data.drawdown < 0 && (
				<p className="font-mono text-tiny text-fb-error">
					DD: {formatCompactCurrency(data.drawdown, "R$")}
				</p>
			)}
		</div>
	)
}

const BacktestEquityChart = ({ equityCurve }: BacktestEquityChartProps) => {
	const t = useTranslations("backtest.results")
	const { yAxisWidth, tickFontSize } = useChartConfig()

	const chartData: ChartDataPoint[] = useMemo(
		() =>
			equityCurve.map((point) => ({
				label: `#${point.tradeIndex + 1} — ${point.dayKey}`,
				equity: point.cumulativePnlCents / 100,
				drawdown: -(point.drawdownCents / 100),
			})),
		[equityCurve]
	)

	if (equityCurve.length === 0) return null

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border p-m-400">
			<h3 className="text-h3 font-semibold text-txt-100 mb-m-400">{t("equityCurve")}</h3>
			<ChartContainer id="backtest-equity" className="h-72">
				<AreaChart data={chartData} margin={CHART_MARGIN}>
					<defs>
						<linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="var(--color-acc-100)" stopOpacity={0.3} />
							<stop offset="95%" stopColor="var(--color-acc-100)" stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>
					<XAxis
						dataKey="label"
						tick={false}
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
					<ChartTooltip content={<CustomTooltip />} />
					<ReferenceLine y={0} stroke="var(--color-txt-300)" strokeDasharray="3 3" strokeOpacity={0.5} />
					<Area
						type="monotone"
						dataKey="equity"
						stroke="var(--color-acc-100)"
						strokeWidth={2}
						fill="url(#equityGradient)"
						dot={false}
						animationDuration={300}
					/>
					<Area
						type="monotone"
						dataKey="drawdown"
						stroke="var(--color-fb-error)"
						strokeWidth={1}
						fill="none"
						dot={false}
						animationDuration={300}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	)
}

export { BacktestEquityChart }
