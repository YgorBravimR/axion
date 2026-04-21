"use client"

import { useEffect, useRef, useMemo, useState } from "react"
import {
	createChart,
	ColorType,
	CandlestickSeries,
	HistogramSeries,
	LineSeries,
} from "lightweight-charts"
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts"
import type { CandleRow } from "@/types/candle"
import { getChartThemeColors } from "@/lib/chart/theme-colors"
import { createMACD, updateMACD } from "@/lib/backtest/modules/entry/indicators"

interface MacdChartViewProps {
	candles: CandleRow[]
	asset: string
	timeframe: string
}

interface MACDPoint {
	histogram: number
	macdLine: number
	signalLine: number
	prevHistogram: number
}

interface MACDConfig {
	fast: number
	slow: number
	signal: number
}

// Convert UTC timestamp → BRT date string (YYYY-MM-DD)
const toBrtDate = (timestamp: string): string => {
	const brtMs = new Date(timestamp).getTime() - 3 * 60 * 60 * 1000
	return new Date(brtMs).toISOString().slice(0, 10)
}

// Convert UTC timestamp → BRT time label (HH:MM)
const toBrtTime = (timestamp: string): string => {
	const ts = new Date(timestamp)
	const brtHour = (ts.getUTCHours() - 3 + 24) % 24
	const brtMin = ts.getUTCMinutes()
	return `${String(brtHour).padStart(2, "0")}:${String(brtMin).padStart(2, "0")}`
}

// Compute MACD through ALL candles in sequence — preserves warmup state across days.
// This is the same logic used in the backtest engine.
const computeAllMacd = (candles: CandleRow[], config: MACDConfig): MACDPoint[] => {
	let state = createMACD(config.fast, config.slow, config.signal)

	return candles.map((candle) => {
		const prevHistogram = state.histogram
		state = updateMACD(state, candle.close, config.fast, config.slow, config.signal)
		return {
			histogram: state.histogram,
			macdLine: state.fastEMA.value - state.slowEMA.value,
			signalLine: state.signalEMA.value,
			prevHistogram,
		}
	})
}

// Diego TAT MACD histogram color classification (matches backtest engine)
const histogramColor = (histogram: number, prevHistogram: number): string => {
	if (histogram >= 0) {
		return histogram > prevHistogram ? "#26a69a" : "#4db6ac"
	}
	return histogram < prevHistogram ? "#ef5350" : "#f06292"
}

const MacdChartView = ({ candles, asset, timeframe }: MacdChartViewProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const chartRef = useRef<IChartApi | null>(null)
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
	const histSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
	const macdLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null)
	const signalLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null)
	// Ref used by the time formatter closure to map index → BRT label
	const daysCandlesRef = useRef<CandleRow[]>([])

	const [macdConfig, setMacdConfig] = useState<MACDConfig>({ fast: 12, slow: 26, signal: 15 })

	// Compute MACD values for ALL candles (full warmup across entire history)
	const allMacd = useMemo(() => computeAllMacd(candles, macdConfig), [candles, macdConfig])

	// Group candle indices by BRT date
	const dayGroups = useMemo(() => {
		const groups = new Map<string, number[]>()
		for (let i = 0; i < candles.length; i++) {
			const date = toBrtDate(candles[i].timestamp)
			const indices = groups.get(date) ?? []
			indices.push(i)
			groups.set(date, indices)
		}
		return groups
	}, [candles])

	const availableDays = useMemo(() => [...dayGroups.keys()].sort(), [dayGroups])

	const [selectedDay, setSelectedDay] = useState<string>("")

	// Default to last available day once data loads
	useEffect(() => {
		if (availableDays.length && !selectedDay) {
			setSelectedDay(availableDays[availableDays.length - 1])
		}
	}, [availableDays, selectedDay])

	// Create chart on mount
	useEffect(() => {
		if (!containerRef.current) return

		const theme = getChartThemeColors()

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
				timeFormatter: (time: number) => {
					const idx = Math.round(time)
					const c = daysCandlesRef.current[idx]
					return c ? toBrtTime(c.timestamp) : ""
				},
			},
			timeScale: {
				tickMarkFormatter: (time: number) => {
					const idx = Math.round(time)
					const c = daysCandlesRef.current[idx]
					return c ? toBrtTime(c.timestamp) : ""
				},
				borderColor: theme.bg300,
			},
		})

		// Pane 0 — price (candlesticks)
		const candleSeries = chart.addSeries(CandlestickSeries, {
			upColor: theme.tradeBuy,
			downColor: theme.tradeSell,
			borderUpColor: theme.tradeBuy,
			borderDownColor: theme.tradeSell,
			wickUpColor: theme.tradeBuy,
			wickDownColor: theme.tradeSell,
			priceLineVisible: false,
		})

		// Pane 1 — MACD (histogram + lines share the same price scale)
		const histSeries = chart.addSeries(HistogramSeries, { base: 0, priceLineVisible: false }, 1)

		const macdLineSeries = chart.addSeries(
			LineSeries,
			{ color: "#2196F3", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
			1
		)

		const signalLineSeries = chart.addSeries(
			LineSeries,
			{ color: "#FF9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
			1
		)

		// Price pane ~70%, MACD pane ~30% of total height
		const panes = chart.panes()
		if (panes.length >= 2) {
			const totalH = containerRef.current.clientHeight || 600
			panes[0].setHeight(Math.round(totalH * 0.68))
			panes[1].setHeight(Math.round(totalH * 0.32))
		}

		chartRef.current = chart
		candleSeriesRef.current = candleSeries
		histSeriesRef.current = histSeries
		macdLineSeriesRef.current = macdLineSeries
		signalLineSeriesRef.current = signalLineSeries

		return () => {
			chart.remove()
			chartRef.current = null
			candleSeriesRef.current = null
			histSeriesRef.current = null
			macdLineSeriesRef.current = null
			signalLineSeriesRef.current = null
		}
	}, [])

	// Update chart data whenever selected day or MACD config changes
	useEffect(() => {
		if (
			!selectedDay ||
			!candleSeriesRef.current ||
			!histSeriesRef.current ||
			!macdLineSeriesRef.current ||
			!signalLineSeriesRef.current
		)
			return

		const globalIndices = dayGroups.get(selectedDay) ?? []
		if (!globalIndices.length) return

		const dayCandlesList = globalIndices.map((i) => candles[i])
		daysCandlesRef.current = dayCandlesList

		candleSeriesRef.current.setData(
			dayCandlesList.map((c, localIdx) => ({
				time: localIdx as UTCTimestamp,
				open: c.open,
				high: c.high,
				low: c.low,
				close: c.close,
			}))
		)

		histSeriesRef.current.setData(
			globalIndices.map((globalIdx, localIdx) => {
				const m = allMacd[globalIdx]
				return {
					time: localIdx as UTCTimestamp,
					value: m.histogram,
					color: histogramColor(m.histogram, m.prevHistogram),
				}
			})
		)

		macdLineSeriesRef.current.setData(
			globalIndices.map((globalIdx, localIdx) => ({
				time: localIdx as UTCTimestamp,
				value: allMacd[globalIdx].macdLine,
			}))
		)

		signalLineSeriesRef.current.setData(
			globalIndices.map((globalIdx, localIdx) => ({
				time: localIdx as UTCTimestamp,
				value: allMacd[globalIdx].signalLine,
			}))
		)

		chartRef.current?.timeScale().fitContent()
	}, [selectedDay, dayGroups, candles, allMacd])

	const handleConfigChange = (field: keyof MACDConfig, rawValue: string) => {
		const value = parseInt(rawValue, 10)
		if (!isNaN(value) && value > 0) {
			setMacdConfig((prev) => ({ ...prev, [field]: value }))
		}
	}

	const dayCandles = dayGroups.get(selectedDay) ?? []

	return (
		<div className="space-y-m-400">
			{/* Controls */}
			<div className="border-bg-300 bg-bg-200 flex flex-wrap items-end gap-m-400 rounded-lg border p-m-400">
				{/* Day selector */}
				<div className="space-y-s-200">
					<label className="text-small font-medium text-txt-200">Date</label>
					<select
						value={selectedDay}
						onChange={(e) => setSelectedDay(e.target.value)}
						className="border-bg-300 bg-bg-100 text-body text-txt-100 rounded-md border px-s-300 py-s-200 focus:outline-none"
					>
						{availableDays.map((day) => (
							<option key={day} value={day}>
								{day}
							</option>
						))}
					</select>
				</div>

				{/* MACD config */}
				<div className="space-y-s-200">
					<label className="text-small font-medium text-txt-200">EMA Fast</label>
					<input
						type="number"
						min={1}
						value={macdConfig.fast}
						onChange={(e) => handleConfigChange("fast", e.target.value)}
						className="border-bg-300 bg-bg-100 text-body text-txt-100 w-20 rounded-md border px-s-300 py-s-200 focus:outline-none"
					/>
				</div>
				<div className="space-y-s-200">
					<label className="text-small font-medium text-txt-200">EMA Slow</label>
					<input
						type="number"
						min={1}
						value={macdConfig.slow}
						onChange={(e) => handleConfigChange("slow", e.target.value)}
						className="border-bg-300 bg-bg-100 text-body text-txt-100 w-20 rounded-md border px-s-300 py-s-200 focus:outline-none"
					/>
				</div>
				<div className="space-y-s-200">
					<label className="text-small font-medium text-txt-200">Signal</label>
					<input
						type="number"
						min={1}
						value={macdConfig.signal}
						onChange={(e) => handleConfigChange("signal", e.target.value)}
						className="border-bg-300 bg-bg-100 text-body text-txt-100 w-20 rounded-md border px-s-300 py-s-200 focus:outline-none"
					/>
				</div>

				{/* Candle count */}
				<p className="text-small text-txt-300 pb-s-200">
					{dayCandles.length} candles · {asset} {timeframe} · warmup from {candles.length.toLocaleString()} total
				</p>
			</div>

			{/* Chart */}
			<div className="border-bg-300 bg-bg-100 overflow-hidden rounded-lg border">
				<div ref={containerRef} style={{ height: 600 }} />
			</div>

			{/* Legend */}
			<div className="flex items-center gap-m-400 px-s-200">
				<div className="flex items-center gap-s-200">
					<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#26a69a" }} />
					<span className="text-small text-txt-300">Histogram (strong)</span>
				</div>
				<div className="flex items-center gap-s-200">
					<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#4db6ac" }} />
					<span className="text-small text-txt-300">Histogram (weak)</span>
				</div>
				<div className="flex items-center gap-s-200">
					<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#2196F3" }} />
					<span className="text-small text-txt-300">MACD line</span>
				</div>
				<div className="flex items-center gap-s-200">
					<span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#FF9800" }} />
					<span className="text-small text-txt-300">Signal line</span>
				</div>
			</div>
		</div>
	)
}

export { MacdChartView }
