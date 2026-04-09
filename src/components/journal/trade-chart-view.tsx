"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { ISeriesMarkersPluginApi, SeriesMarker } from "lightweight-charts"
import {
	createSeriesMarkers,
	LineSeries,
	LineStyle,
} from "lightweight-charts"
import type { UTCTimestamp } from "lightweight-charts"
import type { CandleRow, IndicatorGroupWithKeys, TradeChartData } from "@/types/candle"
import { useCandleChart } from "@/lib/chart/use-candle-chart"
import { REFERENCE_GROUPS } from "@/lib/chart/constants"
import { LayoutList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TradeInfoPanel } from "@/components/journal/trade-info-panel"
import type { TradeInfoPanelProps } from "@/components/journal/trade-info-panel"

interface TradeChartViewProps {
	trade: TradeChartData["trade"]
	executions: TradeChartData["executions"]
	candles: CandleRow[]
	indicatorGroups: IndicatorGroupWithKeys[]
	fullTrade: TradeInfoPanelProps["fullTrade"]
	tickSize?: number
	tickValue?: number
	onToggleView?: () => void
	onDirtyChange?: (dirty: boolean) => void
}

const TradeChartView = ({
	trade,
	executions,
	candles,
	indicatorGroups,
	fullTrade,
	tickSize,
	tickValue,
	onToggleView,
	onDirtyChange,
}: TradeChartViewProps) => {
	const chartContainerRef = useRef<HTMLDivElement>(null)
	const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null)

	const {
		chartRef,
		candleSeriesRef,
		indicatorSeriesRef,
		themeRef,
		candlesRef,
		getIndicatorColor,
	} = useCandleChart({ containerRef: chartContainerRef })

	const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set())
	const [showExecutions, setShowExecutions] = useState(true)

	/** Execution line series refs for toggling visibility */
	const executionLinesRef = useRef<Array<import("lightweight-charts").ISeriesApi<"Line">>>([])

	const isLong = trade.direction === "long"

	/**
	 * Find the sequential candle index closest to a given ISO timestamp.
	 * Returns -1 if no candles are loaded.
	 */
	const findCandleIndex = useCallback(
		(isoTimestamp: string): number => {
			if (candles.length === 0) return -1
			const target = new Date(isoTimestamp).getTime()
			let bestIndex = 0
			let bestDiff = Infinity
			for (let idx = 0; idx < candles.length; idx++) {
				const diff = Math.abs(new Date(candles[idx].timestamp).getTime() - target)
				if (diff < bestDiff) {
					bestDiff = diff
					bestIndex = idx
				}
			}
			return bestIndex
		},
		[candles]
	)

	// Set candle data + draw executions + SL/TP (single effect for correct ordering)
	useEffect(() => {
		candlesRef.current = candles
		const chart = chartRef.current
		if (!chart || !candleSeriesRef.current || candles.length === 0) return

		// Set candle OHLC data
		const candleData = candles.map((c, i) => ({
			time: i as unknown as UTCTimestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		}))
		candleSeriesRef.current.setData(candleData)

		// Create markers plugin if not yet created
		if (!markersPluginRef.current) {
			const markersPlugin = createSeriesMarkers(candleSeriesRef.current)
			markersPluginRef.current = markersPlugin as ISeriesMarkersPluginApi<UTCTimestamp>
		}

		// Clean up previous execution lines
		for (const series of executionLinesRef.current) {
			try { chart.removeSeries(series) } catch { /* stale ref */ }
		}
		executionLinesRef.current = []

		// Clear markers
		try { markersPluginRef.current?.setMarkers([]) } catch { /* stale ref */ }

		if (!showExecutions) {
			chart.timeScale().fitContent()
			return
		}

		const theme = themeRef.current
		const entryColor = theme?.actionBuy ?? "rgb(100, 180, 255)"
		const exitColor = theme?.actionSell ?? "rgb(255, 140, 100)"
		const lastIdx = candles.length - 1

		// Build execution list
		const executionPoints: Array<{
			type: "entry" | "exit"
			price: number
			quantity: number
			candleIdx: number
		}> = []

		if (executions.length > 0) {
			for (const exec of executions) {
				const idx = findCandleIndex(exec.timestamp)
				if (idx < 0) continue
				executionPoints.push({
					type: exec.type,
					price: exec.price,
					quantity: exec.quantity,
					candleIdx: idx,
				})
			}
		} else {
			const entryIdx = findCandleIndex(trade.entryDate)
			if (entryIdx >= 0) {
				executionPoints.push({
					type: "entry",
					price: trade.entryPrice,
					quantity: trade.positionSize,
					candleIdx: entryIdx,
				})
			}
			if (trade.exitDate && trade.exitPrice !== null) {
				const exitIdx = findCandleIndex(trade.exitDate)
				if (exitIdx >= 0) {
					executionPoints.push({
						type: "exit",
						price: trade.exitPrice,
						quantity: trade.positionSize,
						candleIdx: exitIdx,
					})
				}
			}
		}

		// Sort by candle index (chronological order) so #1, #2, #3... matches time
		executionPoints.sort((a, b) => a.candleIdx - b.candleIdx)

		// Determine trade boundaries (first entry → last exit candle)
		const entryIndices = executionPoints.filter((e) => e.type === "entry").map((e) => e.candleIdx)
		const exitIndices = executionPoints.filter((e) => e.type === "exit").map((e) => e.candleIdx)
		const tradeStartIdx = entryIndices.length > 0 ? Math.min(...entryIndices) : 0
		const tradeEndIdx = exitIndices.length > 0 ? Math.max(...exitIndices) : lastIdx

		// Execution lines bounded to trade lifespan, with index + quantity as title
		for (let execIdx = 0; execIdx < executionPoints.length; execIdx++) {
			const exec = executionPoints[execIdx]
			const isBuy = isLong ? exec.type === "entry" : exec.type === "exit"
			const color = isBuy ? entryColor : exitColor
			const lineData: Array<{ time: UTCTimestamp; value: number }> = []

			// Line runs from execution candle to trade close
			// Lines stop at trade close, but extend at least 5 candles for label visibility
			const lineEndIdx = Math.max(tradeEndIdx, exec.candleIdx + 5)
			for (let i = exec.candleIdx; i <= lineEndIdx; i++) {
				lineData.push({
					time: i as unknown as UTCTimestamp,
					value: exec.price,
				})
			}

			if (lineData.length > 0) {
				const label = `#${execIdx + 1} x${exec.quantity}`
				const lineSeries = chart.addSeries(LineSeries, {
					color,
					lineWidth: 2,
					lineStyle: LineStyle.Dashed,
					title: label,
					priceLineVisible: false,
					lastValueVisible: true,
					crosshairMarkerVisible: false,
				})
				lineSeries.setData(lineData)
				executionLinesRef.current.push(lineSeries)
			}
		}

		// Arrow markers on execution candles (no text — label is on the line)
		const markers: Array<{
			time: UTCTimestamp
			position: "belowBar" | "aboveBar"
			color: string
			shape: "arrowUp" | "arrowDown"
			text: string
		}> = []

		for (const exec of executionPoints) {
			const isBuy = isLong ? exec.type === "entry" : exec.type === "exit"
			markers.push({
				time: exec.candleIdx as unknown as UTCTimestamp,
				position: isBuy ? "belowBar" : "aboveBar",
				color: isBuy ? entryColor : exitColor,
				shape: isBuy ? "arrowUp" : "arrowDown",
				text: "",
			})
		}

		markers.sort((a, b) => (a.time as number) - (b.time as number))
		markersPluginRef.current?.setMarkers(markers as SeriesMarker<UTCTimestamp>[])

		// SL / TP as bounded line series (trade open → close, not full chart)
		const slTpPairs: Array<{ price: number; color: string; label: string }> = []
		if (trade.stopLoss !== null) {
			slTpPairs.push({
				price: trade.stopLoss,
				color: theme?.tradeSell ?? "rgb(128, 128, 255)",
				label: "Stop Loss",
			})
		}
		if (trade.takeProfit !== null) {
			slTpPairs.push({
				price: trade.takeProfit,
				color: theme?.tradeBuy ?? "rgb(0, 255, 150)",
				label: "Take Profit",
			})
		}

		for (const { price, color, label } of slTpPairs) {
			const lineData: Array<{ time: UTCTimestamp; value: number }> = []
			for (let i = tradeStartIdx; i <= tradeEndIdx; i++) {
				lineData.push({ time: i as unknown as UTCTimestamp, value: price })
			}
			if (lineData.length > 0) {
				const lineSeries = chart.addSeries(LineSeries, {
					color,
					lineWidth: 1,
					lineStyle: LineStyle.LargeDashed,
					title: label,
					lastValueVisible: true,
					priceLineVisible: false,
					crosshairMarkerVisible: false,
				})
				lineSeries.setData(lineData)
				executionLinesRef.current.push(lineSeries)
			}
		}
		chart.timeScale().fitContent()
	}, [candles, trade, executions, isLong, showExecutions, findCandleIndex, chartRef, candleSeriesRef, candlesRef, themeRef])

	// Update indicator lines when active groups or candles change
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) return

		for (const [, series] of indicatorSeriesRef.current) {
			try { chart.removeSeries(series) } catch { /* stale ref */ }
		}
		indicatorSeriesRef.current.clear()

		if (candles.length === 0) return

		for (const group of indicatorGroups) {
			if (!activeGroups.has(group.key)) continue

			const isReference = REFERENCE_GROUPS.has(group.key)

			for (const indicator of group.indicatorKeys) {
				const color = getIndicatorColor(indicator.key)

				const lineSeries = chart.addSeries(LineSeries, {
					color,
					lineWidth: isReference ? 1 : 2,
					lineStyle: isReference ? LineStyle.Dashed : LineStyle.Solid,
					title: isReference ? indicator.displayName : "",
					lastValueVisible: isReference,
					priceLineVisible: false,
					crosshairMarkerVisible: false,
				})

				const lineData: Array<{ time: UTCTimestamp; value: number }> = []
				for (let idx = 0; idx < candles.length; idx++) {
					const val = candles[idx].indicators[indicator.key]
					if (val === undefined || val === null || val === 0) continue
					lineData.push({
						time: idx as unknown as UTCTimestamp,
						value: val,
					})
				}

				if (lineData.length > 0) {
					lineSeries.setData(lineData)
				}

				indicatorSeriesRef.current.set(indicator.key, lineSeries)
			}
		}
	}, [candles, activeGroups, indicatorGroups, getIndicatorColor, chartRef, indicatorSeriesRef])

	const handleToggleGroup = (groupKey: string) => {
		setActiveGroups((prev) => {
			const next = new Set(prev)
			if (next.has(groupKey)) {
				next.delete(groupKey)
			} else {
				next.add(groupKey)
			}
			return next
		})
	}

	const handleToggleExecutions = () => {
		setShowExecutions((prev) => !prev)
	}

	return (
		<div id="trade-chart-view" className="flex h-full flex-col lg:flex-row overflow-hidden">
			{/* Chart area — fills remaining space after panel */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{/* Chart container */}
				<div
					ref={chartContainerRef}
					className="min-h-0 flex-1"
					role="img"
					aria-label={`Candlestick chart for ${trade.asset} trade`}
				/>

				{/* Toolbar: toggles + view switch */}
				<div className="border-bg-300 bg-bg-100 flex shrink-0 flex-wrap items-center gap-s-200 border-t px-m-400 py-s-300">
					<Button
						id="toggle-executions"
						size="sm"
						variant="outline"
						className={
							showExecutions
								? "bg-acc-100/20 border-acc-100 text-acc-100"
								: "bg-bg-300 text-txt-300 border-bg-300"
						}
						onClick={handleToggleExecutions}
						aria-pressed={showExecutions}
						aria-label="Toggle execution markers visibility"
					>
						Executions
					</Button>

					{indicatorGroups.map((group) => {
						const isActive = activeGroups.has(group.key)
						return (
							<Button
								key={group.key}
								id={`toggle-group-${group.key}`}
								variant="outline"
								size="sm"
								className={
									isActive
										? "bg-acc-100/20 border-acc-100 text-acc-100"
										: "bg-bg-300 text-txt-300 border-bg-300"
								}
								onClick={() => handleToggleGroup(group.key)}
								aria-pressed={isActive}
								aria-label={`Toggle ${group.displayName} indicator group`}
							>
								{group.displayName} ({group.indicatorKeys.length})
							</Button>
						)
					})}

					{/* Spacer */}
					<div className="flex-1" />

					{/* Switch to detail view */}
					{onToggleView && (
						<Button
							id="toggle-detail-view"
							size="sm"
							variant="outline"
							onClick={onToggleView}
							className="border-acc-100/40 text-acc-100 hover:bg-acc-100/10 gap-s-200"
							aria-label="Switch to detail view"
						>
							<LayoutList className="h-4 w-4" />
							Details
						</Button>
					)}
				</div>
			</div>

			{/* Info panel — 30%, full height, independent scroll */}
			<div className="border-bg-300 shrink-0 lg:h-full lg:w-[30%] lg:min-w-[300px] lg:max-w-[380px] lg:border-l lg:overflow-y-auto">
				<TradeInfoPanel
					trade={trade}
					executions={executions}
					fullTrade={fullTrade}
					tickSize={tickSize}
					tickValue={tickValue}
					onDirtyChange={onDirtyChange}
				/>
			</div>
		</div>
	)
}

export type { TradeChartViewProps }
export { TradeChartView }
