"use client"

import { useMemo, memo } from "react"
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
	/** Whether to show live-only comparison mode */
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
	showComparison?: boolean
}

// Static chart margin — hoisted to avoid new object identity each render
const CHART_MARGIN = { top: 10, right: 16, left: 10, bottom: 0 }

// ==========================================
// TOOLTIP
// ==========================================

const CustomTooltip = memo(
	({ active, payload, variant, showComparison }: CustomTooltipProps) => {
		const t = useTranslations("equityShield.chart")

		if (!active || !payload || payload.length === 0) {
			return null
		}

		const data = payload[0].payload
		const pnlSign = data.pnl >= 0 ? "+" : ""

		return (
			<div className="border-bg-300 bg-bg-100 p-s-300 rounded-lg border shadow-lg">
				<p className="text-tiny text-txt-300">
					{t("tooltipTrade", { number: data.tradeNumber, date: data.date })}
				</p>
				{showComparison ? (
					<>
						<p className="text-small text-acc-100 font-medium">
							{t("tooltipOriginal", {
								value: formatCompactCurrency(data.originalAccountEquity, "R$"),
							})}
						</p>
						<p className="text-small text-txt-100 font-medium">
							{t("tooltipManaged", {
								value: formatCompactCurrency(data.accountEquity, "R$"),
							})}
						</p>
					</>
				) : (
					<>
						<p className="text-small text-txt-100 font-medium">
							{t("tooltipEquity", {
								value: formatCompactCurrency(
									variant === "method2"
										? data.originalAccountEquity
										: data.accountEquity,
									"R$"
								),
							})}
						</p>
					</>
				)}
				<p
					className={`text-tiny ${data.pnl >= 0 ? "text-trade-buy" : "text-trade-sell"}`}
				>
					{t("tooltipPnl", {
						value: `${pnlSign}${formatCompactCurrency(data.pnl, "R$")}`,
					})}
				</p>
				{!showComparison && data.drawdownFromPeak > 0 && (
					<p className="text-tiny text-trade-sell">
						{t("tooltipDrawdown", {
							value: formatCompactCurrency(data.drawdownFromPeak, "R$"),
						})}
					</p>
				)}
				{!showComparison && variant !== "original" && (
					<p
						className={`text-tiny mt-s-100 ${data.mode === "live" ? "text-trade-buy" : "text-txt-300"}`}
					>
						{data.mode === "live" ? t("modeLive") : t("modeSim")}
					</p>
				)}
				{!showComparison && data.smaValue !== null && (
					<p className="text-tiny text-acc-200">
						{t("tooltipSMA", {
							value: formatCompactCurrency(data.smaValue, "R$"),
						})}
					</p>
				)}
			</div>
		)
	}
)
CustomTooltip.displayName = "EquityShieldTooltip"

// ==========================================
// ZONE COMPUTATION
// ==========================================

/**
 * Build contiguous bands of same-mode trades for ReferenceArea shading.
 */
const buildZoneBands = (points: EquityShieldPoint[]): ZoneBand[] => {
	if (points.length === 0) {
		return []
	}

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
	showLiveOnly,
	title,
	drawdownLimitDollars,
	initialBalance,
	variant,
	showSMA = false,
}: EquityShieldChartProps) => {
	const { yAxisWidth } = useChartConfig()
	const t = useTranslations("equityShield.chart")

	// In comparison mode: always use full data, show both original and managed curves
	const isComparisonMode = showLiveOnly && variant !== "original"

	const chartData = useMemo(
		() =>
			data.map((point) => ({
				tradeNumber: point.tradeNumber,
				date: point.date,
				accountEquity: point.accountEquity,
				originalAccountEquity: initialBalance + point.originalEquity,
				pnl: point.pnl,
				mode: point.mode,
				smaValue: point.smaValue,
				drawdownFromPeak: point.drawdownFromPeak,
				/** Trailing DD limit: peak - drawdownLimit (moves up with equity peak) */
				ddLimitLine:
					drawdownLimitDollars > 0
						? point.peakEquity - drawdownLimitDollars
						: null,
			})),
		[data, drawdownLimitDollars, initialBalance]
	)

	const zoneBands = useMemo(
		() => (isComparisonMode ? [] : buildZoneBands(data)),
		[data, isComparisonMode]
	)

	// Method 2 full view: show original equity so SMA crossovers are visible
	// Comparison mode: show both lines
	// Everything else: show managed account equity
	const showOriginalEquity = !isComparisonMode && variant === "method2"
	const mainEquityKey = isComparisonMode
		? "accountEquity"
		: showOriginalEquity
			? "originalAccountEquity"
			: "accountEquity"

	const { minValue, maxValue } = useMemo(() => {
		const equityValues = chartData.map((d) => d.accountEquity)
		const originalValues =
			isComparisonMode || showOriginalEquity
				? chartData.map((d) => d.originalAccountEquity)
				: []
		const smaValues =
			showSMA && !isComparisonMode
				? chartData
						.filter((d) => d.smaValue !== null)
						.map((d) => d.smaValue as number)
				: []
		const ddLimitValues = !isComparisonMode
			? chartData
					.filter((d) => d.ddLimitLine !== null)
					.map((d) => d.ddLimitLine as number)
			: []
		const allValues = [
			...equityValues,
			...originalValues,
			...smaValues,
			...ddLimitValues,
		]

		return {
			minValue: Math.min(...allValues),
			maxValue: Math.max(...allValues),
		}
	}, [chartData, showSMA, isComparisonMode, showOriginalEquity])

	const padding = (maxValue - minValue) * 0.08 || 100

	// strokeColor, gradientId, originalGradientId — computed from variant prop
	const { strokeColor, gradientId, originalGradientId } = useMemo(
		() => ({
			strokeColor:
				variant === "original"
					? "var(--color-acc-100)"
					: variant === "method1"
						? "var(--color-trade-buy)"
						: "var(--color-acc-200)",
			gradientId: `shield-gradient-${variant}`,
			originalGradientId: `shield-gradient-original-${variant}`,
		}),
		[variant]
	)

	// activeDot depends on strokeColor
	const activeDot = useMemo(
		() => ({
			r: 4,
			fill: strokeColor,
			stroke: "var(--color-bg-200)",
			strokeWidth: 2,
		}),
		[strokeColor]
	)

	// Stable tooltip element — avoids new JSX element identity each render
	const tooltipContent = useMemo(
		() => <CustomTooltip variant={variant} showComparison={isComparisonMode} />,
		[variant, isComparisonMode]
	)

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
			<h3 className="text-small text-txt-100 mb-s-300 font-semibold">
				{title}
			</h3>

			<ChartContainer
				id={`equity-shield-${variant}${isComparisonMode ? "-cmp" : ""}`}
				className="h-[250px] w-full sm:h-[300px] lg:h-[350px]"
				role="img"
				aria-label={title}
			>
				<AreaChart data={chartData} margin={CHART_MARGIN}>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
							<stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
						</linearGradient>
						{isComparisonMode && (
							<linearGradient
								id={originalGradientId}
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop
									offset="5%"
									stopColor="var(--color-acc-100)"
									stopOpacity={0.15}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-acc-100)"
									stopOpacity={0}
								/>
							</linearGradient>
						)}
					</defs>

					<CartesianGrid
						strokeDasharray="3 3"
						stroke="var(--color-bg-300)"
						vertical={false}
					/>

					{/* Sim zone background shading (full view only) */}
					{!isComparisonMode &&
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
						dataKey={isComparisonMode ? "date" : "tradeNumber"}
						tick={{ fontSize: 11, fill: "var(--color-txt-300)" }}
						tickFormatter={
							isComparisonMode ? undefined : (val: number) => `#${val}`
						}
						tickLine={false}
						axisLine={false}
					/>

					<YAxis
						domain={[minValue - padding, maxValue + padding]}
						tick={{ fontSize: 11, fill: "var(--color-txt-300)" }}
						tickFormatter={(val: number) => formatCompactCurrency(val, "R$")}
						width={yAxisWidth}
						tickLine={false}
						axisLine={false}
					/>

					<ChartTooltip variant="line" content={tooltipContent} />

					{/* Trailing DD Limit line — full view, not Method 2 */}
					{!isComparisonMode &&
						drawdownLimitDollars > 0 &&
						variant !== "method2" && (
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

					{/* SMA line for Method 2 (full view only) */}
					{showSMA && !isComparisonMode && (
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
							isAnimationActive={false}
						/>
					)}

					{/* In comparison mode: original equity line (gold, behind) */}
					{isComparisonMode && (
						<Area
							type="monotone"
							dataKey="originalAccountEquity"
							stroke="var(--color-acc-100)"
							strokeWidth={1.5}
							strokeDasharray="5 3"
							fill={`url(#${originalGradientId})`}
							dot={false}
							activeDot={false}
							isAnimationActive={false}
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
						activeDot={activeDot}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ChartContainer>

			{/* Chart legend */}
			{isComparisonMode ? (
				<div className="mt-s-200 gap-m-400 flex flex-wrap items-center">
					{/* Original curve (dashed gold) */}
					<div className="gap-s-200 flex items-center">
						<div
							className="h-0 w-4 border-t-2 border-dashed"
							style={{ borderColor: "var(--color-acc-100)" }}
						/>
						<span className="text-tiny text-txt-300">
							{t("legendOriginal")}
						</span>
					</div>
					{/* Managed curve (solid method color) */}
					<div className="gap-s-200 flex items-center">
						<div
							className="h-0 w-4 border-t-2"
							style={{ borderColor: strokeColor }}
						/>
						<span className="text-tiny text-txt-300">{t("legendManaged")}</span>
					</div>
				</div>
			) : (
				variant !== "original" && (
					<div className="mt-s-200 gap-m-400 flex flex-wrap items-center">
						{/* Equity line */}
						<div className="gap-s-200 flex items-center">
							<div
								className="h-0 w-4 border-t-2"
								style={{ borderColor: strokeColor }}
							/>
							<span className="text-tiny text-txt-300">
								{t("legendEquity")}
							</span>
						</div>
						{/* Sim zone */}
						<div className="gap-s-200 flex items-center">
							<div className="bg-trade-sell h-2.5 w-4 rounded-sm opacity-20" />
							<span className="text-tiny text-txt-300">{t("legendSim")}</span>
						</div>
						{/* DD Limit */}
						{drawdownLimitDollars > 0 && variant !== "method2" && (
							<div className="gap-s-200 flex items-center">
								<div className="border-trade-sell h-0 w-4 border-t border-dashed" />
								<span className="text-tiny text-txt-300">{t("ddLimit")}</span>
							</div>
						)}
						{/* SMA line */}
						{showSMA && (
							<div className="gap-s-200 flex items-center">
								<div className="border-txt-300 h-0 w-4 border-t border-dashed" />
								<span className="text-tiny text-txt-300">{t("legendSMA")}</span>
							</div>
						)}
					</div>
				)
			)}
		</div>
	)
}

export { EquityShieldChart }
