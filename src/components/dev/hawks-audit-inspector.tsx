"use client"

// i18n-exempt: developer debug tool (src/components/dev/**) — English strings
// are intentional. Future /scan passes should skip dev-only components.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import type {
	CandlestickData,
	HistogramData,
	UTCTimestamp,
} from "lightweight-charts"
import {
	buildCrosshairSyncMap,
	findBrickIndexForTime,
} from "@/lib/renko/bricks-to-chart"
import type { BrickChartSeries } from "@/lib/renko/bricks-to-chart"
import { getInspectorWindow } from "@/app/actions/inspector-data"
import { formatRSize } from "@/lib/enrichment/format-rsize"
import type { InspectorCandleRow, InspectorBrickSizes } from "@/types/inspector"
import type { BacktestTrade } from "@/types/backtest"
import { RenkoPane } from "@/components/backtest/inspector/renko-pane"
import type {
	HistogramOverlay,
	IndicatorOverlay,
	PaneClickEvent,
	TradeOverlay,
} from "@/components/backtest/inspector/renko-pane"
import { Button } from "@/components/ui/button"
import {
	type Drawing,
	type DrawingTool,
	makeId,
	projectDrawingsForPane,
} from "./hawks-drawings"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"

interface IndicatorConfig {
	readonly key: string
	readonly label: string
	readonly color: string
}

// Canonical Hawks palette — source: docs/hawks-strategy/chart-palette.md.
// Colors are inline strings here (RGB tuples) because Lightweight Charts can't
// read CSS vars directly; the values mirror Axion semantic intent without
// requiring a runtime token lookup for these overlay-only series. Brick body
// + wick colors DO use the live theme (read inside RenkoPane via
// `getChartThemeColors()` → `theme.tradeBuy` / `theme.tradeSell`).
const ORANGE_BRIGHT = "rgb(255, 165, 60)"
const ORANGE_MUTED = "rgb(210, 130, 40)"
const GRAY_LIGHT = "rgb(190, 195, 205)"
const GRAY_DARK = "rgb(130, 135, 145)"
const YELLOW_SOLID = "rgb(252, 211, 77)"
const YELLOW_FAINT = "rgba(252, 211, 77, 0.45)"
const TEAL_BRIGHT = "rgb(94, 234, 212)"
const TEAL_MID = "rgb(45, 212, 191)"
const TEAL_DARK = "rgb(20, 160, 160)"
const CYAN = "rgb(34, 211, 238)"
const WHITE = "rgb(245, 245, 245)"

const OVERLAYS_5M: IndicatorConfig[] = [
	// 5m spec: MME 60m → Orange; MME 15m → Gray; Keltner → Yellow;
	// VWAP D/S/M → Teal shades (lighter → darker); AJUSTE → Cyan;
	// TOPOS E FUNDOS → White.
	{ key: "mme27_60m", label: "MME27 60m", color: ORANGE_BRIGHT },
	{ key: "mme55_60m", label: "MME55 60m", color: ORANGE_MUTED },
	{ key: "mme27_15m", label: "MME27 15m", color: GRAY_LIGHT },
	{ key: "mme55_15m", label: "MME55 15m", color: GRAY_DARK },
	{ key: "keltner_sup_125", label: "Keltner Sup 12.5", color: YELLOW_SOLID },
	{ key: "keltner_inf_125", label: "Keltner Inf 12.5", color: YELLOW_SOLID },
	{ key: "keltner_sup_165", label: "Keltner Sup 16.5", color: YELLOW_FAINT },
	{ key: "keltner_inf_165", label: "Keltner Inf 16.5", color: YELLOW_FAINT },
	{ key: "vwap_d_5m", label: "VWAP D", color: TEAL_BRIGHT },
	{ key: "vwap_s_5m", label: "VWAP S", color: TEAL_MID },
	{ key: "vwap_m_5m", label: "VWAP M", color: TEAL_DARK },
	{ key: "ajuste_d1", label: "AJUSTE", color: CYAN },
	{ key: "topos_fundos", label: "Topos/Fundos [2]", color: WHITE },
]

const OVERLAYS_15M: IndicatorConfig[] = [
	// 15m spec: MME 27 → Orange; MME 55 → Teal; Keltner → Yellow;
	// TOPOS E FUNDOS [1] → White; TOPOS E FUNDOS [2] → Gray.
	{ key: "mme27_15m", label: "MME27", color: ORANGE_BRIGHT },
	{ key: "mme55_15m", label: "MME55", color: TEAL_MID },
	{ key: "keltner_sup_125", label: "Keltner Sup 12.5", color: YELLOW_SOLID },
	{ key: "keltner_inf_125", label: "Keltner Inf 12.5", color: YELLOW_SOLID },
	{ key: "keltner_sup_165", label: "Keltner Sup 16.5", color: YELLOW_FAINT },
	{ key: "keltner_inf_165", label: "Keltner Inf 16.5", color: YELLOW_FAINT },
	{ key: "topos_fundos_p1", label: "Pivot [1]", color: WHITE },
	{ key: "topos_fundos_p2", label: "Pivot [2]", color: GRAY_LIGHT },
]

const OVERLAYS_60M: IndicatorConfig[] = [
	{ key: "mme27_60m", label: "MME27", color: ORANGE_BRIGHT },
	{ key: "mme55_60m", label: "MME55", color: TEAL_MID },
	{ key: "keltner_sup_125", label: "Keltner Sup 12.5", color: YELLOW_SOLID },
	{ key: "keltner_inf_125", label: "Keltner Inf 12.5", color: YELLOW_SOLID },
	{ key: "keltner_sup_165", label: "Keltner Sup 16.5", color: YELLOW_FAINT },
	{ key: "keltner_inf_165", label: "Keltner Inf 16.5", color: YELLOW_FAINT },
	{ key: "topos_fundos_p1", label: "Pivot [1]", color: WHITE },
	{ key: "topos_fundos_p2", label: "Pivot [2]", color: GRAY_LIGHT },
]

// MACD bar colors — must read live theme so they match brick body colors
// regardless of light/dark mode. The values here are sensible fallbacks.
const MACD_POSITIVE = "rgb(52, 211, 153)" // --color-trade-buy fallback
const MACD_NEGATIVE = "rgb(248, 113, 113)" // --color-trade-sell fallback

interface PreparedPane {
	readonly series: BrickChartSeries
	readonly indicators: IndicatorOverlay[]
	readonly trade: TradeOverlay | null
	readonly candles: readonly InspectorCandleRow[]
	readonly histogram: HistogramOverlay | null
}

// MACD histogram per-bar: green when MACD value is positive, red when negative.
// Lightweight Charts respects `color` on each HistogramData point — overrides
// the series-wide color.
const buildMacdHistogram = (
	candles: readonly InspectorCandleRow[]
): HistogramOverlay | null => {
	const data: Array<HistogramData<UTCTimestamp>> = []
	for (let i = 0; i < candles.length; i++) {
		const v = candles[i]!.indicators.macd
		if (typeof v !== "number" || !Number.isFinite(v)) {
			continue
		}
		data.push({
			time: i as UTCTimestamp,
			value: v,
			color: v >= 0 ? MACD_POSITIVE : MACD_NEGATIVE,
		})
	}
	if (data.length === 0) {
		return null
	}
	return { label: "MACD", data }
}

// DB rows ARE the Renko bricks (ProfitChart already bricked the data; the loader
// persists one row per brick with real O/H/L/C). We do NOT re-brick here — that
// would synthesize new H/L from open/close and discard the actual intra-brick
// price excursion (the "pavio"/wick). Instead, feed each candle row straight to
// the chart as a candlestick with the real H/L preserved.
const candlesToBrickSeriesNative = (
	candles: readonly InspectorCandleRow[]
): BrickChartSeries => {
	const data: CandlestickData<UTCTimestamp>[] = []
	const times: number[] = []
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i]!
		data.push({
			time: i as UTCTimestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		})
		times.push(new Date(c.timestamp).getTime())
	}
	return { data, times }
}

// Each brick is one DB row, so indicator lookup is a direct index — no
// time-floor search needed (the floor search only existed because the old
// pipeline created brick objects whose count didn't match the candle count).
const indicatorValuesNative = (
	candles: readonly InspectorCandleRow[],
	key: string
): Array<{ time: UTCTimestamp; value: number }> => {
	const out: Array<{ time: UTCTimestamp; value: number }> = []
	for (let i = 0; i < candles.length; i++) {
		const v = candles[i]!.indicators[key]
		if (typeof v === "number" && Number.isFinite(v)) {
			out.push({ time: i as UTCTimestamp, value: v })
		}
	}
	return out
}

const buildPane = (
	candles: readonly InspectorCandleRow[],
	indicatorConfigs: ReadonlyArray<IndicatorConfig>,
	trade: BacktestTrade
): PreparedPane | null => {
	if (candles.length === 0) {
		return null
	}
	const series = candlesToBrickSeriesNative(candles)
	const indicators: IndicatorOverlay[] = indicatorConfigs.map((ind) => ({
		key: ind.key,
		label: ind.label,
		color: ind.color,
		data: indicatorValuesNative(candles, ind.key),
	}))

	const entryMs = new Date(trade.entryTime).getTime()
	const exitMs = new Date(trade.exitTime).getTime()
	const entryIdx = findBrickIndexForTime(series.times, entryMs)
	const exitIdx = findBrickIndexForTime(series.times, exitMs)
	const outcome: TradeOverlay["outcome"] =
		trade.rMultiple > 0 ? "win" : trade.rMultiple < 0 ? "loss" : "neutral"

	return {
		series,
		indicators,
		candles,
		histogram: buildMacdHistogram(candles),
		trade: {
			entryBrickIdx: entryIdx,
			exitBrickIdx: exitIdx,
			entryPrice: trade.entryPrice,
			exitPrice: trade.exitPrice,
			direction: trade.direction,
			outcome,
		},
	}
}

interface IndicatorRow {
	readonly key: string
	readonly value5m: number | null
	readonly value15m: number | null
	readonly value60m: number | null
}

const collectIndicatorTable = (
	candles5m: readonly InspectorCandleRow[],
	candles15m: readonly InspectorCandleRow[],
	candles60m: readonly InspectorCandleRow[],
	entryTime: string
): IndicatorRow[] => {
	const entryMs = new Date(entryTime).getTime()
	const findFloor = (
		candles: readonly InspectorCandleRow[]
	): InspectorCandleRow | null => {
		let best: InspectorCandleRow | null = null
		for (const c of candles) {
			const t = new Date(c.timestamp).getTime()
			if (t <= entryMs) {
				best = c
			} else {
				break
			}
		}
		return best
	}
	const c5 = findFloor(candles5m)
	const c15 = findFloor(candles15m)
	const c60 = findFloor(candles60m)

	const allKeys = new Set<string>()
	for (const c of [c5, c15, c60]) {
		if (c) {
			for (const k of Object.keys(c.indicators)) {
				allKeys.add(k)
			}
		}
	}
	const sorted = Array.from(allKeys).sort()
	return sorted.map((key) => ({
		key,
		value5m: c5?.indicators[key] ?? null,
		value15m: c15?.indicators[key] ?? null,
		value60m: c60?.indicators[key] ?? null,
	}))
}

interface BrickDetailRow {
	readonly idx: number
	readonly brt: string
	readonly open: number
	readonly high: number
	readonly low: number
	readonly close: number
	readonly direction: "BULL" | "BEAR"
	readonly body: number
	readonly indicators: Record<string, number>
}

const buildBrickWindow = (
	pane: PreparedPane,
	radius: number
): BrickDetailRow[] => {
	if (!pane.trade) {
		return []
	}
	const entryIdx = pane.trade.entryBrickIdx
	const lo = Math.max(0, entryIdx - radius)
	const hi = Math.min(pane.series.data.length - 1, entryIdx + radius)
	const out: BrickDetailRow[] = []
	// Map candles to their floor by brick close time so we can resolve indicator
	// values without re-running the indexer. For each brick, the candle with
	// timestamp <= brick.closeTimestamp wins.
	const candleByMs = new Map<number, InspectorCandleRow>()
	for (const c of pane.candles) {
		candleByMs.set(new Date(c.timestamp).getTime(), c)
	}
	const sortedCandleTimes = Array.from(candleByMs.keys()).sort((a, b) => a - b)
	const findFloor = (target: number): InspectorCandleRow | null => {
		let lo2 = 0
		let hi2 = sortedCandleTimes.length - 1
		let result: number | null = null
		while (lo2 <= hi2) {
			const mid = (lo2 + hi2) >>> 1
			if (sortedCandleTimes[mid]! <= target) {
				result = sortedCandleTimes[mid]!
				lo2 = mid + 1
			} else {
				hi2 = mid - 1
			}
		}
		return result === null ? null : (candleByMs.get(result) ?? null)
	}

	for (let i = lo; i <= hi; i++) {
		const d = pane.series.data[i]!
		const closeMs = pane.series.times[i]!
		const dir: "BULL" | "BEAR" = d.close > d.open ? "BULL" : "BEAR"
		const body = Number((d.close - d.open).toFixed(3))
		const sourceCandle = findFloor(closeMs)
		out.push({
			idx: i,
			brt: new Date(closeMs).toLocaleString("en-CA", {
				timeZone: "America/Sao_Paulo",
				hour12: false,
			}),
			open: d.open,
			high: d.high,
			low: d.low,
			close: d.close,
			direction: dir,
			body,
			indicators: sourceCandle?.indicators ?? {},
		})
	}
	return out
}

interface HawksAuditInspectorProps {
	readonly trade: BacktestTrade
	readonly assetSymbol: string
}

const HawksAuditInspector = ({
	trade,
	assetSymbol,
}: HawksAuditInspectorProps) => {
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [windowData, setWindowData] = useState<{
		candles5m: InspectorCandleRow[]
		candles15m: InspectorCandleRow[]
		candles60m: InspectorCandleRow[]
		sizes: InspectorBrickSizes
	} | null>(null)
	const [hoveredBrickIdx5m, setHoveredBrickIdx5m] = useState<number | null>(
		null
	)

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		setError(null)
		void getInspectorWindow({
			assetSymbol,
			centerTime: trade.entryTime,
		})
			.then((res) => {
				if (cancelled) {
					return
				}
				if (res.status === "success") {
					setWindowData(res.data)
				} else {
					setError(res.message)
				}
				setLoading(false)
			})
			.catch((err: unknown) => {
				if (cancelled) {
					return
				}
				setError(err instanceof Error ? err.message : "Failed to load")
				setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [trade, assetSymbol])

	const panes = useMemo((): {
		pane5m: PreparedPane | null
		pane15m: PreparedPane | null
		pane60m: PreparedPane | null
	} | null => {
		if (!windowData) {
			return null
		}
		return {
			pane5m: buildPane(windowData.candles5m, OVERLAYS_5M, trade),
			pane15m: buildPane(windowData.candles15m, OVERLAYS_15M, trade),
			pane60m: buildPane(windowData.candles60m, OVERLAYS_60M, trade),
		}
	}, [windowData, trade])

	const syncMap = useMemo(() => {
		if (!panes?.pane5m || !panes.pane15m || !panes.pane60m) {
			return null
		}
		return buildCrosshairSyncMap(
			panes.pane5m.series.times,
			panes.pane15m.series.times,
			panes.pane60m.series.times
		)
	}, [panes])

	const handle5mCrosshair = useCallback((idx: number | null) => {
		setHoveredBrickIdx5m(idx)
	}, [])

	const synced = useMemo(() => {
		if (!syncMap || hoveredBrickIdx5m === null) {
			return { idx15m: null, idx60m: null }
		}
		return syncMap.get(hoveredBrickIdx5m) ?? { idx15m: null, idx60m: null }
	}, [syncMap, hoveredBrickIdx5m])

	// ── Drawings (session-only state) ──────────────────────────────────────
	const [drawings, setDrawings] = useState<Drawing[]>([])
	const [activeTool, setActiveTool] = useState<DrawingTool>("cursor")
	const [pendingTrendline, setPendingTrendline] = useState<{
		timeMs: number
		price: number
	} | null>(null)

	// Reset drawing state whenever the user picks a different trade — the
	// timestamps in the drawings are absolute, but the chart window changes,
	// so showing stale drawings outside the window would confuse the user.
	useEffect(() => {
		setDrawings([])
		setActiveTool("cursor")
		setPendingTrendline(null)
	}, [trade.id])

	const handle5mClick = useCallback(
		(event: PaneClickEvent) => {
			if (activeTool === "cursor") {
				return
			}
			if (activeTool === "hline") {
				setDrawings((prev) => [
					...prev,
					{
						id: makeId(),
						type: "hline",
						price: event.price,
						color: "rgb(234, 179, 8)",
					},
				])
				return
			}
			if (activeTool === "trendline") {
				if (!pendingTrendline) {
					setPendingTrendline({ timeMs: event.timeMs, price: event.price })
					return
				}
				setDrawings((prev) => [
					...prev,
					{
						id: makeId(),
						type: "trendline",
						startTimeMs: pendingTrendline.timeMs,
						startPrice: pendingTrendline.price,
						endTimeMs: event.timeMs,
						endPrice: event.price,
						color: "rgb(96, 165, 250)",
					},
				])
				setPendingTrendline(null)
			}
		},
		[activeTool, pendingTrendline]
	)

	const removeDrawing = useCallback((id: string) => {
		setDrawings((prev) => prev.filter((d) => d.id !== id))
	}, [])

	const clearAllDrawings = useCallback(() => {
		setDrawings([])
		setPendingTrendline(null)
	}, [])

	// Project drawings into per-pane brick-index space.
	const projectedDrawings = useMemo(() => {
		if (!panes?.pane5m || !panes.pane15m || !panes.pane60m) {
			return null
		}
		return {
			pane5m: projectDrawingsForPane(drawings, panes.pane5m.series.times),
			pane15m: projectDrawingsForPane(drawings, panes.pane15m.series.times),
			pane60m: projectDrawingsForPane(drawings, panes.pane60m.series.times),
		}
	}, [drawings, panes])

	const indicatorTable = useMemo(() => {
		if (!windowData) {
			return []
		}
		return collectIndicatorTable(
			windowData.candles5m,
			windowData.candles15m,
			windowData.candles60m,
			trade.entryTime
		)
	}, [windowData, trade])

	const brickDetail = useMemo(() => {
		if (!panes?.pane5m) {
			return []
		}
		return buildBrickWindow(panes.pane5m, 6)
	}, [panes])

	if (loading) {
		return (
			<div className="bg-bg-200 border-bg-300 gap-s-300 flex h-[480px] items-center justify-center rounded-lg border">
				<Loader2 className="text-txt-300 h-5 w-5 animate-spin" />
				<span className="text-small text-txt-300">Loading window…</span>
			</div>
		)
	}

	if (error) {
		return (
			<div className="bg-bg-200 border-bg-300 p-l-700 flex h-[480px] items-center justify-center rounded-lg border">
				<p className="text-small text-destructive">{error}</p>
			</div>
		)
	}

	if (!panes?.pane5m || !panes.pane15m || !panes.pane60m) {
		return (
			<div className="bg-bg-200 border-bg-300 p-l-700 flex h-[480px] items-center justify-center rounded-lg border">
				<p className="text-small text-txt-300">No bricks in window</p>
			</div>
		)
	}

	const sizesLabel = windowData
		? `5m=${formatRSize(windowData.sizes.size5m)}  ·  15m=${formatRSize(windowData.sizes.size15m)}  ·  60m=${formatRSize(windowData.sizes.size60m)}`
		: ""

	return (
		<div className="space-y-m-400">
			<div className="flex items-baseline justify-between">
				<h3 className="text-h3 text-txt-100 font-semibold">
					Trade #{trade.id} · {trade.direction.toUpperCase()} · {trade.label}
				</h3>
				<span className="text-tiny text-txt-300 font-mono">
					{trade.dayKey} · {assetSymbol} · brick sizes {sizesLabel}
				</span>
			</div>

			<DrawingToolbar
				activeTool={activeTool}
				onSelectTool={(t) => {
					setActiveTool(t)
					setPendingTrendline(null)
				}}
				pendingTrendline={pendingTrendline !== null}
				drawingCount={drawings.length}
				onClearAll={clearAllDrawings}
			/>

			<div className="gap-s-300 grid h-[640px] grid-cols-[3fr_2fr]">
				<RenkoPane
					label="5m Renko"
					subLabel={`size ${formatRSize(windowData?.sizes.size5m)}`}
					series={panes.pane5m.series}
					indicators={panes.pane5m.indicators}
					trade={panes.pane5m.trade}
					histogram={panes.pane5m.histogram}
					markerColorMode="action"
					drawings={projectedDrawings?.pane5m ?? null}
					onPaneClick={handle5mClick}
					emitsCrosshair
					onCrosshairMove={handle5mCrosshair}
				/>
				<div className="gap-s-300 grid grid-rows-2">
					<RenkoPane
						label="15m Renko"
						subLabel={`size ${formatRSize(windowData?.sizes.size15m)}`}
						series={panes.pane15m.series}
						indicators={panes.pane15m.indicators}
						trade={panes.pane15m.trade}
						histogram={panes.pane15m.histogram}
						markerColorMode="action"
						drawings={projectedDrawings?.pane15m ?? null}
						externalCrosshair={synced.idx15m}
					/>
					<RenkoPane
						label="60m Renko"
						subLabel={`size ${formatRSize(windowData?.sizes.size60m)}`}
						series={panes.pane60m.series}
						indicators={panes.pane60m.indicators}
						trade={panes.pane60m.trade}
						histogram={panes.pane60m.histogram}
						markerColorMode="action"
						drawings={projectedDrawings?.pane60m ?? null}
						externalCrosshair={synced.idx60m}
					/>
				</div>
			</div>

			{drawings.length > 0 && (
				<DrawingsList drawings={drawings} onRemove={removeDrawing} />
			)}

			<div className="gap-m-400 grid grid-cols-1 lg:grid-cols-2">
				<div className="bg-bg-200 border-bg-300 rounded-lg border">
					<div className="p-s-300 border-bg-300 border-b">
						<h4 className="text-body text-txt-100 font-semibold">
							Indicators at entry time
						</h4>
						<p className="text-tiny text-txt-300 mt-1">
							floor-snapped to entry timestamp; one column per timeframe
						</p>
					</div>
					<div className="max-h-[320px] overflow-auto">
						<Table className="text-tiny font-mono">
							<TableHeader className="bg-bg-300 text-txt-200 sticky top-0">
								<TableRow>
									<TableHead className="text-left">Key</TableHead>
									<TableHead className="text-right">5m</TableHead>
									<TableHead className="text-right">15m</TableHead>
									<TableHead className="text-right">60m</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{indicatorTable.map((row) => (
									<TableRow key={row.key} className="border-bg-300 border-t">
										<TableCell className="text-txt-100">{row.key}</TableCell>
										<TableCell className="text-txt-200 text-right">
											{row.value5m !== null ? row.value5m.toFixed(2) : "—"}
										</TableCell>
										<TableCell className="text-txt-200 text-right">
											{row.value15m !== null ? row.value15m.toFixed(2) : "—"}
										</TableCell>
										<TableCell className="text-txt-200 text-right">
											{row.value60m !== null ? row.value60m.toFixed(2) : "—"}
										</TableCell>
									</TableRow>
								))}
								{indicatorTable.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={4}
											className="text-txt-300 py-s-300 text-center"
										>
											no indicator data
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</div>

				<div className="bg-bg-200 border-bg-300 rounded-lg border">
					<div className="p-s-300 border-bg-300 border-b">
						<h4 className="text-body text-txt-100 font-semibold">
							5m bricks ±6 around entry
						</h4>
						<p className="text-tiny text-txt-300 mt-1">
							OHLC, direction, body size; entry row highlighted in primary, exit
							in warning
						</p>
					</div>
					<div className="max-h-[320px] overflow-auto">
						<Table className="text-tiny font-mono">
							<TableHeader className="bg-bg-300 text-txt-200 sticky top-0">
								<TableRow>
									<TableHead className="text-left">#</TableHead>
									<TableHead className="text-left">BRT</TableHead>
									<TableHead className="text-right">O</TableHead>
									<TableHead className="text-right">H</TableHead>
									<TableHead className="text-right">L</TableHead>
									<TableHead className="text-right">C</TableHead>
									<TableHead className="text-left">Dir</TableHead>
									<TableHead className="text-right">Body</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{brickDetail.map((row) => {
									const isEntry = panes.pane5m?.trade?.entryBrickIdx === row.idx
									const isExit = panes.pane5m?.trade?.exitBrickIdx === row.idx
									const rowClass = isEntry
										? "bg-primary/15"
										: isExit
											? "bg-warning/15"
											: ""
									return (
										<TableRow
											key={row.idx}
											className={`border-bg-300 border-t ${rowClass}`}
										>
											<TableCell className="text-txt-100">
												{row.idx}
												{isEntry ? " ⤓" : ""}
												{isExit ? " ⤒" : ""}
											</TableCell>
											<TableCell className="text-txt-200">
												{row.brt.slice(11, 19)}
											</TableCell>
											<TableCell className="text-txt-200 text-right">
												{row.open.toFixed(3)}
											</TableCell>
											<TableCell className="text-txt-200 text-right">
												{row.high.toFixed(3)}
											</TableCell>
											<TableCell className="text-txt-200 text-right">
												{row.low.toFixed(3)}
											</TableCell>
											<TableCell className="text-txt-200 text-right">
												{row.close.toFixed(3)}
											</TableCell>
											<TableCell
												className={`font-semibold ${
													row.direction === "BULL"
														? "text-fb-success"
														: "text-destructive"
												}`}
											>
												{row.direction}
											</TableCell>
											<TableCell className="text-txt-200 text-right">
												{row.body.toFixed(3)}
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</div>
				</div>
			</div>
		</div>
	)
}

// ── Drawing toolbar ──────────────────────────────────────────────────────

interface DrawingToolbarProps {
	readonly activeTool: DrawingTool
	readonly onSelectTool: (_tool: DrawingTool) => void
	readonly pendingTrendline: boolean
	readonly drawingCount: number
	readonly onClearAll: () => void
}

const DrawingToolbar = ({
	activeTool,
	onSelectTool,
	pendingTrendline,
	drawingCount,
	onClearAll,
}: DrawingToolbarProps) => {
	const tools: ReadonlyArray<{
		key: DrawingTool
		label: string
		hint: string
	}> = [
		{ key: "cursor", label: "Cursor", hint: "no drawing" },
		{
			key: "hline",
			label: "H-line",
			hint: "click 5m to drop a horizontal line at click price",
		},
		{
			key: "trendline",
			label: "Trendline",
			hint: "click 5m twice — start then end",
		},
	]
	return (
		<div className="bg-bg-200 border-bg-300 p-s-300 gap-s-300 flex items-center rounded-lg border">
			<span className="text-tiny text-txt-300 font-semibold">Tools:</span>
			{tools.map((t) => (
				<button
					key={t.key}
					type="button"
					onClick={() => onSelectTool(t.key)}
					title={t.hint}
					className={`px-s-300 py-s-100 text-tiny rounded-sm border font-mono ${
						activeTool === t.key
							? "bg-primary/20 border-primary text-txt-100"
							: "bg-bg-300 border-bg-300 text-txt-200 hover:border-bg-400"
					}`}
				>
					{t.label}
				</button>
			))}
			{activeTool === "trendline" && (
				<span className="text-tiny text-txt-300 ml-s-200">
					{pendingTrendline
						? "click 5m for end point"
						: "click 5m for start point"}
				</span>
			)}
			<span className="text-tiny text-txt-300 ml-auto">
				{drawingCount} drawing{drawingCount === 1 ? "" : "s"}
			</span>
			<Button
				id="clear-drawings"
				type="button"
				variant="outline"
				onClick={onClearAll}
				disabled={drawingCount === 0}
				className="text-tiny"
			>
				Clear all
			</Button>
		</div>
	)
}

// ── Drawings list ────────────────────────────────────────────────────────

interface DrawingsListProps {
	readonly drawings: ReadonlyArray<Drawing>
	readonly onRemove: (_id: string) => void
}

const formatTimeBrt = (ms: number): string =>
	new Date(ms).toLocaleString("en-CA", {
		timeZone: "America/Sao_Paulo",
		hour12: false,
	})

const DrawingsList = ({ drawings, onRemove }: DrawingsListProps) => (
	<div className="bg-bg-200 border-bg-300 overflow-hidden rounded-lg border">
		<div className="p-s-300 border-bg-300 border-b">
			<h4 className="text-body text-txt-100 font-semibold">Drawings</h4>
			<p className="text-tiny text-txt-300 mt-1">
				session-only — disappear when you switch trades or reload
			</p>
		</div>
		<ul className="divide-bg-300 divide-y">
			{drawings.map((d) => (
				<li
					key={d.id}
					className="p-s-200 gap-s-300 flex items-center justify-between font-mono"
				>
					<span className="text-tiny text-txt-200">
						<span
							className="mr-s-200 inline-block size-3 rounded-sm align-middle"
							style={{ background: d.color }}
						/>
						{d.type === "hline"
							? `H-line @ ${d.price.toFixed(3)}`
							: d.type === "trendline"
								? `Trendline ${formatTimeBrt(d.startTimeMs).slice(11, 19)} → ${formatTimeBrt(d.endTimeMs).slice(11, 19)} · ${d.startPrice.toFixed(3)} → ${d.endPrice.toFixed(3)}`
								: d.type === "vline"
									? `V-line @ ${formatTimeBrt(d.timeMs).slice(11, 19)}`
									: d.type === "fibo"
										? `Fibo ${d.startPrice.toFixed(3)} → ${d.endPrice.toFixed(3)}`
										: `${d.direction} position @ ${d.entryPrice.toFixed(3)}`}
					</span>
					<Button
						id={`remove-drawing-${d.id}`}
						type="button"
						variant="ghost"
						onClick={() => onRemove(d.id)}
						className="text-tiny text-destructive"
					>
						×
					</Button>
				</li>
			))}
		</ul>
	</div>
)

export { HawksAuditInspector }
