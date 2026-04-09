"use client"

import type { RefObject } from "react"
import { useEffect, useRef, useCallback } from "react"
import type { IChartApi, ISeriesApi } from "lightweight-charts"
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts"
import type { CandleRow } from "@/types/candle"
import { getChartThemeColors } from "@/lib/chart/theme-colors"
import type { ChartThemeColors } from "@/lib/chart/theme-colors"
import { buildIndicatorColorMap } from "@/lib/chart/constants"

interface UseCandleChartOptions {
	containerRef: RefObject<HTMLDivElement | null>
}

interface UseCandleChartResult {
	chartRef: RefObject<IChartApi | null>
	candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>
	indicatorSeriesRef: RefObject<Map<string, ISeriesApi<"Line">>>
	themeRef: RefObject<ChartThemeColors | null>
	indicatorColorMapRef: RefObject<Record<string, string>>
	candlesRef: RefObject<CandleRow[]>
	getIndicatorColor: (key: string) => string
}

/**
 * Shared chart infrastructure hook for candlestick charts.
 * Creates the chart, candlestick series, and theme-aware color maps on mount.
 * Callers are responsible for setting candle data, indicator data, markers, and price lines.
 */
const useCandleChart = ({ containerRef }: UseCandleChartOptions): UseCandleChartResult => {
	const chartRef = useRef<IChartApi | null>(null)
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
	const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map())
	const candlesRef = useRef<CandleRow[]>([])
	const themeRef = useRef<ChartThemeColors | null>(null)
	const indicatorColorMapRef = useRef<Record<string, string>>({})

	/** Resolve indicator key to color from live theme + ProfitChart scheme */
	const getIndicatorColor = useCallback(
		(key: string): string =>
			indicatorColorMapRef.current[key] ?? (themeRef.current?.txtPlaceholder ?? "rgb(80, 86, 95)"),
		[]
	)

	// Create chart on mount
	useEffect(() => {
		if (!containerRef.current) return

		// Read live theme colors from CSS variables
		const theme = getChartThemeColors()
		themeRef.current = theme
		indicatorColorMapRef.current = buildIndicatorColorMap(theme)

		// Resolve sequential candle index to BRT time label
		const indexToBrtTime = (time: number): string => {
			const idx = Math.round(time)
			if (idx < 0 || idx >= candlesRef.current.length) return ""
			const ts = new Date(candlesRef.current[idx].timestamp)
			const brtHours = (ts.getUTCHours() - 3 + 24) % 24
			const brtMinutes = ts.getUTCMinutes()
			return `${brtHours.toString().padStart(2, "0")}:${brtMinutes.toString().padStart(2, "0")}`
		}

		const chart = createChart(containerRef.current, {
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
			// Current price line always txt-100 (white/dark) to avoid confusion
			priceLineColor: theme.txt100,
		})

		chartRef.current = chart
		candleSeriesRef.current = candleSeries

		return () => {
			chart.remove()
			chartRef.current = null
			candleSeriesRef.current = null
			indicatorSeriesRef.current.clear()
		}
	}, [containerRef])

	return {
		chartRef,
		candleSeriesRef,
		indicatorSeriesRef,
		themeRef,
		indicatorColorMapRef,
		candlesRef,
		getIndicatorColor,
	}
}

export type { UseCandleChartOptions, UseCandleChartResult }
export { useCandleChart }
