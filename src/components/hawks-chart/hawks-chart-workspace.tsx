"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import type { UTCTimestamp } from "lightweight-charts"
import { useTranslations } from "next-intl"
import { RenkoPane } from "@/components/backtest/inspector/renko-pane"
import type {
	ChartPaletteOverride,
	IndicatorOverlay,
	PaneClickEvent,
} from "@/components/backtest/inspector/renko-pane"
import {
	buildCrosshairSyncMap,
	candlesToBrickSeriesNative,
	computeBoundaryMarkers,
	findBrickIndexForTime,
	indicatorValuesByBrickIndex,
} from "@/lib/renko/bricks-to-chart"
import type { BrickChartSeries } from "@/lib/renko/bricks-to-chart"
import { HAWKS_PALETTE } from "@/lib/chart/hawks-palette"
import { formatRSize } from "@/lib/enrichment/format-rsize"
import { resolveActiveTradeId, resolveBrickSize } from "./trade-hover"
import { useDrawingsCache } from "./use-drawings-cache"
import type {
	HawksChartFullWindowResult,
	HawksChartTradeMarker,
} from "@/app/actions/hawks-chart-data.types"
import { makeId, projectDrawingsForPane } from "./drawings"
import type { Drawing, DrawingTool, PositionDrawing } from "./drawings"
import { HawksChartDrawingToolbar } from "./drawing-toolbar"
import { HawksChartPositionEditor } from "./position-editor"
import {
	DEFAULT_INDICATOR_TOGGLES,
	HawksChartIndicatorPanel,
} from "./indicator-panel"
import type { IndicatorToggles } from "./indicator-panel"

interface HawksChartWorkspaceProps {
	readonly assetSymbol: string
	readonly initialWindow: HawksChartFullWindowResult
	readonly initialDrawings: ReadonlyArray<Drawing>
	readonly userId?: string
}

// WIN tick value in BRL per point. Used by the "position" drawing tool to
// turn its stop/target points into R$ amounts. Hardcoded for now — when WDO
// support arrives, this resolves via the asset's stored tickValue.
const VALUE_PER_POINT_WIN = 0.2

// Default qty for new positions — matches the conservative starting size on
// the Hawks playbook. The user can edit per-position in a follow-up; v1
// commits to 1 contract so the math reads cleanly.
const DEFAULT_QTY = 1

// The hawks-chart page is a Nelogica-tooling lookalike, NOT the Axion product
// theme. RenkoPane defaults to Axion's chart palette (green/pink), but here we
// hand it the Nelogica palette so candles render azul aço × cinza claro and
// trade markers use the Tom-3 buy/sell colors. This override applies only to
// hawks-chart panes — other RenkoPane consumers (Inspector, backtest) keep
// the Axion theme.
const HAWKS_PALETTE_OVERRIDE: ChartPaletteOverride = {
	candleUp: HAWKS_PALETTE.candle.up,
	candleDown: HAWKS_PALETTE.candle.down,
	// Legacy single-trade fallbacks (kept for the candle palette + any
	// consumer that doesn't read the entry/exit-specific tokens).
	markerWin: HAWKS_PALETTE.trade.buy,
	markerLoss: HAWKS_PALETTE.trade.sell,
	markerNeutral: HAWKS_PALETTE.outcome.breakeven,
	// Entry markers + entry price stub line: colored by trade DIRECTION.
	entryLong: HAWKS_PALETTE.trade.buy, // azul puro Tom 3
	entryShort: HAWKS_PALETTE.trade.sell, // vermelho puro Tom 3
	// Exit markers + exit price stub line: colored by trade OUTCOME.
	// Win = light green, Loss = light red, Breakeven = yellow.
	exitWin: HAWKS_PALETTE.outcome.win,
	exitLoss: HAWKS_PALETTE.outcome.loss,
	exitBreakeven: HAWKS_PALETTE.outcome.breakeven,
}

const buildIndicatorOverlays = (
	candles: ReadonlyArray<{
		timestamp: string
		indicators: Record<string, number>
	}>,
	series: BrickChartSeries,
	toggles: IndicatorToggles,
	tf: "5m" | "15m" | "60m"
): IndicatorOverlay[] => {
	const overlays: IndicatorOverlay[] = []
	const addOverlay = (
		key: string,
		label: string,
		color: string,
		style?: "line" | "points"
	) => {
		const data = indicatorValuesByBrickIndex(series.times, candles, key)
		if (data.length === 0) {
			return
		}
		const overlay: IndicatorOverlay = style
			? { key, label, color, data, style }
			: { key, label, color, data }
		overlays.push(overlay)
	}

	// EMAs. 15m + 60m streams hold the native EMA values under the `ema27`/
	// `ema55` keys; the 5m stream carries them as `mme27_15m`/`mme55_15m`/
	// `mme27_60m`/`mme55_60m` projections. Use whichever TF we're rendering.
	if (toggles.ema15m) {
		if (tf === "5m") {
			addOverlay("mme27_15m", "EMA 27 (15m)", HAWKS_PALETTE.ema.tf15m)
			addOverlay("mme55_15m", "EMA 55 (15m)", HAWKS_PALETTE.ema.tf15m)
		} else if (tf === "15m") {
			addOverlay("ema27", "EMA 27", HAWKS_PALETTE.ema.tf15m)
			addOverlay("ema55", "EMA 55", HAWKS_PALETTE.ema.tf15m)
		}
	}
	if (toggles.ema60m) {
		if (tf === "5m") {
			addOverlay("mme27_60m", "EMA 27 (60m)", HAWKS_PALETTE.ema.tf60m)
			addOverlay("mme55_60m", "EMA 55 (60m)", HAWKS_PALETTE.ema.tf60m)
		} else if (tf === "60m") {
			addOverlay("ema27", "EMA 27", HAWKS_PALETTE.ema.tf60m)
			addOverlay("ema55", "EMA 55", HAWKS_PALETTE.ema.tf60m)
		}
	}

	if (toggles.vwapD) {
		addOverlay("vwap_d", "VWAP D", HAWKS_PALETTE.vwap.d)
	}
	if (toggles.vwapW) {
		addOverlay("vwap_w", "VWAP W", HAWKS_PALETTE.vwap.w)
	}
	if (toggles.vwapM) {
		addOverlay("vwap_m", "VWAP M", HAWKS_PALETTE.vwap.m)
	}
	if (toggles.ajuste) {
		addOverlay("ajuste", "Ajuste D-1", HAWKS_PALETTE.trava.ajusteLine)
	}
	if (toggles.keltner) {
		addOverlay("kc1_sup", "KC1 Sup", HAWKS_PALETTE.keltner.kc1)
		addOverlay("kc1_inf", "KC1 Inf", HAWKS_PALETTE.keltner.kc1)
		addOverlay("kc2_sup", "KC2 Sup", HAWKS_PALETTE.keltner.kc2Faint)
		addOverlay("kc2_inf", "KC2 Inf", HAWKS_PALETTE.keltner.kc2Faint)
	}
	return overlays
}

// Build a `tradePositions` set for the multi-trade position-box renderer.
// Each entry carries everything `RenkoPane.tradePositions` needs to paint
// a trade with the same visual language as a user-drawn position drawing:
// entry line + dashed stop / target lines + risk and reward fill bands.
//
// Stop / target source of truth: the trade's planned `stopPrice` /
// `takeProfit` when present. When missing (legacy rows), we synthesise:
//   - stop  = exit, if outcome=="loss"; else mirror of target.
//   - target = exit, if outcome=="win"; else placed at 3R from entry on
//     the win side.
// This keeps the box visually correct even for legacy trades — the user
// still sees one band on the realized-PnL side and one band on the
// would-have-been-target side. Open positions (no exitTime) extend to the
// pane's right edge instead of past it.
//
// Color: entry line uses the direction-blue/red palette (matches user
// position drawings). The risk band is coral, reward band is green —
// SAME tokens the user-drawing renderer uses, so trades and drawings
// read identically on the chart.
const buildTradePositionsFor5m = (
	tradeMarkers: ReadonlyArray<HawksChartTradeMarker>,
	series5mTimes: ReadonlyArray<number>
): Array<{
	id: string
	direction: "long" | "short"
	startBrickIdx: number
	endBrickIdx: number
	entryPrice: number
	stopPrice: number
	targetPrice: number
	qty: number
	valuePerPoint: number
	color: string
}> => {
	type TradePosition = {
		id: string
		direction: "long" | "short"
		startBrickIdx: number
		endBrickIdx: number
		entryPrice: number
		stopPrice: number
		targetPrice: number
		qty: number
		valuePerPoint: number
		color: string
	}
	const out: TradePosition[] = []
	const lastIdx = series5mTimes.length - 1
	if (lastIdx < 0) {
		return out
	}
	for (const t of tradeMarkers) {
		const entryIdx = findBrickIndexForTime(
			series5mTimes,
			new Date(t.entryTime).getTime()
		)
		const exitIdx = t.exitTime
			? findBrickIndexForTime(series5mTimes, new Date(t.exitTime).getTime())
			: lastIdx
		// LWC asserts strictly-ascending time in setData — collapse to a
		// 1-brick minimum span when entry == exit (very fast trades).
		const startBrickIdx = Math.min(entryIdx, exitIdx)
		const endBrickIdx = Math.max(
			startBrickIdx + 1,
			Math.min(lastIdx, Math.max(entryIdx, exitIdx))
		)

		const direction = t.direction
		const entryPrice = t.entryPrice

		// Resolve stop / target with the fallback chain described above.
		let stopPrice = t.stopPrice
		let targetPrice = t.targetPrice
		if (stopPrice === null || !Number.isFinite(stopPrice)) {
			if (t.outcome === "loss" && t.exitPrice !== null) {
				stopPrice = t.exitPrice
			} else if (targetPrice !== null && Number.isFinite(targetPrice)) {
				// Mirror the target at 1R / 3R-from-target back into entry.
				const reward = Math.abs(targetPrice - entryPrice)
				const risk = reward / 3
				stopPrice = direction === "long" ? entryPrice - risk : entryPrice + risk
			} else {
				// Final fallback: 100-pt risk (1 R21 brick on WIN). Better
				// than rendering nothing.
				stopPrice = direction === "long" ? entryPrice - 100 : entryPrice + 100
			}
		}
		if (targetPrice === null || !Number.isFinite(targetPrice)) {
			if (t.outcome === "win" && t.exitPrice !== null) {
				targetPrice = t.exitPrice
			} else {
				const risk = Math.abs(entryPrice - stopPrice)
				targetPrice =
					direction === "long" ? entryPrice + 3 * risk : entryPrice - 3 * risk
			}
		}

		// Entry-line color matches the trade DIRECTION (same convention as
		// the position-drawing tool). The renderer paints stop / target with
		// the canonical drawing-palette tokens regardless of the trade's
		// outcome — that's deliberate: the entry line tells you what was
		// PLANNED; the candles tell you what HAPPENED.
		const color =
			direction === "long" ? HAWKS_PALETTE.trade.buy : HAWKS_PALETTE.trade.sell

		out.push({
			id: t.id,
			direction,
			startBrickIdx,
			endBrickIdx,
			entryPrice,
			stopPrice,
			targetPrice,
			qty: 1,
			valuePerPoint: VALUE_PER_POINT_WIN,
			color,
		})
	}
	return out
}

// Build the dotted exit-price stub overlay (one short horizontal line per
// closed trade at the realized exit price, colored by outcome). The
// position-box renderer covers the PLANNED geometry (entry/stop/target +
// fills); this overlay covers what actually HAPPENED — the exit price.
// Open trades (no exitTime/exitPrice) are skipped cleanly. Applies the
// chart-side 0.25R breakeven band so a -0.1R trade reads as scratch
// (yellow) even when `trades.outcome` says "loss" (because the per-account
// breakevenTicks rule is stricter than what the eye reads on the chart).
const buildTradeOverlaysFor5m = (
	tradeMarkers: ReadonlyArray<HawksChartTradeMarker>,
	series5mTimes: ReadonlyArray<number>
): Array<{
	id: string
	entryBrickIdx: number
	exitBrickIdx: number
	entryPrice: number
	exitPrice: number
	direction: "long" | "short"
	outcome: "win" | "loss" | "neutral" | "breakeven"
	hideEntryStub: boolean
}> => {
	const out: Array<{
		id: string
		entryBrickIdx: number
		exitBrickIdx: number
		entryPrice: number
		exitPrice: number
		direction: "long" | "short"
		outcome: "win" | "loss" | "neutral" | "breakeven"
		hideEntryStub: boolean
	}> = []
	if (series5mTimes.length === 0) {
		return out
	}
	for (const t of tradeMarkers) {
		if (
			t.exitTime === null ||
			t.exitPrice === null ||
			!Number.isFinite(t.exitPrice)
		) {
			continue
		}
		const entryBrickIdx = findBrickIndexForTime(
			series5mTimes,
			new Date(t.entryTime).getTime()
		)
		const exitBrickIdx = findBrickIndexForTime(
			series5mTimes,
			new Date(t.exitTime).getTime()
		)
		// Use the stored outcome verbatim. It was set by `determineOutcome`
		// (src/lib/calculations.ts) at save-time, which honors the account's
		// `breakevenTicks` (+ per-trade override) rule. The chart previously
		// re-derived a separate hardcoded ±0.25R band here, which could color
		// a trade differently from how the journal classified it — dropped so
		// chart and journal always agree.
		out.push({
			id: t.id,
			entryBrickIdx,
			exitBrickIdx,
			entryPrice: t.entryPrice,
			exitPrice: t.exitPrice,
			direction: t.direction,
			outcome: t.outcome,
			// The trade is already rendered as a position-box (solid entry
			// line + risk/reward fills). Skip the dotted entry stub — only
			// the dotted EXIT stub is wanted.
			hideEntryStub: true,
		})
	}
	return out
}

const HawksChartWorkspace = ({
	assetSymbol,
	initialWindow,
	initialDrawings,
	userId,
}: HawksChartWorkspaceProps) => {
	const t = useTranslations("hawksChart")
	const [windowResult] = useState(initialWindow)
	// Drawings live in localStorage as the source of truth at runtime; a
	// debounced background flush mirrors them up to the DB. This replaces
	// the old "per-mutation server-action call" pattern that was hammering
	// the network with one request per stroke. See use-drawings-cache.ts
	// for the merge/diff/conflict-resolution mechanics.
	const drawingsCache = useDrawingsCache(assetSymbol, initialDrawings, userId)
	const drawings = drawingsCache.drawings
	const [activeTool, setActiveTool] = useState<DrawingTool>("cursor")
	const [pendingAnchor, setPendingAnchor] = useState<{
		timeMs: number
		price: number
	} | null>(null)
	const [toggles, setToggles] = useState<IndicatorToggles>(
		DEFAULT_INDICATOR_TOGGLES
	)
	const [hoveredIdx5m, setHoveredIdx5m] = useState<number | null>(null)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	// Surface sync errors from the localStorage→DB flush. Local mutations
	// keep working regardless; this only signals "the server hasn't seen
	// your latest edits yet" so the user knows there's drift.
	useEffect(() => {
		if (drawingsCache.lastSyncError) {
			setErrorMessage(drawingsCache.lastSyncError)
		}
	}, [drawingsCache.lastSyncError])
	// Drawing id currently being edited via the inline editor. Only one
	// drawing edits at a time; null means "no editor open." Selecting a
	// drawing == opening its editor.
	const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null)

	// Hooks must run in a stable order — derive the "empty" data shape up-front
	// so the error/empty branches are picked at render-time (not before hooks).
	const data =
		windowResult.status === "success"
			? windowResult.data
			: {
					assetSymbol,
					candles5m: [],
					candles15m: [],
					candles60m: [],
					sizes: {
						size5m: 21,
						size15m: 39,
						size60m: 84,
						effectiveDate: null,
						weekNumber: null,
					},
					tradeMarkers: [],
				}
	const { candles5m, candles15m, candles60m, sizes, tradeMarkers } = data

	const series5m = useMemo(
		() => candlesToBrickSeriesNative(candles5m),
		[candles5m]
	)
	const series15m = useMemo(
		() => candlesToBrickSeriesNative(candles15m),
		[candles15m]
	)
	const series60m = useMemo(
		() => candlesToBrickSeriesNative(candles60m),
		[candles60m]
	)

	const syncMap = useMemo(
		() =>
			buildCrosshairSyncMap(series5m.times, series15m.times, series60m.times),
		[series5m.times, series15m.times, series60m.times]
	)
	const synced = useMemo(() => {
		if (hoveredIdx5m === null) {
			return { idx15m: null, idx60m: null }
		}
		return syncMap.get(hoveredIdx5m) ?? { idx15m: null, idx60m: null }
	}, [syncMap, hoveredIdx5m])
	const handle5mCrosshair = useCallback((idx: number | null) => {
		setHoveredIdx5m(idx)
	}, [])

	const indicators5m = useMemo(
		() => buildIndicatorOverlays(candles5m, series5m, toggles, "5m"),
		[candles5m, series5m, toggles]
	)
	const indicators15m = useMemo(
		() => buildIndicatorOverlays(candles15m, series15m, toggles, "15m"),
		[candles15m, series15m, toggles]
	)
	const indicators60m = useMemo(
		() => buildIndicatorOverlays(candles60m, series60m, toggles, "60m"),
		[candles60m, series60m, toggles]
	)

	// Trade positions — full position-box rendering (entry line + stop +
	// target + risk/reward bands). Same visual language as user-drawn
	// position drawings, only read-only. Disabled when the user hides the
	// trade markers toggle.
	const tradePositions5m = useMemo(
		() =>
			toggles.tradeMarkers
				? buildTradePositionsFor5m(tradeMarkers, series5m.times)
				: [],
		[toggles.tradeMarkers, tradeMarkers, series5m.times]
	)

	const tradeOverlays5m = useMemo(
		() =>
			toggles.tradeMarkers
				? buildTradeOverlaysFor5m(tradeMarkers, series5m.times)
				: [],
		[toggles.tradeMarkers, tradeMarkers, series5m.times]
	)

	// Hover-focus: only the trade whose 5m brick span contains the hovered
	// brick is drawn; everything else stays hidden so the chart is clean at
	// rest. Spans come from the full position set (before filtering).
	const activeTradeId = useMemo(
		() =>
			resolveActiveTradeId(
				tradePositions5m.map((p) => ({
					id: p.id,
					startBrickIdx: p.startBrickIdx,
					endBrickIdx: p.endBrickIdx,
				})),
				hoveredIdx5m
			),
		[tradePositions5m, hoveredIdx5m]
	)
	// Trade overlays (exit markers / dashed lines) stay hover-scoped — only the
	// hovered trade's overlay draws — while the position boxes below render for
	// every trade always.
	const visibleOverlays5m = useMemo(
		() => tradeOverlays5m.filter((o) => o.id === activeTradeId),
		[tradeOverlays5m, activeTradeId]
	)

	// Per-week brick size for each pane's size label — read from the hovered
	// brick's `brick` indicator (fallback: last brick, then the latest-week
	// size). 15m/60m follow the synced crosshair index.
	const size5mR = useMemo(
		() => resolveBrickSize(candles5m, hoveredIdx5m, sizes.size5m),
		[candles5m, hoveredIdx5m, sizes.size5m]
	)
	const size15mR = useMemo(
		() => resolveBrickSize(candles15m, synced.idx15m, sizes.size15m),
		[candles15m, synced.idx15m, sizes.size15m]
	)
	const size60mR = useMemo(
		() => resolveBrickSize(candles60m, synced.idx60m, sizes.size60m),
		[candles60m, synced.idx60m, sizes.size60m]
	)

	const projectedDrawings = useMemo(
		() => ({
			pane5m: projectDrawingsForPane(drawings, series5m.times),
			pane15m: projectDrawingsForPane(drawings, series15m.times),
			pane60m: projectDrawingsForPane(drawings, series60m.times),
		}),
		[drawings, series5m.times, series15m.times, series60m.times]
	)

	// Day/week boundary markers per pane. Empty when the toggle is off so the
	// pane's reconciler removes every boundary line.
	const boundaries5m = useMemo(
		() =>
			toggles.sessionBoundaries ? computeBoundaryMarkers(series5m.times) : [],
		[toggles.sessionBoundaries, series5m.times]
	)
	const boundaries15m = useMemo(
		() =>
			toggles.sessionBoundaries ? computeBoundaryMarkers(series15m.times) : [],
		[toggles.sessionBoundaries, series15m.times]
	)
	const boundaries60m = useMemo(
		() =>
			toggles.sessionBoundaries ? computeBoundaryMarkers(series60m.times) : [],
		[toggles.sessionBoundaries, series60m.times]
	)

	// Memoize histogram object so it doesn't trigger pane rerenders
	const histogram5m = useMemo(
		() =>
			toggles.macd
				? {
						label: "MACD 5m",
						data: indicatorValuesByBrickIndex(
							series5m.times,
							candles5m,
							"macd1_histo"
						)
							// drop whitespace markers — the histogram series
							// expects every point to carry a numeric value, and
							// breaking continuity matters less for a bar plot.
							.filter(
								(p): p is { time: UTCTimestamp; value: number } => "value" in p
							)
							.map((p) => ({
								time: p.time,
								value: p.value,
								color:
									p.value >= 0
										? HAWKS_PALETTE.macd.histPos
										: HAWKS_PALETTE.macd.histNeg,
							})),
					}
				: null,
		[toggles.macd, series5m.times, candles5m]
	)

	// Reset the pending anchor every time the user changes tools — otherwise a
	// half-drawn trendline carries over into the wrong tool.
	const handleSelectTool = useCallback((tool: DrawingTool) => {
		setActiveTool(tool)
		setPendingAnchor(null)
		setErrorMessage(null)
	}, [])

	// All drawing mutations route through the localStorage cache. Each
	// path stamps a fresh `lastModifiedMs` so the per-id newer-wins merge
	// at next mount stays accurate. Network is invisible here — the cache
	// debounces a batch flush to syncDrawings every 5s.
	const appendDrawing = useCallback(
		(drawing: Drawing) => {
			drawingsCache.add(drawing)
		},
		[drawingsCache]
	)

	const updateDrawing = useCallback(
		(next: Drawing) => {
			drawingsCache.update({ ...next, lastModifiedMs: Date.now() })
		},
		[drawingsCache]
	)

	// After committing any drawing, snap the tool back to "cursor" so the
	// user explicitly clicks the toolbar again to add another. Matches the
	// Profit ProRT muscle memory and avoids the "I clicked once on the
	// chart and accidentally drew a second line" footgun. The toolbar's
	// existing onSelectTool path handles the "click toolbar again to add
	// another" UX naturally.
	const finishDrawing = useCallback(() => {
		setPendingAnchor(null)
		setActiveTool("cursor")
	}, [])

	const handlePaneClick = useCallback(
		(event: PaneClickEvent) => {
			setErrorMessage(null)
			if (activeTool === "cursor") {
				return
			}

			if (activeTool === "hline") {
				appendDrawing({
					id: makeId(),
					type: "hline",
					price: event.price,
					color: HAWKS_PALETTE.drawing.hline,
					lastModifiedMs: Date.now(),
				})
				finishDrawing()
				return
			}

			if (activeTool === "vline") {
				appendDrawing({
					id: makeId(),
					type: "vline",
					timeMs: event.timeMs,
					color: HAWKS_PALETTE.drawing.vline,
					lastModifiedMs: Date.now(),
				})
				finishDrawing()
				return
			}

			if (activeTool === "trendline" || activeTool === "fibo") {
				if (!pendingAnchor) {
					setPendingAnchor({ timeMs: event.timeMs, price: event.price })
					return
				}
				const id = makeId()
				if (activeTool === "trendline") {
					appendDrawing({
						id,
						type: "trendline",
						startTimeMs: pendingAnchor.timeMs,
						startPrice: pendingAnchor.price,
						endTimeMs: event.timeMs,
						endPrice: event.price,
						color: HAWKS_PALETTE.drawing.trendline,
						lastModifiedMs: Date.now(),
					})
				} else {
					appendDrawing({
						id,
						type: "fibo",
						startTimeMs: pendingAnchor.timeMs,
						startPrice: pendingAnchor.price,
						endTimeMs: event.timeMs,
						endPrice: event.price,
						color: HAWKS_PALETTE.drawing.fibo,
						lastModifiedMs: Date.now(),
					})
				}
				finishDrawing()
				return
			}

			if (activeTool === "position-long" || activeTool === "position-short") {
				if (!pendingAnchor) {
					// First click = entry price + start time.
					setPendingAnchor({ timeMs: event.timeMs, price: event.price })
					return
				}
				// Second click = STOP price. Risk (1R) is the distance from
				// entry to stop; target is auto-placed at 3R on the OPPOSITE
				// side of entry (3:1 reward:risk is the Hawks default — the
				// user can drag the target in the editor afterwards).
				//
				// For a LONG:  stop BELOW entry,  target = entry + 3*(entry - stop) ABOVE.
				// For a SHORT: stop ABOVE entry,  target = entry - 3*(stop - entry) BELOW.
				const direction = activeTool === "position-long" ? "long" : "short"
				const entryPrice = pendingAnchor.price
				let stopPrice = event.price
				// Guardrails: if the user clicked on the wrong side (e.g.
				// "stop above entry" on a long), flip the stop to the
				// correct side at the same magnitude rather than producing
				// a nonsense position. Avoids 0R / negative-R positions.
				const rawRisk = Math.abs(entryPrice - stopPrice)
				if (rawRisk === 0) {
					// Zero-risk position — bail; user clicked entry twice.
					finishDrawing()
					return
				}
				if (direction === "long" && stopPrice > entryPrice) {
					stopPrice = entryPrice - rawRisk
				} else if (direction === "short" && stopPrice < entryPrice) {
					stopPrice = entryPrice + rawRisk
				}
				const risk = Math.abs(entryPrice - stopPrice)
				const targetPrice =
					direction === "long" ? entryPrice + 3 * risk : entryPrice - 3 * risk
				const color =
					direction === "long"
						? HAWKS_PALETTE.drawing.positionLong
						: HAWKS_PALETTE.drawing.positionShort
				appendDrawing({
					id: makeId(),
					type: "position",
					direction,
					startTimeMs: pendingAnchor.timeMs,
					endTimeMs: event.timeMs,
					entryPrice,
					stopPrice,
					targetPrice,
					qty: DEFAULT_QTY,
					valuePerPoint: VALUE_PER_POINT_WIN,
					color,
					lastModifiedMs: Date.now(),
				})
				finishDrawing()
			}
		},
		[activeTool, appendDrawing, pendingAnchor, finishDrawing]
	)

	const handleRemoveDrawing = useCallback(
		(id: string) => {
			drawingsCache.remove(id)
		},
		[drawingsCache]
	)

	const handleClearAll = useCallback(() => {
		drawingsCache.clearAll()
	}, [drawingsCache])

	const handleToggle = useCallback(
		(key: keyof IndicatorToggles, value: boolean) => {
			setToggles((prev) => ({ ...prev, [key]: value }))
		},
		[]
	)

	const sizesLabel = `5m=${formatRSize(sizes.size5m)}  ·  15m=${formatRSize(sizes.size15m)}  ·  60m=${formatRSize(sizes.size60m)}`

	if (windowResult.status === "error") {
		// Log raw error to console for debugging; never render internally.
		console.error("[hawksChart] Candle load failed:", windowResult.message)
		return (
			<div className="space-y-m-400">
				<header className="space-y-s-100">
					<h1 className="text-h1 text-txt-100 font-semibold">{t("title")}</h1>
					<p className="text-small text-txt-300">{t("subtitle")}</p>
				</header>
				<div className="bg-bg-200 border-bg-300 p-l-700 flex h-[480px] items-center justify-center rounded-lg border">
					<p className="text-small text-destructive">{t("loadError")}</p>
				</div>
			</div>
		)
	}

	if (candles5m.length === 0) {
		return (
			<div className="space-y-m-400">
				<header className="space-y-s-100">
					<h1 className="text-h1 text-txt-100 font-semibold">{t("title")}</h1>
					<p className="text-small text-txt-300">{t("subtitle")}</p>
				</header>
				<div className="bg-bg-200 border-bg-300 p-l-700 flex h-[480px] items-center justify-center rounded-lg border">
					<p className="text-small text-txt-300">{t("noData")}</p>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-m-400">
			<header className="gap-s-200 flex items-baseline justify-between">
				<div>
					<h1 className="text-h1 text-txt-100 font-semibold">{t("title")}</h1>
					<p className="text-small text-txt-300">
						{t("subtitle")} ·{" "}
						<span className="font-mono">
							{assetSymbol} · {sizesLabel} · {candles5m.length}{" "}
							{t("bricksLoaded")}
						</span>
					</p>
				</div>
				{errorMessage && (
					<span className="text-tiny text-destructive flex items-center gap-1">
						<Loader2 className="h-3 w-3 animate-spin" />
						{errorMessage}
					</span>
				)}
			</header>

			<HawksChartDrawingToolbar
				activeTool={activeTool}
				onSelectTool={handleSelectTool}
				pendingAnchor={pendingAnchor !== null}
				drawingCount={drawings.length}
				onClearAll={handleClearAll}
			/>

			<HawksChartIndicatorPanel toggles={toggles} onToggle={handleToggle} />

			<div className="gap-s-300 grid h-[calc(100vh-340px)] min-h-[480px] grid-cols-1 md:grid-cols-[3fr_2fr]">
				<div className="relative h-full min-h-0">
					<RenkoPane
						className="h-full"
						label={t("pane.5m")}
						subLabel={`size ${formatRSize(size5mR)}`}
						series={series5m}
						indicators={indicators5m}
						paletteOverride={HAWKS_PALETTE_OVERRIDE}
						histogram={histogram5m}
						markerColorMode="action"
						drawings={projectedDrawings.pane5m}
						onPaneClick={handlePaneClick}
						tradePositions={tradePositions5m}
						focusedPositionId={activeTradeId}
						tradeOverlays={visibleOverlays5m}
						boundaryMarkers={boundaries5m}
						emitsCrosshair
						onCrosshairMove={handle5mCrosshair}
					/>
				</div>
				<div className="gap-s-300 grid grid-rows-2">
					<RenkoPane
						label={t("pane.15m")}
						subLabel={`size ${formatRSize(size15mR)}`}
						series={series15m}
						indicators={indicators15m}
						paletteOverride={HAWKS_PALETTE_OVERRIDE}
						markerColorMode="action"
						drawings={projectedDrawings.pane15m}
						boundaryMarkers={boundaries15m}
						onPaneClick={handlePaneClick}
						externalCrosshair={synced.idx15m}
					/>
					<RenkoPane
						label={t("pane.60m")}
						subLabel={`size ${formatRSize(size60mR)}`}
						series={series60m}
						indicators={indicators60m}
						paletteOverride={HAWKS_PALETTE_OVERRIDE}
						markerColorMode="action"
						drawings={projectedDrawings.pane60m}
						boundaryMarkers={boundaries60m}
						onPaneClick={handlePaneClick}
						externalCrosshair={synced.idx60m}
					/>
				</div>
			</div>

			{drawings.length > 0 && (
				<div className="border-bg-300 bg-bg-200 rounded-md border">
					<div className="px-s-300 py-s-200 border-bg-300 flex items-baseline justify-between border-b">
						<h3 className="text-small text-txt-100 font-semibold">
							{t("drawings.title")}
						</h3>
						<span className="text-tiny text-txt-300 font-mono">
							{drawings.length}
						</span>
					</div>
					<div className="divide-bg-300 divide-y">
						{drawings.map((d) => {
							const isEditing = editingDrawingId === d.id
							return (
								<div
									key={d.id}
									className="px-s-300 py-s-200 gap-s-200 flex flex-col"
								>
									<div className="gap-s-300 flex items-center justify-between">
										<div className="gap-s-200 flex items-center">
											<span
												className="inline-block h-3 w-3 rounded-sm"
												style={{ backgroundColor: d.color }}
											/>
											<span className="text-tiny text-txt-200 font-mono">
												{d.type === "position"
													? `${d.direction} @ ${d.entryPrice.toFixed(0)} · stop ${d.stopPrice.toFixed(0)} (1R) · target ${d.targetPrice.toFixed(0)}`
													: d.type === "hline"
														? `hline @ ${d.price.toFixed(0)}`
														: d.type === "vline"
															? `vline @ ${new Date(d.timeMs).toISOString().slice(0, 16).replace("T", " ")}`
															: d.type === "trendline"
																? `trendline ${d.startPrice.toFixed(0)} → ${d.endPrice.toFixed(0)}`
																: `fibo ${d.startPrice.toFixed(0)} → ${d.endPrice.toFixed(0)}`}
											</span>
											{d.label && (
												<span className="text-tiny text-txt-300">
													· {d.label}
												</span>
											)}
										</div>
										<div className="gap-s-200 flex items-center">
											{d.type === "position" && (
												<button
													type="button"
													className="text-tiny text-acc-100 hover:underline"
													onClick={() =>
														setEditingDrawingId(isEditing ? null : d.id)
													}
												>
													{isEditing ? t("done") : t("edit")}
												</button>
											)}
											<button
												type="button"
												className="text-tiny text-destructive hover:underline"
												onClick={() => {
													if (editingDrawingId === d.id) {
														setEditingDrawingId(null)
													}
													handleRemoveDrawing(d.id)
												}}
											>
												{t("remove")}
											</button>
										</div>
									</div>
									{isEditing && d.type === "position" && (
										<HawksChartPositionEditor
											drawing={d as PositionDrawing}
											paneTimes={series5m.times}
											onCommit={(next) => {
												updateDrawing(next)
												setEditingDrawingId(null)
											}}
											onCancel={() => setEditingDrawingId(null)}
										/>
									)}
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}

export { HawksChartWorkspace }
export type { HawksChartWorkspaceProps }
