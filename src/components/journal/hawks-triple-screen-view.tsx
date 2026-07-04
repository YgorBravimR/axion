"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
	ChevronLeft,
	ChevronRight,
	HelpCircle,
	LayoutList,
	Loader2,
	SlidersHorizontal,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { formatRSize } from "@/lib/enrichment/format-rsize"
import {
	buildCrosshairSyncMap,
	candlesToBrickSeriesNative,
	findBrickIndexForTime,
	indicatorValuesByBrickIndex,
} from "@/lib/renko/bricks-to-chart"
import type { BrickChartSeries } from "@/lib/renko/bricks-to-chart"
import { getInspectorWindow } from "@/app/actions/inspector-data"
import { RenkoPane } from "@/components/backtest/inspector/renko-pane"
import type {
	IndicatorOverlay,
	TradeOverlay,
} from "@/components/backtest/inspector/renko-pane"
import type { InspectorBrickSizes, InspectorCandleRow } from "@/types/inspector"
import type { BacktestTrade } from "@/types/backtest"
import { TradeInfoPanel } from "./trade-info-panel"
import type { TradeInfoPanelProps } from "./trade-info-panel"
import type { TradeChartData } from "@/types/candle"

const EMA_COLORS = {
	mme27: "rgb(80, 180, 230)",
	mme55: "rgb(245, 175, 90)",
} as const

const VWAP_COLORS = {
	d: "rgb(168, 85, 247)",
	w: "rgb(236, 72, 153)",
	m: "rgb(244, 114, 182)",
} as const

const AJUSTE_COLORS = {
	ajuste: "rgb(250, 204, 21)",
	ajusteAdj: "rgb(234, 179, 8)",
} as const

// Journal context window: 20 days of history before the entry, 3 days of
// follow-through after. Wide enough to read swing structure on the 60m
// pane without flooding the 5m pane with weeks of bricks the user can
// still scroll into.
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const PADDING_BEFORE_MS = 20 * ONE_DAY_MS
const PADDING_AFTER_MS = 3 * ONE_DAY_MS

interface IndicatorSpec {
	readonly key: string
	readonly label: string
	readonly color: string
	// When set, the indicator's line is broken between consecutive points
	// whose timestamps fall on different days/weeks/months. VWAP/ajuste
	// reset per session; without a gap the chart draws a near-vertical
	// segment from yesterday's last value to today's first value.
	readonly resetBoundary?: "day" | "week" | "month"
}

// Returns a key derived from a timestamp (ms) per the reset period; two
// timestamps with the same key are in the same session.
const periodKey = (ms: number, boundary: "day" | "week" | "month"): string => {
	const d = new Date(ms)
	if (boundary === "day") {
		return d.toISOString().slice(0, 10) // YYYY-MM-DD
	}
	if (boundary === "month") {
		return d.toISOString().slice(0, 7) // YYYY-MM
	}
	// ISO week: year-week
	const tmp = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
	)
	const dayNum = tmp.getUTCDay() || 7
	tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
	const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
	const weekNum = Math.ceil(
		((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
	)
	return `${tmp.getUTCFullYear()}-W${weekNum}`
}

interface PreparedPane {
	readonly series: BrickChartSeries
	readonly indicators: IndicatorOverlay[]
	readonly trade: TradeOverlay | null
}

const buildPane = (
	candles: readonly InspectorCandleRow[],
	indicatorKeys: ReadonlyArray<IndicatorSpec>,
	trade: BacktestTrade
): PreparedPane | null => {
	if (candles.length === 0) {
		return null
	}
	const series = candlesToBrickSeriesNative(candles)
	const indicators: IndicatorOverlay[] = []
	for (const ind of indicatorKeys) {
		const data = indicatorValuesByBrickIndex(series.times, candles, ind.key)
		if (data.length === 0) {
			continue
		}
		if (!ind.resetBoundary) {
			indicators.push({
				key: ind.key,
				label: ind.label,
				color: ind.color,
				data,
			})
			continue
		}
		// Split the series at session boundaries so vwap_d/ajuste don't draw
		// a vertical connector from yesterday's last value to today's first
		// value. Each session becomes its own sub-overlay; the legend shows
		// the indicator once (only the first sub-overlay carries the label).
		const boundary = ind.resetBoundary
		let runStart = 0
		let lastKey = periodKey(series.times[data[0]!.time as number]!, boundary)
		let subIdx = 0
		const flush = (endExclusive: number) => {
			if (endExclusive - runStart === 0) {
				return
			}
			indicators.push({
				key: `${ind.key}__${subIdx}`,
				label: subIdx === 0 ? ind.label : "",
				color: ind.color,
				data: data.slice(runStart, endExclusive),
			})
			subIdx++
		}
		for (let i = 1; i < data.length; i++) {
			const brickMs = series.times[data[i]!.time as number]!
			const k = periodKey(brickMs, boundary)
			if (k !== lastKey) {
				flush(i)
				runStart = i
				lastKey = k
			}
		}
		flush(data.length)
	}

	const entryMs = new Date(trade.entryTime).getTime()
	const exitMs = new Date(trade.exitTime).getTime()
	const entryIdx = findBrickIndexForTime(series.times, entryMs)
	const exitIdx = findBrickIndexForTime(series.times, exitMs)
	const outcome: TradeOverlay["outcome"] =
		trade.rMultiple > 0 ? "win" : trade.rMultiple < 0 ? "loss" : "neutral"

	return {
		series,
		indicators,
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

type LegendItemKind =
	"line" | "candle-up" | "candle-down" | "arrow-up" | "arrow-down"

interface LegendItem {
	readonly kind: LegendItemKind
	readonly color?: string
	readonly label: string
	readonly description: string
}

const LegendSwatch = ({
	kind,
	color,
}: {
	kind: LegendItemKind
	color?: string
}) => {
	if (kind === "line") {
		return (
			<span
				className="inline-block h-[2px] w-6 shrink-0 rounded-full"
				style={{ backgroundColor: color }}
				aria-hidden="true"
			/>
		)
	}
	if (kind === "candle-up") {
		return (
			<span
				className="inline-block h-4 w-3 shrink-0 rounded-sm"
				style={{ backgroundColor: "rgb(34, 197, 94)" }}
				aria-hidden="true"
			/>
		)
	}
	if (kind === "candle-down") {
		return (
			<span
				className="inline-block h-4 w-3 shrink-0 rounded-sm"
				style={{ backgroundColor: "rgb(239, 68, 68)" }}
				aria-hidden="true"
			/>
		)
	}
	if (kind === "arrow-up") {
		return (
			<span
				className="inline-block h-3 w-3 shrink-0 rotate-180"
				aria-hidden="true"
				style={{
					clipPath: "polygon(50% 100%, 0 0, 100% 0)",
					backgroundColor: "rgb(34, 197, 94)",
				}}
			/>
		)
	}
	return (
		<span
			className="inline-block h-3 w-3 shrink-0"
			aria-hidden="true"
			style={{
				clipPath: "polygon(50% 100%, 0 0, 100% 0)",
				backgroundColor: "rgb(239, 68, 68)",
			}}
		/>
	)
}

const LegendSection = ({
	title,
	items,
}: {
	title: string
	items: ReadonlyArray<LegendItem>
}) => (
	<section>
		<h3 className="text-tiny text-txt-300 mb-s-200 font-semibold tracking-wide uppercase">
			{title}
		</h3>
		<ul className="space-y-s-200">
			{items.map((item) => (
				<li key={item.label} className="gap-s-300 flex items-start">
					<span className="mt-[6px] flex w-8 items-center justify-center">
						<LegendSwatch kind={item.kind} color={item.color} />
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-small text-txt-100 font-medium">{item.label}</p>
						<p className="text-tiny text-txt-300">{item.description}</p>
					</div>
				</li>
			))}
		</ul>
	</section>
)

interface HawksTripleScreenViewProps {
	readonly trade: BacktestTrade
	readonly assetSymbol: string
	readonly journalTrade: TradeChartData["trade"]
	readonly executions: TradeChartData["executions"]
	readonly fullTrade: TradeInfoPanelProps["fullTrade"]
	readonly tickSize?: number
	readonly tickValue?: number
	readonly prevTradeId?: string | null
	readonly nextTradeId?: string | null
	readonly onToggleView?: () => void
	readonly onDirtyChange?: (_dirty: boolean) => void
}

const HawksTripleScreenView = ({
	trade,
	assetSymbol,
	journalTrade,
	executions,
	fullTrade,
	tickSize,
	tickValue,
	prevTradeId,
	nextTradeId,
	onToggleView,
	onDirtyChange,
}: HawksTripleScreenViewProps) => {
	const tInspector = useTranslations("backtest.inspector")
	const tChart = useTranslations("trade.chart")
	const tTrade = useTranslations("trade")
	const tCommon = useTranslations("common")

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
	// 5m chart toggles. HTF panes (15m/60m) always render their EMAs —
	// they're the engine's structural levels and the user always needs to
	// see them in context.
	const [showMma, setShowMma] = useState(true)
	const [showVwap, setShowVwap] = useState(true)
	const [showAjuste, setShowAjuste] = useState(true)
	const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
	const [isLegendOpen, setIsLegendOpen] = useState(false)

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		setError(null)

		void getInspectorWindow({
			assetSymbol,
			centerTime: trade.entryTime,
			paddingMsBefore: PADDING_BEFORE_MS,
			paddingMsAfter: PADDING_AFTER_MS,
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
				setError(
					err instanceof Error ? err.message : tInspector("failedToLoad")
				)
				setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [trade.entryTime, assetSymbol, tInspector])

	const indicatorSpecs5m = useMemo<IndicatorSpec[]>(() => {
		const specs: IndicatorSpec[] = []
		if (showMma) {
			specs.push(
				{ key: "mme27_15m", label: "EMA 27 (15m)", color: EMA_COLORS.mme27 },
				{ key: "mme55_15m", label: "EMA 55 (15m)", color: EMA_COLORS.mme55 }
			)
		}
		if (showVwap) {
			specs.push(
				{
					key: "vwap_d",
					label: "VWAP D",
					color: VWAP_COLORS.d,
					resetBoundary: "day",
				},
				{
					key: "vwap_w",
					label: "VWAP W",
					color: VWAP_COLORS.w,
					resetBoundary: "week",
				},
				{
					key: "vwap_m",
					label: "VWAP M",
					color: VWAP_COLORS.m,
					resetBoundary: "month",
				}
			)
		}
		if (showAjuste) {
			specs.push(
				{
					key: "ajuste",
					label: "Ajuste",
					color: AJUSTE_COLORS.ajuste,
					resetBoundary: "day",
				},
				{
					key: "ajuste_adj",
					label: "Ajuste Adj",
					color: AJUSTE_COLORS.ajusteAdj,
					resetBoundary: "day",
				}
			)
		}
		return specs
	}, [showMma, showVwap, showAjuste])
	// HTF panes always show their EMAs — they're the gate the engine reads.
	const indicatorSpecs15m = useMemo<IndicatorSpec[]>(
		() => [
			{ key: "mme27_15m", label: "EMA 27", color: EMA_COLORS.mme27 },
			{ key: "mme55_15m", label: "EMA 55", color: EMA_COLORS.mme55 },
		],
		[]
	)
	const indicatorSpecs60m = useMemo<IndicatorSpec[]>(
		() => [
			{ key: "mme27_60m", label: "EMA 27", color: EMA_COLORS.mme27 },
			{ key: "mme55_60m", label: "EMA 55", color: EMA_COLORS.mme55 },
		],
		[]
	)

	const panes = useMemo(() => {
		if (!windowData) {
			return null
		}
		return {
			pane5m: buildPane(windowData.candles5m, indicatorSpecs5m, trade),
			pane15m: buildPane(windowData.candles15m, indicatorSpecs15m, trade),
			pane60m: buildPane(windowData.candles60m, indicatorSpecs60m, trade),
		}
	}, [
		windowData,
		trade,
		indicatorSpecs5m,
		indicatorSpecs15m,
		indicatorSpecs60m,
	])

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

	const sizesLabel = windowData
		? `5m=${formatRSize(windowData.sizes.size5m)}  ·  15m=${formatRSize(windowData.sizes.size15m)}  ·  60m=${formatRSize(windowData.sizes.size60m)}`
		: ""

	return (
		<div
			id="hawks-triple-screen-view"
			className="flex h-full flex-col overflow-hidden lg:flex-row"
		>
			{/* Charts column — vertical stack of 3 renko panes */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{loading ? (
					<div className="text-txt-300 gap-s-300 flex flex-1 items-center justify-center">
						<Loader2 className="h-5 w-5 animate-spin" />
						<span className="text-small">{tInspector("loading")}</span>
					</div>
				) : error ? (
					<div className="text-destructive flex flex-1 items-center justify-center">
						<p className="text-small">{error}</p>
					</div>
				) : !panes?.pane5m || !panes.pane15m || !panes.pane60m ? (
					<div className="text-txt-300 flex flex-1 items-center justify-center">
						<p className="text-small">{tInspector("noBricks")}</p>
					</div>
				) : (
					// Grid mirrors the spec:
					//   5m  5m  5m  5m
					//   5m  5m  5m  5m
					//   5m  5m  5m  5m
					//   15m 15m 60m 60m
					//   15m 15m 60m 60m
					// 5 rows × 4 cols. 5m spans rows 1–3 across the full width;
					// 15m and 60m split the bottom 2 rows.
					<div className="gap-s-200 p-s-200 grid min-h-0 flex-1 grid-cols-2 grid-rows-5">
						<RenkoPane
							className="col-span-2 row-span-3 min-h-0"
							label="5m Renko"
							subLabel={`size ${formatRSize(windowData?.sizes.size5m)}`}
							series={panes.pane5m.series}
							indicators={panes.pane5m.indicators}
							trade={panes.pane5m.trade}
							markerColorMode="action"
							emitsCrosshair
							onCrosshairMove={handle5mCrosshair}
						/>
						<RenkoPane
							className="col-span-1 row-span-2 min-h-0"
							label="15m Renko"
							subLabel={`size ${formatRSize(windowData?.sizes.size15m)}`}
							series={panes.pane15m.series}
							indicators={panes.pane15m.indicators}
							trade={panes.pane15m.trade}
							markerColorMode="action"
							externalCrosshair={synced.idx15m}
						/>
						<RenkoPane
							className="col-span-1 row-span-2 min-h-0"
							label="60m Renko"
							subLabel={`size ${formatRSize(windowData?.sizes.size60m)}`}
							series={panes.pane60m.series}
							indicators={panes.pane60m.indicators}
							trade={panes.pane60m.trade}
							markerColorMode="action"
							externalCrosshair={synced.idx60m}
						/>
					</div>
				)}

				{/* Toolbar: indicator toggles + view switch (mirrors TradeChartView) */}
				<div className="border-bg-300 bg-bg-100 gap-s-200 px-m-400 py-s-300 flex shrink-0 flex-wrap items-center border-t">
					<Button
						id="hawks-prev-trade"
						asChild={Boolean(prevTradeId)}
						size="icon"
						variant="ghost"
						className="h-8 w-8"
						disabled={!prevTradeId}
						aria-label={tTrade("prevTrade")}
					>
						{prevTradeId ? (
							<Link href={`/journal/${prevTradeId}`}>
								<ChevronLeft className="h-4 w-4" aria-hidden="true" />
							</Link>
						) : (
							<ChevronLeft className="h-4 w-4" aria-hidden="true" />
						)}
					</Button>
					<Button
						id="hawks-next-trade"
						asChild={Boolean(nextTradeId)}
						size="icon"
						variant="ghost"
						className="h-8 w-8"
						disabled={!nextTradeId}
						aria-label={tTrade("nextTrade")}
					>
						{nextTradeId ? (
							<Link href={`/journal/${nextTradeId}`}>
								<ChevronRight className="h-4 w-4" aria-hidden="true" />
							</Link>
						) : (
							<ChevronRight className="h-4 w-4" aria-hidden="true" />
						)}
					</Button>

					<span className="text-tiny text-txt-300 font-mono">{sizesLabel}</span>

					<Button
						id="open-chart-legend"
						size="sm"
						variant="outline"
						className="border-bg-300 text-txt-300 gap-s-200"
						onClick={() => setIsLegendOpen(true)}
						aria-label={tChart("legendButton")}
					>
						<HelpCircle className="h-4 w-4" />
						{tChart("legendButton")}
					</Button>

					<div className="flex-1" />

					<Button
						id="toggle-group-mma"
						variant="outline"
						size="sm"
						className={
							showMma
								? "bg-acc-100/20 border-acc-100 text-acc-100"
								: "bg-bg-300 text-txt-300 border-bg-300"
						}
						onClick={() => setShowMma((v) => !v)}
						aria-pressed={showMma}
						aria-label={tChart("toggleIndicatorGroup", {
							name: "EMA 27/55 (5m)",
						})}
					>
						EMA 27/55 (5m)
					</Button>

					<Button
						id="toggle-group-vwap"
						variant="outline"
						size="sm"
						className={
							showVwap
								? "bg-acc-100/20 border-acc-100 text-acc-100"
								: "bg-bg-300 text-txt-300 border-bg-300"
						}
						onClick={() => setShowVwap((v) => !v)}
						aria-pressed={showVwap}
						aria-label={tChart("toggleIndicatorGroup", { name: "VWAP" })}
					>
						VWAP D/W/M
					</Button>

					<Button
						id="toggle-group-ajuste"
						variant="outline"
						size="sm"
						className={
							showAjuste
								? "bg-acc-100/20 border-acc-100 text-acc-100"
								: "bg-bg-300 text-txt-300 border-bg-300"
						}
						onClick={() => setShowAjuste((v) => !v)}
						aria-pressed={showAjuste}
						aria-label={tChart("toggleIndicatorGroup", { name: "Ajuste" })}
					>
						Ajuste
					</Button>

					<Button
						id="toggle-details-sheet"
						size="sm"
						variant="outline"
						onClick={() => setIsDetailSheetOpen(true)}
						className="border-bg-300 text-txt-300 gap-s-200 lg:hidden"
						aria-label={tCommon("details")}
					>
						<SlidersHorizontal className="h-4 w-4" />
						{tCommon("details")}
					</Button>

					{onToggleView && (
						<Button
							id="toggle-detail-view"
							size="sm"
							variant="outline"
							onClick={onToggleView}
							className="border-acc-100/40 text-acc-100 hover:bg-acc-100/10 gap-s-200"
							aria-label={tChart("switchToDetailView")}
						>
							<LayoutList className="h-4 w-4" />
							{tCommon("details")}
						</Button>
					)}
				</div>
			</div>

			{/* Info panel — desktop side rail. Width fixed at 320px so the
			    chart gets the rest of the viewport; the panel's own padding
			    (p-m-400 from TradeInfoPanel) handles right gutter. `min-w-0`
			    keeps the inner Tabs from blowing past the wrapper width. */}
			<div className="border-bg-300 hidden shrink-0 lg:block lg:h-full lg:w-[320px] lg:border-l">
				<div className="h-full min-w-0">
					<TradeInfoPanel
						trade={journalTrade}
						executions={executions}
						fullTrade={fullTrade}
						tickSize={tickSize}
						tickValue={tickValue}
						onDirtyChange={onDirtyChange}
					/>
				</div>
			</div>

			<Dialog open={isLegendOpen} onOpenChange={setIsLegendOpen}>
				<DialogContent id="chart-legend-dialog" className="max-w-md">
					<DialogHeader>
						<DialogTitle>{tChart("legendDialogTitle")}</DialogTitle>
					</DialogHeader>
					<div className="space-y-m-400">
						<LegendSection
							title={tChart("legendCandles")}
							items={[
								{
									kind: "candle-up",
									label: tChart("legendBrickBullish"),
									description: tChart("legendBrickBullishDesc"),
								},
								{
									kind: "candle-down",
									label: tChart("legendBrickBearish"),
									description: tChart("legendBrickBearishDesc"),
								},
							]}
						/>
						<LegendSection
							title="EMA (5m)"
							items={[
								{
									kind: "line",
									color: EMA_COLORS.mme27,
									label: "EMA 27 (15m)",
									description: tChart("legendEmaDesc"),
								},
								{
									kind: "line",
									color: EMA_COLORS.mme55,
									label: "EMA 55 (15m)",
									description: tChart("legendEmaDesc"),
								},
							]}
						/>
						<LegendSection
							title="VWAP"
							items={[
								{
									kind: "line",
									color: VWAP_COLORS.d,
									label: "VWAP D",
									description: tChart("legendVwapDayDesc"),
								},
								{
									kind: "line",
									color: VWAP_COLORS.w,
									label: "VWAP W",
									description: tChart("legendVwapWeekDesc"),
								},
								{
									kind: "line",
									color: VWAP_COLORS.m,
									label: "VWAP M",
									description: tChart("legendVwapMonthDesc"),
								},
							]}
						/>
						<LegendSection
							title="Ajuste"
							items={[
								{
									kind: "line",
									color: AJUSTE_COLORS.ajuste,
									label: "Ajuste",
									description: tChart("legendAjusteDesc"),
								},
								{
									kind: "line",
									color: AJUSTE_COLORS.ajusteAdj,
									label: "Ajuste Adj",
									description: tChart("legendAjusteAdjDesc"),
								},
							]}
						/>
						<LegendSection
							title={tChart("legendTradeMarkers")}
							items={[
								{
									kind: "arrow-up",
									label: tChart("legendEntryLong"),
									description: tChart("legendEntryLongDesc"),
								},
								{
									kind: "arrow-down",
									label: tChart("legendEntryShort"),
									description: tChart("legendEntryShortDesc"),
								},
							]}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
				<SheetContent
					id="trade-detail-sheet"
					side="right"
					className="w-full max-w-[420px] overflow-y-auto p-0"
				>
					<SheetHeader className="border-bg-300 px-m-400 py-s-300 border-b">
						<SheetTitle className="text-small font-medium">
							{tCommon("details")}
						</SheetTitle>
					</SheetHeader>
					<TradeInfoPanel
						trade={journalTrade}
						executions={executions}
						fullTrade={fullTrade}
						tickSize={tickSize}
						tickValue={tickValue}
						onDirtyChange={onDirtyChange}
					/>
				</SheetContent>
			</Sheet>
		</div>
	)
}

export type { HawksTripleScreenViewProps }
export { HawksTripleScreenView }
