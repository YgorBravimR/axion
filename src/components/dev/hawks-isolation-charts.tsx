"use client"

import { type ReactNode, useCallback, useMemo, useState } from "react"
import Link from "next/link"
import type { HistogramData, UTCTimestamp } from "lightweight-charts"
import { RenkoPane } from "@/components/backtest/inspector/renko-pane"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
	buildCrosshairSyncMap,
	candlesToBrickSeriesNative,
} from "@/lib/renko/bricks-to-chart"
import type {
	BrickChartSeries,
	CandleRowLike,
} from "@/lib/renko/bricks-to-chart"
import type { HawksIsolationData } from "@/app/actions/hawks-isolation-data.types"
import { walkStructuralPivots } from "@/lib/backtest/hawks-structural-pivots"

interface HawksIsolationChartsProps {
	data: HawksIsolationData
	locale: string
}

const ORANGE_BRIGHT = "rgb(255, 165, 60)"
const ORANGE_MUTED = "rgb(210, 130, 40)"
const GRAY_LIGHT = "rgb(190, 195, 205)"
const GRAY_DARK = "rgb(130, 135, 145)"
const YELLOW_SOLID = "rgb(252, 211, 77)"
const YELLOW_FAINT = "rgba(252, 211, 77, 0.45)"
const TEAL_BRIGHT = "rgb(94, 234, 212)"
const TEAL_MID = "rgb(45, 212, 191)"
const TEAL_DARK = "rgb(20, 160, 160)"
const GREEN = "rgb(52, 211, 153)"
const GREEN_FAINT = "rgba(52, 211, 153, 0.6)"
const RED = "rgb(248, 113, 113)"
const RED_FAINT = "rgba(248, 113, 113, 0.6)"
const GRAY_NEUTRAL = "rgba(120, 124, 132, 0.45)"
const GRAY_NEUTRAL_FAINT = "rgba(120, 124, 132, 0.3)"
const GRAY_NEUTRAL_DIM = "rgba(120, 124, 132, 0.4)"
const GRAY_NEUTRAL_LIGHT = "rgba(120, 124, 132, 0.15)"
const MAGENTA = "rgb(244, 114, 182)"
const YELLOW_BRIGHT_SEMI = "rgba(251, 191, 36, 0.6)"
const YELLOW_BRIGHT_SEMI_HIGH = "rgba(251, 191, 36, 0.85)"
const ROLL_LINE_COLOR = "rgb(168, 85, 247)" // purple
const DAY_LINE_COLOR = "rgb(56, 189, 248)" // sky blue
const TEXT_BG = "#0f1014"

type Overlay = {
	key: string
	label: string
	color: string
	data: ReadonlyArray<{ time: UTCTimestamp; value: number }>
	style?: "line" | "points"
}

const overlayFromKey = (
	candles: HawksIsolationData["candles5m"],
	key: string,
	label: string,
	color: string
): Overlay => {
	const data: Array<{ time: UTCTimestamp; value: number }> = []
	for (let i = 0; i < candles.length; i++) {
		const v = candles[i]!.indicators[key]
		if (typeof v === "number") {
			data.push({ time: i as UTCTimestamp, value: v })
		}
	}
	return { key, label, color, data }
}

const histogramFromKey = (
	candles: HawksIsolationData["candles5m"],
	key: string,
	label: string,
	posColor: string,
	negColor: string
): { label: string; data: Array<HistogramData<UTCTimestamp>> } => {
	const data: Array<HistogramData<UTCTimestamp>> = []
	for (let i = 0; i < candles.length; i++) {
		const v = candles[i]!.indicators[key]
		if (typeof v === "number") {
			data.push({
				time: i as UTCTimestamp,
				value: v,
				color: v >= 0 ? posColor : negColor,
			})
		}
	}
	return { label, data }
}

const walkerHistogram = (
	candles: HawksIsolationData["candles5m"],
	walkerByTimestamp: HawksIsolationData["walkerByTimestamp"],
	field: "gate15m" | "gate60m",
	label: string
): { label: string; data: Array<HistogramData<UTCTimestamp>> } => {
	const data: Array<HistogramData<UTCTimestamp>> = []
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i]!
		const snap = walkerByTimestamp[c.timestamp]
		if (!snap) {
			continue
		}
		const state = snap[field]
		const value = state === "BULL" ? 1 : state === "BEAR" ? -1 : 0
		const color =
			state === "BULL" ? GREEN : state === "BEAR" ? RED : GRAY_NEUTRAL
		data.push({ time: i as UTCTimestamp, value, color })
	}
	return { label, data }
}

type EvalSnap = {
	value: number | null
	rollMean: number | null
	dayMean: number | null
	dayBrickCount: number
}
interface EvalTabProps {
	title: string
	subtitle: string
	snap: EvalSnap | null
	stream: ReadonlyArray<EvalSnap>
	mode: "roll" | "day"
	setMode: (_m: "roll" | "day") => void
	recentTrigger: {
		brickIdx: number
		label: string
		direction: "short" | "long"
	} | null
	refIdx: number
	series: BrickChartSeries
	histogram: {
		label: string
		data: Array<HistogramData<UTCTimestamp>>
		lines?: ReadonlyArray<{
			key: string
			label: string
			color: string
			data: ReadonlyArray<{ time: UTCTimestamp; value: number }>
		}>
	}
	directional: boolean
}

const EvalTab = ({
	title,
	subtitle,
	snap,
	stream,
	mode,
	setMode,
	recentTrigger,
	refIdx,
	series,
	histogram,
	directional,
}: EvalTabProps): ReactNode => {
	const value = snap?.value ?? null
	// Threshold multiplier: a brick "crosses" when |value| ≥ MULT × mean. A
	// raw mean cutoff (×1) gives a ~50/50 coin-flip — useless. 1.5× captures
	// the top ~30% (above-average burst). 2× captures the top ~15% (strong
	// burst). 1.5 is the sweet spot for entry-confirmation.
	const THRESHOLD_MULT = 1.5
	const judge = (
		threshold: number | null
	): { verdict: "POS" | "NEG" | "NEUTRAL"; ratio: number | null } => {
		if (value === null || threshold === null) {
			return { verdict: "NEUTRAL", ratio: null }
		}
		const ratio = threshold !== 0 ? Math.abs(value) / threshold : null
		const aboveThreshold = Math.abs(value) >= threshold * THRESHOLD_MULT
		if (!aboveThreshold) {
			return { verdict: "NEUTRAL", ratio }
		}
		if (!directional || recentTrigger === null) {
			return { verdict: "POS", ratio }
		}
		const wantsNegative = recentTrigger.direction === "short"
		const valueIsNegative = value < 0
		return { verdict: wantsNegative === valueIsNegative ? "POS" : "NEG", ratio }
	}
	const rollJudge = judge(snap?.rollMean ?? null)
	const dayJudge = judge(snap?.dayMean ?? null)

	// Per-brick threshold crossings over the entire window. We tally counts +
	// build a compact "crossings strip" — one tiny cell per brick — to render
	// above the chart. Cell glyph shows whether THAT brick crossed roll, day,
	// both, or neither.
	let evaluatedBricks = 0
	let rollCrosses = 0
	let dayCrosses = 0
	let bothCrosses = 0
	const crossings: Array<"none" | "roll" | "day" | "both"> = []
	for (let i = 0; i < stream.length; i++) {
		const s = stream[i]!
		if (s.value === null) {
			crossings.push("none")
			continue
		}
		const mag = Math.abs(s.value)
		const overRoll = s.rollMean !== null && mag >= s.rollMean * THRESHOLD_MULT
		const overDay = s.dayMean !== null && mag >= s.dayMean * THRESHOLD_MULT
		if (s.rollMean !== null || s.dayMean !== null) {
			evaluatedBricks += 1
		}
		if (overRoll && overDay) {
			crossings.push("both")
			bothCrosses += 1
			rollCrosses += 1
			dayCrosses += 1
		} else if (overRoll) {
			crossings.push("roll")
			rollCrosses += 1
		} else if (overDay) {
			crossings.push("day")
			dayCrosses += 1
		} else {
			crossings.push("none")
		}
	}
	const pct = (n: number): string =>
		evaluatedBricks > 0 ? `${Math.round((n / evaluatedBricks) * 100)}%` : "—"
	const crossingColor: Record<"none" | "roll" | "day" | "both", string> = {
		none: "transparent",
		roll: ROLL_LINE_COLOR,
		day: DAY_LINE_COLOR,
		both: MAGENTA,
	}
	const cellStyle = (
		v: "POS" | "NEG" | "NEUTRAL"
	): { background: string; color: string } => ({
		background: v === "POS" ? GREEN : v === "NEG" ? RED : GRAY_NEUTRAL_DIM,
		color: TEXT_BG,
	})

	const glyph = (v: "POS" | "NEG" | "NEUTRAL") =>
		v === "POS" ? "▲" : v === "NEG" ? "▼" : "·"
	return (
		<div className="flex flex-col gap-2">
			{/* Keltner-style per-brick badges: one cell per threshold + raw value
			    on the right. Same shape as Group C's "5m KC1 ▼ KC2 ·" row. */}
			<div className="border-bg-300 bg-bg-100/40 p-s-200 text-tiny border">
				<div className="flex flex-wrap items-center gap-1 font-mono">
					<span className="text-txt-300">5m</span>
					<span
						className="rounded-sm px-2 py-0.5 font-semibold"
						style={cellStyle(rollJudge.verdict)}
						title={`roll 200 · value=${value?.toFixed(0) ?? "?"} threshold=${snap?.rollMean?.toFixed(0) ?? "?"} ratio=${rollJudge.ratio !== null ? rollJudge.ratio.toFixed(2) + "×" : "?"}`}
					>
						roll {glyph(rollJudge.verdict)}
					</span>
					<span
						className="rounded-sm px-2 py-0.5 font-semibold"
						style={cellStyle(dayJudge.verdict)}
						title={`day so far (≥20 bricks) · value=${value?.toFixed(0) ?? "?"} threshold=${snap?.dayMean?.toFixed(0) ?? "?"} ratio=${dayJudge.ratio !== null ? dayJudge.ratio.toFixed(2) + "×" : "?"}`}
					>
						day {glyph(dayJudge.verdict)}
					</span>
					<span className="text-txt-300 text-tiny font-mono">
						{value !== null ? value.toFixed(0) : "—"}
					</span>
				</div>
				<div className="text-txt-300 text-tiny mt-1 font-mono opacity-70">
					{subtitle} · {snap?.dayBrickCount ?? 0} day-bricks ·{" "}
					{recentTrigger
						? `last trigger ${recentTrigger.label} (${recentTrigger.direction}) at #${recentTrigger.brickIdx}`
						: "no prior trigger"}{" "}
					· @ #{refIdx} ·{" "}
					<button
						type="button"
						onClick={() => setMode("roll")}
						className={
							mode === "roll"
								? "text-txt-100 underline"
								: "text-txt-300 hover:underline"
						}
					>
						roll
					</button>
					{" / "}
					<button
						type="button"
						onClick={() => setMode("day")}
						className={
							mode === "day"
								? "text-txt-100 underline"
								: "text-txt-300 hover:underline"
						}
					>
						day
					</button>
				</div>
			</div>
			{/* Threshold-crossing counter + per-brick strip — shows when
			    and how often |value| crosses each threshold over the window. */}
			<div className="border-bg-300 bg-bg-100/40 p-s-200 text-tiny border">
				<div className="flex flex-wrap items-center gap-2 font-mono">
					<span className="text-txt-300">
						Crossings (≥ {THRESHOLD_MULT}× mean · {evaluatedBricks} bricks
						evaluated):
					</span>
					<span
						className="rounded-sm px-2 py-0.5 font-semibold"
						style={{ background: crossingColor.roll, color: TEXT_BG }}
						title="Bricks where |value| > rolling-200 mean"
					>
						roll · {rollCrosses} ({pct(rollCrosses)})
					</span>
					<span
						className="rounded-sm px-2 py-0.5 font-semibold"
						style={{ background: crossingColor.day, color: TEXT_BG }}
						title="Bricks where |value| > day-so-far mean"
					>
						day · {dayCrosses} ({pct(dayCrosses)})
					</span>
					<span
						className="rounded-sm px-2 py-0.5 font-semibold"
						style={{ background: crossingColor.both, color: TEXT_BG }}
						title="Bricks where |value| > BOTH thresholds"
					>
						both · {bothCrosses} ({pct(bothCrosses)})
					</span>
				</div>
				{/* Per-brick crossing strip — compact horizontal map. */}
				<div
					className="mt-2 flex h-3 items-stretch overflow-hidden rounded-sm"
					style={{ background: GRAY_NEUTRAL_LIGHT }}
					title="Each cell = one 5m brick. Colored bricks crossed a threshold."
				>
					{crossings.map((kind, i) => (
						<div
							key={i}
							style={{
								flex: 1,
								background: crossingColor[kind],
								outline: i === refIdx ? "1px solid white" : undefined,
								outlineOffset: i === refIdx ? "-1px" : undefined,
							}}
						/>
					))}
				</div>
			</div>
			<div style={{ height: "calc(100vh - 420px)", minHeight: "460px" }}>
				<RenkoPane
					className="h-full"
					label={title}
					subLabel="purple = rolling 200 · sky-blue = day so far · magenta strip cells = both crossed"
					series={series}
					histogram={histogram}
				/>
			</div>
		</div>
	)
}

const HawksIsolationCharts = ({
	data,
	locale,
}: HawksIsolationChartsProps): React.ReactElement => {
	const {
		date,
		candles5m,
		candles15m,
		candles60m,
		walkerByTimestamp,
		catalog,
		cleanDays,
	} = data
	const [activeGroup, setActiveGroup] = useState("A")
	const [hoveredIdx5m, setHoveredIdx5m] = useState<number | null>(null)

	const series5m = useMemo(
		() => candlesToBrickSeriesNative(candles5m as readonly CandleRowLike[]),
		[candles5m]
	)
	const series15m = useMemo(
		() => candlesToBrickSeriesNative(candles15m as readonly CandleRowLike[]),
		[candles15m]
	)
	const series60m = useMemo(
		() => candlesToBrickSeriesNative(candles60m as readonly CandleRowLike[]),
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

	const dayIdx = useMemo(() => cleanDays.indexOf(date), [cleanDays, date])
	const prevDay = dayIdx > 0 ? cleanDays[dayIdx - 1] : null
	const nextDay =
		dayIdx >= 0 && dayIdx < cleanDays.length - 1 ? cleanDays[dayIdx + 1] : null

	const overlaysByGroup = useMemo(() => {
		// Group A — projected onto the 5m timeline (legacy view). The triple-screen
		// also renders 15m EMAs on the 15m pane and 60m EMAs on the 60m pane below.
		const groupA5m: Overlay[] = [
			overlayFromKey(candles5m, "mme27_15m", "MME27 15m", GRAY_LIGHT),
			overlayFromKey(candles5m, "mme55_15m", "MME55 15m", GRAY_DARK),
			overlayFromKey(candles5m, "mme27_60m", "MME27 60m", ORANGE_BRIGHT),
			overlayFromKey(candles5m, "mme55_60m", "MME55 60m", ORANGE_MUTED),
		]
		// 15m + 60m parquets store NATIVE EMA values under `ema27` / `ema55`
		// (the projections `mme27_15m`, `mme55_15m`, `mme27_60m`, `mme55_60m`
		// only exist on the OTHER TFs as cross-projections).
		const groupA15m: Overlay[] = [
			overlayFromKey(candles15m, "ema27", "EMA 27 (15m native)", GRAY_LIGHT),
			overlayFromKey(candles15m, "ema55", "EMA 55 (15m native)", GRAY_DARK),
		]
		const groupA60m: Overlay[] = [
			overlayFromKey(candles60m, "ema27", "EMA 27 (60m native)", ORANGE_BRIGHT),
			overlayFromKey(candles60m, "ema55", "EMA 55 (60m native)", ORANGE_MUTED),
		]
		const groupC5m: Overlay[] = [
			overlayFromKey(candles5m, "kc1_sup", "KC1 Sup", YELLOW_SOLID),
			overlayFromKey(candles5m, "kc1_inf", "KC1 Inf", YELLOW_SOLID),
			overlayFromKey(candles5m, "kc2_sup", "KC2 Sup", YELLOW_FAINT),
			overlayFromKey(candles5m, "kc2_inf", "KC2 Inf", YELLOW_FAINT),
		]
		const groupC15m: Overlay[] = [
			overlayFromKey(candles15m, "kc1_sup", "KC1 Sup", YELLOW_SOLID),
			overlayFromKey(candles15m, "kc1_inf", "KC1 Inf", YELLOW_SOLID),
			overlayFromKey(candles15m, "kc2_sup", "KC2 Sup", YELLOW_FAINT),
			overlayFromKey(candles15m, "kc2_inf", "KC2 Inf", YELLOW_FAINT),
		]
		const groupC60m: Overlay[] = [
			overlayFromKey(candles60m, "kc1_sup", "KC1 Sup", YELLOW_SOLID),
			overlayFromKey(candles60m, "kc1_inf", "KC1 Inf", YELLOW_SOLID),
			overlayFromKey(candles60m, "kc2_sup", "KC2 Sup", YELLOW_FAINT),
			overlayFromKey(candles60m, "kc2_inf", "KC2 Inf", YELLOW_FAINT),
		]
		// VWAP D/W/M are TF-independent (same value at same timestamp on every TF
		// stream — they're cumulative, anchored to day/week/month start). We
		// project them on each TF's native bricks so each pane shows price-action
		// vs VWAP at that resolution. `ajuste` is a per-day constant joined from
		// `asset_session_anchors` server-side and merged onto each candle's
		// `indicators` blob before render.
		const groupD5m: Overlay[] = [
			overlayFromKey(candles5m, "ajuste", "Ajuste D-1", MAGENTA),
			overlayFromKey(candles5m, "vwap_d", "VWAP D", TEAL_BRIGHT),
			overlayFromKey(candles5m, "vwap_w", "VWAP W", TEAL_MID),
			overlayFromKey(candles5m, "vwap_m", "VWAP M", TEAL_DARK),
			// HTF EMA magnets — projected onto 5m bricks. Visually faint to keep
			// them distinct from horizontal-level lines.
			overlayFromKey(candles5m, "mme27_15m", "MME27 15m", ORANGE_BRIGHT),
			overlayFromKey(candles5m, "mme55_15m", "MME55 15m", ORANGE_MUTED),
			overlayFromKey(candles5m, "mme27_60m", "MME27 60m", GRAY_LIGHT),
			overlayFromKey(candles5m, "mme55_60m", "MME55 60m", GRAY_DARK),
		]
		const groupD15m: Overlay[] = [
			overlayFromKey(candles15m, "ajuste", "Ajuste D-1", MAGENTA),
			overlayFromKey(candles15m, "vwap_d", "VWAP D", TEAL_BRIGHT),
			overlayFromKey(candles15m, "vwap_w", "VWAP W", TEAL_MID),
			overlayFromKey(candles15m, "vwap_m", "VWAP M", TEAL_DARK),
		]
		const groupD60m: Overlay[] = [
			overlayFromKey(candles60m, "ajuste", "Ajuste D-1", MAGENTA),
			overlayFromKey(candles60m, "vwap_d", "VWAP D", TEAL_BRIGHT),
			overlayFromKey(candles60m, "vwap_w", "VWAP W", TEAL_MID),
			overlayFromKey(candles60m, "vwap_m", "VWAP M", TEAL_DARK),
		]
		return {
			A5m: groupA5m,
			A15m: groupA15m,
			A60m: groupA60m,
			C5m: groupC5m,
			C15m: groupC15m,
			C60m: groupC60m,
			D5m: groupD5m,
			D15m: groupD15m,
			D60m: groupD60m,
		}
	}, [candles5m, candles15m, candles60m])

	// Group G — Dow-theory swing structure. Period-2 detector + strict type
	// alternation yields a clean TOPO ↔ FUNDO zigzag. Render it as ONE
	// connected swing-tape line; color each vertex by trend continuation:
	//   - green vertex  = continuation (TOPO > prior TOPO, or FUNDO < prior FUNDO)
	//   - red vertex    = trend break  (TOPO ≤ prior TOPO, or FUNDO ≥ prior FUNDO)
	//   - neutral       = first vertex of each type (no prior to compare)
	// Reading the tape: a run of green vertices = clean trend (HH+HL or LL+LH);
	// a red vertex = roll-over moment. This is Dow theory rendered directly.
	type VertexKind = "continuation" | "break" | "neutral"
	// Dow-theory structural state, evaluated on the most recent same-type
	// pivot vs the one before it. `null` = not enough data yet (only one
	// TOPO or one FUNDO so far in the window).
	type StructuralState = "higher" | "lower" | null
	const buildSwingStructure = useCallback(
		(
			candles: HawksIsolationData["candles5m"]
		): {
			line: Array<{ time: UTCTimestamp; value: number }>
			continuation: Array<{ time: UTCTimestamp; value: number }>
			breaks: Array<{ time: UTCTimestamp; value: number }>
			neutral: Array<{ time: UTCTimestamp; value: number }>
			counts: { topo: number; fundo: number; cont: number; brk: number }
			// Per-brick streams of structural state. Index = brick index;
			// value = state of the most recent same-type pivot comparison
			// observed at or before that brick (forward-fill). Badges read
			// these streams at the crosshair position so they update live.
			topoTrendByBrick: StructuralState[]
			fundoTrendByBrick: StructuralState[]
		} => {
			const bricks: Array<{
				open: number
				high: number
				low: number
				close: number
			}> = new Array(candles.length)
			for (let i = 0; i < candles.length; i++) {
				const c = candles[i]!
				bricks[i] = { open: c.open, high: c.high, low: c.low, close: c.close }
			}
			const markers = walkStructuralPivots(bricks)
			const line: Array<{ time: UTCTimestamp; value: number }> = []
			const continuation: Array<{ time: UTCTimestamp; value: number }> = []
			const breaks: Array<{ time: UTCTimestamp; value: number }> = []
			const neutral: Array<{ time: UTCTimestamp; value: number }> = []
			let lastTopo: number | null = null
			let lastFundo: number | null = null
			let lastType: "topo" | "fundo" | null = null
			let topoCount = 0
			let fundoCount = 0
			let contCount = 0
			let brkCount = 0
			// Events: { atBrickIdx, state } sorted by atBrickIdx ascending. We
			// expand into per-brick forward-filled arrays after the loop.
			const topoEvents: Array<{ at: number; state: StructuralState }> = []
			const fundoEvents: Array<{ at: number; state: StructuralState }> = []
			for (const m of markers) {
				if (m.type === lastType) {
					continue
				}
				// Cosmetic refinement: the detector picks the last bullish close
				// (or bearish close for FUNDO) as the pivot — but the actual
				// visual extreme is often the wick of the first opposite-color
				// brick that comes right after. Scan [peakBrickIdx, confirmBrickIdx)
				// inclusive of the bridge bricks and pick the true high (or low)
				// for rendering. Engine still consumes the unrefined price.
				let renderIdx = m.peakBrickIdx
				let renderPrice = m.price
				if (m.type === "topo") {
					for (let i = m.peakBrickIdx; i < m.brickIdx; i++) {
						const h = bricks[i]?.high
						if (h !== undefined && h > renderPrice) {
							renderPrice = h
							renderIdx = i
						}
					}
				} else {
					for (let i = m.peakBrickIdx; i < m.brickIdx; i++) {
						const l = bricks[i]?.low
						if (l !== undefined && l < renderPrice) {
							renderPrice = l
							renderIdx = i
						}
					}
				}
				let kind: VertexKind = "neutral"
				if (m.type === "topo") {
					if (lastTopo !== null) {
						kind = renderPrice > lastTopo ? "continuation" : "break"
						topoEvents.push({
							at: renderIdx,
							state: renderPrice > lastTopo ? "higher" : "lower",
						})
					}
					lastTopo = renderPrice
					topoCount++
				} else {
					if (lastFundo !== null) {
						kind = renderPrice < lastFundo ? "continuation" : "break"
						fundoEvents.push({
							at: renderIdx,
							state: renderPrice < lastFundo ? "lower" : "higher",
						})
					}
					lastFundo = renderPrice
					fundoCount++
				}
				const pt = { time: renderIdx as UTCTimestamp, value: renderPrice }
				line.push(pt)
				if (kind === "continuation") {
					continuation.push(pt)
					contCount++
				} else if (kind === "break") {
					breaks.push(pt)
					brkCount++
				} else {
					neutral.push(pt)
				}
				lastType = m.type
			}
			// Forward-fill events into per-brick streams. Events are already in
			// ascending `at` order by construction (loop processes markers in
			// time order). After event[i], the stream carries event[i].state
			// until event[i+1].at.
			const topoTrendByBrick: StructuralState[] = new Array(
				candles.length
			).fill(null)
			const fundoTrendByBrick: StructuralState[] = new Array(
				candles.length
			).fill(null)
			let ti = 0
			let fi = 0
			let curTopo: StructuralState = null
			let curFundo: StructuralState = null
			for (let i = 0; i < candles.length; i++) {
				while (ti < topoEvents.length && topoEvents[ti]!.at <= i) {
					curTopo = topoEvents[ti]!.state
					ti++
				}
				while (fi < fundoEvents.length && fundoEvents[fi]!.at <= i) {
					curFundo = fundoEvents[fi]!.state
					fi++
				}
				topoTrendByBrick[i] = curTopo
				fundoTrendByBrick[i] = curFundo
			}
			return {
				line,
				continuation,
				breaks,
				neutral,
				counts: {
					topo: topoCount,
					fundo: fundoCount,
					cont: contCount,
					brk: brkCount,
				},
				topoTrendByBrick,
				fundoTrendByBrick,
			}
		},
		[]
	)
	const swing5m = useMemo(
		() => buildSwingStructure(candles5m),
		[buildSwingStructure, candles5m]
	)
	const swing15m = useMemo(
		() => buildSwingStructure(candles15m),
		[buildSwingStructure, candles15m]
	)
	const swing60m = useMemo(
		() => buildSwingStructure(candles60m),
		[buildSwingStructure, candles60m]
	)
	const [pivotPaneEnabled, setPivotPaneEnabled] = useState<{
		"5m": boolean
		"15m": boolean
		"60m": boolean
	}>({
		"5m": true,
		"15m": true,
		"60m": true,
	})
	const togglePivotPane = useCallback(
		(tf: "5m" | "15m" | "60m") =>
			setPivotPaneEnabled((s) => ({ ...s, [tf]: !s[tf] })),
		[]
	)
	const buildOverlaysForPane = useCallback(
		(
			data: ReturnType<typeof buildSwingStructure>,
			tfEnabled: boolean
		): Overlay[] => {
			if (!tfEnabled) {
				return []
			}
			return [
				{
					key: "swing-tape",
					label: `Swing tape (${data.counts.topo} TOPO + ${data.counts.fundo} FUNDO)`,
					color: "rgb(56, 189, 248)",
					data: data.line,
					style: "line",
				},
			]
		},
		[]
	)
	const pivotOverlays5m = useMemo(
		() => buildOverlaysForPane(swing5m, pivotPaneEnabled["5m"]),
		[buildOverlaysForPane, swing5m, pivotPaneEnabled]
	)
	const pivotOverlays15m = useMemo(
		() => buildOverlaysForPane(swing15m, pivotPaneEnabled["15m"]),
		[buildOverlaysForPane, swing15m, pivotPaneEnabled]
	)
	const pivotOverlays60m = useMemo(
		() => buildOverlaysForPane(swing60m, pivotPaneEnabled["60m"]),
		[buildOverlaysForPane, swing60m, pivotPaneEnabled]
	)

	// Group A walker ribbon: pick one ribbon — composite if both gates agree
	// (BULL-BULL → +1 green, BEAR-BEAR → −1 red, otherwise gray). Mirrors how
	// the engine itself uses the gates: only acts when BOTH agree.
	const walkerCompositeHistogram = useMemo(() => {
		const data: Array<HistogramData<UTCTimestamp>> = []
		for (let i = 0; i < candles5m.length; i++) {
			const c = candles5m[i]!
			const snap = walkerByTimestamp[c.timestamp]
			if (!snap) {
				continue
			}
			const both =
				snap.gate15m === "BULL" && snap.gate60m === "BULL"
					? 1
					: snap.gate15m === "BEAR" && snap.gate60m === "BEAR"
						? -1
						: 0
			data.push({
				time: i as UTCTimestamp,
				value: both === 0 ? 0.4 : both,
				color: both === 1 ? GREEN : both === -1 ? RED : GRAY_NEUTRAL,
			})
		}
		return { label: "HTF gate (15m∩60m walker)", data }
	}, [candles5m, walkerByTimestamp])

	const walker15Histogram = useMemo(
		() =>
			walkerHistogram(candles5m, walkerByTimestamp, "gate15m", "15m walker"),
		[candles5m, walkerByTimestamp]
	)
	const walker60Histogram = useMemo(
		() =>
			walkerHistogram(candles5m, walkerByTimestamp, "gate60m", "60m walker"),
		[candles5m, walkerByTimestamp]
	)

	const macd5mHistogram = useMemo(
		() =>
			histogramFromKey(
				candles5m,
				"macd1_histo",
				"MACD 5m (native)",
				GREEN,
				RED
			),
		[candles5m]
	)
	const macd15mHistogram = useMemo(
		() =>
			histogramFromKey(
				candles15m,
				"macd1_histo",
				"MACD 15m (native)",
				GREEN,
				RED
			),
		[candles15m]
	)
	const macd60mHistogram = useMemo(
		() =>
			histogramFromKey(
				candles60m,
				"macd1_histo",
				"MACD 60m (native)",
				GREEN,
				RED
			),
		[candles60m]
	)

	// MACD sign + slope at a given brick index. Slope = current - previous on
	// the same stream (rising / falling / flat).
	const macdSignalAt = (
		series: HawksIsolationData["candles5m"],
		idx: number
	): {
		sign: "+" | "-" | "0" | "?"
		slope: "rising" | "falling" | "flat" | "?"
		value: number | null
	} => {
		if (idx < 0 || idx >= series.length) {
			return { sign: "?", slope: "?", value: null }
		}
		const curr = series[idx]!.indicators.macd1_histo
		if (typeof curr !== "number") {
			return { sign: "?", slope: "?", value: null }
		}
		const sign = curr > 0 ? "+" : curr < 0 ? "-" : "0"
		if (idx === 0) {
			return { sign, slope: "?", value: curr }
		}
		const prev = series[idx - 1]!.indicators.macd1_histo
		if (typeof prev !== "number") {
			return { sign, slope: "?", value: curr }
		}
		const d = curr - prev
		const slope = d > 0 ? "rising" : d < 0 ? "falling" : "flat"
		return { sign, slope, value: curr }
	}

	// Reference brick index when nothing is hovered = last 5m brick (most-recent).
	const refIdx5m = hoveredIdx5m ?? candles5m.length - 1
	const refIdx15m =
		hoveredIdx5m !== null
			? (synced.idx15m ?? candles15m.length - 1)
			: candles15m.length - 1
	const refIdx60m =
		hoveredIdx5m !== null
			? (synced.idx60m ?? candles60m.length - 1)
			: candles60m.length - 1
	const macdSig5m = macdSignalAt(candles5m, refIdx5m)
	const macdSig15m = macdSignalAt(candles15m, refIdx15m)
	const macdSig60m = macdSignalAt(candles60m, refIdx60m)

	// Keltner position: close vs inner (kc1) and outer (kc2) channels.
	const keltnerSignalAt = (
		series: HawksIsolationData["candles5m"],
		idx: number
	): {
		kc1: "above" | "inside" | "below" | "?"
		kc2: "above" | "inside" | "below" | "?"
		close: number | null
		kc1Sup: number | null
		kc1Inf: number | null
		kc2Sup: number | null
		kc2Inf: number | null
	} => {
		if (idx < 0 || idx >= series.length) {
			return {
				kc1: "?",
				kc2: "?",
				close: null,
				kc1Sup: null,
				kc1Inf: null,
				kc2Sup: null,
				kc2Inf: null,
			}
		}
		const c = series[idx]!
		const close = c.close
		const kc1Sup =
			typeof c.indicators.kc1_sup === "number" ? c.indicators.kc1_sup : null
		const kc1Inf =
			typeof c.indicators.kc1_inf === "number" ? c.indicators.kc1_inf : null
		const kc2Sup =
			typeof c.indicators.kc2_sup === "number" ? c.indicators.kc2_sup : null
		const kc2Inf =
			typeof c.indicators.kc2_inf === "number" ? c.indicators.kc2_inf : null
		const classify = (sup: number | null, inf: number | null) => {
			if (sup === null || inf === null) {
				return "?" as const
			}
			if (close > sup) {
				return "above" as const
			}
			if (close < inf) {
				return "below" as const
			}
			return "inside" as const
		}
		return {
			kc1: classify(kc1Sup, kc1Inf),
			kc2: classify(kc2Sup, kc2Inf),
			close,
			kc1Sup,
			kc1Inf,
			kc2Sup,
			kc2Inf,
		}
	}
	const kcSig5m = keltnerSignalAt(candles5m, refIdx5m)
	const kcSig15m = keltnerSignalAt(candles15m, refIdx15m)
	const kcSig60m = keltnerSignalAt(candles60m, refIdx60m)

	// VWAP position: close vs VWAP_D, VWAP_W, VWAP_M.
	const vwapSignalAt = (
		series: HawksIsolationData["candles5m"],
		idx: number
	): {
		a: "above" | "below" | "at" | "?"
		d: "above" | "below" | "at" | "?"
		w: "above" | "below" | "at" | "?"
		m: "above" | "below" | "at" | "?"
		close: number | null
		ajuste: number | null
		vwapD: number | null
		vwapW: number | null
		vwapM: number | null
	} => {
		if (idx < 0 || idx >= series.length) {
			return {
				a: "?",
				d: "?",
				w: "?",
				m: "?",
				close: null,
				ajuste: null,
				vwapD: null,
				vwapW: null,
				vwapM: null,
			}
		}
		const c = series[idx]!
		const close = c.close
		const ajuste =
			typeof c.indicators.ajuste === "number" ? c.indicators.ajuste : null
		const vwapD =
			typeof c.indicators.vwap_d === "number" ? c.indicators.vwap_d : null
		const vwapW =
			typeof c.indicators.vwap_w === "number" ? c.indicators.vwap_w : null
		const vwapM =
			typeof c.indicators.vwap_m === "number" ? c.indicators.vwap_m : null
		const side = (level: number | null) => {
			if (level === null) {
				return "?" as const
			}
			if (close > level) {
				return "above" as const
			}
			if (close < level) {
				return "below" as const
			}
			return "at" as const
		}
		return {
			a: side(ajuste),
			d: side(vwapD),
			w: side(vwapW),
			m: side(vwapM),
			close,
			ajuste,
			vwapD,
			vwapW,
			vwapM,
		}
	}
	const vwapSig5m = vwapSignalAt(candles5m, refIdx5m)
	const vwapSig15m = vwapSignalAt(candles15m, refIdx15m)
	const vwapSig60m = vwapSignalAt(candles60m, refIdx60m)

	// ─────────────────────────────────────────────────────────────────────
	// Group D — S/R trigger detection (5m bricks only)
	//
	// Spec (locked w/ Ygor 2026-06-13):
	//
	//   "Came from far, touched the level, was rejected" = trigger.
	//
	// Adaptive buffer: 1 brick body (median |close-open| over the window).
	// WIN bricks are ~100 pts body — a hardcoded 10pt buffer was 10× too
	// small (every wick triggered an arm).
	//
	// Anti-chop guard: price must have been at least `APPROACH_DISTANCE_MUL ×
	// buffer` away from the level for the last APPROACH_BRICKS bricks BEFORE
	// the arm — kills the "wobbling around VWAP" false positives.
	//
	// Cooldown: after a fire, the level can't re-fire until price has moved
	// >= `COOLDOWN_DISTANCE_MUL × buffer` away AND stayed there
	// COOLDOWN_BRICKS bricks.
	//
	// State machine (per level, per side):
	//   below → (approach guard ok) high enters [level - buf, level + buf]
	//           → armed_from_below, countdown=RESOLUTION_BRICKS
	//   armed_from_below → close < level - buf → emit rejection_short
	//                    → close > level + buf → escaped to above (no trigger)
	//                    → inside band → countdown--; expires to current side
	//   above mirrors.
	// ─────────────────────────────────────────────────────────────────────
	const BUFFER_BRICKS_MUL = 1 // buffer = N × brick body
	const APPROACH_BRICKS = 3 // need K prior bricks clear of the approach band
	const APPROACH_DISTANCE_MUL = 2 // approach band = ± (mul × buffer) around level — ≥2 brick bodies
	const RESOLUTION_BRICKS = 2 // bricks-window to resolve after arming
	const COOLDOWN_BRICKS = 3
	const COOLDOWN_DISTANCE_MUL = 5 // cooldown band matches approach band
	// After a break-through (side tag → "broken"), price must travel at least
	// RETEST_TRAVEL_MUL × buffer FURTHER away from the level (in the break
	// direction) before a retest is allowed. Stops chop-around-the-level
	// from generating endless retest arms.
	const RETEST_TRAVEL_MUL = 3
	// Two levels are merged into the same S/R "zone" when their values are
	// within CLUSTER_MERGE_MUL × buffer of each other. Per-level overlap
	// (e.g. vwap_d, mme27_15m, mme55_15m all at ~175,000) becomes ONE
	// effective level whose state is tracked under a compound key.
	const CLUSTER_MERGE_MUL = 2
	const TRIGGER_LEVELS: Array<{ key: string; short: string }> = [
		{ key: "ajuste", short: "Aj" },
		{ key: "vwap_d", short: "Dv" },
		{ key: "vwap_w", short: "Wv" },
		{ key: "vwap_m", short: "Mv" },
		{ key: "mme27_15m", short: "E27₁₅" },
		{ key: "mme55_15m", short: "E55₁₅" },
		{ key: "mme27_60m", short: "E27₆₀" },
		{ key: "mme55_60m", short: "E55₆₀" },
	]
	// `archetype` distinguishes the two trigger flavors:
	//   "reversal"  — Archetype 1: price was below the level, climbed to test
	//                 it, got rejected back down (or mirrored above→below).
	//                 Trade in the opposite direction of the approach.
	//   "retest"    — Archetype 2: price broke THROUGH the level (closed
	//                 cleanly on the other side for K bricks), then pulled
	//                 back to retest the broken level from the new side, and
	//                 was rejected back into the new side. Trade in the
	//                 break direction.
	type Archetype = "reversal" | "retest"
	type TriggerOutcome =
		| { kind: "inert"; side: "above" | "below" | "unknown" }
		| {
				kind: "armed"
				archetype: Archetype
				from: "below" | "above"
				countdown: number
				level: number
		  }
		| {
				kind: "cooldown"
				side: "above" | "below"
				bricksLeft: number
				level: number
		  }
		| { kind: "rejection_short"; archetype: Archetype; level: number }
		| { kind: "rejection_long"; archetype: Archetype; level: number }
	// Adaptive buffer = median(|close - open|) over the window. Falls back
	// to 50 pts if the window is too thin to compute a median.
	const triggerBuffer = useMemo(() => {
		const bodies: number[] = []
		for (const c of candles5m) {
			const body = Math.abs(c.close - c.open)
			if (body > 0) {
				bodies.push(body)
			}
		}
		if (bodies.length === 0) {
			return 50
		}
		bodies.sort((a, b) => a - b)
		const median = bodies[Math.floor(bodies.length / 2)] ?? 50
		return Math.round(median * BUFFER_BRICKS_MUL)
	}, [candles5m])

	// Cluster the 8 levels at each brick. Returns an array indexed by brick i,
	// where each entry is a list of clusters present at that brick. Each
	// cluster has a stable key (sorted member labels) and an effective level
	// (midpoint of members).
	const clustersByBrick = useMemo(() => {
		const buf = triggerBuffer
		const mergeDist = buf * CLUSTER_MERGE_MUL
		const all: Array<
			Array<{
				key: string
				members: string[]
				memberShorts: string[]
				level: number
				width: number
			}>
		> = []
		for (let i = 0; i < candles5m.length; i++) {
			const c = candles5m[i]!
			const present: Array<{ k: string; short: string; v: number }> = []
			for (const { key, short } of TRIGGER_LEVELS) {
				const v = c.indicators[key]
				if (typeof v === "number") {
					present.push({ k: key, short, v })
				}
			}
			present.sort((a, b) => a.v - b.v)
			// Greedy linear merge: walk the sorted list, attach to the current
			// cluster while neighboring gap ≤ mergeDist.
			const clusters: Array<(typeof all)[number][number]> = []
			let cur: { items: typeof present } = { items: [] }
			for (const p of present) {
				if (
					cur.items.length === 0 ||
					p.v - cur.items[cur.items.length - 1]!.v <= mergeDist
				) {
					cur.items.push(p)
				} else {
					const sortedKeys = [...cur.items].sort((a, b) =>
						a.k.localeCompare(b.k)
					)
					const level =
						(sortedKeys[0]!.v + sortedKeys[sortedKeys.length - 1]!.v) / 2
					const width = sortedKeys[sortedKeys.length - 1]!.v - sortedKeys[0]!.v
					clusters.push({
						key: sortedKeys.map((x) => x.k).join("+"),
						members: sortedKeys.map((x) => x.k),
						memberShorts: sortedKeys.map((x) => x.short),
						level,
						width,
					})
					cur = { items: [p] }
				}
			}
			if (cur.items.length > 0) {
				const sortedKeys = [...cur.items].sort((a, b) => a.k.localeCompare(b.k))
				const level =
					(sortedKeys[0]!.v + sortedKeys[sortedKeys.length - 1]!.v) / 2
				const width = sortedKeys[sortedKeys.length - 1]!.v - sortedKeys[0]!.v
				clusters.push({
					key: sortedKeys.map((x) => x.k).join("+"),
					members: sortedKeys.map((x) => x.k),
					memberShorts: sortedKeys.map((x) => x.short),
					level,
					width,
				})
			}
			all.push(clusters)
		}
		return all
	}, [candles5m, triggerBuffer])

	const triggerStreams = useMemo(() => {
		// One stream per cluster KEY (string of sorted member keys joined by "+").
		// State for a key is dropped the moment the brick stops producing that key
		// (membership change → fresh seed under the new key).
		const streams: Record<string, TriggerOutcome[]> = {}
		const buf = triggerBuffer
		const BREAK_CONFIRM_BRICKS = APPROACH_BRICKS

		// Find every cluster key that ever existed in the window, so we can
		// build a stream entry per key (filled with "inert/unknown" where the
		// key is absent at that brick).
		const allKeys = new Set<string>()
		for (const clusters of clustersByBrick) {
			for (const cl of clusters) {
				allKeys.add(cl.key)
			}
		}
		for (const clusterKey of allKeys) {
			const out: TriggerOutcome[] = []
			// Side carries WHY price is on this side:
			//   "fresh"        — price has been on this side natively (no recent break-through).
			//                    Approach trigger from this side = reversal.
			//   "broken_pending" — broke through but hasn't traveled far enough away yet
			//                      to qualify as a real break. Approach trigger NOT armed
			//                      (waiting for price to extend RETEST_TRAVEL_MUL × buffer
			//                      past the level).
			//   "broken"       — broke through AND traveled far enough away.
			//                    Approach trigger that pulls back here = retest.
			type SideTag = "fresh" | "broken_pending" | "broken"
			type State =
				| { name: "below"; tag: SideTag }
				| { name: "above"; tag: SideTag }
				| {
						name: "armed_from_below"
						archetype: Archetype
						countdown: number
						level: number
				  }
				| {
						name: "armed_from_above"
						archetype: Archetype
						countdown: number
						level: number
				  }
				| {
						name: "cooldown"
						side: "above" | "below"
						bricksLeft: number
						level: number
				  }

			let state: State = { name: "below", tag: "fresh" }
			let seeded = false

			// Approach streak: consecutive bricks that sit clearly past the level
			// (away from it by ≥ approachBand). Resets the moment a brick fails
			// the distance test. Used to gate arming.
			let farBelowStreak = 0
			let farAboveStreak = 0
			// Break-confirm streak: consecutive bricks closing past `level ± buf`
			// on the same side. When this hits BREAK_CONFIRM_BRICKS, the side
			// tag flips to "broken" — making the next approach back to the level
			// a retest (Archetype 2). Resets if a close violates the band.
			let confirmAboveStreak = 0
			let confirmBelowStreak = 0

			for (let i = 0; i < candles5m.length; i++) {
				const c = candles5m[i]!
				const cluster = clustersByBrick[i]?.find((cl) => cl.key === clusterKey)
				if (!cluster) {
					// Cluster not present this brick — drop state so a future
					// re-appearance starts fresh under (possibly the same) key.
					out.push({ kind: "inert", side: "unknown" })
					state = { name: "below", tag: "fresh" }
					seeded = false
					farBelowStreak = 0
					farAboveStreak = 0
					confirmAboveStreak = 0
					confirmBelowStreak = 0
					continue
				}
				const level = cluster.level
				// Effective buffer grows by half the cluster width so the band
				// envelopes every member level in the zone.
				const effBuf = buf + cluster.width / 2
				const lo = level - effBuf
				const hi = level + effBuf

				if (!seeded) {
					state =
						c.close >= level
							? { name: "above", tag: "fresh" }
							: { name: "below", tag: "fresh" }
					seeded = true
				}

				// Snapshot streaks BEFORE this brick's update so arming reads the
				// PRIOR run, not the current brick's effect on itself.
				const wasFarBelow = farBelowStreak
				const wasFarAbove = farAboveStreak
				const wasConfirmAbove = confirmAboveStreak
				const wasConfirmBelow = confirmBelowStreak

				// Update approach streaks (scaled by cluster width — every band
				// derived from `effBuf`, not the raw single-level `buf`).
				const effApproachBand = effBuf * APPROACH_DISTANCE_MUL
				const effCooldownBand = effBuf * COOLDOWN_DISTANCE_MUL
				const effTravelDist = effBuf * RETEST_TRAVEL_MUL
				farBelowStreak =
					c.high < level - effApproachBand ? farBelowStreak + 1 : 0
				farAboveStreak =
					c.low > level + effApproachBand ? farAboveStreak + 1 : 0
				// Update break-confirm streaks.
				if (c.close > hi) {
					confirmAboveStreak += 1
					confirmBelowStreak = 0
				} else if (c.close < lo) {
					confirmBelowStreak += 1
					confirmAboveStreak = 0
				} else {
					confirmAboveStreak = 0
					confirmBelowStreak = 0
				}

				let emitted: TriggerOutcome | null = null

				if (state.name === "cooldown") {
					const isFarBelow = c.high < level - effCooldownBand
					const isFarAbove = c.low > level + effCooldownBand
					if (
						(state.side === "below" && isFarBelow) ||
						(state.side === "above" && isFarAbove)
					) {
						state = { ...state, bricksLeft: state.bricksLeft - 1 }
						if (state.bricksLeft <= 0) {
							state = { name: state.side, tag: "fresh" }
						}
					} else {
						state = { ...state, bricksLeft: COOLDOWN_BRICKS }
					}
				} else if (state.name === "below" || state.name === "above") {
					const onSide = state.name
					// Detect a NEW break-through completing at this brick: flip the
					// side tag to "broken_pending" so a retest cannot fire until
					// price has traveled RETEST_TRAVEL_MUL × buffer further away.
					if (
						onSide === "below" &&
						state.tag === "fresh" &&
						wasConfirmBelow < BREAK_CONFIRM_BRICKS &&
						confirmBelowStreak >= BREAK_CONFIRM_BRICKS
					) {
						state = { name: "below", tag: "broken_pending" }
					} else if (
						onSide === "above" &&
						state.tag === "fresh" &&
						wasConfirmAbove < BREAK_CONFIRM_BRICKS &&
						confirmAboveStreak >= BREAK_CONFIRM_BRICKS
					) {
						state = { name: "above", tag: "broken_pending" }
					}
					// Promote pending → broken once price extends far enough past
					// the level. If price comes back too soon (close inside the
					// band), drop back to fresh — the break wasn't real.
					if (state.name === "below" && state.tag === "broken_pending") {
						const travelTarget = level - effTravelDist
						if (c.low <= travelTarget) {
							state = { name: "below", tag: "broken" }
						} else if (c.close >= lo) {
							// Came back into / above the band before traveling — fake break.
							state = { name: "below", tag: "fresh" }
						}
					} else if (state.name === "above" && state.tag === "broken_pending") {
						const travelTarget = level + effTravelDist
						if (c.high >= travelTarget) {
							state = { name: "above", tag: "broken" }
						} else if (c.close <= hi) {
							state = { name: "above", tag: "fresh" }
						}
					}
					// Arming.
					//   - reversal: tag === "fresh" + approach-distance guard
					//   - retest: tag === "broken" (which already implies the travel
					//             condition was met, so no further distance guard)
					//   - broken_pending: do nothing — wait for travel or fake-break.
					const tag = state.tag
					if (state.name === "below") {
						const touched = c.high >= lo
						if (touched && tag === "broken") {
							state = {
								name: "armed_from_below",
								archetype: "retest",
								countdown: RESOLUTION_BRICKS,
								level,
							}
						} else if (
							touched &&
							tag === "fresh" &&
							wasFarBelow >= APPROACH_BRICKS
						) {
							state = {
								name: "armed_from_below",
								archetype: "reversal",
								countdown: RESOLUTION_BRICKS,
								level,
							}
						}
					} else {
						const touched = c.low <= hi
						if (touched && tag === "broken") {
							state = {
								name: "armed_from_above",
								archetype: "retest",
								countdown: RESOLUTION_BRICKS,
								level,
							}
						} else if (
							touched &&
							tag === "fresh" &&
							wasFarAbove >= APPROACH_BRICKS
						) {
							state = {
								name: "armed_from_above",
								archetype: "reversal",
								countdown: RESOLUTION_BRICKS,
								level,
							}
						}
					}
				} else if (state.name === "armed_from_below") {
					if (c.close < lo) {
						// Pushed back below → BEARISH rejection.
						// Reversal arm from below → trade short (price came up, got rejected).
						// Retest arm from below → trade short (broke down, pulled up, rejected back) — continuation down.
						emitted = {
							kind: "rejection_short",
							archetype: state.archetype,
							level,
						}
						state = {
							name: "cooldown",
							side: "below",
							bricksLeft: COOLDOWN_BRICKS,
							level,
						}
					} else if (c.close > hi) {
						// Closed above the band — armed from below escaped upward.
						// Tag the new "above" side: if the prior side was "broken" the upward
						// escape becomes a fresh side; if prior was "fresh" the break is now
						// confirming and confirmAboveStreak handles it next iteration.
						state = { name: "above", tag: "fresh" }
					} else {
						state = { ...state, countdown: state.countdown - 1 }
						if (state.countdown <= 0) {
							state =
								c.close >= level
									? { name: "above", tag: "fresh" }
									: { name: "below", tag: "fresh" }
						}
					}
				} else {
					// armed_from_above
					if (c.close > hi) {
						emitted = {
							kind: "rejection_long",
							archetype: state.archetype,
							level,
						}
						state = {
							name: "cooldown",
							side: "above",
							bricksLeft: COOLDOWN_BRICKS,
							level,
						}
					} else if (c.close < lo) {
						state = { name: "below", tag: "fresh" }
					} else {
						state = { ...state, countdown: state.countdown - 1 }
						if (state.countdown <= 0) {
							state =
								c.close >= level
									? { name: "above", tag: "fresh" }
									: { name: "below", tag: "fresh" }
						}
					}
				}

				if (emitted !== null) {
					out.push(emitted)
				} else if (state.name === "armed_from_below") {
					out.push({
						kind: "armed",
						archetype: state.archetype,
						from: "below",
						countdown: state.countdown,
						level: state.level,
					})
				} else if (state.name === "armed_from_above") {
					out.push({
						kind: "armed",
						archetype: state.archetype,
						from: "above",
						countdown: state.countdown,
						level: state.level,
					})
				} else if (state.name === "cooldown") {
					out.push({
						kind: "cooldown",
						side: state.side,
						bricksLeft: state.bricksLeft,
						level: state.level,
					})
				} else {
					out.push({
						kind: "inert",
						side: state.name === "above" ? "above" : "below",
					})
				}
			}
			streams[clusterKey] = out
		}
		return streams
	}, [candles5m, triggerBuffer, clustersByBrick])

	// Base histogram series — line overlays for rolling/day thresholds are
	// attached below once the eval streams are computed.
	// Aggression: plot |saldo| above zero. Color = sign of the actual saldo
	// (green if bid pressure / +, red if ask pressure / −). Magnitude vs
	// threshold becomes a clean upward-comparison on the chart.
	const aggressionHistogramData = useMemo(() => {
		const data: Array<HistogramData<UTCTimestamp>> = []
		for (let i = 0; i < candles5m.length; i++) {
			const v = candles5m[i]!.indicators.agr_saldo
			if (typeof v === "number") {
				data.push({
					time: i as UTCTimestamp,
					value: Math.abs(v),
					color: v >= 0 ? GREEN : RED,
				})
			}
		}
		return { label: "Aggression |saldo|", data }
	}, [candles5m])
	const volumeHistogramData = useMemo(() => {
		const data: Array<HistogramData<UTCTimestamp>> = []
		for (let i = 0; i < candles5m.length; i++) {
			const v = candles5m[i]!.indicators.volume_fin
			if (typeof v === "number") {
				data.push({ time: i as UTCTimestamp, value: v, color: TEAL_BRIGHT })
			}
		}
		return { label: "Volume (financeiro)", data }
	}, [candles5m])

	const [walkerView, setWalkerView] = useState<"both" | "15m" | "60m">("both")

	// ─────────────────────────────────────────────────────────────────────
	// Groups E (aggression) & F (volume) — entry confirmation evaluators.
	// Not standalone triggers: they grade an entry brick produced by Group D.
	//
	// Two rolling thresholds computed per brick:
	//   - "rolling 200" — mean of the prior 200 5m bricks (or whatever's available
	//                     ≥20). Cross-day; smooths out regime transitions.
	//   - "day so far"  — mean across bricks of the CURRENT BRT trading day up to
	//                     (but excluding) this brick. Active only when ≥20 bricks
	//                     of the day have closed.
	// ─────────────────────────────────────────────────────────────────────
	const BRT_OFFSET_MS = -3 * 60 * 60 * 1000
	const ROLL_WINDOW = 200
	const MIN_DAY_BRICKS = 20
	const MIN_ROLL_BRICKS = 20

	type EvalSnapshot = {
		value: number | null
		rollMean: number | null // mean of prior up-to-200 bricks
		dayMean: number | null // mean of prior current-day bricks (null if <20 collected)
		dayBrickCount: number // bricks-so-far in this BRT day, excluding current
	}
	const buildEvalStreams = (key: string): EvalSnapshot[] => {
		const out: EvalSnapshot[] = []
		const values: Array<number | null> = candles5m.map((c) => {
			const v = c.indicators[key]
			return typeof v === "number" ? v : null
		})
		const dayKeys: string[] = candles5m.map((c) =>
			new Date(new Date(c.timestamp).getTime() + BRT_OFFSET_MS)
				.toISOString()
				.slice(0, 10)
		)
		// Rolling window (using |value| so volume + saldo magnitudes behave
		// consistently; sign is preserved on `value` itself for downstream eval).
		let rollSum = 0
		let rollCount = 0
		const rollBuf: number[] = [] // last up-to-200 |values|
		// Day-accumulators reset on day boundary.
		let daySum = 0
		let dayCount = 0
		let prevDay: string | null = null

		for (let i = 0; i < values.length; i++) {
			const dayKey = dayKeys[i]!
			if (prevDay !== null && dayKey !== prevDay) {
				daySum = 0
				dayCount = 0
			}
			// Snapshot the PRIOR-only statistics (current brick not yet folded in).
			const rollMean = rollCount >= MIN_ROLL_BRICKS ? rollSum / rollCount : null
			const dayMean = dayCount >= MIN_DAY_BRICKS ? daySum / dayCount : null
			out.push({
				value: values[i],
				rollMean,
				dayMean,
				dayBrickCount: dayCount,
			})
			// Now fold the current brick into both accumulators for the next iteration.
			const v = values[i]
			if (typeof v === "number") {
				const mag = Math.abs(v)
				rollBuf.push(mag)
				rollSum += mag
				rollCount += 1
				if (rollBuf.length > ROLL_WINDOW) {
					rollSum -= rollBuf.shift()!
					rollCount -= 1
				}
				daySum += mag
				dayCount += 1
			}
			prevDay = dayKey
		}
		return out
	}
	const aggressionEval = useMemo(
		() => buildEvalStreams("agr_saldo"),
		[candles5m]
	)
	const volumeEval = useMemo(() => buildEvalStreams("volume_fin"), [candles5m])

	const [evalMode, setEvalMode] = useState<"roll" | "day">("roll")

	// Build threshold-line overlays for the histogram panes. Aggression is
	// signed — draw the rolling/day means mirrored ±value (a saldo with
	// magnitude above the line means the participation crossed the bar in
	// either direction). Volume is positive-only, so single line each.
	// Must match the THRESHOLD_MULT used inside EvalTab — drawn lines = actual
	// fire threshold (1.5 × mean), not the bare mean.
	const HIST_THRESHOLD_MULT = 1.5
	const aggressionHistogram = useMemo(() => {
		const roll: Array<{ time: UTCTimestamp; value: number }> = []
		const day: Array<{ time: UTCTimestamp; value: number }> = []
		for (let i = 0; i < aggressionEval.length; i++) {
			const s = aggressionEval[i]!
			const t = i as UTCTimestamp
			if (s.rollMean !== null) {
				roll.push({ time: t, value: s.rollMean * HIST_THRESHOLD_MULT })
			}
			if (s.dayMean !== null) {
				day.push({ time: t, value: s.dayMean * HIST_THRESHOLD_MULT })
			}
		}
		return {
			...aggressionHistogramData,
			lines: [
				{
					key: "roll",
					label: "1.5× roll 200",
					color: ROLL_LINE_COLOR,
					data: roll,
				},
				{ key: "day", label: "1.5× day", color: DAY_LINE_COLOR, data: day },
			],
		}
	}, [aggressionHistogramData, aggressionEval])
	const volumeHistogram = useMemo(() => {
		const roll: Array<{ time: UTCTimestamp; value: number }> = []
		const day: Array<{ time: UTCTimestamp; value: number }> = []
		for (let i = 0; i < volumeEval.length; i++) {
			const s = volumeEval[i]!
			const t = i as UTCTimestamp
			if (s.rollMean !== null) {
				roll.push({ time: t, value: s.rollMean * HIST_THRESHOLD_MULT })
			}
			if (s.dayMean !== null) {
				day.push({ time: t, value: s.dayMean * HIST_THRESHOLD_MULT })
			}
		}
		return {
			...volumeHistogramData,
			lines: [
				{
					key: "roll",
					label: "1.5× roll 200",
					color: ROLL_LINE_COLOR,
					data: roll,
				},
				{ key: "day", label: "1.5× day", color: DAY_LINE_COLOR, data: day },
			],
		}
	}, [volumeHistogramData, volumeEval])

	// Find the most-recent trigger fire on or before refIdx5m, across all
	// cluster streams. Used by E/F panes to label the "candidate entry"
	// context — which trigger this brick is being scored against.
	const recentTrigger = useMemo(() => {
		let best: {
			brickIdx: number
			label: string
			direction: "short" | "long"
		} | null = null
		for (const clusterKey of Object.keys(triggerStreams)) {
			const stream = triggerStreams[clusterKey]
			if (!stream) {
				continue
			}
			for (let i = Math.min(refIdx5m, stream.length - 1); i >= 0; i--) {
				const o = stream[i]
				if (!o) {
					continue
				}
				if (o.kind === "rejection_short" || o.kind === "rejection_long") {
					if (best === null || i > best.brickIdx) {
						const c = clustersByBrick[i]?.find((cl) => cl.key === clusterKey)
						best = {
							brickIdx: i,
							label: c?.memberShorts.join("+") ?? clusterKey,
							direction: o.kind === "rejection_short" ? "short" : "long",
						}
					}
					break
				}
			}
		}
		return best
	}, [triggerStreams, clustersByBrick, refIdx5m])

	return (
		<div className="flex flex-col gap-3">
			<div className="border-bg-300 flex flex-wrap items-center gap-3 border-b pb-2">
				<h1 className="text-txt-100 text-2xl font-semibold">
					Indicator Lab — {date}
				</h1>
				<div className="flex items-center gap-2">
					{prevDay ? (
						<Link
							className="bg-bg-200 hover:bg-bg-300 text-txt-100 text-small rounded-sm px-2 py-1"
							href={`/${locale}/indicator-lab/${prevDay}`}
						>
							← {prevDay}
						</Link>
					) : (
						<span className="text-txt-300 text-small px-2 py-1">← (none)</span>
					)}
					<select
						className="border-bg-300 bg-bg-200 text-txt-100 text-small rounded-sm border px-2 py-1"
						defaultValue={date}
						onChange={(e) => {
							window.location.href = `/${locale}/indicator-lab/${e.target.value}`
						}}
					>
						{cleanDays.map((d) => (
							<option key={d} value={d}>
								{d}
							</option>
						))}
					</select>
					{nextDay ? (
						<Link
							className="bg-bg-200 hover:bg-bg-300 text-txt-100 text-small rounded-sm px-2 py-1"
							href={`/${locale}/indicator-lab/${nextDay}`}
						>
							{nextDay} →
						</Link>
					) : (
						<span className="text-txt-300 text-small px-2 py-1">(none) →</span>
					)}
				</div>
				<div className="text-txt-300 text-small ml-auto">
					{candles5m.length} 5m · {candles15m.length} 15m · {candles60m.length}{" "}
					60m bricks · {catalog.length} markers
				</div>
			</div>

			<Tabs value={activeGroup} onValueChange={setActiveGroup}>
				<TabsList>
					<TabsTrigger value="A">A · HTF gate</TabsTrigger>
					<TabsTrigger value="B">B · MACD</TabsTrigger>
					<TabsTrigger value="C">C · Keltner</TabsTrigger>
					<TabsTrigger value="D">D · S/R</TabsTrigger>
					<TabsTrigger value="E">E · Aggression</TabsTrigger>
					<TabsTrigger value="F">F · Volume</TabsTrigger>
					<TabsTrigger value="G">G · Pivots</TabsTrigger>
				</TabsList>

				<TabsContent value="A">
					<div className="text-small flex items-center gap-2 pb-2">
						<span className="text-txt-300">Ribbon:</span>
						<button
							type="button"
							onClick={() => setWalkerView("both")}
							className={
								walkerView === "both"
									? "bg-acc-100 text-bg-100 rounded-sm px-2 py-0.5"
									: "bg-bg-200 text-txt-100 rounded-sm px-2 py-0.5"
							}
						>
							composite (both)
						</button>
						<button
							type="button"
							onClick={() => setWalkerView("15m")}
							className={
								walkerView === "15m"
									? "bg-acc-100 text-bg-100 rounded-sm px-2 py-0.5"
									: "bg-bg-200 text-txt-100 rounded-sm px-2 py-0.5"
							}
						>
							15m only
						</button>
						<button
							type="button"
							onClick={() => setWalkerView("60m")}
							className={
								walkerView === "60m"
									? "bg-acc-100 text-bg-100 rounded-sm px-2 py-0.5"
									: "bg-bg-200 text-txt-100 rounded-sm px-2 py-0.5"
							}
						>
							60m only
						</button>
					</div>
					<div
						className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_2fr]"
						style={{ height: "calc(100vh - 380px)", minHeight: "560px" }}
					>
						<RenkoPane
							className="h-full"
							label="5m bricks"
							subLabel="walker ribbon: green=BULL · red=BEAR · gray=NO_SIGNAL"
							series={series5m}
							indicators={overlaysByGroup.A5m}
							histogram={
								walkerView === "both"
									? walkerCompositeHistogram
									: walkerView === "15m"
										? walker15Histogram
										: walker60Histogram
							}
							emitsCrosshair
							onCrosshairMove={handle5mCrosshair}
						/>
						<div className="grid grid-rows-2 gap-2">
							<RenkoPane
								className="h-full"
								label="15m bricks"
								subLabel="MME27 / MME55 (15m EMAs the walker reads)"
								series={series15m}
								indicators={overlaysByGroup.A15m}
								externalCrosshair={synced.idx15m}
							/>
							<RenkoPane
								className="h-full"
								label="60m bricks"
								subLabel="MME27 / MME55 (60m EMAs the walker reads)"
								series={series60m}
								indicators={overlaysByGroup.A60m}
								externalCrosshair={synced.idx60m}
							/>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="B">
					<div className="border-bg-300 bg-bg-100/40 p-s-200 text-tiny mb-2 grid grid-cols-3 gap-1 border">
						{[
							{ label: "5m", sig: macdSig5m },
							{ label: "15m", sig: macdSig15m },
							{ label: "60m", sig: macdSig60m },
						].map((row) => (
							<div key={row.label} className="flex items-center gap-1">
								<span className="text-txt-300 font-mono">{row.label}</span>
								<span
									className="rounded-sm px-2 py-0.5 font-semibold"
									style={{
										background:
											row.sig.sign === "+"
												? GREEN_FAINT
												: row.sig.sign === "-"
													? RED_FAINT
													: row.sig.sign === "0"
														? YELLOW_BRIGHT_SEMI
														: GRAY_NEUTRAL_FAINT,
										color: TEXT_BG,
									}}
									title={`sign — value=${row.sig.value?.toFixed(2) ?? "—"}`}
								>
									{row.sig.sign}
								</span>
								<span
									className="rounded-sm px-2 py-0.5 font-semibold"
									style={{
										background:
											row.sig.slope === "rising"
												? GREEN_FAINT
												: row.sig.slope === "falling"
													? RED_FAINT
													: row.sig.slope === "flat"
														? YELLOW_BRIGHT_SEMI
														: GRAY_NEUTRAL_FAINT,
										color: TEXT_BG,
									}}
									title={`slope ${row.sig.slope}`}
								>
									{row.sig.slope === "rising"
										? "▲"
										: row.sig.slope === "falling"
											? "▼"
											: row.sig.slope === "flat"
												? "·"
												: "—"}
								</span>
								<span className="text-txt-300 text-tiny font-mono">
									{row.sig.value !== null ? row.sig.value.toFixed(1) : "—"}
								</span>
							</div>
						))}
						<div className="text-txt-300 text-tiny col-span-3 opacity-70">
							{hoveredIdx5m !== null
								? `Hovering 5m brick #${hoveredIdx5m} → 15m brick #${refIdx15m}, 60m brick #${refIdx60m}`
								: "Showing latest brick of each TF (hover the 5m chart to sync)"}
						</div>
					</div>
					<div
						className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_2fr]"
						style={{ height: "calc(100vh - 440px)", minHeight: "500px" }}
					>
						<RenkoPane
							className="h-full"
							label="5m bricks + MACD 5m"
							subLabel="histogram below = macd1_histo on this 5m stream"
							series={series5m}
							histogram={macd5mHistogram}
							emitsCrosshair
							onCrosshairMove={handle5mCrosshair}
						/>
						<div className="grid grid-rows-2 gap-2">
							<RenkoPane
								className="h-full"
								label="15m bricks + MACD 15m"
								subLabel="histogram below = macd1_histo on the native 15m stream"
								series={series15m}
								histogram={macd15mHistogram}
								externalCrosshair={synced.idx15m}
							/>
							<RenkoPane
								className="h-full"
								label="60m bricks + MACD 60m"
								subLabel="histogram below = macd1_histo on the native 60m stream"
								series={series60m}
								histogram={macd60mHistogram}
								externalCrosshair={synced.idx60m}
							/>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="C">
					<div className="border-bg-300 bg-bg-100/40 p-s-200 text-tiny mb-2 grid grid-cols-3 gap-1 border">
						{[
							{ label: "5m", sig: kcSig5m },
							{ label: "15m", sig: kcSig15m },
							{ label: "60m", sig: kcSig60m },
						].map((row) => (
							<div key={row.label} className="flex items-center gap-1">
								<span className="text-txt-300 font-mono">{row.label}</span>
								<span
									className="rounded-sm px-2 py-0.5 font-semibold"
									style={{
										background:
											row.sig.kc1 === "above"
												? GREEN_FAINT
												: row.sig.kc1 === "below"
													? RED_FAINT
													: row.sig.kc1 === "inside"
														? YELLOW_BRIGHT_SEMI
														: GRAY_NEUTRAL_FAINT,
										color: TEXT_BG,
									}}
									title={`close=${row.sig.close?.toFixed(0) ?? "?"} vs KC1 [${row.sig.kc1Inf?.toFixed(0) ?? "?"} — ${row.sig.kc1Sup?.toFixed(0) ?? "?"}]`}
								>
									KC1{" "}
									{row.sig.kc1 === "above"
										? "▲"
										: row.sig.kc1 === "below"
											? "▼"
											: row.sig.kc1 === "inside"
												? "·"
												: "—"}
								</span>
								<span
									className="rounded-sm px-2 py-0.5 font-semibold"
									style={{
										background:
											row.sig.kc2 === "above"
												? GREEN_FAINT
												: row.sig.kc2 === "below"
													? RED_FAINT
													: row.sig.kc2 === "inside"
														? YELLOW_BRIGHT_SEMI
														: GRAY_NEUTRAL_FAINT,
										color: TEXT_BG,
									}}
									title={`close=${row.sig.close?.toFixed(0) ?? "?"} vs KC2 [${row.sig.kc2Inf?.toFixed(0) ?? "?"} — ${row.sig.kc2Sup?.toFixed(0) ?? "?"}]`}
								>
									KC2{" "}
									{row.sig.kc2 === "above"
										? "▲"
										: row.sig.kc2 === "below"
											? "▼"
											: row.sig.kc2 === "inside"
												? "·"
												: "—"}
								</span>
								<span className="text-txt-300 text-tiny font-mono">
									{row.sig.close !== null ? row.sig.close.toFixed(0) : "—"}
								</span>
							</div>
						))}
						<div className="text-txt-300 text-tiny col-span-3 opacity-70">
							{hoveredIdx5m !== null
								? `Hovering 5m brick #${hoveredIdx5m} → 15m brick #${refIdx15m}, 60m brick #${refIdx60m}`
								: "Showing latest brick of each TF (hover the 5m chart to sync)"}
						</div>
					</div>
					<div
						className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_2fr]"
						style={{ height: "calc(100vh - 440px)", minHeight: "500px" }}
					>
						<RenkoPane
							className="h-full"
							label="5m bricks + Keltner (5m native)"
							subLabel="solid = inner (kc1), faded = outer (kc2)"
							series={series5m}
							indicators={overlaysByGroup.C5m}
							emitsCrosshair
							onCrosshairMove={handle5mCrosshair}
						/>
						<div className="grid grid-rows-2 gap-2">
							<RenkoPane
								className="h-full"
								label="15m bricks + Keltner (15m native)"
								subLabel="solid = inner (kc1), faded = outer (kc2)"
								series={series15m}
								indicators={overlaysByGroup.C15m}
								externalCrosshair={synced.idx15m}
							/>
							<RenkoPane
								className="h-full"
								label="60m bricks + Keltner (60m native)"
								subLabel="solid = inner (kc1), faded = outer (kc2)"
								series={series60m}
								indicators={overlaysByGroup.C60m}
								externalCrosshair={synced.idx60m}
							/>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="D">
					<div className="border-bg-300 bg-bg-100/40 p-s-200 text-tiny mb-2 grid grid-cols-3 gap-1 border">
						{[
							{ label: "5m", sig: vwapSig5m },
							{ label: "15m", sig: vwapSig15m },
							{ label: "60m", sig: vwapSig60m },
						].map((row) => {
							const cellStyle = (side: "above" | "below" | "at" | "?") => ({
								background:
									side === "above"
										? GREEN_FAINT
										: side === "below"
											? RED_FAINT
											: side === "at"
												? YELLOW_BRIGHT_SEMI
												: GRAY_NEUTRAL_FAINT,
								color: TEXT_BG,
							})
							const mark = (side: "above" | "below" | "at" | "?") =>
								side === "above"
									? "▲"
									: side === "below"
										? "▼"
										: side === "at"
											? "="
											: "—"
							return (
								<div key={row.label} className="flex items-center gap-1">
									<span className="text-txt-300 font-mono">{row.label}</span>
									<span
										className="rounded-sm px-2 py-0.5 font-semibold"
										style={cellStyle(row.sig.a)}
										title={`close=${row.sig.close?.toFixed(0) ?? "?"} vs Ajuste=${row.sig.ajuste?.toFixed(0) ?? "?"}`}
									>
										A {mark(row.sig.a)}
									</span>
									<span
										className="rounded-sm px-2 py-0.5 font-semibold"
										style={cellStyle(row.sig.d)}
										title={`close=${row.sig.close?.toFixed(0) ?? "?"} vs VWAP_D=${row.sig.vwapD?.toFixed(0) ?? "?"}`}
									>
										D {mark(row.sig.d)}
									</span>
									<span
										className="rounded-sm px-2 py-0.5 font-semibold"
										style={cellStyle(row.sig.w)}
										title={`close=${row.sig.close?.toFixed(0) ?? "?"} vs VWAP_W=${row.sig.vwapW?.toFixed(0) ?? "?"}`}
									>
										W {mark(row.sig.w)}
									</span>
									<span
										className="rounded-sm px-2 py-0.5 font-semibold"
										style={cellStyle(row.sig.m)}
										title={`close=${row.sig.close?.toFixed(0) ?? "?"} vs VWAP_M=${row.sig.vwapM?.toFixed(0) ?? "?"}`}
									>
										M {mark(row.sig.m)}
									</span>
									<span className="text-txt-300 text-tiny font-mono">
										{row.sig.close !== null ? row.sig.close.toFixed(0) : "—"}
									</span>
								</div>
							)
						})}
						<div className="text-txt-300 text-tiny col-span-3 opacity-70">
							{hoveredIdx5m !== null
								? `Hovering 5m brick #${hoveredIdx5m} → 15m brick #${refIdx15m}, 60m brick #${refIdx60m}`
								: "Showing latest brick of each TF (hover the 5m chart to sync). A = Ajuste D-1 (per-day constant); VWAP D/W/M are cumulative TF-independent."}
						</div>
					</div>

					{/* Trigger row (5m only). Each badge is a CLUSTER — levels
					    within CLUSTER_MERGE_MUL brick bodies of each other are
					    merged into one S/R zone with combined state.  */}
					<div className="border-bg-300 bg-bg-100/40 p-s-200 text-tiny mb-2 border">
						<div className="text-txt-300 mb-1 font-mono">
							5m triggers @ brick #{refIdx5m} · buffer ±{triggerBuffer} pts ·
							approach {APPROACH_BRICKS}br · window {RESOLUTION_BRICKS}br ·
							cooldown {COOLDOWN_BRICKS}br · cluster-merge {CLUSTER_MERGE_MUL}
							×buf
						</div>
						<div className="flex flex-wrap items-center gap-1">
							{(clustersByBrick[refIdx5m] ?? []).map((cluster) => {
								const outcome = triggerStreams[cluster.key]?.[refIdx5m]
								const compoundLabel = cluster.memberShorts.join("+")
								let bg = GRAY_NEUTRAL_FAINT
								let color = "#0f1014"
								let border = "transparent"
								let glyph: string = "—"
								let tip = `${compoundLabel}: no data`
								if (outcome) {
									if (outcome.kind === "rejection_short") {
										bg = "rgb(248, 113, 113)"
										glyph =
											outcome.archetype === "retest" ? "↩ FIRED" : "▼ FIRED"
										tip = `${compoundLabel}: BEARISH ${outcome.archetype} just fired @ ${outcome.level.toFixed(0)}`
									} else if (outcome.kind === "rejection_long") {
										bg = "rgb(52, 211, 153)"
										glyph =
											outcome.archetype === "retest" ? "↪ FIRED" : "▲ FIRED"
										tip = `${compoundLabel}: BULLISH ${outcome.archetype} just fired @ ${outcome.level.toFixed(0)}`
									} else if (outcome.kind === "armed") {
										bg = YELLOW_BRIGHT_SEMI_HIGH
										const arrow = outcome.from === "below" ? "↑" : "↓"
										glyph = `${arrow} ${outcome.archetype === "retest" ? "retest" : "armed"}`
										tip = `${compoundLabel}: ${outcome.archetype} armed from ${outcome.from} (resolves in ${outcome.countdown}br) @ ${outcome.level.toFixed(0)}`
									} else if (outcome.kind === "cooldown") {
										bg = "transparent"
										color = "rgb(251, 191, 36)"
										border = "rgb(251, 191, 36)"
										glyph = `cd ${outcome.bricksLeft}`
										tip = `${compoundLabel}: cooldown after fire (${outcome.bricksLeft}br left) @ ${outcome.level.toFixed(0)}`
									} else {
										bg = "transparent"
										if (outcome.side === "above") {
											color = "rgb(52, 211, 153)"
											border = "rgba(52, 211, 153, 0.5)"
											glyph = "▲"
										} else if (outcome.side === "below") {
											color = "rgb(248, 113, 113)"
											border = "rgba(248, 113, 113, 0.5)"
											glyph = "▼"
										} else {
											color = "rgb(160, 164, 172)"
											border = "rgba(120, 124, 132, 0.4)"
											glyph = "—"
										}
										tip = `${compoundLabel}: inert (${outcome.side})`
									}
								}
								return (
									<span
										key={cluster.key}
										className="rounded-sm px-2 py-0.5 font-semibold"
										style={{
											background: bg,
											color,
											border: `1px solid ${border}`,
										}}
										title={tip}
									>
										{compoundLabel} {glyph}
									</span>
								)
							})}
						</div>
					</div>

					<div
						className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_2fr]"
						style={{ height: "calc(100vh - 500px)", minHeight: "500px" }}
					>
						<RenkoPane
							className="h-full"
							label="5m bricks + Ajuste + VWAP D/W/M + HTF EMAs"
							subLabel="pink=Ajuste, teals=VWAP D/W/M, oranges=MME 15m, grays=MME 60m"
							series={series5m}
							indicators={overlaysByGroup.D5m}
							emitsCrosshair
							onCrosshairMove={handle5mCrosshair}
						/>
						<div className="grid grid-rows-2 gap-2">
							<RenkoPane
								className="h-full"
								label="15m bricks + Ajuste + VWAP D/W/M"
								subLabel="pink=Ajuste D-1, bright=D, mid=W, dark=M"
								series={series15m}
								indicators={overlaysByGroup.D15m}
								externalCrosshair={synced.idx15m}
							/>
							<RenkoPane
								className="h-full"
								label="60m bricks + Ajuste + VWAP D/W/M"
								subLabel="pink=Ajuste D-1, bright=D, mid=W, dark=M"
								series={series60m}
								indicators={overlaysByGroup.D60m}
								externalCrosshair={synced.idx60m}
							/>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="E">
					<EvalTab
						title="Aggression |saldo| (E)"
						subtitle="|saldo| plotted above zero · color = green/red for raw sign · direction-aware (short trigger expects negative saldo)"
						snap={aggressionEval[refIdx5m] ?? null}
						stream={aggressionEval}
						mode={evalMode}
						setMode={setEvalMode}
						recentTrigger={recentTrigger}
						refIdx={refIdx5m}
						series={series5m}
						histogram={aggressionHistogram}
						directional
					/>
				</TabsContent>

				<TabsContent value="F">
					<EvalTab
						title="Volume financeiro (F)"
						subtitle="Magnitude-only: above threshold = high participation = POS"
						snap={volumeEval[refIdx5m] ?? null}
						stream={volumeEval}
						mode={evalMode}
						setMode={setEvalMode}
						recentTrigger={recentTrigger}
						refIdx={refIdx5m}
						series={series5m}
						histogram={volumeHistogram}
						directional={false}
					/>
				</TabsContent>

				<TabsContent value="G">
					<div className="text-tiny text-txt-300 mb-2 leading-relaxed">
						Dow-theory swing tape: period-2 pivots from{" "}
						<code>walkStructuralPivots</code> alternated TOPO ↔ FUNDO and
						connected as a single cyan line. Read the line for trend structure:
						ascending segments between consecutive TOPOs = higher highs;
						descending segments between consecutive FUNDOs = lower lows.
						Vertices land at the confirmation brick (2-brick lag from the actual
						peak/trough by design).
					</div>
					<div className="text-small mb-2 flex items-center gap-2">
						<span className="text-txt-300">TF:</span>
						{(["5m", "15m", "60m"] as const).map((tf) => (
							<button
								key={tf}
								type="button"
								onClick={() => togglePivotPane(tf)}
								className={
									pivotPaneEnabled[tf]
										? "bg-acc-100 text-bg-100 rounded-sm px-2 py-0.5"
										: "bg-bg-200 text-txt-100 rounded-sm px-2 py-0.5"
								}
							>
								{tf}
							</button>
						))}
					</div>
					<div className="text-tiny mb-2 grid grid-cols-3 gap-2">
						{(
							[
								{
									tf: "5m",
									swing: swing5m,
									idx: hoveredIdx5m ?? candles5m.length - 1,
								},
								{
									tf: "15m",
									swing: swing15m,
									idx: synced.idx15m ?? candles15m.length - 1,
								},
								{
									tf: "60m",
									swing: swing60m,
									idx: synced.idx60m ?? candles60m.length - 1,
								},
							] as const
						).map(({ tf, swing, idx }) => {
							const len = swing.topoTrendByBrick.length
							const safeIdx =
								idx === null || idx < 0 ? len - 1 : Math.min(idx, len - 1)
							const topoState = swing.topoTrendByBrick[safeIdx] ?? null
							const fundoState = swing.fundoTrendByBrick[safeIdx] ?? null
							const badge = (
								label: string,
								state: StructuralState,
								greenWhen: "higher" | "lower"
							) => {
								const bg =
									state === null
										? GRAY_NEUTRAL
										: state === greenWhen
											? GREEN_FAINT
											: RED_FAINT
								return (
									<span
										key={label}
										className="rounded-sm px-2 py-0.5 font-semibold"
										style={{ background: bg, color: TEXT_BG }}
									>
										{label}{" "}
										{state === null ? "—" : state === "higher" ? "↑" : "↓"}
									</span>
								)
							}
							return (
								<div
									key={tf}
									className="border-bg-300 bg-bg-100/40 flex items-center gap-2 border px-2 py-1"
								>
									<span className="text-txt-300 font-mono">{tf}</span>
									{badge("Highs", topoState, "higher")}
									{badge("Lows", fundoState, "lower")}
								</div>
							)
						})}
					</div>
					<div
						className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_2fr]"
						style={{ height: "calc(100vh - 480px)", minHeight: "520px" }}
					>
						<RenkoPane
							className="h-full"
							label="5m bricks + structural pivots"
							subLabel="yellow=TOPO · cyan=FUNDO · 2-brick confirmation lag"
							series={series5m}
							indicators={pivotOverlays5m}
							emitsCrosshair
							onCrosshairMove={handle5mCrosshair}
						/>
						<div className="grid grid-rows-2 gap-2">
							<RenkoPane
								className="h-full"
								label="15m bricks + structural pivots"
								subLabel="pivots detected from 15m brick sequence"
								series={series15m}
								indicators={pivotOverlays15m}
								externalCrosshair={synced.idx15m}
							/>
							<RenkoPane
								className="h-full"
								label="60m bricks + structural pivots"
								subLabel="pivots detected from 60m brick sequence"
								series={series60m}
								indicators={pivotOverlays60m}
								externalCrosshair={synced.idx60m}
							/>
						</div>
					</div>
				</TabsContent>
			</Tabs>

			{(() => {
				const fired: Array<{
					brickIdx: number
					level: number
					label: string
					kind: "rejection_short" | "rejection_long"
					archetype: Archetype
				}> = []
				// Iterate all known cluster keys. For each fire-brick, look up the
				// cluster that was present at that brick (the key uniquely
				// identifies it) to recover the member shorts for display.
				for (const clusterKey of Object.keys(triggerStreams)) {
					const stream = triggerStreams[clusterKey]
					if (!stream) {
						continue
					}
					for (let i = 0; i < stream.length; i++) {
						const o = stream[i]!
						if (o.kind === "rejection_short" || o.kind === "rejection_long") {
							const c = clustersByBrick[i]?.find((cl) => cl.key === clusterKey)
							const label = c?.memberShorts.join("+") ?? clusterKey
							fired.push({
								brickIdx: i,
								level: o.level,
								label,
								kind: o.kind,
								archetype: o.archetype,
							})
						}
					}
				}
				fired.sort((a, b) => a.brickIdx - b.brickIdx)
				if (fired.length === 0) {
					return null
				}
				const reversalCount = fired.filter(
					(t) => t.archetype === "reversal"
				).length
				const retestCount = fired.filter((t) => t.archetype === "retest").length
				return (
					<div className="border-bg-300 bg-bg-100/40 p-s-300 mt-2 border">
						<h2 className="text-txt-100 text-small pb-1 font-semibold">
							S/R triggers fired ({fired.length}) · reversal {reversalCount} ·
							retest {retestCount}
						</h2>
						<div className="text-tiny flex flex-wrap gap-2">
							{fired.map((t, i) => {
								const arrow =
									t.kind === "rejection_short"
										? t.archetype === "retest"
											? "↩"
											: "▼"
										: t.archetype === "retest"
											? "↪"
											: "▲"
								return (
									<span
										key={`${t.brickIdx}-${t.label}-${i}`}
										className={
											t.kind === "rejection_short"
												? "bg-trade-sell text-bg-100 rounded-sm px-2 py-0.5"
												: "bg-trade-buy text-bg-100 rounded-sm px-2 py-0.5"
										}
										title={`5m brick #${t.brickIdx} · ${t.label} @ ${t.level.toFixed(0)} · ${t.archetype.toUpperCase()} · ${t.kind === "rejection_short" ? "BEARISH" : "BULLISH"}`}
									>
										{t.label} {arrow} · #{t.brickIdx}
									</span>
								)
							})}
						</div>
					</div>
				)
			})()}

			{catalog.length > 0 && (
				<div className="border-bg-300 bg-bg-100/40 p-s-300 mt-2 border">
					<h2 className="text-txt-100 text-small pb-1 font-semibold">
						Catalog markers ({catalog.length})
					</h2>
					<div className="text-tiny flex flex-wrap gap-2">
						{catalog.map((m) => (
							<span
								key={`${m.label}-${m.brickIndex}`}
								className={
									m.direction === "short"
										? "bg-trade-sell text-bg-100 rounded-sm px-2 py-0.5"
										: "bg-trade-buy text-bg-100 rounded-sm px-2 py-0.5"
								}
								title={`brick #${m.brickIndex} @ ${m.closePrice ?? "?"}`}
							>
								{m.label} · #{m.brickIndex} · {m.direction}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	)
}

export { HawksIsolationCharts }
