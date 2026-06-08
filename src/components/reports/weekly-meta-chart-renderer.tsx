"use client"

import { useTranslations } from "next-intl"
import {
	ComposedChart,
	Bar,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
	Cell,
} from "recharts"
import { formatCompactCurrency } from "@/lib/formatting"
import type {
	WeeklyMetaVsRealData,
	WeeklyMetaRow,
} from "@/lib/reports/annual-types"

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{ name: string; value: number; color: string }>
	label?: string
	weeks: WeeklyMetaRow[]
}

const CustomTooltip = ({
	active,
	payload,
	label,
	weeks,
}: CustomTooltipProps) => {
	const t = useTranslations("reports.weeklyMeta")
	if (!active || !payload?.length) {
		return null
	}
	const weekNum = parseInt(label?.replace("W", "") ?? "0")
	const week = weeks.find((w) => w.isoWeek === weekNum)

	if (week?.disabled) {
		return (
			<div className="border-bg-300 bg-bg-200 text-txt-300 text-tiny px-s-300 py-s-200 rounded-md border">
				{t("beforeAccountStart")}
			</div>
		)
	}

	return (
		<div className="border-bg-300 bg-bg-200 text-tiny space-y-s-100 px-s-300 py-s-200 rounded-md border">
			<p className="text-txt-100 font-mono font-medium">W{weekNum}</p>
			{week && (
				<p className="text-txt-300">
					{week.weekStart} → {week.weekEnd}
				</p>
			)}
			{payload.map((entry) => (
				<p key={entry.name} style={{ color: entry.color }}>
					{entry.name}: {formatCompactCurrency(entry.value / 100, "BRL")}
				</p>
			))}
		</div>
	)
}

const WeeklyMetaChartRenderer = ({ data }: { data: WeeklyMetaVsRealData }) => {
	const t = useTranslations("reports.weeklyMeta")
	const chartData = data.weeks.map((w) => ({
		name: `W${w.isoWeek}`,
		resultado: w.disabled ? 0 : w.resultado,
		metaBruto: w.metaBruto,
		metaLiquido: w.metaLiquido,
		autoRetirada: w.autoRetirada > 0 ? w.autoRetirada : undefined,
		disabled: w.disabled,
	}))

	return (
		<ResponsiveContainer width="100%" height={280}>
			<ComposedChart
				data={chartData}
				margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
			>
				<CartesianGrid
					strokeDasharray="3 3"
					stroke="var(--color-bg-300)"
					vertical={false}
				/>
				<XAxis
					dataKey="name"
					tick={{
						fontSize: 11,
						fill: "var(--color-txt-300)",
						fontFamily: "var(--font-mono)",
					}}
					tickLine={false}
					axisLine={false}
				/>
				<YAxis
					tickFormatter={(cents: number) =>
						formatCompactCurrency(cents / 100, "BRL")
					}
					tick={{
						fontSize: 11,
						fill: "var(--color-txt-300)",
						fontFamily: "var(--font-mono)",
					}}
					tickLine={false}
					axisLine={false}
					width={60}
				/>
				<Tooltip
					content={<CustomTooltip weeks={data.weeks} />}
					cursor={{ fill: "var(--color-bg-300)", opacity: 0.4 }}
				/>
				<Legend
					wrapperStyle={{ fontSize: 11, color: "var(--color-txt-300)" }}
				/>

				<Bar
					dataKey="resultado"
					name={t("seriesResultado")}
					radius={[2, 2, 0, 0]}
					maxBarSize={24}
				>
					{chartData.map((entry) => (
						<Cell
							key={`week-${entry.name}`}
							fill={
								entry.disabled
									? "var(--color-bg-300)"
									: entry.resultado >= 0
										? "var(--color-trade-buy)"
										: "var(--color-trade-sell)"
							}
							opacity={entry.disabled ? 0.3 : 1}
						/>
					))}
				</Bar>

				{data.hasPlan && (
					<Line
						dataKey="metaBruto"
						name={t("seriesMetaBruto")}
						stroke="var(--color-acc-100)"
						strokeDasharray="6 3"
						strokeWidth={1.5}
						dot={false}
						connectNulls
					/>
				)}
				{data.hasPlan && (
					<Line
						dataKey="metaLiquido"
						name={t("seriesMetaLiquido")}
						stroke="var(--color-acc-200)"
						strokeDasharray="6 3"
						strokeWidth={1.5}
						dot={false}
						connectNulls
					/>
				)}
				{data.withdrawalTargetPercent && data.withdrawalTargetPercent > 0 && (
					<Line
						dataKey="autoRetirada"
						name={t("seriesRetiradaAuto")}
						stroke="var(--color-acc-100)"
						strokeDasharray="2 4"
						strokeWidth={1}
						dot={false}
						opacity={0.5}
						connectNulls
					/>
				)}
			</ComposedChart>
		</ResponsiveContainer>
	)
}

export { WeeklyMetaChartRenderer }
