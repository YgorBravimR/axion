"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker } from "lightweight-charts"
import {
	createChart,
	createSeriesMarkers,
	ColorType,
	CandlestickSeries,
	LineSeries,
	LineStyle,
} from "lightweight-charts"
import type { UTCTimestamp } from "lightweight-charts"
import type { CandleRow, IndicatorGroupWithKeys, TradeChartData } from "@/types/candle"
import { getChartThemeColors } from "@/lib/chart/theme-colors"
import type { ChartThemeColors } from "@/lib/chart/theme-colors"
import {
	ArrowUpRight,
	ArrowDownRight,
	Target,
	ShieldAlert,
	TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/** ProfitChart indicator colors — fixed across all themes */
const PROFITCHART_COLORS: Record<string, string> = {
	trava_1: "rgb(255, 218, 185)", trava_2: "rgb(255, 140, 0)", trava_3: "rgb(194, 117, 23)",
	trava_4: "rgb(139, 69, 19)", trava_5: "rgb(107, 52, 16)",
	trava_neg1: "rgb(170, 170, 230)", trava_neg2: "rgb(160, 32, 240)", trava_neg3: "rgb(120, 30, 176)",
	trava_neg4: "rgb(75, 0, 130)", trava_neg5: "rgb(53, 0, 96)",
	percent_1: "rgb(255, 218, 185)", percent_2: "rgb(255, 140, 0)", percent_3: "rgb(194, 117, 23)",
	percent_neg1: "rgb(170, 170, 230)", percent_neg2: "rgb(160, 32, 240)", percent_neg3: "rgb(120, 30, 176)",
	ajuste: "rgb(180, 255, 255)", prev_day_close: "rgb(120, 20, 60)",
	prev_day_high: "rgb(255, 20, 147)", prev_day_low: "rgb(255, 20, 147)",
	vwap_m: "rgb(13, 71, 161)",
}

/** Build indicator color map from live theme + fixed ProfitChart colors */
const buildIndicatorColorMap = (theme: ChartThemeColors): Record<string, string> => ({
	...PROFITCHART_COLORS,
	trava_0: theme.txt300,
	vwap_d: theme.actionBuy,
	vwap_s: theme.acc200,
	ema_200: theme.acc100,
	entrada: theme.actionBuy,
	stop: theme.actionSell,
	alvo_final: theme.acc100,
	breakeven_trailing: theme.txt300,
	breakeven_trigger: theme.txt200,
	trailing_trigger: theme.txtPlaceholder,
})

/** Reference groups — show horizontal dashed lines instead of moving curves */
const REFERENCE_GROUPS = new Set([
	"trava",
	"percent",
	"daily_reference",
	"strategy_level",
])

interface TradeChartContentProps {
	trade: TradeChartData["trade"]
	executions: TradeChartData["executions"]
	candles: CandleRow[]
	indicatorGroups: IndicatorGroupWithKeys[]
}

const TradeChartContent = ({
	trade,
	executions,
	candles,
	indicatorGroups,
}: TradeChartContentProps) => {
	const chartContainerRef = useRef<HTMLDivElement>(null)
	const chartRef = useRef<IChartApi | null>(null)
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
	const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null)
	const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	const candlesRef = useRef<CandleRow[]>([])

	const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set())

	const isLong = trade.direction === "long"
	const pnlDisplay = trade.pnl !== null ? fromCents(trade.pnl) : null
	const isProfitable = pnlDisplay !== null && pnlDisplay > 0

	const themeRef = useRef<ChartThemeColors | null>(null)
	const indicatorColorMapRef = useRef<Record<string, string>>({})

	const getIndicatorColor = useCallback(
		(key: string): string => indicatorColorMapRef.current[key] ?? (themeRef.current?.txtPlaceholder ?? "rgb(80, 86, 95)"),
		[]
	)

	/**
	 * Find the sequential candle index closest to a given ISO timestamp.
	 * Returns -1 if no candles are loaded.
	 */
	const findCandleIndex = useCallback(
		(isoTimestamp: string): number => {
			if (candles.length === 0) return -1
			const target = new Date(isoTimestamp).getTime()
			let bestIndex = 0
			let bestDiff = Infinity
			for (let idx = 0; idx < candles.length; idx++) {
				const diff = Math.abs(new Date(candles[idx].timestamp).getTime() - target)
				if (diff < bestDiff) {
					bestDiff = diff
					bestIndex = idx
				}
			}
			return bestIndex
		},
		[candles]
	)

	// Create chart on mount
	useEffect(() => {
		if (!chartContainerRef.current) return

		// Read live theme colors from CSS variables
		const theme = getChartThemeColors()
		themeRef.current = theme
		indicatorColorMapRef.current = buildIndicatorColorMap(theme)

		const indexToBrtTime = (time: number): string => {
			const idx = Math.round(time)
			if (idx < 0 || idx >= candlesRef.current.length) return ""
			const ts = new Date(candlesRef.current[idx].timestamp)
			const brtHours = (ts.getUTCHours() - 3 + 24) % 24
			const brtMinutes = ts.getUTCMinutes()
			return `${brtHours.toString().padStart(2, "0")}:${brtMinutes.toString().padStart(2, "0")}`
		}

		const chart = createChart(chartContainerRef.current, {
			autoSize: true,
			layout: {
				background: { type: ColorType.Solid, color: theme.bg100 },
				textColor: theme.txt300,
			},
			grid: {
				vertLines: { color: theme.bg300 },
				horzLines: { color: theme.bg300 },
			},
			localization: {
				timeFormatter: (time: number) => indexToBrtTime(time),
			},
			timeScale: {
				tickMarkFormatter: (time: number) => indexToBrtTime(time),
			},
		})

		// Candles use trade-buy / trade-sell from active theme
		const candleSeries = chart.addSeries(CandlestickSeries, {
			upColor: theme.tradeBuy,
			downColor: theme.tradeSell,
			borderUpColor: theme.tradeBuy,
			borderDownColor: theme.tradeSell,
			wickUpColor: theme.tradeBuy,
			wickDownColor: theme.tradeSell,
			// Current price line always white to avoid confusion with candle colors
			priceLineColor: theme.txt100,
		})

		// Create markers plugin for trade entry/exit markers
		const markersPlugin = createSeriesMarkers(candleSeries)

		chartRef.current = chart
		candleSeriesRef.current = candleSeries
		markersPluginRef.current = markersPlugin as ISeriesMarkersPluginApi<UTCTimestamp>

		return () => {
			chart.remove()
			chartRef.current = null
			candleSeriesRef.current = null
			markersPluginRef.current = null
			indicatorSeriesRef.current.clear()
		}
	}, [])

	// Update candle data + trade markers when candles change
	useEffect(() => {
		candlesRef.current = candles
		if (!candleSeriesRef.current || candles.length === 0) return

		const theme = themeRef.current

		const candleData = candles.map((c, i) => ({
			time: i as unknown as UTCTimestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		}))

		candleSeriesRef.current.setData(candleData)

		// --- Execution lines + markers (action-buy / action-sell) ---
		const entryColor = theme?.actionBuy ?? "rgb(100, 180, 255)"
		const exitColor = theme?.actionSell ?? "rgb(255, 140, 100)"
		const chart = chartRef.current
		const lastIdx = candles.length - 1

		// Build execution list (from scaled executions or simple trade)
		const executionPoints: Array<{
			type: "entry" | "exit"
			price: number
			quantity: number
			candleIdx: number
		}> = []

		if (executions.length > 0) {
			for (const exec of executions) {
				const idx = findCandleIndex(exec.timestamp)
				if (idx < 0) continue
				executionPoints.push({
					type: exec.type,
					price: exec.price,
					quantity: exec.quantity,
					candleIdx: idx,
				})
			}
		} else {
			const entryIdx = findCandleIndex(trade.entryDate)
			if (entryIdx >= 0) {
				executionPoints.push({
					type: "entry",
					price: trade.entryPrice,
					quantity: trade.positionSize,
					candleIdx: entryIdx,
				})
			}
			if (trade.exitDate && trade.exitPrice !== null) {
				const exitIdx = findCandleIndex(trade.exitDate)
				if (exitIdx >= 0) {
					executionPoints.push({
						type: "exit",
						price: trade.exitPrice,
						quantity: trade.positionSize,
						candleIdx: exitIdx,
					})
				}
			}
		}

		// For each execution: draw a horizontal line from the execution candle to the chart end
		// Color follows the actual buy/sell direction, not entry/exit:
		// Long entry = buy, Long exit = sell, Short entry = sell, Short exit = buy
		if (chart) {
			for (const exec of executionPoints) {
				const isBuy = isLong ? exec.type === "entry" : exec.type === "exit"
				const color = isBuy ? entryColor : exitColor
				const lineData: Array<{ time: UTCTimestamp; value: number }> = []

				// Line starts at execution candle and extends to the last candle
				for (let i = exec.candleIdx; i <= lastIdx; i++) {
					lineData.push({
						time: i as unknown as UTCTimestamp,
						value: exec.price,
					})
				}

				if (lineData.length > 0) {
					const lineSeries = chart.addSeries(LineSeries, {
						color,
						lineWidth: 1,
						lineStyle: LineStyle.Dotted,
						title: "",
						priceLineVisible: false,
						lastValueVisible: true,
						crosshairMarkerVisible: false,
					})
					lineSeries.setData(lineData)
				}
			}
		}

		// Markers (arrows) to indicate which candle the execution happened on
		const markers: Array<{
			time: UTCTimestamp
			position: "belowBar" | "aboveBar"
			color: string
			shape: "arrowUp" | "arrowDown"
			text: string
		}> = []

		for (const exec of executionPoints) {
			// Color follows buy/sell direction: buy = action-buy, sell = action-sell
			const isBuy = isLong ? exec.type === "entry" : exec.type === "exit"
			markers.push({
				time: exec.candleIdx as unknown as UTCTimestamp,
				position: isBuy ? "belowBar" : "aboveBar",
				color: isBuy ? entryColor : exitColor,
				shape: isBuy ? "arrowUp" : "arrowDown",
				text: `x${exec.quantity}`,
			})
		}

		markers.sort((a, b) => (a.time as number) - (b.time as number))
		markersPluginRef.current?.setMarkers(markers as SeriesMarker<UTCTimestamp>[])

		// --- Stop loss / take profit (trade colors, dashed + thinner to differentiate from candles) ---
		if (trade.stopLoss !== null) {
			candleSeriesRef.current.createPriceLine({
				price: trade.stopLoss,
				color: theme?.tradeSell ?? "rgb(128, 128, 255)",
				lineWidth: 1,
				lineStyle: LineStyle.LargeDashed,
				title: "Stop Loss",
			})
		}

		if (trade.takeProfit !== null) {
			candleSeriesRef.current.createPriceLine({
				price: trade.takeProfit,
				color: theme?.tradeBuy ?? "rgb(0, 255, 150)",
				lineWidth: 1,
				lineStyle: LineStyle.LargeDashed,
				title: "Take Profit",
			})
		}

		chartRef.current?.timeScale().fitContent()
	}, [candles, trade, executions, isLong, findCandleIndex])

	// Update indicator lines when active groups or candles change
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) return

		for (const [, series] of indicatorSeriesRef.current) {
			chart.removeSeries(series)
		}
		indicatorSeriesRef.current.clear()

		if (candles.length === 0) return

		for (const group of indicatorGroups) {
			if (!activeGroups.has(group.key)) continue

			const isReference = REFERENCE_GROUPS.has(group.key)

			for (const indicator of group.indicatorKeys) {
				const color = getIndicatorColor(indicator.key)

				const lineSeries = chart.addSeries(LineSeries, {
					color,
					lineWidth: isReference ? 1 : 2,
					lineStyle: isReference ? LineStyle.Dashed : LineStyle.Solid,
					title: isReference ? indicator.displayName : "",
					lastValueVisible: isReference,
					priceLineVisible: false,
					crosshairMarkerVisible: false,
				})

				const lineData: Array<{ time: UTCTimestamp; value: number }> = []
				for (let idx = 0; idx < candles.length; idx++) {
					const val = candles[idx].indicators[indicator.key]
					if (val === undefined || val === null || val === 0) continue
					lineData.push({
						time: idx as unknown as UTCTimestamp,
						value: val,
					})
				}

				if (lineData.length > 0) {
					lineSeries.setData(lineData)
				}

				indicatorSeriesRef.current.set(indicator.key, lineSeries)
			}
		}
	}, [candles, activeGroups, indicatorGroups, getIndicatorColor])

	const handleToggleGroup = (groupKey: string) => {
		setActiveGroups((prev) => {
			const next = new Set(prev)
			if (next.has(groupKey)) {
				next.delete(groupKey)
			} else {
				next.add(groupKey)
			}
			return next
		})
	}

	return (
		<div className="flex flex-col gap-m-400">
			{/* Trade info card */}
			<Card id="trade-chart-info" className="p-m-400 sm:p-m-500">
				<div className="flex flex-col gap-m-400 sm:flex-row sm:items-start sm:justify-between">
					{/* Left: Asset, direction, timestamps */}
					<div className="flex items-center gap-s-300 sm:gap-m-500">
						<div
							className={cn(
								"flex h-12 w-12 items-center justify-center rounded-xl",
								isLong ? "bg-action-buy-muted" : "bg-action-sell-muted"
							)}
						>
							{isLong ? (
								<ArrowUpRight className="text-action-buy h-6 w-6" />
							) : (
								<ArrowDownRight className="text-action-sell h-6 w-6" />
							)}
						</div>
						<div>
							<div className="flex items-center gap-s-300">
								<h2 className="text-h2 text-txt-100 font-semibold">
									{trade.asset}
								</h2>
								<Badge
									id="trade-chart-direction"
									variant="outline"
									className={cn(
										isLong
											? "border-trade-buy/30 text-trade-buy"
											: "border-trade-sell/30 text-trade-sell"
									)}
								>
									{trade.direction.toUpperCase()}
								</Badge>
								{trade.outcome && (
									<Badge
										id="trade-chart-outcome"
										className={cn(
											trade.outcome === "win" &&
												"bg-trade-buy/20 text-trade-buy",
											trade.outcome === "loss" &&
												"bg-trade-sell/20 text-trade-sell",
											trade.outcome === "breakeven" &&
												"bg-bg-300 text-txt-300"
										)}
									>
										{trade.outcome.toUpperCase()}
									</Badge>
								)}
							</div>
							<p className="mt-s-200 text-small text-txt-300">
								{new Date(trade.entryDate).toLocaleString()}
								{trade.exitDate && (
									<>
										{" "}
										<span className="text-txt-placeholder">→</span>{" "}
										{new Date(trade.exitDate).toLocaleString()}
									</>
								)}
							</p>
						</div>
					</div>

					{/* Right: P&L and metrics */}
					<div className="flex items-center gap-m-500">
						{/* Price info */}
						<div className="text-right">
							<div className="flex items-center gap-s-300 justify-end">
								<div>
									<p className="text-tiny text-txt-300">Entry</p>
									<p className="text-body text-txt-100 font-medium">
										{trade.entryPrice.toFixed(2)}
									</p>
								</div>
								<span className="text-txt-placeholder">→</span>
								<div>
									<p className="text-tiny text-txt-300">Exit</p>
									<p className="text-body text-txt-100 font-medium">
										{trade.exitPrice !== null
											? trade.exitPrice.toFixed(2)
											: "Open"}
									</p>
								</div>
							</div>
						</div>

						{/* P&L */}
						{pnlDisplay !== null && (
							<div className="text-right">
								<p className="text-tiny text-txt-300">P&L</p>
								<p
									className={cn(
										"text-h3 font-semibold",
										isProfitable ? "text-trade-buy" : "text-trade-sell"
									)}
								>
									{isProfitable ? "+" : ""}
									{pnlDisplay.toLocaleString("pt-BR", {
										style: "currency",
										currency: "BRL",
									})}
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Bottom row: position size, SL, TP */}
				<div className="mt-m-400 flex flex-wrap items-center gap-m-500">
					<div className="flex items-center gap-s-200">
						<TrendingUp className="h-4 w-4 text-txt-300" />
						<span className="text-small text-txt-300">Size:</span>
						<span className="text-small text-txt-100 font-medium">
							{trade.positionSize}
						</span>
					</div>

					{trade.stopLoss !== null && (
						<div className="flex items-center gap-s-200">
							<ShieldAlert className="h-4 w-4 text-trade-sell" />
							<span className="text-small text-txt-300">SL:</span>
							<span className="text-small text-trade-sell font-medium">
								{trade.stopLoss.toFixed(2)}
							</span>
						</div>
					)}

					{trade.takeProfit !== null && (
						<div className="flex items-center gap-s-200">
							<Target className="h-4 w-4 text-trade-buy" />
							<span className="text-small text-txt-300">TP:</span>
							<span className="text-small text-trade-buy font-medium">
								{trade.takeProfit.toFixed(2)}
							</span>
						</div>
					)}

					{executions.length > 0 && (
						<div className="flex items-center gap-s-200">
							<span className="text-small text-txt-300">Executions:</span>
							<span className="text-small text-txt-100 font-medium">
								{executions.length}
							</span>
						</div>
					)}
				</div>
			</Card>

			{/* Indicator group toggles */}
			{indicatorGroups.length > 0 && (
				<div className="flex flex-wrap gap-s-300">
					<span className="text-small text-txt-300 self-center mr-s-200">
						Groups:
					</span>
					{indicatorGroups.map((group) => {
						const isActive = activeGroups.has(group.key)
						return (
							<Button
								key={group.key}
								id={`toggle-group-${group.key}`}
								variant="outline"
								size="sm"
								className={
									isActive
										? "bg-acc-100/20 border-acc-100 text-acc-100"
										: "bg-bg-300 text-txt-300 border-bg-300"
								}
								onClick={() => handleToggleGroup(group.key)}
								aria-pressed={isActive}
								aria-label={`Toggle ${group.displayName} indicator group`}
							>
								{group.displayName} ({group.indicatorKeys.length})
							</Button>
						)
					})}
				</div>
			)}

			{/* Chart area */}
			<div
				ref={chartContainerRef}
				className="h-[500px] w-full rounded-md border border-bg-300 bg-bg-200"
				role="img"
				aria-label={`Candlestick chart for ${trade.asset} trade`}
			/>

			{/* Status */}
			<p className="text-small text-txt-300">
				{candles.length} candles loaded
				{activeGroups.size > 0 &&
					` | ${activeGroups.size} indicator group${activeGroups.size > 1 ? "s" : ""} active`}
			</p>
		</div>
	)
}

export { TradeChartContent }
