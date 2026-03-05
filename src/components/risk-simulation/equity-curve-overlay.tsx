"use client"

import { useMemo } from "react"
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { fromCents } from "@/lib/money"
import type { EquityCurvePoint } from "@/types/risk-simulation"

interface EquityCurveOverlayProps {
	equityCurve: EquityCurvePoint[]
}

interface TooltipPayload {
	tradeIndex: number
	dayKey: string
	original: number
	simulated: number
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{ value: number; payload: TooltipPayload }>
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	if (!active || !payload || payload.length === 0) return null

	const data = payload[0].payload

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">
				Trade #{data.tradeIndex + 1} — {data.dayKey}
			</p>
			<p className="text-small text-acc-200">
				Original: R${data.original.toFixed(2)}
			</p>
			<p className="text-small text-trade-buy">
				Simulated: R${data.simulated.toFixed(2)}
			</p>
		</div>
	)
}

const EquityCurveOverlay = ({ equityCurve }: EquityCurveOverlayProps) => {
	const t = useTranslations("riskSimulation.chart")

	const chartData = useMemo(
		() =>
			equityCurve.map((point) => ({
				tradeIndex: point.tradeIndex,
				dayKey: point.dayKey,
				original: fromCents(point.originalEquityCents),
				simulated: fromCents(point.simulatedEquityCents),
			})),
		[equityCurve]
	)

	const { minValue, maxValue } = useMemo(() => {
		const allValues = chartData.flatMap((d) => [d.original, d.simulated])
		return {
			minValue: Math.min(...allValues),
			maxValue: Math.max(...allValues),
		}
	}, [chartData])

	const padding = (maxValue - minValue) * 0.05 || 100

	if (chartData.length === 0) return null

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
			<h3 className="text-small text-txt-100 mb-s-300 font-semibold">
				{t("title")}
			</h3>
			<ChartContainer
				id="risk-sim-equity-chart"
				className="h-[250px] w-full sm:h-[300px] lg:h-[350px]"
			>
				<AreaChart
					data={chartData}
					margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-300)" />
					<XAxis
						dataKey="tradeIndex"
						tick={{ fontSize: 11, fill: "var(--color-txt-300)" }}
						tickFormatter={(val: number) => `#${val + 1}`}
					/>
					<YAxis
						domain={[minValue - padding, maxValue + padding]}
						tick={{ fontSize: 11, fill: "var(--color-txt-300)" }}
						tickFormatter={(val: number) => `${(val / 1000).toFixed(1)}k`}
						width={60}
					/>
					<Tooltip content={<CustomTooltip />} />
					<Legend
						wrapperStyle={{ fontSize: 12, color: "var(--color-txt-300)" }}
					/>

					{/* Original equity curve */}
					<Area
						type="monotone"
						dataKey="original"
						name={t("original")}
						stroke="var(--color-acc-200)"
						fill="var(--color-acc-200)"
						fillOpacity={0.1}
						strokeWidth={2}
					/>

					{/* Simulated equity curve */}
					<Area
						type="monotone"
						dataKey="simulated"
						name={t("simulated")}
						stroke="var(--color-trade-buy)"
						fill="var(--color-trade-buy)"
						fillOpacity={0.1}
						strokeWidth={2}
					/>
				</AreaChart>
			</ChartContainer>
		</div>
	)
}

export { EquityCurveOverlay }
