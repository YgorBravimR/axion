"use client"

import { useEffect, useMemo, useRef } from "react"
import {
	CandlestickSeries,
	ColorType,
	HistogramSeries,
	LineSeries,
	createChart,
	createSeriesMarkers,
	CrosshairMode,
} from "lightweight-charts"
import type {
	HistogramData,
	IChartApi,
	IPriceLine,
	ISeriesApi,
	ISeriesMarkersPluginApi,
	MouseEventParams,
	SeriesMarker,
	UTCTimestamp,
} from "lightweight-charts"
import { getChartThemeColors } from "@/lib/chart/theme-colors"
import type { BrickChartSeries } from "@/lib/renko/bricks-to-chart"
import type { ProjectedDrawings } from "@/components/dev/hawks-drawings"

interface IndicatorOverlay {
	readonly key: string
	readonly label: string
	readonly color: string
	readonly data: ReadonlyArray<{ time: UTCTimestamp; value: number }>
}

interface TradeOverlay {
	readonly entryBrickIdx: number
	readonly exitBrickIdx: number
	readonly entryPrice: number
	readonly exitPrice: number
	readonly direction: "long" | "short"
	readonly outcome: "win" | "loss" | "neutral"
}

// Optional sub-pane histogram (e.g., MACD). When provided, RenkoPane creates a
// second pane below the price pane sharing the time axis. Each data point can
// carry its own color via `HistogramData.color` — caller decides what positive
// vs. negative means (we don't impose semantics here).
interface HistogramOverlay {
	readonly label: string
	readonly data: ReadonlyArray<HistogramData<UTCTimestamp>>
}

// "trade" (default): entry marker uses tradeBuy/tradeSell palette colored by
//   direction (long=tradeBuy, short=tradeSell). Production behavior — unchanged.
// "action": entry marker uses actionBuy (long) / actionSell (short). Exit
//   marker color is left as outcome-based regardless of mode.
type MarkerColorMode = "trade" | "action"

interface PaneClickEvent {
	readonly brickIdx: number
	readonly timeMs: number
	readonly price: number
}

interface RenkoPaneProps {
	readonly label: string
	readonly subLabel?: string
	readonly series: BrickChartSeries
	readonly indicators?: ReadonlyArray<IndicatorOverlay>
	readonly trade?: TradeOverlay | null
	readonly histogram?: HistogramOverlay | null
	readonly markerColorMode?: MarkerColorMode
	readonly drawings?: ProjectedDrawings | null
	readonly onPaneClick?: (_event: PaneClickEvent) => void
	readonly externalCrosshair?: number | null
	readonly onCrosshairMove?: (_brickIdx: number | null) => void
	readonly emitsCrosshair?: boolean
	readonly className?: string
}

const RenkoPane = ({
	label,
	subLabel,
	series,
	indicators,
	trade,
	histogram,
	markerColorMode = "trade",
	drawings,
	onPaneClick,
	externalCrosshair,
	onCrosshairMove,
	emitsCrosshair = false,
	className,
}: RenkoPaneProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const chartRef = useRef<IChartApi | null>(null)
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
	const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	const entryLineRef = useRef<ISeriesApi<"Line"> | null>(null)
	const exitLineRef = useRef<ISeriesApi<"Line"> | null>(null)
	const histogramSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
	const hlineRefs = useRef<Map<string, IPriceLine>>(new Map())
	const trendlineRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	const seriesTimesRef = useRef<ReadonlyArray<number>>([])
	const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(
		null
	)

	const theme = useMemo(() => {
		if (typeof window === "undefined") {
			return null
		}
		return getChartThemeColors()
	}, [])

	// Create chart once on mount
	useEffect(() => {
		if (!containerRef.current || !theme) {
			return
		}
		const chart = createChart(containerRef.current, {
			autoSize: true,
			layout: {
				background: { type: ColorType.Solid, color: theme.bg100 },
				textColor: theme.txt300,
				fontSize: 11,
			},
			grid: {
				vertLines: { color: theme.bg300, style: 0 },
				horzLines: { color: theme.bg300, style: 0 },
			},
			rightPriceScale: { borderColor: theme.bg300 },
			timeScale: {
				borderColor: theme.bg300,
				visible: true,
				timeVisible: false,
				secondsVisible: false,
			},
			crosshair: { mode: CrosshairMode.Normal },
		})
		const candleSeries = chart.addSeries(CandlestickSeries, {
			upColor: theme.tradeBuy,
			downColor: theme.tradeSell,
			borderUpColor: theme.tradeBuy,
			borderDownColor: theme.tradeSell,
			wickUpColor: theme.tradeBuy,
			wickDownColor: theme.tradeSell,
		})
		chartRef.current = chart
		candleSeriesRef.current = candleSeries

		return () => {
			const indicatorSeriesMap = indicatorSeriesRef.current
			chart.remove()
			chartRef.current = null
			candleSeriesRef.current = null
			indicatorSeriesMap.clear()
			entryLineRef.current = null
			exitLineRef.current = null
			markersPluginRef.current = null
		}
	}, [theme])

	// Push candle data whenever series changes
	useEffect(() => {
		const candleSeries = candleSeriesRef.current
		const chart = chartRef.current
		if (!candleSeries || !chart) {
			return
		}
		candleSeries.setData(series.data)
		chart.timeScale().fitContent()
		seriesTimesRef.current = series.times
	}, [series])

	// Indicator overlays — recreate on change
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) {
			return
		}
		const existing = indicatorSeriesRef.current
		const incoming = new Set((indicators ?? []).map((i) => i.key))

		// Remove series that no longer exist
		for (const [key, s] of existing) {
			if (!incoming.has(key)) {
				chart.removeSeries(s)
				existing.delete(key)
			}
		}

		// Add or update remaining
		for (const ind of indicators ?? []) {
			let s = existing.get(ind.key)
			if (!s) {
				s = chart.addSeries(LineSeries, {
					color: ind.color,
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
				})
				existing.set(ind.key, s)
			}
			s.setData(ind.data as Array<{ time: UTCTimestamp; value: number }>)
		}
	}, [indicators])

	// Trade overlay: horizontal price line at entry price + entry/exit markers
	useEffect(() => {
		const chart = chartRef.current
		const candleSeries = candleSeriesRef.current
		if (!chart || !candleSeries) {
			return
		}

		// Remove previous trade overlay if any
		for (const ref of [entryLineRef, exitLineRef]) {
			if (ref.current) {
				try {
					chart.removeSeries(ref.current)
				} catch {
					// already removed (chart torn down)
				}
				ref.current = null
			}
		}
		if (markersPluginRef.current) {
			markersPluginRef.current.setMarkers([])
		}

		if (!trade || !theme) {
			return
		}

		const winColor = theme.tradeBuy
		const lossColor = theme.tradeSell

		// Entry line color follows the entry-marker palette so they read as
		// a pair. In "trade" mode that's tradeBuy/tradeSell by direction; in
		// "action" mode it's actionBuy/actionSell.
		const actionBuyColor = theme.actionBuy
		const actionSellColor = theme.actionSell
		const entryLineColor =
			markerColorMode === "action"
				? trade.direction === "long"
					? actionBuyColor
					: actionSellColor
				: trade.direction === "long"
					? winColor
					: lossColor

		// Exit line — dark variants per outcome.
		// gain = dark green, loss = dark red, breakeven = dark yellow.
		const exitLineColor =
			trade.outcome === "win"
				? "rgb(22, 101, 52)"
				: trade.outcome === "loss"
					? "rgb(127, 29, 29)"
					: "rgb(161, 98, 7)"

		// Each price line extends ±RADIUS bricks past its anchor brick so it's
		// visible but doesn't span the full chart. Lightweight Charts requires
		// strictly ascending `time` in setData, so we clamp the range to the
		// pane's brick count and bail if it collapses to a point.
		const RADIUS = 3
		const lastIdx = series.data.length - 1
		const drawDashed = (
			anchorIdx: number,
			price: number,
			color: string,
			ref: typeof entryLineRef
		) => {
			const lo = Math.max(0, anchorIdx - RADIUS)
			const hi = Math.min(lastIdx, anchorIdx + RADIUS)
			if (hi <= lo) {
				return
			}
			const line = chart.addSeries(LineSeries, {
				color,
				lineWidth: 2,
				lineStyle: 2, // dashed
				priceLineVisible: false,
				lastValueVisible: false,
				crosshairMarkerVisible: false,
			})
			line.setData([
				{ time: lo as UTCTimestamp, value: price },
				{ time: hi as UTCTimestamp, value: price },
			])
			ref.current = line
		}
		drawDashed(
			trade.entryBrickIdx,
			trade.entryPrice,
			entryLineColor,
			entryLineRef
		)
		drawDashed(trade.exitBrickIdx, trade.exitPrice, exitLineColor, exitLineRef)

		// Markers — vertical position depends on direction
		if (!markersPluginRef.current) {
			markersPluginRef.current = createSeriesMarkers(
				candleSeries
			) as ISeriesMarkersPluginApi<UTCTimestamp>
		}
		const isLong = trade.direction === "long"
		const actionBuy = theme.actionBuy
		const actionSell = theme.actionSell
		const entryColor =
			markerColorMode === "action"
				? isLong
					? actionBuy
					: actionSell
				: isLong
					? winColor
					: lossColor
		const exitColor = trade.outcome === "win" ? winColor : lossColor
		const markers: SeriesMarker<UTCTimestamp>[] = [
			{
				time: trade.entryBrickIdx as UTCTimestamp,
				position: isLong ? "belowBar" : "aboveBar",
				color: entryColor,
				shape: isLong ? "arrowUp" : "arrowDown",
				text: `entry ${trade.entryPrice.toLocaleString()}`,
			},
			{
				time: trade.exitBrickIdx as UTCTimestamp,
				position: isLong ? "aboveBar" : "belowBar",
				color: exitColor,
				// Exit arrow points opposite the entry — closing the position.
				// LONG exit (above bar): arrowDown points into the bar from above.
				// SHORT exit (below bar): arrowUp points into the bar from below.
				shape: isLong ? "arrowDown" : "arrowUp",
				text: `exit ${trade.exitPrice.toLocaleString()}`,
			},
		]
		markers.sort((m1, m2) => (m1.time as number) - (m2.time as number))
		markersPluginRef.current.setMarkers(markers)
	}, [trade, theme, markerColorMode])

	// Optional histogram sub-pane (e.g., MACD). Mounted at paneIndex 1 so it
	// shares the time axis with the price pane above. Per-point `color` on each
	// HistogramData drives positive/negative coloring — see caller.
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) {
			return
		}
		if (histogramSeriesRef.current) {
			try {
				chart.removeSeries(histogramSeriesRef.current)
			} catch {
				// already removed
			}
			histogramSeriesRef.current = null
		}
		if (!histogram) {
			return
		}
		const hist = chart.addSeries(
			HistogramSeries,
			{
				priceFormat: { type: "volume" },
				priceLineVisible: false,
				lastValueVisible: false,
			},
			1
		)
		hist.setData([...histogram.data])
		histogramSeriesRef.current = hist
		// Price pane: ~4/5 of the vertical space; MACD pane: ~1/5.
		const panes = chart.panes()
		if (panes.length >= 2 && panes[0] && panes[1]) {
			panes[0].setStretchFactor(4)
			panes[1].setStretchFactor(1)
		}
	}, [histogram])

	// User drawings — hlines as priceLines, trendlines as 2-point LineSeries.
	// Reconciled by id: we add new ones, update changed ones, remove dropped.
	useEffect(() => {
		const chart = chartRef.current
		const candleSeries = candleSeriesRef.current
		if (!chart || !candleSeries) {
			return
		}
		const hlines = drawings?.hlines ?? []
		const trendlines = drawings?.trendlines ?? []

		// Reconcile hlines
		const incomingHlineIds = new Set(hlines.map((h) => h.id))
		for (const [id, line] of hlineRefs.current) {
			if (!incomingHlineIds.has(id)) {
				try {
					candleSeries.removePriceLine(line)
				} catch {
					// already torn down
				}
				hlineRefs.current.delete(id)
			}
		}
		for (const h of hlines) {
			const existing = hlineRefs.current.get(h.id)
			if (existing) {
				existing.applyOptions({ price: h.price, color: h.color })
			} else {
				const line = candleSeries.createPriceLine({
					price: h.price,
					color: h.color,
					lineWidth: 1,
					lineStyle: 2,
					axisLabelVisible: true,
					title: `${h.price.toFixed(0)}`,
				})
				hlineRefs.current.set(h.id, line)
			}
		}

		// Reconcile trendlines
		const incomingTrendIds = new Set(trendlines.map((t) => t.id))
		for (const [id, s] of trendlineRefs.current) {
			if (!incomingTrendIds.has(id)) {
				try {
					chart.removeSeries(s)
				} catch {
					// already torn down
				}
				trendlineRefs.current.delete(id)
			}
		}
		for (const t of trendlines) {
			let s = trendlineRefs.current.get(t.id)
			if (!s) {
				s = chart.addSeries(LineSeries, {
					color: t.color,
					lineWidth: 2,
					lineStyle: 0,
					priceLineVisible: false,
					lastValueVisible: false,
					crosshairMarkerVisible: false,
				})
				trendlineRefs.current.set(t.id, s)
			} else {
				s.applyOptions({ color: t.color })
			}
			s.setData([
				{ time: t.startBrickIdx as UTCTimestamp, value: t.startPrice },
				{ time: t.endBrickIdx as UTCTimestamp, value: t.endPrice },
			])
		}
	}, [drawings])

	// Forward click events upward so the inspector can implement tool behavior.
	// We use chart.subscribeClick; the handler receives MouseEventParams with a
	// `time` (= brick index for our axis) and a `point` (pixel coords). To get
	// the price we ask the candle series to convert the y-coordinate.
	useEffect(() => {
		const chart = chartRef.current
		const candleSeries = candleSeriesRef.current
		if (!chart || !candleSeries || !onPaneClick) {
			return
		}
		const handler = (param: MouseEventParams) => {
			if (param.time === undefined) {
				return
			}
			if (!param.point) {
				return
			}
			const brickIdx = Number(param.time)
			if (!Number.isFinite(brickIdx)) {
				return
			}
			const price = candleSeries.coordinateToPrice(param.point.y)
			if (price === null) {
				return
			}
			const timeMs = seriesTimesRef.current[brickIdx]
			if (timeMs === undefined) {
				return
			}
			onPaneClick({ brickIdx, timeMs, price })
		}
		chart.subscribeClick(handler)
		return () => {
			chart.unsubscribeClick(handler)
		}
	}, [onPaneClick])

	// Emit crosshair-move events outward (the orchestrator listens on the 5m pane)
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || !emitsCrosshair || !onCrosshairMove) {
			return
		}
		const handler = (param: MouseEventParams) => {
			if (param.time === undefined) {
				onCrosshairMove(null)
				return
			}
			const idx = Number(param.time)
			if (!Number.isFinite(idx)) {
				onCrosshairMove(null)
				return
			}
			onCrosshairMove(idx)
		}
		chart.subscribeCrosshairMove(handler)
		return () => {
			chart.unsubscribeCrosshairMove(handler)
		}
	}, [emitsCrosshair, onCrosshairMove])

	// Drive crosshair from external source (the 5m → 15m/60m sync)
	useEffect(() => {
		const chart = chartRef.current
		const candleSeries = candleSeriesRef.current
		if (!chart || !candleSeries) {
			return
		}
		if (externalCrosshair === undefined || externalCrosshair === null) {
			chart.clearCrosshairPosition()
			return
		}
		if (externalCrosshair < 0 || externalCrosshair >= series.data.length) {
			chart.clearCrosshairPosition()
			return
		}
		const target = series.data[externalCrosshair]
		if (!target) {
			return
		}
		chart.setCrosshairPosition(target.close, target.time, candleSeries)
	}, [externalCrosshair, series])

	return (
		<div
			className={`bg-bg-200 border-bg-300 flex flex-col rounded-md border ${className ?? ""}`}
		>
			<div className="px-s-300 py-s-200 border-bg-300 flex items-baseline justify-between border-b">
				<span className="text-small text-txt-100 font-semibold">{label}</span>
				{subLabel ? (
					<span className="text-tiny text-txt-300 font-mono">{subLabel}</span>
				) : null}
			</div>
			<div ref={containerRef} className="min-h-0 flex-1" />
		</div>
	)
}

export type {
	HistogramOverlay,
	IndicatorOverlay,
	MarkerColorMode,
	PaneClickEvent,
	RenkoPaneProps,
	TradeOverlay,
}
export { RenkoPane }
