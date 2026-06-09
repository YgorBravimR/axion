"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { createSeriesMarkers } from "lightweight-charts"
import type {
	ISeriesMarkersPluginApi,
	SeriesMarker,
	UTCTimestamp,
} from "lightweight-charts"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { getCandlesForRange } from "@/app/actions/candle-query"
import { useCandleChart } from "@/lib/chart/use-candle-chart"
import type { CandleRow, DataSourceInfo } from "@/types/candle"
import type { BacktestTrade } from "@/types/backtest"

const WINDOW_PADDING_MS = 60 * 60 * 1000 // 1 hour either side of the trade

interface BacktestTradeChartModalProps {
	open: boolean
	onOpenChange: (_open: boolean) => void
	trade: BacktestTrade | null
	source: DataSourceInfo | null
}

const BacktestTradeChartModal = ({
	open,
	onOpenChange,
	trade,
	source,
}: BacktestTradeChartModalProps) => {
	const t = useTranslations("backtest.chartModal")
	const tCommon = useTranslations("common")

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				id="backtest-trade-chart-modal"
				className="w-full sm:w-[95vw] sm:max-w-5xl"
			>
				<DialogHeader>
					<DialogTitle>
						{trade
							? t("title", {
									id: trade.id,
									direction: (trade.direction === "long"
										? tCommon("long")
										: tCommon("short")
									).toUpperCase(),
								})
							: t("titleFallback")}
					</DialogTitle>
					{trade && source ? (
						<DialogDescription>
							{t("subtitle", {
								asset: source.assetSymbol,
								timeframe: source.timeframeCode,
								day: trade.dayKey,
							})}
						</DialogDescription>
					) : null}
				</DialogHeader>
				{open && trade && source ? (
					<BacktestTradeChartContent trade={trade} source={source} />
				) : null}
			</DialogContent>
		</Dialog>
	)
}

interface BacktestTradeChartContentProps {
	trade: BacktestTrade
	source: DataSourceInfo
}

const BacktestTradeChartContent = ({
	trade,
	source,
}: BacktestTradeChartContentProps) => {
	const t = useTranslations("backtest.chartModal")
	const containerRef = useRef<HTMLDivElement>(null)
	const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(
		null
	)
	const { chartRef, candleSeriesRef, themeRef, candlesRef } = useCandleChart({
		containerRef,
	})

	const [candles, setCandles] = useState<CandleRow[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Fetch the candle window around the trade
	useEffect(() => {
		let cancelled = false
		setLoading(true)
		setError(null)

		const entryMs = new Date(trade.entryTime).getTime()
		const exitMs = new Date(trade.exitTime).getTime()
		const from = new Date(entryMs - WINDOW_PADDING_MS)
		const to = new Date(exitMs + WINDOW_PADDING_MS)

		void getCandlesForRange({
			assetId: source.assetId,
			timeframeId: source.timeframeId,
			from,
			to,
		})
			.then((result) => {
				if (cancelled) {
					return
				}
				if (result.status === "success" && result.data) {
					setCandles(result.data.candles)
				} else {
					setError(result.message || t("loadFailed"))
				}
				setLoading(false)
			})
			.catch((err: unknown) => {
				if (cancelled) {
					return
				}
				// Defensive: server-action throws (auth redirect → HTML response)
				// land here so the modal renders an error state instead of
				// staying stuck in loading.
				setError(err instanceof Error ? err.message : t("loadFailed"))
				setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [trade, source, t])

	// Push candles + markers into the chart whenever data or trade changes
	useEffect(() => {
		const chart = chartRef.current
		if (!chart || !candleSeriesRef.current || candles.length === 0) {
			return
		}

		candlesRef.current = candles

		const candleData = candles.map((c, i) => ({
			time: i as unknown as UTCTimestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		}))
		candleSeriesRef.current.setData(candleData)

		if (!markersPluginRef.current) {
			markersPluginRef.current = createSeriesMarkers(
				candleSeriesRef.current
			) as ISeriesMarkersPluginApi<UTCTimestamp>
		}

		// Find the candle index closest to a given ISO timestamp (linear scan — small windows)
		const findIdx = (iso: string): number => {
			const target = new Date(iso).getTime()
			let best = 0
			let bestDelta = Infinity
			for (let i = 0; i < candles.length; i++) {
				const delta = Math.abs(
					new Date(candles[i]!.timestamp).getTime() - target
				)
				if (delta < bestDelta) {
					bestDelta = delta
					best = i
				}
			}
			return best
		}

		const entryIdx = findIdx(trade.entryTime)
		const exitIdx = findIdx(trade.exitTime)
		const isLong = trade.direction === "long"
		const theme = themeRef.current
		const buyColor = theme?.actionBuy ?? "rgb(100, 180, 255)"
		const sellColor = theme?.actionSell ?? "rgb(255, 140, 100)"

		const entryIsBuy = isLong // long entry = buy; short entry = sell
		const exitIsBuy = !isLong // long exit = sell; short exit = buy

		const markers: SeriesMarker<UTCTimestamp>[] = [
			{
				time: entryIdx as unknown as UTCTimestamp,
				position: entryIsBuy ? "belowBar" : "aboveBar",
				color: entryIsBuy ? buyColor : sellColor,
				shape: entryIsBuy ? "arrowUp" : "arrowDown",
				text: `#${trade.id} entry`,
			},
			{
				time: exitIdx as unknown as UTCTimestamp,
				position: exitIsBuy ? "belowBar" : "aboveBar",
				color: exitIsBuy ? buyColor : sellColor,
				shape: exitIsBuy ? "arrowUp" : "arrowDown",
				text: `#${trade.id} exit`,
			},
		]
		markers.sort((a, b) => (a.time as number) - (b.time as number))
		markersPluginRef.current.setMarkers(markers)

		chart.timeScale().fitContent()
	}, [candles, trade, chartRef, candleSeriesRef, candlesRef, themeRef])

	return (
		<div className="space-y-s-300">
			<div
				ref={containerRef}
				className="bg-bg-200 border-bg-300 h-[480px] w-full rounded-md border"
				aria-label={t("title", {
					id: trade.id,
					direction: trade.direction.toUpperCase(),
				})}
			/>
			{loading ? (
				<div className="text-txt-300 gap-s-200 flex items-center justify-center">
					<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
					<span className="text-small">{t("loading")}</span>
				</div>
			) : error ? (
				<p className="text-small text-destructive text-center">{error}</p>
			) : candles.length === 0 ? (
				<p className="text-small text-txt-300 text-center">{t("noData")}</p>
			) : null}
		</div>
	)
}

export { BacktestTradeChartModal }
