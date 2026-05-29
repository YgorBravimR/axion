"use client"

import { memo, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
	RadarChart,
	Radar,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart-container"
import { Panel } from "@/components/ui/panel"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import { computeAxionScore, type AxionScoreTier } from "@/lib/axion-score"
import type { RadarChartData } from "@/types"

interface AxionScoreCardProps {
	data: RadarChartData[]
}

const RADIUS_AXIS_TICK = false as const

const tierToneClass: Record<AxionScoreTier, string> = {
	elite: "text-tier-elite",
	forte: "text-tier-forte",
	solido: "text-tier-solido",
	building: "text-tier-building",
	attention: "text-tier-attention",
}

const formatAxisValue = (key: string, value: number): string => {
	switch (key) {
		case "winRate":
		case "discipline":
		case "consistency":
			return `${value.toFixed(1)}%`
		case "avgR":
			return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`
		case "profitFactor":
			return value.toFixed(2)
		case "drawdown":
			return `${value.toFixed(1)}%`
		default:
			return value.toFixed(1)
	}
}

/**
 * Pill that pairs the axis name with its raw value. Uniform treatment for
 * all six axes — the value is rendered in the same warm gold as the hero
 * score, which is the only "bring-attention" carry-over from the ornate
 * variant we kept here.
 */
interface ElegantPillProps {
	label: string
	value: string
}

const ElegantPill = ({ label, value }: ElegantPillProps) => (
	<div className="gap-s-200 border-bg-300 bg-bg-100 px-s-300 py-s-200 flex items-center justify-between rounded-md border">
		<span className="text-tiny text-txt-200 leading-tight">{label}</span>
		<span className="text-small text-tier-elite font-mono font-semibold">
			{value}
		</span>
	</div>
)

const AxionScoreCardBase = ({ data }: AxionScoreCardProps) => {
	const t = useTranslations("dashboard")
	const tScore = useTranslations("dashboard.axionScore")
	const isMobile = useIsMobile()

	const { score, tier } = useMemo(() => computeAxionScore(data), [data])

	const angleAxisTick = useMemo(
		() => ({
			fill: "var(--color-txt-300)",
			fontSize: isMobile ? 9 : 10,
			fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui",
		}),
		[isMobile]
	)

	const chartData = useMemo(
		() =>
			data.map((item) => ({
				...item,
				metric: t(`radar.${item.metricKey}`),
			})),
		[data, t]
	)

	if (data.length === 0) {
		return (
			<Panel padding="md">
				<p className="text-txt-300">{t("noData")}</p>
			</Panel>
		)
	}

	return (
		<Panel padding="md" role="region" aria-label={tScore("title")}>
			{/* Header: title + subtitle on the left, hero score on the right */}
			<div className="gap-m-400 flex items-start justify-between">
				<div className="min-w-0">
					<h3 className="text-body text-txt-100 font-semibold tracking-tight">
						{tScore("title")}
					</h3>
					<p className="text-micro text-txt-300 mt-s-100 font-medium tracking-[0.18em] uppercase">
						{tScore("subtitle")}
					</p>
				</div>
				<div className="text-right">
					<div className="gap-s-100 flex items-baseline justify-end">
						<span
							className="text-h1 leading-none font-semibold"
							style={{
								background: "var(--gradient-axion-score)",
								WebkitBackgroundClip: "text",
								WebkitTextFillColor: "transparent",
								backgroundClip: "text",
							}}
						>
							{Math.round(score)}
						</span>
						<span className="text-tiny text-bronze-deep">/ 100</span>
					</div>
					<p
						className={cn(
							"text-tiny mt-s-100 font-bold tracking-[0.22em] uppercase",
							tierToneClass[tier]
						)}
					>
						{tScore(`tier.${tier}`)}
					</p>
				</div>
			</div>

			{/* Radar — hexagonal grid, warm amber fill. The fill is the second
			    "bring-attention" carry from the ornate card. */}
			<div className="mt-s-300 sm:mt-m-400">
				<ChartContainer
					id="chart-axion-elegant"
					className="h-chart-md w-full sm:h-[220px]"
					suppressHydrationWarning
				>
					<RadarChart
						data={chartData}
						cx="50%"
						cy="50%"
						outerRadius={isMobile ? "62%" : "72%"}
					>
						<PolarGrid
							stroke="color-mix(in srgb, var(--color-tier-solido) 18%, transparent)"
							strokeOpacity={1}
							gridType="polygon"
						/>
						<PolarAngleAxis dataKey="metric" tick={angleAxisTick} />
						<PolarRadiusAxis
							angle={90}
							domain={[0, 100]}
							tick={RADIUS_AXIS_TICK}
							axisLine={false}
						/>
						<Radar
							name="performance"
							dataKey="normalized"
							stroke="var(--color-tier-elite)"
							fill="url(#elegantGoldFill)"
							fillOpacity={0.9}
							strokeWidth={1.5}
						/>
						<defs>
							<radialGradient id="elegantGoldFill" cx="50%" cy="50%" r="50%">
								<stop
									offset="0%"
									stopColor="var(--color-bronze-highlight)"
									stopOpacity={0.9}
								/>
								<stop
									offset="70%"
									stopColor="var(--color-tier-solido)"
									stopOpacity={0.8}
								/>
								<stop
									offset="100%"
									stopColor="var(--color-bronze-deep)"
									stopOpacity={0.7}
								/>
							</radialGradient>
						</defs>
					</RadarChart>
				</ChartContainer>
			</div>

			{/* 2-column pill grid — 3 rows × 2 cols. Uniform treatment, value in
			    warm gold so the eye can scan the actual numbers quickly. */}
			<div className="gap-s-200 mt-s-300 sm:mt-m-400 grid grid-cols-2">
				{data.map((axis) => (
					<ElegantPill
						key={axis.metricKey}
						label={t(`radar.${axis.metricKey}`)}
						value={formatAxisValue(axis.metricKey, axis.value)}
					/>
				))}
			</div>
		</Panel>
	)
}

const AxionScoreCard = memo(AxionScoreCardBase)
AxionScoreCard.displayName = "AxionScoreCard"

export { AxionScoreCard }
