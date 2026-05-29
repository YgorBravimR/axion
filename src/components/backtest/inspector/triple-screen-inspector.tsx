"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	buildCrosshairSyncMap,
	candlesToBrickSeriesNative,
	findBrickIndexForTime,
	indicatorValuesByBrickIndex,
} from "@/lib/renko/bricks-to-chart"
import type { BrickChartSeries } from "@/lib/renko/bricks-to-chart"
import { getInspectorWindow } from "@/app/actions/inspector-data"
import type { InspectorCandleRow, InspectorBrickSizes } from "@/types/inspector"
import type { BacktestTrade } from "@/types/backtest"
import { RenkoPane } from "./renko-pane"
import type { IndicatorOverlay, TradeOverlay } from "./renko-pane"

interface HawksTripleScreenInspectorProps {
	readonly trade: BacktestTrade | null
	readonly assetSymbol: string
}

interface PreparedPane {
	readonly series: BrickChartSeries
	readonly indicators: IndicatorOverlay[]
	readonly trade: TradeOverlay | null
}

const EMA_COLORS = {
	mme27: "rgb(80, 180, 230)",
	mme55: "rgb(245, 175, 90)",
} as const

const buildPane = (
	candles: readonly InspectorCandleRow[],
	_brickSize: number,
	indicatorKeys: ReadonlyArray<{
		key: string
		label: string
		color: string
	}>,
	trade: BacktestTrade
): PreparedPane | null => {
	if (candles.length === 0) {
		return null
	}
	// DB rows already are bricks (loader persists one row per painted brick
	// with real intra-brick H/L). Use the native conversion — re-bricking via
	// generateRenkoBricks would collapse wicks and could change brick count.
	const series = candlesToBrickSeriesNative(candles)
	const indicators: IndicatorOverlay[] = indicatorKeys.map((ind) => ({
		key: ind.key,
		label: ind.label,
		color: ind.color,
		data: indicatorValuesByBrickIndex(series.times, candles, ind.key),
	}))

	const entryMs = new Date(trade.entryTime).getTime()
	const exitMs = new Date(trade.exitTime).getTime()
	const entryIdx = findBrickIndexForTime(series.times, entryMs)
	const exitIdx = findBrickIndexForTime(series.times, exitMs)
	const outcome: TradeOverlay["outcome"] =
		trade.rMultiple > 0 ? "win" : trade.rMultiple < 0 ? "loss" : "neutral"

	const tradeOverlay: TradeOverlay = {
		entryBrickIdx: entryIdx,
		exitBrickIdx: exitIdx,
		entryPrice: trade.entryPrice,
		exitPrice: trade.exitPrice,
		direction: trade.direction,
		outcome,
	}

	return { series, indicators, trade: tradeOverlay }
}

const HawksTripleScreenInspector = ({
	trade,
	assetSymbol,
}: HawksTripleScreenInspectorProps) => {
	const t = useTranslations("backtest.inspector")
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
		if (!trade) {
			setWindowData(null)
			setError(null)
			return
		}
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
				setError(err instanceof Error ? err.message : t("failedToLoad"))
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
		if (!trade || !windowData) {
			return null
		}
		return {
			pane5m: buildPane(
				windowData.candles5m,
				windowData.sizes.size5m,
				[
					{
						key: "mme27_15m",
						label: "EMA 27 (15m)",
						color: EMA_COLORS.mme27,
					},
					{
						key: "mme55_15m",
						label: "EMA 55 (15m)",
						color: EMA_COLORS.mme55,
					},
				],
				trade
			),
			pane15m: buildPane(
				windowData.candles15m,
				windowData.sizes.size15m,
				[
					{ key: "mme27_15m", label: "EMA 27", color: EMA_COLORS.mme27 },
					{ key: "mme55_15m", label: "EMA 55", color: EMA_COLORS.mme55 },
				],
				trade
			),
			pane60m: buildPane(
				windowData.candles60m,
				windowData.sizes.size60m,
				[
					{ key: "mme27_60m", label: "EMA 27", color: EMA_COLORS.mme27 },
					{ key: "mme55_60m", label: "EMA 55", color: EMA_COLORS.mme55 },
				],
				trade
			),
		}
	}, [trade, windowData])

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

	if (!trade) {
		return (
			<div className="bg-bg-200 border-bg-300 p-l-700 flex h-[480px] items-center justify-center rounded-lg border">
				<p className="text-body text-txt-300 text-center">{t("emptyState")}</p>
			</div>
		)
	}

	if (loading) {
		return (
			<div className="bg-bg-200 border-bg-300 gap-s-300 flex h-[480px] items-center justify-center rounded-lg border">
				<Loader2 className="text-txt-300 h-5 w-5 animate-spin" />
				<span className="text-small text-txt-300">{t("loading")}</span>
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
				<p className="text-small text-txt-300">{t("noBricks")}</p>
			</div>
		)
	}

	const sizesLabel = windowData
		? `5m=${windowData.sizes.size5m}  ·  15m=${windowData.sizes.size15m}  ·  60m=${windowData.sizes.size60m}`
		: ""

	return (
		<div className="space-y-s-300">
			<div className="flex items-baseline justify-between">
				<h3 className="text-h3 text-txt-100 font-semibold">
					{t("title", {
						id: trade.id,
						direction: trade.direction.toUpperCase(),
					})}
				</h3>
				<span className="text-tiny text-txt-300 font-mono">
					{trade.dayKey} · {assetSymbol} · {sizesLabel}
				</span>
			</div>
			<div className="gap-s-300 grid h-[640px] grid-cols-[3fr_2fr]">
				<RenkoPane
					label="5m Renko"
					subLabel={`size ${windowData?.sizes.size5m ?? "—"} pts`}
					series={panes.pane5m.series}
					indicators={panes.pane5m.indicators}
					trade={panes.pane5m.trade}
					markerColorMode="action"
					emitsCrosshair
					onCrosshairMove={handle5mCrosshair}
				/>
				<div className="gap-s-300 grid grid-rows-2">
					<RenkoPane
						label="15m Renko"
						subLabel={`size ${windowData?.sizes.size15m ?? "—"} pts`}
						series={panes.pane15m.series}
						indicators={panes.pane15m.indicators}
						trade={panes.pane15m.trade}
						markerColorMode="action"
						externalCrosshair={synced.idx15m}
					/>
					<RenkoPane
						label="60m Renko"
						subLabel={`size ${windowData?.sizes.size60m ?? "—"} pts`}
						series={panes.pane60m.series}
						indicators={panes.pane60m.indicators}
						trade={panes.pane60m.trade}
						markerColorMode="action"
						externalCrosshair={synced.idx60m}
					/>
				</div>
			</div>
		</div>
	)
}

export { HawksTripleScreenInspector }
