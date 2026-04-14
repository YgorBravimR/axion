"use client"

import { useMemo } from "react"
import {
	AreaChart,
	Area,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
	ReferenceArea,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart-container"
import { useTranslations } from "next-intl"
import { useChartConfig } from "@/hooks/use-chart-config"
import { formatCompactCurrency } from "@/lib/formatting"
import type { EquityShieldPoint } from "@/types/equity-shield"

// ==========================================
// TYPES
// ==========================================

interface EquityShieldChartProps {
	/** Full method curve (with sim + live) */
	data: EquityShieldPoint[]
	/** Live-only curve (for toggle) */
	liveOnlyData: EquityShieldPoint[]
	/** Whether to show live-only mode */
	showLiveOnly: boolean
	/** Chart title */
	title: string
	/** Prop firm DD limit as dollar amount */
	drawdownLimitDollars: number
	/** Initial balance for DD limit line calculation */
	initialBalance: number
	/** Chart variant for visual differentiation */
	variant: "original" | "method1" | "method2"
	/** Whether to show the SMA line (Method 2) */
	showSMA?: boolean
}

interface ZoneBand {
	x1: number
	x2: number
	mode: "live" | "sim"
}

interface TooltipPayload {
	tradeNumber: number
	date: string
	accountEquity: number
	originalAccountEquity: number
	pnl: number
	mode: "live" | "sim"
	smaValue: number | null
	drawdownFromPeak: number
}

interface CustomTooltipProps {
	active?: boolean
	payload?: Array<{ value: number; payload: TooltipPayload }>
	variant: "original" | "method1" | "method2"
	showOriginalEquity?: boolean
}

// ==========================================
// TOOLTIP
// ==========================================

const CustomTooltip = ({ active, payload, variant, showOriginalEquity }: CustomTooltipProps) => {
	const t = useTranslations("equityShield.chart")

	if (!active || !payload || payload.length === 0) return null

	const data = payload[0].payload
	const pnlSign = data.pnl >= 0 ? "+" : ""
	const displayEquity = showOriginalEquity ? data.originalAccountEquity : data.accountEquity

	return (
		<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
			<p className="text-tiny text-txt-300">
				{t("tooltipTrade", { number: data.tradeNumber, date: data.date })}
			</p>
			<p className="text-small text-txt-100 font-medium">
				{t("tooltipEquity", { value: formatCompactCurrency(displayEquity, "R$") })}
			</p>
			<p
				className={`text-tiny ${data.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"}`}
			>
				{t("tooltipPnl", { value: `${pnlSign}${formatCompactCurrency(data.pnl, "R$")}` })}
			</p>
			{data.drawdownFromPeak > 0 && (
				<p className="text-tiny text-trade-sell">
					{t("tooltipDrawdown", { value: formatCompactCurrency(data.drawdownFromPeak, "R$") })}
				</p>
			)}
			{variant !== "original" && (
				<p className={`text-tiny mt-1 ${data.mode === "live" ? "text-trade-buy" : "text-txt-300"}`}>
					{data.mode === "live" ? t("modeLive") : t("modeSim")}
				</p>
			)}
			{data.smaValue !== null && (
				<p className="text-tiny text-acc-200">
					{t("tooltipSMA", { value: formatCompactCurrency(data.smaValue, "R$") })}
				</p>
			)}
		</div>
	)
}

// ==========================================
// ZONE COMPUTATION
// ==========================================

/**
 * Build contiguous bands of same-mode trades for ReferenceArea shading.
 */
const buildZoneBands = (points: EquityShieldPoint[]): ZoneBand[] => {
	if (points.length === 0) return []

	const bands: ZoneBand[] = []
	let currentBand: ZoneBand = {
		x1: points[0].tradeNumber,
		x2: points[0].tradeNumber,
		mode: points[0].mode,
	}

	for (let i = 1; i < points.length; i++) {
		const point = points[i]
		if (point.mode === currentBand.mode) {
			currentBand.x2 = point.tradeNumber
		} else {
			bands.push(currentBand)
			currentBand = {
				x1: point.tradeNumber,
				x2: point.tradeNumber,
				mode: point.mode,
			}
		}
	}
	bands.push(currentBand)

	return bands
}

// ==========================================
// CHART
// ==========================================

const EquityShieldChart = ({
	data,
	liveOnlyData,
	showLiveOnly,
	title,
	drawdownLimitDollars,
	initialBalance,
	variant,
	showSMA = false,
}: EquityShieldChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("equityShield.chart")

	const activeData = showLiveOnly ? liveOnlyData : data

	const chartData = useMemo(
		() =>
			activeData.map((point) => ({
				tradeNumber: showLiveOnly ? point.liveTradeNumber : point.tradeNumber,
				date: point.date,
				accountEquity: point.accountEquity,
				originalAccountEquity: initialBalance + point.originalEquity,
				pnl: point.pnl,
				mode: point.mode,
				smaValue: point.smaValue,
				drawdownFromPeak: point.drawdownFromPeak,
				/** Trailing DD limit: peak - drawdownLimit (moves up with equity peak) */
				ddLimitLine: drawdownLimitDollars > 0
					? point.peakEquity - drawdownLimitDollars
					: null,
			})),
		[activeData, showLiveOnly, drawdownLimitDollars, initialBalance]
	)

	const zoneBands = useMemo(
		() => (showLiveOnly ? [] : buildZoneBands(data)),
		[data, showLiveOnly]
	)

	// Method 2 full view: show original equity so SMA crossovers are visible
	// Everything else: show managed account equity
	const showOriginalEquity = variant === "method2" && !showLiveOnly
	const mainEquityKey = showOriginalEquity ? "originalAccountEquity" : "accountEquity"

	const { minValue, maxValue } = useMemo(() => {
		const equityValues = chartData.map((d) =>
			showOriginalEquity ? d.originalAccountEquity : d.accountEquity
		)
		const smaValues = showSMA
			? chartData.filter((d) => d.smaValue !== null).map((d) => d.smaValue as number)
			: []
		const ddLimitValues = chartData
			.filter((d) => d.ddLimitLine !== null)
			.map((d) => d.ddLimitLine as number)
		const allValues = [...equityValues, ...smaValues, ...ddLimitValues]

		return {
			minValue: Math.min(...allValues),
			maxValue: Math.max(...allValues),
		}
	}, [chartData, showSMA, showOriginalEquity])

	const padding = (maxValue - minValue) * 0.08 || 100

	const strokeColor =
		variant === "original"
			? "var(--color-acc-100)"
			: variant === "method1"
				? "var(--color-trade-buy)"
				: "var(--color-acc-200)"

	const gradientId = `shield-gradient-${variant}`

	if (chartData.length === 0) {
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
				<h3 className="text-small text-txt-100 font-semibold">{title}</h3>
				<div className="mt-s-300 text-txt-300 flex h-48 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
			<h3 className="text-small text-txt-100 mb-s-300 font-semibold">{title}</h3>

			<ChartContainer
				id={`equity-shield-${variant}`}
				className="h-[250px] w-full sm:h-[300px] lg:h-[350px]"
			>
				<AreaChart
					data={chartData}
					margin={{ top: 10, right: 16, left: 10, bottom: 0 }}
				>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
							<stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
						</linearGradient>
					</defs>

					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>

					{/* Sim zone background shading */}
					{!showLiveOnly &&
						zoneBands
							.filter((band) => band.mode === "sim")
							.map((band, idx) => (
								<ReferenceArea
									key={`sim-zone-${idx}`}
									x1={band.x1}
									x2={band.x2}
									fill="var(--color-trade-sell)"
									fillOpacity={0.06}
									strokeOpacity={0}
								/>
							))}

					<XAxis
						dataKey="tradeNumber"
						tick={{ fontSize: 11, fill: "var(--color-txt-300)" }}
						tickFormatter={(val: number) => `#${val}`}
						tickLine={false}
						axisLine={false}
					/>

					<YAxis
						domain={[minValue - padding, maxValue + padding]}
						tick={{ fontSize: 11, fill: "var(--color-txt-300)" }}
						tickFormatter={(val: number) =>
							formatCompactCurrency(val, "R$")
						}
						width={yAxisWidth}
						tickLine={false}
						axisLine={false}
					/>

					<ChartTooltip
						variant="line"
						content={<CustomTooltip variant={variant} showOriginalEquity={showOriginalEquity} />}
					/>

					{/* Trailing DD Limit line (peak - drawdownLimit) */}
					{drawdownLimitDollars > 0 && (
						<Line
							type="monotone"
							dataKey="ddLimitLine"
							stroke="var(--color-trade-sell)"
							strokeWidth={1.5}
							strokeDasharray="6 4"
							dot={false}
							activeDot={false}
							connectNulls
							isAnimationActive={false}
						/>
					)}

					{/* Initial balance reference */}
					<ReferenceLine
						y={initialBalance}
						stroke="var(--color-bg-300)"
						strokeWidth={1}
						strokeDasharray="3 3"
					/>

					{/* SMA line for Method 2 */}
					{showSMA && !showLiveOnly && (
						<Area
							type="monotone"
							dataKey="smaValue"
							stroke="var(--color-txt-300)"
							strokeWidth={1.5}
							strokeDasharray="4 4"
							fill="none"
							dot={false}
							activeDot={false}
							connectNulls
						/>
					)}

					{/* Main equity line */}
					<Area
						type="monotone"
						dataKey={mainEquityKey}
						stroke={strokeColor}
						strokeWidth={2}
						fill={`url(#${gradientId})`}
						dot={false}
						activeDot={{
							r: 4,
							fill: strokeColor,
							stroke: "var(--color-bg-200)",
							strokeWidth: 2,
						}}
					/>
				</AreaChart>
			</ChartContainer>

			{/* Zone legend */}
			{!showLiveOnly && variant !== "original" && (
				<div className="mt-s-200 flex items-center gap-m-400">
					<div className="flex items-center gap-s-200">
						<div className="h-2.5 w-2.5 rounded-full bg-trade-buy" />
						<span className="text-tiny text-txt-300">{t("legendLive")}</span>
					</div>
					<div className="flex items-center gap-s-200">
						<div className="bg-trade-sell h-2.5 w-2.5 rounded-full opacity-40" />
						<span className="text-tiny text-txt-300">{t("legendSim")}</span>
					</div>
					{drawdownLimitDollars > 0 && (
						<div className="flex items-center gap-s-200">
							<div className="border-trade-sell h-0 w-4 border-t border-dashed" />
							<span className="text-tiny text-txt-300">{t("ddLimit")}</span>
						</div>
					)}
					{showSMA && (
						<div className="flex items-center gap-s-200">
							<div className="border-txt-300 h-0 w-4 border-t border-dashed" />
							<span className="text-tiny text-txt-300">{t("legendSMA")}</span>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

export { EquityShieldChart }
