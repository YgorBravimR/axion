"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import {
	CandlestickSeries,
	ColorType,
	CrosshairMode,
	LineSeries,
	createChart,
	createSeriesMarkers,
} from "lightweight-charts"
import type {
	IChartApi,
	ISeriesApi,
	ISeriesMarkersPluginApi,
	MouseEventParams,
	SeriesMarker,
	UTCTimestamp,
} from "lightweight-charts"
import { getChartThemeColors } from "@/lib/chart/theme-colors"
import {
	candlesToBrickSeriesNative,
	findBrickIndexForTime,
} from "@/lib/renko/bricks-to-chart"
import { getOverviewRange } from "@/app/actions/inspector-data"
import type { BacktestTrade } from "@/types/backtest"

interface BacktestOverviewChartProps {
	readonly trades: ReadonlyArray<BacktestTrade>
	readonly assetSymbol: string
	readonly dateFrom: string
	readonly dateTo: string
	readonly selectedTradeId: number | string | null
	readonly onTradeSelect: (_trade: BacktestTrade) => void
}

const BacktestOverviewChart = ({
	trades,
	assetSymbol,
	dateFrom,
	dateTo,
	selectedTradeId,
	onTradeSelect,
}: BacktestOverviewChartProps) => {
	const t = useTranslations("backtest.inspector")
	const containerRef = useRef<HTMLDivElement>(null)
	const chartRef = useRef<IChartApi | null>(null)
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
	const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(
		null
	)
	const tradeLineSeriesRef = useRef<ISeriesApi<"Line">[]>([])

	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [bricks, setBricks] = useState<ReturnType<
		typeof candlesToBrickSeriesNative
	> | null>(null)

	const tradesRef = useRef(trades)
	useEffect(() => {
		tradesRef.current = trades
	}, [trades])

	const onTradeSelectRef = useRef(onTradeSelect)
	useEffect(() => {
		onTradeSelectRef.current = onTradeSelect
	}, [onTradeSelect])

	// Fetch overview data
	useEffect(() => {
		if (!dateFrom || !dateTo) {
			return
		}
		let cancelled = false
		setLoading(true)
		setError(null)

		void getOverviewRange({ assetSymbol, fromDate: dateFrom, toDate: dateTo })
			.then((res) => {
				if (cancelled) {
					return
				}
				if (res.status !== "success") {
					setError(res.message)
					setLoading(false)
					return
				}
				// DB rows already are bricks — render natively to preserve real
				// intra-brick wicks and keep brick count == row count.
				setBricks(candlesToBrickSeriesNative(res.data.candles5m))
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
	}, [assetSymbol, dateFrom, dateTo, t])

	const theme = useMemo(() => {
		if (typeof window === "undefined") {
			return null
		}
		return getChartThemeColors()
	}, [])

	// Create chart once
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
			},
			crosshair: { mode: CrosshairMode.Normal },
			handleScroll: true,
			handleScale: true,
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
			chart.remove()
			chartRef.current = null
			candleSeriesRef.current = null
			markersPluginRef.current = null
			tradeLineSeriesRef.current = []
		}
	}, [theme])

	// Push brick data
	useEffect(() => {
		const series = candleSeriesRef.current
		const chart = chartRef.current
		if (!series || !chart || !bricks) {
			return
		}
		series.setData(bricks.data)
		chart.timeScale().fitContent()
	}, [bricks])

	// Trade overlays: one LineSeries per trade + markers
	useEffect(() => {
		const chart = chartRef.current
		const candleSeries = candleSeriesRef.current
		if (!chart || !candleSeries || !bricks || !theme) {
			return
		}

		// Tear down previous trade overlays
		for (const s of tradeLineSeriesRef.current) {
			try {
				chart.removeSeries(s)
			} catch {
				// chart was torn down
			}
		}
		tradeLineSeriesRef.current = []

		const winColor = theme.tradeBuy
		const lossColor = theme.tradeSell
		const neutralColor = theme.txt300

		const markers: SeriesMarker<UTCTimestamp>[] = []
		for (const trade of trades) {
			const entryIdx = findBrickIndexForTime(
				bricks.times,
				new Date(trade.entryTime).getTime()
			)
			const exitIdx = findBrickIndexForTime(
				bricks.times,
				new Date(trade.exitTime).getTime()
			)
			const a = Math.min(entryIdx, exitIdx)
			const b = Math.max(entryIdx, exitIdx)
			const outcomeColor =
				trade.rMultiple > 0
					? winColor
					: trade.rMultiple < 0
						? lossColor
						: neutralColor
			const isSelected = String(trade.id) === String(selectedTradeId)

			// Lightweight Charts asserts strictly ascending times on setData;
			// same-brick entry/exit collapses to one point, so skip the segment
			// and rely on the entry marker alone.
			if (b > a) {
				const line = chart.addSeries(LineSeries, {
					color: outcomeColor,
					lineWidth: isSelected ? 3 : 2,
					lineStyle: 0,
					priceLineVisible: false,
					lastValueVisible: false,
					crosshairMarkerVisible: false,
				})
				line.setData([
					{ time: a as UTCTimestamp, value: trade.entryPrice },
					{ time: b as UTCTimestamp, value: trade.entryPrice },
				])
				tradeLineSeriesRef.current.push(line)
			}

			const isLong = trade.direction === "long"
			markers.push({
				time: entryIdx as UTCTimestamp,
				position: isLong ? "belowBar" : "aboveBar",
				color: isSelected ? theme.acc100 : outcomeColor,
				shape: isLong ? "arrowUp" : "arrowDown",
				text: isSelected ? `#${trade.id}` : "",
			})
		}

		if (!markersPluginRef.current) {
			markersPluginRef.current = createSeriesMarkers(
				candleSeries
			) as ISeriesMarkersPluginApi<UTCTimestamp>
		}
		markers.sort((a, b) => (a.time as number) - (b.time as number))
		markersPluginRef.current.setMarkers(markers)
	}, [trades, bricks, selectedTradeId, theme])

	const handleClick = useCallback(
		(param: MouseEventParams) => {
			if (param.time === undefined) {
				return
			}
			const clickedIdx = Number(param.time)
			if (!Number.isFinite(clickedIdx)) {
				return
			}
			const currentTrades = tradesRef.current
			if (currentTrades.length === 0) {
				return
			}
			// Pick the trade whose entry brick is nearest the click
			let best: BacktestTrade | null = null
			let bestDelta = Number.POSITIVE_INFINITY
			// Use the displayed bricks' time mapping to find entry indices
			const brickTimes = bricks?.times
			if (!brickTimes) {
				return
			}
			for (const trade of currentTrades) {
				const entryIdx = findBrickIndexForTime(
					brickTimes,
					new Date(trade.entryTime).getTime()
				)
				const delta = Math.abs(entryIdx - clickedIdx)
				if (delta < bestDelta) {
					bestDelta = delta
					best = trade
				}
			}
			if (best && bestDelta < 10) {
				onTradeSelectRef.current(best)
			}
		},
		[bricks]
	)

	useEffect(() => {
		const chart = chartRef.current
		if (!chart) {
			return
		}
		chart.subscribeClick(handleClick)
		return () => {
			chart.unsubscribeClick(handleClick)
		}
	}, [handleClick])

	return (
		<div className="bg-bg-200 border-bg-300 space-y-s-200 p-s-300 rounded-lg border">
			<div className="flex items-baseline justify-between">
				<h3 className="text-h3 text-txt-100 font-semibold">
					{t("overviewTitle")}
				</h3>
				<span className="text-tiny text-txt-300">
					{t("overviewHint", { count: trades.length })}
				</span>
			</div>
			<div className="relative h-[260px] w-full">
				<div ref={containerRef} className="absolute inset-0" />
				{loading ? (
					<div className="bg-bg-100/60 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
						<Loader2 className="text-txt-300 h-5 w-5 animate-spin" />
					</div>
				) : null}
				{error ? (
					<div className="absolute inset-0 flex items-center justify-center">
						<p className="text-small text-destructive">{error}</p>
					</div>
				) : null}
			</div>
		</div>
	)
}

export { BacktestOverviewChart }
