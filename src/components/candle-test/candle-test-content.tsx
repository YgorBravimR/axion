"use client"

import type { ChangeEvent } from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { LineSeries, LineStyle } from "lightweight-charts"
import type { CandleRow, IndicatorGroupWithKeys, DataSourceInfo } from "@/types/candle"
import { getCandlesForRange } from "@/app/actions/candle-query"
import { useCandleChart } from "@/lib/chart/use-candle-chart"
import { REFERENCE_GROUPS } from "@/lib/chart/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

interface CandleTestContentProps {
	dataSources: DataSourceInfo[]
}

const CandleTestContent = ({ dataSources }: CandleTestContentProps) => {
	const chartContainerRef = useRef<HTMLDivElement>(null)

	const {
		chartRef,
		candleSeriesRef,
		indicatorSeriesRef,
		candlesRef,
		getIndicatorColor,
	} = useCandleChart({ containerRef: chartContainerRef })

	const [selectedSource, setSelectedSource] = useState<string>(
		dataSources.length > 0
			? `${dataSources[0].assetId}::${dataSources[0].timeframeId}`
			: ""
	)
	const [date, setDate] = useState("2026-03-17")
	const [mode, setMode] = useState<"hour" | "day">("day")
	const [hour, setHour] = useState("09")
	const [candles, setCandles] = useState<CandleRow[]>([])
	const [indicatorGroups, setIndicatorGroups] = useState<
		IndicatorGroupWithKeys[]
	>([])
	const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set())
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const getSourceParts = useCallback((): {
		assetId: string
		timeframeId: string
	} | null => {
		if (!selectedSource) return null
		const [assetId, timeframeId] = selectedSource.split("::")
		if (!assetId || !timeframeId) return null
		return { assetId, timeframeId }
	}, [selectedSource])

	const fetchData = useCallback(async () => {
		const source = getSourceParts()
		if (!source || !date) return
		if (mode === "hour" && !hour) return

		setLoading(true)
		setError(null)

		try {
			// Full day: 09:00-18:00 BRT (B3 market hours); Hour mode: selected hour only
			const from = mode === "day"
				? new Date(`${date}T09:00:00-03:00`)
				: new Date(`${date}T${hour}:00:00-03:00`)
			const to = mode === "day"
				? new Date(`${date}T18:00:00-03:00`)
				: new Date(`${date}T${hour}:59:59-03:00`)

			const result = await getCandlesForRange({
				assetId: source.assetId,
				timeframeId: source.timeframeId,
				from,
				to,
			})

			if (result.status === "error") {
				setError(result.message)
				return
			}

			if (result.data) {
				setCandles(result.data.candles)
				setIndicatorGroups(result.data.indicatorGroups)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error")
		} finally {
			setLoading(false)
		}
	}, [date, hour, mode, getSourceParts])

	// Fetch data when date, hour, or source changes
	useEffect(() => {
		fetchData()
	}, [fetchData])

	// Update candle data when candles change
	useEffect(() => {
		candlesRef.current = candles
		if (!candleSeriesRef.current || candles.length === 0) return

		// Renko charts are sequential (price-based), not time-based.
		// Use sequential index as "time" so candles are evenly spaced — matches ProfitChart rendering.
		// Each candle gets index 0, 1, 2, ... as its fake timestamp.
		const candleData = candles.map((c, i) => ({
			time: i as unknown as import("lightweight-charts").UTCTimestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		}))

		candleSeriesRef.current.setData(candleData)
		chartRef.current?.timeScale().fitContent()
	}, [candles, candlesRef, candleSeriesRef, chartRef])

	// Update indicator lines when active groups or candles change
	useEffect(() => {
		const chart = chartRef.current
		if (!chart) return

		// Remove all existing indicator series
		for (const [, series] of indicatorSeriesRef.current) {
			chart.removeSeries(series)
		}
		indicatorSeriesRef.current.clear()

		if (candles.length === 0) return

		// Add series for each active group's indicators
		for (const group of indicatorGroups) {
			if (!activeGroups.has(group.key)) continue

			const isReference = REFERENCE_GROUPS.has(group.key)

			for (const indicator of group.indicatorKeys) {
				const color = getIndicatorColor(indicator.key)

				const lineSeries = chart.addSeries(LineSeries, {
					color,
					lineWidth: isReference ? 1 : 2,
					lineStyle: isReference ? LineStyle.Dashed : LineStyle.Solid,
					// Reference levels show name badge on Y-axis; moving indicators don't
					title: isReference ? indicator.displayName : "",
					lastValueVisible: isReference,
					priceLineVisible: false,
					crosshairMarkerVisible: false,
				})

				// Use same sequential index as candles for indicator alignment
				// Skip zero values — for reference indicators, 0 means "not set" (draws a line from origin)
				const lineData: Array<{ time: import("lightweight-charts").UTCTimestamp; value: number }> = []
				for (let idx = 0; idx < candles.length; idx++) {
					const val = candles[idx].indicators[indicator.key]
					if (val === undefined || val === null || val === 0) continue
					lineData.push({
						time: idx as unknown as import("lightweight-charts").UTCTimestamp,
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

	const handleSourceChange = (value: string) => {
		setSelectedSource(value)
	}

	const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
		setDate(event.target.value)
	}

	const handleHourChange = (event: ChangeEvent<HTMLInputElement>) => {
		setHour(event.target.value)
	}

	if (dataSources.length === 0) {
		return (
			<p className="text-txt-300">
				No price data sources found. Import candle data first.
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-m-400">
			{/* Controls row */}
			<div className="flex flex-wrap items-end gap-m-400">
				<div className="flex flex-col gap-s-200">
					<label htmlFor="candle-test-date" className="text-small text-txt-200">
						Date
					</label>
					<Input
						id="candle-test-date"
						type="date"
						value={date}
						onChange={handleDateChange}
						className="w-[160px] bg-bg-200 text-txt-100 border-bg-300"
					/>
				</div>

				<div className="flex flex-col gap-s-200">
					<label className="text-small text-txt-200">Range</label>
					<div className="flex gap-s-200">
						<Button
							id="candle-test-mode-day"
							type="button"
							variant={mode === "day" ? "default" : "ghost"}
							size="sm"
							onClick={() => setMode("day")}
							className="text-small"
						>
							Full Day
						</Button>
						<Button
							id="candle-test-mode-hour"
							type="button"
							variant={mode === "hour" ? "default" : "ghost"}
							size="sm"
							onClick={() => setMode("hour")}
							className="text-small"
						>
							1 Hour
						</Button>
					</div>
				</div>

				{mode === "hour" && (
					<div className="flex flex-col gap-s-200">
						<label htmlFor="candle-test-hour" className="text-small text-txt-200">
							Hour
						</label>
						<Input
							id="candle-test-hour"
							type="text"
							value={hour}
							onChange={handleHourChange}
							placeholder="09"
							className="w-[80px] bg-bg-200 text-txt-100 border-bg-300"
							maxLength={2}
						/>
					</div>
				)}

				<div className="flex flex-col gap-s-200">
					<label
						htmlFor="candle-test-source"
						className="text-small text-txt-200"
					>
						Source
					</label>
					<Select value={selectedSource} onValueChange={handleSourceChange}>
						<SelectTrigger
							id="candle-test-source"
							className="w-[240px] bg-bg-200 text-txt-100 border-bg-300"
						>
							<SelectValue placeholder="Select source" />
						</SelectTrigger>
						<SelectContent>
							{dataSources.map((source) => (
								<SelectItem
									key={`${source.assetId}::${source.timeframeId}`}
									value={`${source.assetId}::${source.timeframeId}`}
								>
									{source.assetSymbol} - {source.timeframeName}
									{source.rowCount ? ` (${source.rowCount} rows)` : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Indicator group toggles */}
			{indicatorGroups.length > 0 && (
				<div className="flex flex-wrap gap-s-300">
					<span className="text-small text-txt-300 self-center mr-s-200">
						Groups:
					</span>
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
				</div>
			)}

			{/* Error message */}
			{error && (
				<p className="text-small text-fb-error">Error: {error}</p>
			)}

			{/* Loading state */}
			{loading && (
				<p className="text-small text-txt-300">Loading candles...</p>
			)}

			{/* Chart area */}
			<div
				ref={chartContainerRef}
				className="h-[500px] w-full rounded-md border border-bg-300 bg-bg-200"
			/>

			{/* Status */}
			<p className="text-small text-txt-300">
				{candles.length} candles loaded
				{activeGroups.size > 0 &&
					` | ${activeGroups.size} indicator group${activeGroups.size > 1 ? "s" : ""} active`}
			</p>
		</div>
	)
}

export { CandleTestContent }
