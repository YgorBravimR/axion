"use client"

import { useEffect, useMemo, useRef } from "react"
import {
	BaselineSeries,
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
import type { ProjectedDrawings } from "@/components/hawks-chart/drawings"
import {
	computePositionStats,
	fiboLevelPrice,
} from "@/components/hawks-chart/drawings"
import { HAWKS_PALETTE } from "@/lib/chart/hawks-palette"
import { useFormatting } from "@/hooks/use-formatting"

// Indicator point can be either a real value or a "whitespace" marker that
// breaks the line continuity at session boundaries (lightweight-charts treats
// a point without `value` as whitespace and won't draw a segment across it).
// The hawks-chart pipeline emits whitespace at every multi-day gap so the EMA
// / VWAP lines don't draw a long diagonal across weekends and holidays.
type IndicatorOverlayPoint =
	| { readonly time: UTCTimestamp; readonly value: number }
	| { readonly time: UTCTimestamp }

interface IndicatorOverlay {
	readonly key: string
	readonly label: string
	readonly color: string
	readonly data: ReadonlyArray<IndicatorOverlayPoint>
	// When "points", the overlay renders as isolated dots — no connecting
	// line between sparse data points (useful for pivot markers, event
	// glyphs). Default = "line".
	readonly style?: "line" | "points"
}

interface TradeOverlay {
	readonly entryBrickIdx: number
	readonly exitBrickIdx: number
	readonly entryPrice: number
	readonly exitPrice: number
	readonly direction: "long" | "short"
	// Backtest path uses "neutral" (zero-PnL), live-trades path uses
	// "breakeven" (within ±BE-tick band). Both render with the breakeven
	// color on the hawks-chart route; semantically identical.
	readonly outcome: "win" | "loss" | "neutral" | "breakeven"
	// When the trade is ALSO rendered as a position-box (entry/stop/target
	// solid lines), the entry stub is redundant — caller sets this to true
	// and only the dotted exit stub is drawn. Hawks-chart uses this.
	readonly hideEntryStub?: boolean
}

// Optional sub-pane histogram (e.g., MACD). When provided, RenkoPane creates a
// second pane below the price pane sharing the time axis. Each data point can
// carry its own color via `HistogramData.color` — caller decides what positive
// vs. negative means (we don't impose semantics here).
//
// `lines` lets the caller paint line overlays ON the histogram pane (e.g.
// rolling-mean / day-mean threshold for an aggression/volume evaluator).
interface HistogramLineOverlay {
	readonly key: string
	readonly label: string
	readonly color: string
	readonly data: ReadonlyArray<{ time: UTCTimestamp; value: number }>
}
interface HistogramOverlay {
	readonly label: string
	readonly data: ReadonlyArray<HistogramData<UTCTimestamp>>
	readonly lines?: ReadonlyArray<HistogramLineOverlay>
}

// "trade" (default): entry marker uses tradeBuy/tradeSell palette colored by
//   direction (long=tradeBuy, short=tradeSell). Production behavior — unchanged.
// "action": entry marker uses actionBuy (long) / actionSell (short). Exit
//   marker color is left as outcome-based regardless of mode.
type MarkerColorMode = "trade" | "action"

// Override candle + marker colors when the consumer wants to follow a different
// palette than the global Axion theme tokens. The hawks-chart route uses this
// to apply the Nelogica `PALETA_CORES.md` candle layer (steel-blue × light-gray)
// instead of the green/red trade-execution colors that the rest of the app
// uses for candles. Omit for default behavior.
interface ChartPaletteOverride {
	readonly candleUp: string
	readonly candleDown: string
	readonly markerWin: string
	readonly markerLoss: string
	readonly markerNeutral: string
	// Entry-marker colors (by direction). When omitted, the entry marker
	// falls back to the win/loss pair used everywhere else.
	readonly entryLong?: string
	readonly entryShort?: string
	// Exit-marker colors (by outcome). When omitted, the exit marker
	// falls back to win/loss/neutral.
	readonly exitWin?: string
	readonly exitLoss?: string
	readonly exitBreakeven?: string
}

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
	// Freeform marker array layered on top of the `trade` overlay's
	// markers. Useful for engines that emit many fires across a window
	// (engine lab) where the single-trade overlay model doesn't fit.
	// Each marker uses the lightweight-charts `SeriesMarker` shape
	// directly — caller controls position / shape / color / text.
	readonly extraMarkers?: ReadonlyArray<SeriesMarker<UTCTimestamp>>
	// Multi-trade overlay: paints a short dashed price line at each trade's
	// entry price (anchored to entry brick) AND a separate short dashed line
	// at the exit price (anchored to exit brick). Use this from the
	// hawks-chart page where many trades render on a single 5m pane.
	// Each overlay's entry line is colored by DIRECTION
	// (paletteOverride.entryLong/entryShort) and the exit line is colored
	// by OUTCOME (paletteOverride.exitWin/exitLoss/exitBreakeven). Falls
	// back to the win/loss pair when the override isn't supplied.
	readonly tradeOverlays?: ReadonlyArray<TradeOverlay & { readonly id: string }>
	// Trade positions to render as full position-style boxes (entry line +
	// stop line + target line + risk band + reward band). Visually identical
	// to user-drawn positions but read-only — they don't appear in the
	// drawings list. Use this when the route wants to paint historical
	// trades using the same visual language as the planning tool.
	readonly tradePositions?: ReadonlyArray<{
		readonly id: string
		readonly direction: "long" | "short"
		readonly startBrickIdx: number
		readonly endBrickIdx: number
		readonly entryPrice: number
		readonly stopPrice: number
		readonly targetPrice: number
		readonly qty: number
		readonly valuePerPoint: number
		readonly color: string
	}>
	readonly histogram?: HistogramOverlay | null
	readonly markerColorMode?: MarkerColorMode
	readonly paletteOverride?: ChartPaletteOverride | null
	readonly drawings?: ProjectedDrawings | null
	readonly onPaneClick?: (_event: PaneClickEvent) => void
	readonly externalCrosshair?: number | null
	readonly onCrosshairMove?: (_brickIdx: number | null) => void
	readonly emitsCrosshair?: boolean
	// When set, the chart's visible logical range is constrained to
	// [focusBrickIdx - focusBrickRadius, focusBrickIdx + focusBrickRadius]
	// instead of fitting the entire series. Used by the engine lab to
	// zoom around the currently-selected trade across a long timeline.
	readonly focusBrickIdx?: number | null
	readonly focusBrickRadius?: number
	readonly className?: string
}

const RenkoPane = ({
	label,
	subLabel,
	series,
	indicators,
	trade,
	extraMarkers,
	tradeOverlays,
	tradePositions,
	histogram,
	markerColorMode = "trade",
	paletteOverride,
	drawings,
	onPaneClick,
	externalCrosshair,
	onCrosshairMove,
	emitsCrosshair = false,
	focusBrickIdx = null,
	focusBrickRadius = 30,
	className,
}: RenkoPaneProps) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const { formatNumber } = useFormatting()
	const chartRef = useRef<IChartApi | null>(null)
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
	const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	const entryLineRef = useRef<ISeriesApi<"Line"> | null>(null)
	const exitLineRef = useRef<ISeriesApi<"Line"> | null>(null)
	const histogramSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
	const histogramLineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(
		new Map()
	)
	const hlineRefs = useRef<Map<string, IPriceLine>>(new Map())
	const trendlineRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	// Vertical-line drawings are a "stem" LineSeries pinned to one brick idx,
	// spanning the pane's price range. Reconciled separately so a price-range
	// change (data update) refreshes them without dropping hlines/trendlines.
	const vlineRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	// Each fibo drawing renders as N+1 line series (one per level). Keyed by
	// "<drawingId>:<level>" so we can replace them when the level set changes.
	const fiboRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	// Position drawings paint as a 5-tuple of series per drawing id:
	// [entryLine, stopLine, targetLine, riskFill (Baseline), rewardFill (Baseline)].
	// The two BaselineSeries paint the colored risk/reward zones (Profit ProRT
	// look). We type them as the union of both series kinds since they share
	// the same disposal path.
	const positionRefs = useRef<
		Map<string, Array<ISeriesApi<"Line"> | ISeriesApi<"Baseline">>>
	>(new Map())
	// Multi-trade overlay: one dashed entry-line + one dashed exit-line per
	// trade. Keyed by trade id; each entry holds the 2-series tuple so the
	// reconciler can replace them in place when trades change.
	const tradeOverlayLinesRef = useRef<Map<string, ISeriesApi<"Line">[]>>(
		new Map()
	)
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
		// Renko bricks use brick-INDEX as the time axis (0, 1, 2, …) —
		// not a real timestamp. Default lightweight-charts formatting reads
		// "14" as Unix epoch and prints "01 Jan '70 00:00:00.014". TWO places
		// need overriding:
		//   1. `timeScale.tickMarkFormatter` — the X-axis tick labels.
		//   2. `localization.timeFormatter` — the crosshair-hover bubble
		//      (the floating time tooltip when the cursor sits on a brick).
		// Both translate the index back to the brick close timestamp via
		// `seriesTimesRef` and format as BRT YYYY-MM-DD HH:MM. Without (2),
		// the user sees `01 Jan '70` in the crosshair hover whenever they
		// land on a brick that was painted before lightweight-charts'
		// minimum-Unix-timestamp boundary — which for index-based axes is
		// "always."
		const brickIndexToLabel = (time: unknown): string => {
			const idx = typeof time === "number" ? time : Number(time)
			const epochMs = seriesTimesRef.current[idx]
			if (typeof epochMs !== "number" || Number.isNaN(epochMs)) {
				return ""
			}
			// BRT = UTC - 3h. Shift then format.
			const d = new Date(epochMs - 3 * 60 * 60 * 1000)
			const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
			const dd = String(d.getUTCDate()).padStart(2, "0")
			const hh = String(d.getUTCHours()).padStart(2, "0")
			const mi = String(d.getUTCMinutes()).padStart(2, "0")
			return `${mm}-${dd} ${hh}:${mi}`
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
				tickMarkFormatter: brickIndexToLabel,
			},
			// The crosshair hover bubble uses `localization.timeFormatter`,
			// NOT `tickMarkFormatter` — separate code path inside
			// lightweight-charts. Both must point at the same translator
			// or the user sees `01 Jan '70` on hover.
			localization: {
				timeFormatter: brickIndexToLabel,
			},
			crosshair: { mode: CrosshairMode.Normal },
		})
		// Candle series defaults to the Axion product theme tokens. The
		// hawks-chart route passes `paletteOverride` to swap in the Nelogica
		// PALETA_CORES candle layer (steel-blue × light-gray) — applied in a
		// dedicated effect below so the chart instance doesn't need to be
		// recreated when the user toggles palettes.
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
		const indicatorSeriesMap = indicatorSeriesRef.current

		return () => {
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
		if (focusBrickIdx === null) {
			chart.timeScale().fitContent()
		}
		seriesTimesRef.current = series.times
	}, [series, focusBrickIdx])

	// Apply candle palette override when present. Consumers (currently
	// /hawks-chart) use this to switch off the Axion green×red trade tokens
	// and onto the Nelogica PALETA_CORES candle layer (steel-blue × light-gray).
	// Runs separately from chart creation so toggling later doesn't recreate
	// the chart instance.
	useEffect(() => {
		const candleSeries = candleSeriesRef.current
		if (!candleSeries || !paletteOverride) {
			return
		}
		candleSeries.applyOptions({
			upColor: paletteOverride.candleUp,
			downColor: paletteOverride.candleDown,
			borderUpColor: paletteOverride.candleUp,
			borderDownColor: paletteOverride.candleDown,
			wickUpColor: paletteOverride.candleUp,
			wickDownColor: paletteOverride.candleDown,
		})
	}, [paletteOverride])

	// Focus window — re-applies when the selected anchor changes,
	// independently of the series data lifecycle.
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || focusBrickIdx === null) {
			return
		}
		const last = series.data.length - 1
		if (last < 0) {
			return
		}
		const from = Math.max(0, focusBrickIdx - focusBrickRadius)
		const to = Math.min(last, focusBrickIdx + focusBrickRadius)
		chart.timeScale().setVisibleLogicalRange({ from, to })
	}, [focusBrickIdx, focusBrickRadius, series])

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
				const isPoints = ind.style === "points"
				s = chart.addSeries(LineSeries, {
					color: ind.color,
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
					lineVisible: !isPoints,
					pointMarkersVisible: isPoints,
					pointMarkersRadius: isPoints ? 4 : undefined,
				})
				existing.set(ind.key, s)
			}
			// `ind.data` may interleave real points with whitespace markers
			// (`{time}` only) to break the line at session gaps. Lightweight-
			// charts' LineSeries.setData accepts a (LineData | WhitespaceData)
			// array natively — the cast is needed only because our local
			// union doesn't structurally match LineData<UTCTimestamp>.
			s.setData(
				ind.data as ReadonlyArray<{
					time: UTCTimestamp
					value?: number
				}> as Array<{ time: UTCTimestamp; value: number }>
			)
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

		// Caller may pass `extraMarkers` without a `trade` — still render them.
		const hasExtra = (extraMarkers?.length ?? 0) > 0
		if ((!trade && !hasExtra) || !theme) {
			return
		}

		// Ensure plugin is mounted before either path uses it.
		const candleSeriesForMarkers = candleSeriesRef.current
		if (!markersPluginRef.current && candleSeriesForMarkers) {
			markersPluginRef.current = createSeriesMarkers(
				candleSeriesForMarkers
			) as ISeriesMarkersPluginApi<UTCTimestamp>
		}

		// `trade`-less path: render extraMarkers and bail.
		if (!trade) {
			const eMarkers = [...(extraMarkers ?? [])].sort(
				(m1, m2) => (m1.time as number) - (m2.time as number)
			)
			markersPluginRef.current?.setMarkers(eMarkers)
			return
		}

		// Marker colors — honor the palette override when present so the
		// hawks-chart route uses the Nelogica trade-execution layer
		// (saturated blue × red) instead of the Axion green×red defaults.
		const winColor = paletteOverride?.markerWin ?? theme.tradeBuy
		const lossColor = paletteOverride?.markerLoss ?? theme.tradeSell

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
				text: `entry ${formatNumber(trade.entryPrice)}`,
			},
			{
				time: trade.exitBrickIdx as UTCTimestamp,
				position: isLong ? "aboveBar" : "belowBar",
				color: exitColor,
				// Exit arrow points opposite the entry — closing the position.
				// LONG exit (above bar): arrowDown points into the bar from above.
				// SHORT exit (below bar): arrowUp points into the bar from below.
				shape: isLong ? "arrowDown" : "arrowUp",
				text: `exit ${formatNumber(trade.exitPrice)}`,
			},
		]
		const merged = [...markers, ...(extraMarkers ?? [])]
		merged.sort((m1, m2) => (m1.time as number) - (m2.time as number))
		markersPluginRef.current?.setMarkers(merged)
	}, [
		trade,
		extraMarkers,
		theme,
		markerColorMode,
		paletteOverride,
		series,
		formatNumber,
	])

	// Multi-trade overlay reconciler. For every trade in `tradeOverlays`, paint
	// a short dashed price-line at entry (colored by direction) and a separate
	// short dashed price-line at exit (colored by outcome). Markers are NOT
	// drawn here — the caller passes them through `extraMarkers` (single
	// markers plugin owns the SeriesMarkers slot; sharing it from here would
	// race with the single-trade effect).
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) {
			return
		}

		// Drop every previously-rendered overlay line — simpler than diffing
		// the trade-id set, and the per-trade work is just 2 short series so
		// the rebuild cost is bounded.
		for (const [, lines] of tradeOverlayLinesRef.current) {
			for (const line of lines) {
				try {
					chart.removeSeries(line)
				} catch {
					// already gone
				}
			}
		}
		tradeOverlayLinesRef.current.clear()

		if (!tradeOverlays || tradeOverlays.length === 0) {
			return
		}

		const lastIdx = series.data.length - 1
		if (lastIdx < 0) {
			return
		}

		// Color fallbacks: when the route doesn't supply outcome-specific
		// colors via paletteOverride, fall back to the same win/loss/neutral
		// trio the single-trade overlay uses (markerWin/markerLoss/etc).
		const winColor = paletteOverride?.exitWin ?? paletteOverride?.markerWin
		const lossColor = paletteOverride?.exitLoss ?? paletteOverride?.markerLoss
		const beColor =
			paletteOverride?.exitBreakeven ?? paletteOverride?.markerNeutral
		const entryLongColor =
			paletteOverride?.entryLong ?? paletteOverride?.markerWin
		const entryShortColor =
			paletteOverride?.entryShort ?? paletteOverride?.markerLoss

		// Short horizontal stub anchored to a brick index. RADIUS=2 keeps each
		// stub tight enough to not visually overlap neighbouring trades.
		const RADIUS = 2
		const stub = (
			anchorIdx: number,
			price: number,
			color: string
		): ISeriesApi<"Line"> | null => {
			const lo = Math.max(0, anchorIdx - RADIUS)
			const hi = Math.min(lastIdx, anchorIdx + RADIUS)
			if (hi <= lo) {
				return null
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
			return line
		}

		for (const t of tradeOverlays) {
			const lines: ISeriesApi<"Line">[] = []
			const entryColor =
				t.direction === "long"
					? (entryLongColor ?? "#22c55e")
					: (entryShortColor ?? "#ef4444")
			// "neutral" (backtest semantics) and "breakeven" (live-trade
			// semantics) both render with the breakeven color.
			const exitColor =
				t.outcome === "win"
					? (winColor ?? "#86efac")
					: t.outcome === "loss"
						? (lossColor ?? "#fca5a5")
						: (beColor ?? "#facc15")

			if (!t.hideEntryStub) {
				const eLine = stub(t.entryBrickIdx, t.entryPrice, entryColor)
				if (eLine) {
					lines.push(eLine)
				}
			}
			const xLine = stub(t.exitBrickIdx, t.exitPrice, exitColor)
			if (xLine) {
				lines.push(xLine)
			}
			if (lines.length > 0) {
				tradeOverlayLinesRef.current.set(t.id, lines)
			}
		}
	}, [tradeOverlays, paletteOverride, series])

	// Optional histogram sub-pane (e.g., MACD). Mounted at paneIndex 1 so it
	// shares the time axis with the price pane above. Per-point `color` on each
	// HistogramData drives positive/negative coloring — see caller.
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) {
			return
		}
		// Tear down line overlays first so subsequent histogram removal doesn't
		// orphan them on a stale pane.
		for (const [, line] of histogramLineSeriesRef.current) {
			try {
				chart.removeSeries(line)
			} catch {
				// already removed
			}
		}
		histogramLineSeriesRef.current.clear()
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
		// Line overlays on the histogram pane (paneIndex 1).
		for (const ln of histogram.lines ?? []) {
			const series = chart.addSeries(
				LineSeries,
				{
					color: ln.color,
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
					crosshairMarkerVisible: false,
					title: ln.label,
				},
				1
			)
			series.setData([...ln.data])
			histogramLineSeriesRef.current.set(ln.key, series)
		}
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

		// ── Vertical lines (time markers) ───────────────────────────────
		// A vline is one brick-anchored stem: render as a LineSeries with two
		// points at the same brick index but different prices (top/bottom of
		// the pane's data range). The price ends are widened slightly so the
		// line reaches the visible edge of the price axis. Lightweight charts
		// requires strictly-ascending times, so a "two points at the same
		// brick" stem would crash — instead we splay over [idx-0.0001, idx]
		// via flooring back to int idx. The trick: place one tiny point at
		// idx and the other at idx (it works because LC tolerates duplicates
		// when start === end? No — it doesn't). Workaround: extend the second
		// point ONE brick to the right (idx+1) so the visual is a near-vertical
		// streak occupying < 1 brick width.
		const vlines = drawings?.vlines ?? []
		const incomingVlineIds = new Set(vlines.map((v) => v.id))
		for (const [id, s] of vlineRefs.current) {
			if (!incomingVlineIds.has(id)) {
				try {
					chart.removeSeries(s)
				} catch {
					// already torn down
				}
				vlineRefs.current.delete(id)
			}
		}
		// Compute a comfortable price range from the candle data so the
		// vertical stem spans the full visible price axis. Falls back to
		// ±5% around the last close if the series is somehow empty.
		let priceMin = Number.POSITIVE_INFINITY
		let priceMax = Number.NEGATIVE_INFINITY
		for (const c of series.data) {
			if (c.low < priceMin) {
				priceMin = c.low
			}
			if (c.high > priceMax) {
				priceMax = c.high
			}
		}
		if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
			priceMin = 0
			priceMax = 1
		}
		const lastBrickIdx = series.data.length - 1
		for (const v of vlines) {
			let s = vlineRefs.current.get(v.id)
			if (!s) {
				s = chart.addSeries(LineSeries, {
					color: v.color,
					lineWidth: 1,
					lineStyle: 3, // dotted — readable but not noisy
					priceLineVisible: false,
					lastValueVisible: false,
					crosshairMarkerVisible: false,
				})
				vlineRefs.current.set(v.id, s)
			} else {
				s.applyOptions({ color: v.color })
			}
			// Place the second endpoint one brick to the right so the segment
			// is technically diagonal but visually reads as a vertical streak
			// (one brick = ~3–6 pixels at typical zoom). When the vline sits
			// at the last brick, place it one brick to the LEFT instead so we
			// stay inside the time axis.
			const endIdx =
				v.brickIdx < lastBrickIdx ? v.brickIdx + 1 : Math.max(0, v.brickIdx - 1)
			const [lo, hi] =
				v.brickIdx < endIdx ? [v.brickIdx, endIdx] : [endIdx, v.brickIdx]
			s.setData([
				{ time: lo as UTCTimestamp, value: priceMin },
				{ time: hi as UTCTimestamp, value: priceMax },
			])
		}

		// ── Fibonacci retracement ───────────────────────────────────────
		// One LineSeries per level, drawn as a horizontal segment between the
		// fibo's startBrickIdx and endBrickIdx. The 0 and 1 levels coincide
		// with the user-clicked anchor points by construction.
		const fibos = drawings?.fibos ?? []
		const incomingFiboKeys = new Set<string>()
		for (const f of fibos) {
			for (const level of f.levels) {
				incomingFiboKeys.add(`${f.id}:${level}`)
			}
		}
		for (const [key, s] of fiboRefs.current) {
			if (!incomingFiboKeys.has(key)) {
				try {
					chart.removeSeries(s)
				} catch {
					// already torn down
				}
				fiboRefs.current.delete(key)
			}
		}
		for (const f of fibos) {
			for (const level of f.levels) {
				const key = `${f.id}:${level}`
				let s = fiboRefs.current.get(key)
				if (!s) {
					s = chart.addSeries(LineSeries, {
						color: f.color,
						lineWidth: 1,
						// 0 and 1 are solid (anchor anchors); intermediate
						// levels are dashed so the eye reads them as derived.
						lineStyle: level === 0 || level === 1 ? 0 : 2,
						priceLineVisible: false,
						lastValueVisible: false,
						crosshairMarkerVisible: false,
						title: `${(level * 100).toFixed(1)}%`,
					})
					fiboRefs.current.set(key, s)
				} else {
					s.applyOptions({ color: f.color })
				}
				const levelPrice = fiboLevelPrice(f.startPrice, f.endPrice, level)
				s.setData([
					{ time: f.startBrickIdx as UTCTimestamp, value: levelPrice },
					{ time: f.endBrickIdx as UTCTimestamp, value: levelPrice },
				])
			}
		}

		// ── Position drawings (entry / stop / target box) ───────────────
		// Render as three horizontal LineSeries between startBrickIdx and
		// endBrickIdx — one solid for entry, two dashed (stop above/below,
		// target the opposite side). Stats label is appended via the line's
		// `title` so the user sees R:R + R$ on the price axis label.
		// Merge user-drawn positions and read-only trade positions into a
		// single render pass — same visual treatment, same lifecycle. ID
		// space stays disjoint because user drawings use crypto.randomUUID
		// while trade rows use the DB trade id (UUID too, but a different
		// generation site — collision probability is the same as any UUID
		// pair, i.e. effectively zero).
		const positions = [
			...(drawings?.positions ?? []),
			...(tradePositions ?? []),
		]
		const incomingPositionIds = new Set(positions.map((p) => p.id))
		for (const [id, lines] of positionRefs.current) {
			if (!incomingPositionIds.has(id)) {
				for (const line of lines) {
					try {
						chart.removeSeries(line)
					} catch {
						// already torn down
					}
				}
				positionRefs.current.delete(id)
			}
		}
		for (const p of positions) {
			const stats = computePositionStats(p)
			const stopColor = HAWKS_PALETTE.drawing.positionStop
			const targetColor = HAWKS_PALETTE.drawing.positionTarget
			const entryColor = p.color
			const lineProps = (opts: {
				color: string
				dashed: boolean
				title: string
			}) => ({
				color: opts.color,
				lineWidth: (opts.dashed ? 1 : 2) as 1 | 2,
				lineStyle: opts.dashed ? 2 : 0,
				priceLineVisible: false,
				lastValueVisible: false,
				crosshairMarkerVisible: false,
				title: opts.title,
			})
			const formatR = stats.riskRewardRatio.toFixed(2)
			const formatStop = stats.stopValue.toFixed(0)
			const formatTarget = stats.targetValue.toFixed(0)
			const existing = positionRefs.current.get(p.id)
			// 5-tuple now: [entry, stop, target, riskFill, rewardFill]. The
			// two BaselineSeries paint the colored zones (risk = entry→stop,
			// reward = entry→target) — same look as Profit ProRT's position
			// drawing.
			let entryLine: ISeriesApi<"Line">
			let stopLine: ISeriesApi<"Line">
			let targetLine: ISeriesApi<"Line">
			let riskFill: ISeriesApi<"Baseline">
			let rewardFill: ISeriesApi<"Baseline">
			// Transparent shells for the un-used half so each fill stays in
			// its half-plane relative to the entry baseline.
			const TRANSPARENT = "rgba(0,0,0,0)"
			// Risk fill: data anchored at stopPrice, baseValue at entry. The
			// fill paints the half-plane between stop and entry. For LONG
			// (stop < entry) → bottom half. For SHORT (stop > entry) → top.
			const riskFillProps = {
				topLineColor: TRANSPARENT,
				topFillColor1: HAWKS_PALETTE.drawing.positionStopFill,
				topFillColor2: HAWKS_PALETTE.drawing.positionStopFill,
				bottomLineColor: TRANSPARENT,
				bottomFillColor1: HAWKS_PALETTE.drawing.positionStopFill,
				bottomFillColor2: HAWKS_PALETTE.drawing.positionStopFill,
				baseValue: { type: "price" as const, price: p.entryPrice },
				priceLineVisible: false,
				lastValueVisible: false,
				crosshairMarkerVisible: false,
			}
			const rewardFillProps = {
				topLineColor: TRANSPARENT,
				topFillColor1: HAWKS_PALETTE.drawing.positionTargetFill,
				topFillColor2: HAWKS_PALETTE.drawing.positionTargetFill,
				bottomLineColor: TRANSPARENT,
				bottomFillColor1: HAWKS_PALETTE.drawing.positionTargetFill,
				bottomFillColor2: HAWKS_PALETTE.drawing.positionTargetFill,
				baseValue: { type: "price" as const, price: p.entryPrice },
				priceLineVisible: false,
				lastValueVisible: false,
				crosshairMarkerVisible: false,
			}
			if (existing && existing.length === 5) {
				;[entryLine, stopLine, targetLine, riskFill, rewardFill] = existing as [
					ISeriesApi<"Line">,
					ISeriesApi<"Line">,
					ISeriesApi<"Line">,
					ISeriesApi<"Baseline">,
					ISeriesApi<"Baseline">,
				]
				entryLine.applyOptions(
					lineProps({ color: entryColor, dashed: false, title: "entry" })
				)
				stopLine.applyOptions(
					lineProps({
						color: stopColor,
						dashed: true,
						title: `stop · 1R · R$ ${formatStop}`,
					})
				)
				targetLine.applyOptions(
					lineProps({
						color: targetColor,
						dashed: true,
						title: `target · ${formatR}R · R$ ${formatTarget}`,
					})
				)
				riskFill.applyOptions(riskFillProps)
				rewardFill.applyOptions(rewardFillProps)
			} else {
				if (existing) {
					for (const line of existing) {
						try {
							chart.removeSeries(line)
						} catch {
							// ignore
						}
					}
				}
				// Mount fills FIRST so the lines paint on top of the band.
				riskFill = chart.addSeries(BaselineSeries, riskFillProps)
				rewardFill = chart.addSeries(BaselineSeries, rewardFillProps)
				entryLine = chart.addSeries(
					LineSeries,
					lineProps({ color: entryColor, dashed: false, title: "entry" })
				)
				stopLine = chart.addSeries(
					LineSeries,
					lineProps({
						color: stopColor,
						dashed: true,
						title: `stop · 1R · R$ ${formatStop}`,
					})
				)
				targetLine = chart.addSeries(
					LineSeries,
					lineProps({
						color: targetColor,
						dashed: true,
						title: `target · ${formatR}R · R$ ${formatTarget}`,
					})
				)
				positionRefs.current.set(p.id, [
					entryLine,
					stopLine,
					targetLine,
					riskFill,
					rewardFill,
				])
			}
			entryLine.setData([
				{ time: p.startBrickIdx as UTCTimestamp, value: p.entryPrice },
				{ time: p.endBrickIdx as UTCTimestamp, value: p.entryPrice },
			])
			stopLine.setData([
				{ time: p.startBrickIdx as UTCTimestamp, value: p.stopPrice },
				{ time: p.endBrickIdx as UTCTimestamp, value: p.stopPrice },
			])
			targetLine.setData([
				{ time: p.startBrickIdx as UTCTimestamp, value: p.targetPrice },
				{ time: p.endBrickIdx as UTCTimestamp, value: p.targetPrice },
			])
			riskFill.setData([
				{ time: p.startBrickIdx as UTCTimestamp, value: p.stopPrice },
				{ time: p.endBrickIdx as UTCTimestamp, value: p.stopPrice },
			])
			rewardFill.setData([
				{ time: p.startBrickIdx as UTCTimestamp, value: p.targetPrice },
				{ time: p.endBrickIdx as UTCTimestamp, value: p.targetPrice },
			])
		}
		// Realized-exit overlay lives in the existing `tradeOverlays`
		// reconciler (dotted horizontal price-line at the exit price,
		// colored by outcome). The position-box renderer does NOT draw the
		// exit — the two systems compose: tradePositions paints the
		// PLANNED box (entry + stop + target + fills), tradeOverlays
		// paints the REALIZED exit price stub.
	}, [drawings, series, tradePositions])

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
	ChartPaletteOverride,
	HistogramOverlay,
	IndicatorOverlay,
	MarkerColorMode,
	PaneClickEvent,
	RenkoPaneProps,
	TradeOverlay,
}
export { RenkoPane }
