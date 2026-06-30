"use client"

import { useCallback, useMemo, useState } from "react"
import type { SeriesMarker, UTCTimestamp } from "lightweight-charts"
import { Button } from "@/components/ui/button"
import { RenkoPane } from "@/components/backtest/inspector/renko-pane"
import { candlesToBrickSeriesNative } from "@/lib/renko/bricks-to-chart"
import type {
	EngineLabBrick,
	EngineLabDayPayload,
} from "@/app/actions/hawks-engine-lab-data.types"

// Color palette — minimal, only what Fibo needs.
const COLOR_FIRE_LONG = "rgb(52, 211, 153)" // green arrow
const COLOR_FIRE_SHORT = "rgb(248, 113, 113)" // red arrow
const COLOR_IMPULSE_START = "rgb(217, 70, 239)" // fuchsia — impulse start
const COLOR_IMPULSE_END = "rgb(168, 85, 247)" // purple — impulse end
const COLOR_RETRACEMENT_PEAK = "rgb(248, 250, 252)" // slate-white — retrace peak
const COLOR_FIB_T = "rgb(56, 189, 248)" // sky — selected T level

const FIB_STUB_RADIUS_5M = 4
const FIB_STUB_RADIUS_15M = 4

const formatPrice = (n: number) =>
	n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })

interface FiboLabProps {
	readonly days: EngineLabDayPayload[]
	readonly from: string
	readonly to: string
}

type Tier = "T1" | "T2" | "T3"

const FiboLab = ({ days, from, to }: FiboLabProps) => {
	const [tier, setTier] = useState<Tier>("T2")
	// Hovered 5m brick index on the left chart. Translated to a 15m
	// brick index for the right chart's externalCrosshair.
	const [hovered5mIdx, setHovered5mIdx] = useState<number | null>(null)

	// Build the flat trade list ACROSS all days. Each entry remembers
	// the dayKey + the EngineLabBrick the trade lives on.
	type TradeRow = {
		dayKey: string
		fire: EngineLabBrick & {
			fiboAnchors: NonNullable<EngineLabBrick["fiboAnchors"]>
		}
	}
	const allTrades = useMemo<TradeRow[]>(() => {
		const out: TradeRow[] = []
		for (const d of days) {
			for (const b of d.bricks) {
				if (
					b.fired &&
					b.fiboAnchors !== null &&
					b.direction !== null &&
					b.price !== null
				) {
					out.push({
						dayKey: d.dayKey,
						fire: b as TradeRow["fire"],
					})
				}
			}
		}
		return out
	}, [days])

	const [selectedTradeIdx, setSelectedTradeIdx] = useState<number>(0)
	const clampedTradeIdx =
		selectedTradeIdx < allTrades.length ? selectedTradeIdx : 0
	const selectedTrade = allTrades[clampedTradeIdx] ?? null

	const activeDay = useMemo(() => {
		const key = selectedTrade?.dayKey ?? days[0]?.dayKey ?? ""
		return days.find((d) => d.dayKey === key) ?? null
	}, [days, selectedTrade])
	const activeDayKey = activeDay?.dayKey ?? ""

	// Build global continuous timelines across ALL days. RenkoPane uses
	// brick index as a synthetic timestamp, so the SAME index space is
	// shared between candles, bricks, indicator stubs and markers — we
	// only need to know each day's brick-offset to translate a per-day
	// `brickIndexInDay` into a global one.
	const globalSeries = useMemo(() => {
		const candles5m: EngineLabDayPayload["candles"] = []
		const candles15m: EngineLabDayPayload["candles15m"] = []
		const dayOffset5m = new Map<string, number>()
		const dayOffset15m = new Map<string, number>()
		const dayOffsetBricks = new Map<string, number>()
		for (const d of days) {
			dayOffset5m.set(d.dayKey, candles5m.length)
			dayOffset15m.set(d.dayKey, candles15m.length)
			dayOffsetBricks.set(d.dayKey, candles5m.length) // bricks ↔ candles 1:1
			for (const c of d.candles) {
				candles5m.push(c)
			}
			for (const c of d.candles15m) {
				candles15m.push(c)
			}
		}
		return {
			candles5m,
			candles15m,
			dayOffset5m,
			dayOffset15m,
			dayOffsetBricks,
		}
	}, [days])

	// Pre-compute (global 5m brick idx → global 15m brick idx) map for
	// crosshair sync. Each 5m index maps to the 15m brick whose timestamp
	// is the latest at-or-before the 5m brick's timestamp.
	const map5mTo15m = useMemo(() => {
		const c5 = globalSeries.candles5m
		const c15 = globalSeries.candles15m
		if (c5.length === 0 || c15.length === 0) {
			return null
		}
		const ts15 = c15.map((c) => new Date(c.timestamp).getTime())
		const out: number[] = new Array<number>(c5.length)
		let cursor = 0
		for (let i = 0; i < c5.length; i++) {
			const t = new Date(c5[i]!.timestamp).getTime()
			while (cursor + 1 < ts15.length && ts15[cursor + 1]! <= t) {
				cursor++
			}
			out[i] = cursor
		}
		return out
	}, [globalSeries])

	const hovered15mIdx =
		hovered5mIdx !== null && map5mTo15m
			? (map5mTo15m[hovered5mIdx] ?? null)
			: null

	// `fires` is exactly the selected trade (or empty). With a global
	// timeline, no day-filtering is needed — the trade always renders.
	const fires = useMemo(() => {
		return selectedTrade ? [selectedTrade] : []
	}, [selectedTrade])

	// Compute the global brick index of the selected trade on each
	// timeframe so the charts can focus around it (instead of fitting
	// the entire 10-day series). null = no focus → fitContent().
	const focusIdx5m = useMemo(() => {
		if (!selectedTrade) {
			return null
		}
		const dayBase = globalSeries.dayOffsetBricks.get(selectedTrade.dayKey) ?? 0
		return dayBase + selectedTrade.fire.brickIndexInDay
	}, [selectedTrade, globalSeries])
	const focusIdx15m = useMemo(() => {
		if (focusIdx5m === null || !map5mTo15m) {
			return null
		}
		return map5mTo15m[focusIdx5m] ?? null
	}, [focusIdx5m, map5mTo15m])

	// Per-gate fail counts across every fire ATTEMPT (every brick where
	// brickDirectionAgrees && isVB — i.e. a setup formed). Helps see at
	// a glance which gate is causing "0 fires" on days that clearly have
	// setups.
	const gateStats = useMemo(() => {
		if (!activeDay) {
			return null
		}
		const stats = {
			attempts: 0,
			passed: 0,
			demoFired: 0,
			realFiredRawOnly: 0,
			fails: {
				gateStable: 0,
				legShapeOk: 0,
				fiveMinStructureOk: 0,
				fifteenMinStructureOk: 0,
				inTradingWindow: 0,
				notCooldown: 0,
			},
		}
		for (const b of activeDay.bricks) {
			if (!b.gateTrace) {
				continue
			}
			stats.attempts++
			if (b.gateTrace.labGatesPass) {
				stats.passed++
			}
			if (b.gateTrace.canDemoFire) {
				stats.demoFired++
			}
			if (b.gateTrace.realFiredRaw) {
				stats.realFiredRawOnly++
			}
			if (!b.gateTrace.gateStable) {
				stats.fails.gateStable++
			}
			if (!b.gateTrace.legShapeOk) {
				stats.fails.legShapeOk++
			}
			if (!b.gateTrace.fiveMinStructureOk) {
				stats.fails.fiveMinStructureOk++
			}
			if (!b.gateTrace.fifteenMinStructureOk) {
				stats.fails.fifteenMinStructureOk++
			}
			if (!b.gateTrace.inTradingWindow) {
				stats.fails.inTradingWindow++
			}
			if (!b.gateTrace.notCooldown) {
				stats.fails.notCooldown++
			}
		}
		return stats
	}, [activeDay])

	const pickT = useCallback(
		(a: NonNullable<EngineLabBrick["fiboAnchors"]>) =>
			tier === "T1" ? a.t1 : tier === "T2" ? a.t2 : a.t3,
		[tier]
	)

	// ─── 5m chart payload (global, all days concatenated) ───────────
	const payload5m = useMemo(() => {
		if (globalSeries.candles5m.length === 0) {
			return null
		}
		const series = candlesToBrickSeriesNative(globalSeries.candles5m)
		const globalMaxIdx = globalSeries.candles5m.length - 1
		const markers: SeriesMarker<UTCTimestamp>[] = []
		const indicators: Array<{
			key: string
			label: string
			color: string
			data: Array<{ time: UTCTimestamp; value: number }>
		}> = []
		const seqBase = clampedTradeIdx + 1
		for (const t of fires) {
			const seq = seqBase
			const b = t.fire
			const dayBase = globalSeries.dayOffsetBricks.get(t.dayKey) ?? 0
			const globalBrickIdx = dayBase + b.brickIndexInDay
			const isLong = b.direction === "long"
			markers.push({
				time: globalBrickIdx as UTCTimestamp,
				position: isLong ? "belowBar" : "aboveBar",
				color: isLong ? COLOR_FIRE_LONG : COLOR_FIRE_SHORT,
				shape: isLong ? "arrowUp" : "arrowDown",
				text: `#${seq} ${formatPrice(b.price!)}`,
			})
			const lo = Math.max(0, globalBrickIdx - FIB_STUB_RADIUS_5M)
			const hi = Math.min(globalMaxIdx, globalBrickIdx + FIB_STUB_RADIUS_5M)
			indicators.push({
				key: `f5-entry-${seq}`,
				label: "Entry",
				color: isLong ? COLOR_FIRE_LONG : COLOR_FIRE_SHORT,
				data: [
					{ time: lo as UTCTimestamp, value: b.price! },
					{ time: hi as UTCTimestamp, value: b.price! },
				],
			})
			indicators.push({
				key: `f5-start-${seq}`,
				label: "Impulse start",
				color: COLOR_IMPULSE_START,
				data: [
					{ time: lo as UTCTimestamp, value: b.fiboAnchors.impulseStartPrice },
					{ time: hi as UTCTimestamp, value: b.fiboAnchors.impulseStartPrice },
				],
			})
			indicators.push({
				key: `f5-end-${seq}`,
				label: "Impulse end",
				color: COLOR_IMPULSE_END,
				data: [
					{ time: lo as UTCTimestamp, value: b.fiboAnchors.impulseEndPrice },
					{ time: hi as UTCTimestamp, value: b.fiboAnchors.impulseEndPrice },
				],
			})
			indicators.push({
				key: `f5-peak-${seq}`,
				label: "Retracement peak",
				color: COLOR_RETRACEMENT_PEAK,
				data: [
					{ time: lo as UTCTimestamp, value: b.fiboAnchors.retracementPeak },
					{ time: hi as UTCTimestamp, value: b.fiboAnchors.retracementPeak },
				],
			})
			const tVal = pickT(b.fiboAnchors)
			indicators.push({
				key: `f5-t-${seq}`,
				label: `${tier}`,
				color: COLOR_FIB_T,
				data: [
					{ time: lo as UTCTimestamp, value: tVal },
					{ time: hi as UTCTimestamp, value: tVal },
				],
			})
		}
		return { series, indicators, markers }
	}, [globalSeries, fires, tier, clampedTradeIdx, pickT])

	// ─── 15m chart payload (global, all days concatenated) ──────────
	const payload15m = useMemo(() => {
		if (globalSeries.candles15m.length === 0) {
			return null
		}
		const series = candlesToBrickSeriesNative(globalSeries.candles15m)
		const markers: SeriesMarker<UTCTimestamp>[] = []
		const indicators: Array<{
			key: string
			label: string
			color: string
			data: Array<{ time: UTCTimestamp; value: number }>
		}> = []
		const max15Idx = globalSeries.candles15m.length - 1
		const ts15 = globalSeries.candles15m.map((c) =>
			new Date(c.timestamp).getTime()
		)
		const findIdxAtOrBefore = (timestamp: string): number => {
			const t = new Date(timestamp).getTime()
			let lo = 0
			let hi = ts15.length - 1
			let result = 0
			while (lo <= hi) {
				const mid = (lo + hi) >> 1
				if (ts15[mid]! <= t) {
					result = mid
					lo = mid + 1
				} else {
					hi = mid - 1
				}
			}
			return result
		}
		const stubAround = (i: number) => {
			const lo = Math.max(0, i - FIB_STUB_RADIUS_15M) as UTCTimestamp
			const hi = Math.min(max15Idx, i + FIB_STUB_RADIUS_15M) as UTCTimestamp
			return [lo, hi] as const
		}
		const seqBase = clampedTradeIdx + 1
		for (const t of fires) {
			const seq = seqBase
			const b = t.fire
			const startIdx = findIdxAtOrBefore(b.fiboAnchors.impulseStartAtTimestamp)
			const endIdx = findIdxAtOrBefore(b.fiboAnchors.impulseEndAtTimestamp)
			const peakIdx = findIdxAtOrBefore(
				b.fiboAnchors.retracementPeakAtTimestamp
			)
			const [sLo, sHi] = stubAround(startIdx)
			const [eLo, eHi] = stubAround(endIdx)
			const [pLo, pHi] = stubAround(peakIdx)
			const isLongDir = b.direction === "long"
			const startAbove = !isLongDir
			const endAbove = isLongDir
			markers.push({
				time: startIdx as UTCTimestamp,
				position: startAbove ? "aboveBar" : "belowBar",
				shape: "circle",
				color: COLOR_IMPULSE_START,
				text: `#${seq}`,
			})
			markers.push({
				time: endIdx as UTCTimestamp,
				position: endAbove ? "aboveBar" : "belowBar",
				shape: "circle",
				color: COLOR_IMPULSE_END,
				text: `#${seq}`,
			})
			markers.push({
				time: peakIdx as UTCTimestamp,
				position: !isLongDir ? "aboveBar" : "belowBar",
				shape: "circle",
				color: COLOR_RETRACEMENT_PEAK,
				text: `#${seq}`,
			})
			indicators.push({
				key: `f15-start-${seq}`,
				label: "Impulse start",
				color: COLOR_IMPULSE_START,
				data: [
					{ time: sLo, value: b.fiboAnchors.impulseStartPrice },
					{ time: sHi, value: b.fiboAnchors.impulseStartPrice },
				],
			})
			indicators.push({
				key: `f15-end-${seq}`,
				label: "Impulse end",
				color: COLOR_IMPULSE_END,
				data: [
					{ time: eLo, value: b.fiboAnchors.impulseEndPrice },
					{ time: eHi, value: b.fiboAnchors.impulseEndPrice },
				],
			})
			indicators.push({
				key: `f15-peak-${seq}`,
				label: "Retracement peak",
				color: COLOR_RETRACEMENT_PEAK,
				data: [
					{ time: pLo, value: b.fiboAnchors.retracementPeak },
					{ time: pHi, value: b.fiboAnchors.retracementPeak },
				],
			})
			const tVal = pickT(b.fiboAnchors)
			indicators.push({
				key: `f15-t-${seq}`,
				label: tier,
				color: COLOR_FIB_T,
				data: [
					{ time: pLo, value: tVal },
					{ time: pHi, value: tVal },
				],
			})
		}
		return { series, indicators, markers }
	}, [globalSeries, fires, tier, clampedTradeIdx, pickT])

	return (
		<div className="flex h-full flex-col gap-2 p-2">
			{/* Toolbar */}
			<div className="text-tiny flex flex-wrap items-center gap-2">
				<span className="font-semibold">
					Fibo lab — {from} → {to}
				</span>
				<span className="text-txt-300">|</span>
				<span className="text-txt-300">Tier:</span>
				{(["T1", "T2", "T3"] as const).map((t) => (
					<Button
						key={t}
						id={`fibo-tier-${t}`}
						type="button"
						size="sm"
						variant={tier === t ? "default" : "outline"}
						onClick={() => setTier(t)}
					>
						{t}
					</Button>
				))}
				<span className="text-txt-300 ml-4">|</span>
				<span className="text-txt-300">
					{allTrades.length} trade{allTrades.length === 1 ? "" : "s"} across{" "}
					{days.length} day{days.length === 1 ? "" : "s"}
				</span>
				{gateStats && gateStats.attempts > 0 ? (
					<span className="text-warning">
						{activeDayKey}: attempts={gateStats.attempts} passed=
						{gateStats.passed} demo={gateStats.demoFired} real=
						{gateStats.realFiredRawOnly} fails:{" "}
						{Object.entries(gateStats.fails)
							.filter(([, n]) => n > 0)
							.sort(([, a], [, b]) => b - a)
							.map(([k, n]) => `${k}=${n}`)
							.join(", ")}
					</span>
				) : null}
			</div>

			{/* Legend */}
			<div className="text-tiny text-txt-300 flex flex-wrap items-center gap-3">
				<LegendDot color={COLOR_IMPULSE_START} label="Impulse start" />
				<LegendDot color={COLOR_IMPULSE_END} label="Impulse end" />
				<LegendDot color={COLOR_RETRACEMENT_PEAK} label="Retracement peak" />
				<LegendDot color={COLOR_FIB_T} label={`${tier} target`} />
				<LegendDot color={COLOR_FIRE_LONG} label="LONG fire" />
				<LegendDot color={COLOR_FIRE_SHORT} label="SHORT fire" />
			</div>

			{/* Trade picker — radio group across ALL fires of ALL days. */}
			{allTrades.length > 0 ? (
				<div
					role="radiogroup"
					aria-label="Select trade to inspect"
					className="text-tiny text-txt-300 flex max-h-24 flex-wrap items-center gap-1 overflow-y-auto"
				>
					<span className="text-txt-300 mr-1">Trade:</span>
					{allTrades.map((t, idx) => {
						const isSel = idx === clampedTradeIdx
						const dirLabel = t.fire.direction === "long" ? "L" : "S"
						const dirColor =
							t.fire.direction === "long" ? COLOR_FIRE_LONG : COLOR_FIRE_SHORT
						const time = t.fire.timestamp.slice(11, 16)
						const dayShort = t.dayKey.slice(5) // MM-DD
						return (
							<button
								key={`${t.dayKey}-${t.fire.timestamp}`}
								id={`fibo-trade-${idx}`}
								role="radio"
								aria-checked={isSel}
								type="button"
								onClick={() => setSelectedTradeIdx(idx)}
								className={
									isSel
										? "bg-bg-200 text-txt-100 rounded-sm border px-2 py-0.5"
										: "border-bg-300 bg-bg-100 hover:bg-bg-200 rounded-sm border px-2 py-0.5"
								}
								style={isSel ? { borderColor: dirColor } : undefined}
							>
								<span style={{ color: dirColor }}>
									#{idx + 1} {dirLabel}
								</span>{" "}
								<span className="opacity-70">{dayShort}</span>{" "}
								<span className="opacity-70">{time}</span>{" "}
								<span className="opacity-70">
									@{formatPrice(t.fire.price!)}
								</span>
							</button>
						)
					})}
				</div>
			) : null}

			{/* Side-by-side charts, full remaining height */}
			<div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
				<div className="flex min-h-0 flex-col">
					{payload5m ? (
						<RenkoPane
							label={`5m Renko — All ${days.length} days (${globalSeries.candles5m.length} bricks) — Trade #${clampedTradeIdx + 1}/${allTrades.length} on ${activeDayKey}`}
							series={payload5m.series}
							indicators={payload5m.indicators}
							extraMarkers={payload5m.markers}
							emitsCrosshair
							onCrosshairMove={setHovered5mIdx}
							focusBrickIdx={focusIdx5m}
							focusBrickRadius={40}
							className="h-full"
						/>
					) : (
						<div className="text-txt-300">No 5m data</div>
					)}
				</div>
				<div className="flex min-h-0 flex-col">
					{payload15m ? (
						<RenkoPane
							label={`15m Renko — All ${days.length} days (${globalSeries.candles15m.length} bricks)`}
							series={payload15m.series}
							indicators={payload15m.indicators}
							extraMarkers={payload15m.markers}
							externalCrosshair={hovered15mIdx}
							focusBrickIdx={focusIdx15m}
							focusBrickRadius={20}
							className="h-full"
						/>
					) : (
						<div className="text-txt-300">No 15m data</div>
					)}
				</div>
			</div>
		</div>
	)
}

interface LegendDotProps {
	readonly color: string
	readonly label: string
}

const LegendDot = ({ color, label }: LegendDotProps) => (
	<span className="inline-flex items-center gap-1">
		<span
			className="inline-block h-2 w-2 rounded-full"
			style={{ backgroundColor: color }}
		/>
		<span>{label}</span>
	</span>
)

export { FiboLab }
