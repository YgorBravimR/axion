"use client"

// i18n-exempt: developer debug tool (src/components/dev/**) — English strings
// are intentional. Future /scan passes should skip dev-only components.

import { useMemo, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import type { SeriesMarker, UTCTimestamp } from "lightweight-charts"
import { loadHawksEngineLabData } from "@/app/actions/hawks-engine-lab-data"
import type {
	HawksEngineLabData,
	EngineLabBrick,
	EngineLabDayPayload,
} from "@/app/actions/hawks-engine-lab-data.types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { RenkoPane } from "@/components/backtest/inspector/renko-pane"
import { candlesToBrickSeriesNative } from "@/lib/renko/bricks-to-chart"

// Indicator overlay colors — match the canonical Hawks palette used in
// /dev/hawks-isolation (see src/components/dev/hawks-isolation-charts.tsx
// lines 411-414, 453). 60m EMAs = orange (the gate, the important color);
// 15m EMAs = gray (booster, subtle); VWAP daily = teal-bright.
const COLOR_EMA_FAST_60M = "rgb(255, 165, 60)" // ORANGE_BRIGHT — 60m EMA 27 (gate fast)
const COLOR_EMA_SLOW_60M = "rgb(210, 130, 40)" // ORANGE_MUTED — 60m EMA 55 (gate slow)
const COLOR_EMA_FAST_15M = "rgb(190, 195, 205)" // GRAY_LIGHT — 15m EMA 27 (booster fast)
const COLOR_EMA_SLOW_15M = "rgb(130, 135, 145)" // GRAY_DARK — 15m EMA 55 (booster slow)
const COLOR_VWAP_D = "rgb(94, 234, 212)" // TEAL_BRIGHT — VWAP daily
const COLOR_FIRE_LONG = "rgb(52, 211, 153)" // green — LONG fire marker
const COLOR_FIRE_SHORT = "rgb(248, 113, 113)" // red — SHORT fire marker
// Exit-marker palette (Phase B). Distinguishes the four exit reasons
// at a glance during catalog scrubbing.
const COLOR_EXIT_TARGET = "rgb(132, 204, 22)" // lime — target hit (full win)
const COLOR_EXIT_BE = "rgb(250, 204, 21)" // amber — BE stop hit (zero P&L)
const COLOR_EXIT_STOP_INITIAL = "rgb(225, 29, 72)" // rose — initial stop (full loss)
const COLOR_EXIT_EOD = "rgb(148, 163, 184)" // slate — EOD forced close
// Phase D — trail-after-3R event palette.
const COLOR_TRAIL_ACTIVE = "rgb(168, 85, 247)" // purple — trail just activated
const COLOR_EXIT_TRAIL = "rgb(34, 197, 94)" // emerald — trail stop hit (locked profit)
// Phase E — fibo measured-move overlay palette.
const COLOR_FIB_T1 = "rgb(56, 189, 248)" // sky — T1 (76.4%)
const COLOR_FIB_T2 = "rgb(14, 165, 233)" // sky-darker — T2 (100%)
const COLOR_FIB_T3 = "rgb(2, 132, 199)" // sky-deepest — T3 (161.8%)
const COLOR_FIB_ANCHOR = "rgb(248, 250, 252)" // slate-light — retracement-peak dashed anchor

const overlayFromKey = (
	candles: EngineLabDayPayload["candles"],
	key: string,
	label: string,
	color: string
) => {
	const data: Array<{ time: UTCTimestamp; value: number }> = []
	for (let i = 0; i < candles.length; i++) {
		const v = candles[i]!.indicators[key]
		if (typeof v === "number") {
			data.push({ time: i as UTCTimestamp, value: v })
		}
	}
	return { key, label, color, data } as const
}

interface HawksEngineLabProps {
	readonly initialData: HawksEngineLabData
	readonly initialFrom: string
	readonly initialTo: string
}

type FilterMode = "all" | "fires" | "gate-open" | "blocked"
const FILTERS: ReadonlyArray<FilterMode> = [
	"all",
	"fires",
	"gate-open",
	"blocked",
]

const HawksEngineLab = ({
	initialData,
	initialFrom,
	initialTo,
}: HawksEngineLabProps) => {
	const [data, setData] = useState<HawksEngineLabData>(initialData)
	const [from, setFrom] = useState(initialFrom)
	const [to, setTo] = useState(initialTo)
	const [activeDayKey, setActiveDayKey] = useState<string | null>(
		initialData.days[0]?.dayKey ?? null
	)
	const [filter, setFilter] = useState<FilterMode>("all")
	const [hoveredGlobalIdx, setHoveredGlobalIdx] = useState<number | null>(null)
	type ExitModeUi =
		| "conservative"
		| "moderate"
		| "fibo_T1"
		| "fibo_T2"
		| "fibo_T3"
		| "fibo_T1_trail"
		| "fibo_T2_trail"
		| "fibo_T3_trail"
	const [exitMode, setExitMode] = useState<ExitModeUi>("conservative")
	// Fibo sub-controls — surfaced when exitMode starts with "fibo".
	const [fiboTier, setFiboTier] = useState<"T1" | "T2" | "T3">("T2")
	const [fiboTrail, setFiboTrail] = useState<boolean>(false)
	const [pending, startTransition] = useTransition()

	const activeDay = useMemo(
		() => data.days.find((d) => d.dayKey === activeDayKey) ?? null,
		[data, activeDayKey]
	)

	// Chart series + overlays for the FULL loaded window. The chart shows
	// every day concatenated on a single brick-index axis (works because
	// lightweight-charts uses brick-index, not wall-clock time, here).
	// The day sidebar + table still operate per-day; the chart is global.
	const chartPayload = useMemo(() => {
		if (data.days.length === 0) {
			return null
		}
		// Flatten candles AND bricks across days while building a per-day
		// brickIdx offset map. The flat brick array is the cursor lookup
		// table — `allBricks[hoveredGlobalIdx]` gives the per-brick state
		// (gate, MACD sign, VWAP side, pivot bias) at the crosshair.
		const allCandles: EngineLabDayPayload["candles"] = []
		const allBricks: EngineLabDayPayload["bricks"] = []
		const dayOffsets: Array<{ dayKey: string; offset: number }> = []
		for (const d of data.days) {
			dayOffsets.push({ dayKey: d.dayKey, offset: allCandles.length })
			for (const c of d.candles) {
				allCandles.push(c)
			}
			for (const b of d.bricks) {
				allBricks.push(b)
			}
		}
		const series = candlesToBrickSeriesNative(allCandles)
		const indicators: Array<{
			key: string
			label: string
			color: string
			data: Array<{ time: UTCTimestamp; value: number }>
		}> = [
			overlayFromKey(
				allCandles,
				"mme27_60m",
				"60m EMA 27 (gate fast)",
				COLOR_EMA_FAST_60M
			),
			overlayFromKey(
				allCandles,
				"mme55_60m",
				"60m EMA 55 (gate slow)",
				COLOR_EMA_SLOW_60M
			),
			overlayFromKey(
				allCandles,
				"mme27_15m",
				"15m EMA 27 (booster fast)",
				COLOR_EMA_FAST_15M
			),
			overlayFromKey(
				allCandles,
				"mme55_15m",
				"15m EMA 55 (booster slow)",
				COLOR_EMA_SLOW_15M
			),
			overlayFromKey(allCandles, "vwap_d", "VWAP daily", COLOR_VWAP_D),
		]
		// Phase E — fibo overlay. For each fire that has `fiboAnchors`, draw
		// 3 horizontal segments at T1/T2/T3 prices + 1 dashed retracement-peak
		// anchor, each spanning fire→exit brick of the ACTIVE fibo lifecycle.
		// We only render this when the lab is in a fibo mode so we don't
		// litter the chart in Conservative/Moderate views.
		//
		// Scope: ACTIVE DAY only. Drawing every fire's fib lines across the
		// full window would (a) tank perf with N indicator series per fire
		// and (b) collide on time-axis dedup when fires overlap. Active day
		// = at most ~15 fires, no overlap chaos.
		const activeDayIdx = data.days.findIndex((d) => d.dayKey === activeDayKey)
		if (exitMode.startsWith("fibo") && activeDayIdx >= 0) {
			const pickLifecycle = (b: EngineLabBrick) =>
				exitMode === "fibo_T1"
					? b.lifecycleFiboT1
					: exitMode === "fibo_T2"
						? b.lifecycleFiboT2
						: exitMode === "fibo_T3"
							? b.lifecycleFiboT3
							: exitMode === "fibo_T1_trail"
								? b.lifecycleFiboT1Trail
								: exitMode === "fibo_T2_trail"
									? b.lifecycleFiboT2Trail
									: b.lifecycleFiboT3Trail
			const t1Data: Array<{ time: UTCTimestamp; value: number }> = []
			const t2Data: Array<{ time: UTCTimestamp; value: number }> = []
			const t3Data: Array<{ time: UTCTimestamp; value: number }> = []
			const anchorData: Array<{ time: UTCTimestamp; value: number }> = []
			const day = data.days[activeDayIdx]!
			const offset = dayOffsets[activeDayIdx]!.offset
			for (const b of day.bricks) {
				if (!b.fired || !b.fiboAnchors) {
					continue
				}
				const lc = pickLifecycle(b)
				const exitIdx = lc?.exitBrickIndexInDay ?? b.brickIndexInDay
				const startTime = (offset + b.brickIndexInDay) as UTCTimestamp
				const endTime = (offset + exitIdx) as UTCTimestamp
				t1Data.push({ time: startTime, value: b.fiboAnchors.t1 })
				t1Data.push({ time: endTime, value: b.fiboAnchors.t1 })
				t2Data.push({ time: startTime, value: b.fiboAnchors.t2 })
				t2Data.push({ time: endTime, value: b.fiboAnchors.t2 })
				t3Data.push({ time: startTime, value: b.fiboAnchors.t3 })
				t3Data.push({ time: endTime, value: b.fiboAnchors.t3 })
				anchorData.push({
					time: startTime,
					value: b.fiboAnchors.retracementPeak,
				})
				anchorData.push({
					time: endTime,
					value: b.fiboAnchors.retracementPeak,
				})
			}
			// lightweight-charts requires per-series data to be asc-sorted
			// by time and unique. Overlapping fires can push out-of-order
			// pairs (entry of fire 2 lands BEFORE exit of fire 1 when fire 1
			// rides to EOD). Sort + de-dup-by-time (last write wins) per
			// overlay before handing off.
			const sortDedup = (
				rows: Array<{ time: UTCTimestamp; value: number }>
			): Array<{ time: UTCTimestamp; value: number }> => {
				const sorted = [...rows].sort(
					(a, b) => (a.time as number) - (b.time as number)
				)
				const out: Array<{ time: UTCTimestamp; value: number }> = []
				for (const r of sorted) {
					const last = out[out.length - 1]
					if (last && last.time === r.time) {
						last.value = r.value
					} else {
						out.push({ time: r.time, value: r.value })
					}
				}
				return out
			}
			if (t1Data.length > 0) {
				indicators.push({
					key: "fib-t1",
					label: "Fib T1 (76.4%)",
					color: COLOR_FIB_T1,
					data: sortDedup(t1Data),
				})
				indicators.push({
					key: "fib-t2",
					label: "Fib T2 (100%)",
					color: COLOR_FIB_T2,
					data: sortDedup(t2Data),
				})
				indicators.push({
					key: "fib-t3",
					label: "Fib T3 (161.8%)",
					color: COLOR_FIB_T3,
					data: sortDedup(t3Data),
				})
				indicators.push({
					key: "fib-anchor",
					label: "Retracement peak",
					color: COLOR_FIB_ANCHOR,
					data: sortDedup(anchorData),
				})
			}
		}
		// FIRE markers: render as proper arrow markers (the same visual
		// language as /backtest and /hawks-isolation). LONG = arrowUp below
		// bar (green), SHORT = arrowDown above bar (red). Per-day brickIdx
		// shifted by the day's offset = global chart x-axis position.
		//
		// Phase B also overlays the trade lifecycle: a "BE" circle marker
		// where breakeven triggered (stop moved to entry), and an exit
		// marker (square) at the closing brick, color-coded by exit reason.
		const fireMarkers: SeriesMarker<UTCTimestamp>[] = []
		for (let di = 0; di < data.days.length; di++) {
			const day = data.days[di]!
			const offset = dayOffsets[di]!.offset
			for (const b of day.bricks) {
				if (!b.fired || b.price === null || b.direction === null) {
					continue
				}
				const isLong = b.direction === "long"
				fireMarkers.push({
					time: (offset + b.brickIndexInDay) as UTCTimestamp,
					position: isLong ? "belowBar" : "aboveBar",
					color: isLong ? COLOR_FIRE_LONG : COLOR_FIRE_SHORT,
					shape: isLong ? "arrowUp" : "arrowDown",
					text: `${b.direction.toUpperCase()} ${b.tier ?? ""}`.trim(),
				})
				const lifecycle =
					exitMode === "conservative"
						? b.lifecycleConservative
						: exitMode === "moderate"
							? b.lifecycleModerate
							: exitMode === "fibo_T1"
								? b.lifecycleFiboT1
								: exitMode === "fibo_T2"
									? b.lifecycleFiboT2
									: exitMode === "fibo_T3"
										? b.lifecycleFiboT3
										: exitMode === "fibo_T1_trail"
											? b.lifecycleFiboT1Trail
											: exitMode === "fibo_T2_trail"
												? b.lifecycleFiboT2Trail
												: b.lifecycleFiboT3Trail
				if (lifecycle) {
					if (lifecycle.beTriggered && lifecycle.beBrickIndexInDay !== null) {
						fireMarkers.push({
							time: (offset + lifecycle.beBrickIndexInDay) as UTCTimestamp,
							position: isLong ? "belowBar" : "aboveBar",
							color: isLong ? COLOR_FIRE_LONG : COLOR_FIRE_SHORT,
							shape: "circle",
							text: "BE",
						})
					}
					if (
						lifecycle.trailActivated &&
						lifecycle.trailActivationBrickIndexInDay !== null
					) {
						fireMarkers.push({
							time: (offset +
								lifecycle.trailActivationBrickIndexInDay) as UTCTimestamp,
							position: isLong ? "belowBar" : "aboveBar",
							color: COLOR_TRAIL_ACTIVE,
							shape: "circle",
							text: "TRAIL",
						})
					}
					const exitColor =
						lifecycle.exitReason === "target"
							? COLOR_EXIT_TARGET
							: lifecycle.exitReason === "stop_be"
								? COLOR_EXIT_BE
								: lifecycle.exitReason === "stop_trail"
									? COLOR_EXIT_TRAIL
									: lifecycle.exitReason === "eod"
										? COLOR_EXIT_EOD
										: COLOR_EXIT_STOP_INITIAL
					fireMarkers.push({
						time: (offset + lifecycle.exitBrickIndexInDay) as UTCTimestamp,
						position: isLong ? "belowBar" : "aboveBar",
						color: exitColor,
						shape: "square",
						text: lifecycle.exitReason.toUpperCase().replace("_", " "),
					})
				}
			}
		}
		// Count ACTUAL fires (entries) — fireMarkers also contains BE + EXIT
		// lifecycle markers, so fireMarkers.length overcounts ~3× per fire.
		const totalFires = data.days.reduce(
			(acc, d) => acc + d.bricks.filter((b) => b.fired).length,
			0
		)
		return {
			series,
			indicators,
			extraMarkers: fireMarkers,
			allBricks,
			totalDays: data.days.length,
			totalBricks: allCandles.length,
			totalFires,
		}
	}, [data, exitMode, activeDayKey])

	// Brick under the crosshair (or last brick when no hover). Drives the
	// per-group badge row below.
	const cursorBrick = useMemo(() => {
		if (!chartPayload || chartPayload.allBricks.length === 0) {
			return null
		}
		const lastIdx = chartPayload.allBricks.length - 1
		const idx =
			hoveredGlobalIdx !== null
				? Math.max(0, Math.min(hoveredGlobalIdx, lastIdx))
				: lastIdx
		return chartPayload.allBricks[idx] ?? null
	}, [chartPayload, hoveredGlobalIdx])

	const filteredBricks = useMemo(() => {
		if (!activeDay) {
			return []
		}
		switch (filter) {
			case "fires":
				return activeDay.bricks.filter((b) => b.fired)
			case "gate-open":
				return activeDay.bricks.filter(
					(b) =>
						b.directionAllowed !== null &&
						b.inTradingWindow &&
						!b.cooldownActive
				)
			case "blocked":
				return activeDay.bricks.filter(
					(b) =>
						b.directionAllowed === null ||
						!b.inTradingWindow ||
						b.cooldownActive
				)
			case "all":
			default:
				return activeDay.bricks
		}
	}, [activeDay, filter])

	const handleReload = () => {
		startTransition(async () => {
			const next = await loadHawksEngineLabData(from, to)
			setData(next)
			setActiveDayKey(next.days[0]?.dayKey ?? null)
		})
	}

	return (
		<div className="space-y-m-500">
			<header className="space-y-s-300">
				<h1 className="text-h1 text-txt-100 font-semibold">
					Hawks engine lab (v0.9)
				</h1>
				<p className="text-small text-txt-300 max-w-prose">
					Per-brick trace of the v0.9 playbook orchestrator. Each row shows the
					60m gate state, the trading-window guard, the cooldown, and whether
					any playbook fired. With the current stubs all three playbooks return
					null — the columns that move are the gate, the cooldown, and the
					direction allowed.
				</p>
			</header>

			<section className="bg-bg-200 border-bg-300 space-y-s-300 rounded-md border p-4">
				<div className="gap-s-300 flex flex-wrap items-end">
					<label htmlFor="lab-from" className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">From (BRT)</span>
						<Input
							id="lab-from"
							type="date"
							value={from}
							onChange={(e) => setFrom(e.target.value)}
							className="w-40"
						/>
					</label>
					<label htmlFor="lab-to" className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">To (BRT)</span>
						<Input
							id="lab-to"
							type="date"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							className="w-40"
						/>
					</label>
					<Button
						id="lab-reload"
						type="button"
						onClick={handleReload}
						disabled={pending}
					>
						{pending && <Loader2 className="mr-s-200 h-4 w-4 animate-spin" />}
						Reload
					</Button>
					<div className="space-y-s-100 flex flex-col">
						<span className="text-tiny text-txt-300">Exit mode</span>
						<div className="gap-s-100 flex">
							<Button
								id="lab-mode-conservative"
								type="button"
								variant={exitMode === "conservative" ? "default" : "outline"}
								size="sm"
								onClick={() => setExitMode("conservative")}
							>
								Conservative
							</Button>
							<Button
								id="lab-mode-moderate"
								type="button"
								variant={exitMode === "moderate" ? "default" : "outline"}
								size="sm"
								onClick={() => setExitMode("moderate")}
							>
								Moderate
							</Button>
							<Button
								id="lab-mode-fibo"
								type="button"
								variant={exitMode.startsWith("fibo") ? "default" : "outline"}
								size="sm"
								onClick={() => {
									setExitMode(
										fiboTrail
											? (`fibo_${fiboTier}_trail` as ExitModeUi)
											: (`fibo_${fiboTier}` as ExitModeUi)
									)
								}}
							>
								Fibo
							</Button>
						</div>
						{exitMode.startsWith("fibo") && (
							<div className="gap-s-100 mt-s-100 flex items-center">
								<div className="gap-s-100 flex">
									{(["T1", "T2", "T3"] as const).map((tier) => (
										<Button
											key={tier}
											id={`lab-mode-fibo-${tier}`}
											type="button"
											variant={fiboTier === tier ? "default" : "outline"}
											size="sm"
											onClick={() => {
												setFiboTier(tier)
												setExitMode(
													fiboTrail
														? (`fibo_${tier}_trail` as ExitModeUi)
														: (`fibo_${tier}` as ExitModeUi)
												)
											}}
										>
											{tier}
										</Button>
									))}
								</div>
								<label
									htmlFor="lab-mode-fibo-trail"
									className="gap-s-100 text-tiny text-txt-300 ml-s-200 flex items-center"
								>
									<Checkbox
										id="lab-mode-fibo-trail"
										checked={fiboTrail}
										onCheckedChange={(v) => {
											const next = v === true
											setFiboTrail(next)
											setExitMode(
												next
													? (`fibo_${fiboTier}_trail` as ExitModeUi)
													: (`fibo_${fiboTier}` as ExitModeUi)
											)
										}}
									/>
									+ trail-after-3R
								</label>
							</div>
						)}
					</div>
				</div>

				<div className="gap-s-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
					<StatTile label="Days" value={data.stats.totalDays} />
					<StatTile label="Bricks" value={data.stats.totalBricks} />
					<StatTile
						label="Fires"
						value={data.stats.totalFires}
						tone="success"
					/>
					<StatTile
						label="60m BULL"
						value={data.stats.bricksGateBull}
						tone="success"
					/>
					<StatTile
						label="60m BEAR"
						value={data.stats.bricksGateBear}
						tone="destructive"
					/>
					<StatTile
						label="60m NO_SIGNAL"
						value={data.stats.bricksGateNoSignal}
						tone="warning"
					/>
				</div>
			</section>

			<section className="gap-m-400 grid grid-cols-1 lg:grid-cols-[200px_1fr]">
				<aside className="bg-bg-200 border-bg-300 space-y-s-100 max-h-[600px] overflow-y-auto rounded-md border p-3">
					<h2 className="text-small text-txt-100 mb-s-200 font-semibold">
						Days
					</h2>
					{data.days.length === 0 ? (
						<p className="text-tiny text-txt-300">No data</p>
					) : (
						data.days.map((d) => {
							const fires = d.bricks.filter((b) => b.fired).length
							const isActive = d.dayKey === activeDayKey
							return (
								<button
									key={d.dayKey}
									type="button"
									onClick={() => setActiveDayKey(d.dayKey)}
									className={`px-s-200 py-s-100 text-small w-full rounded-sm text-left transition-colors ${
										isActive
											? "bg-primary text-primary-foreground"
											: "hover:bg-bg-300 text-txt-100"
									}`}
								>
									<div className="flex items-center justify-between">
										<span className="font-mono">{d.dayKey}</span>
										{fires > 0 && (
											<span
												className={`text-tiny font-semibold ${
													isActive
														? "text-primary-foreground"
														: "text-fb-success"
												}`}
											>
												{fires}
											</span>
										)}
									</div>
								</button>
							)
						})
					)}
				</aside>

				<div className="bg-bg-200 border-bg-300 space-y-s-300 rounded-md border p-3">
					{chartPayload && (
						<div className="space-y-s-200">
							<div className="text-tiny text-txt-300 gap-s-300 flex flex-wrap items-center">
								<LegendDot color={COLOR_EMA_FAST_60M} label="60m EMA27" />
								<LegendDot color={COLOR_EMA_SLOW_60M} label="60m EMA55" />
								<LegendDot color={COLOR_EMA_FAST_15M} label="15m EMA27" />
								<LegendDot color={COLOR_EMA_SLOW_15M} label="15m EMA55" />
								<LegendDot color={COLOR_VWAP_D} label="VWAP D" />
								<LegendDot color={COLOR_FIRE_LONG} label="LONG fire" />
								<LegendDot color={COLOR_FIRE_SHORT} label="SHORT fire" />
							</div>
							<RenkoPane
								label={`${data.from} → ${data.to} — 5m Renko (${chartPayload.totalDays} days, ${chartPayload.totalBricks.toLocaleString()} bricks, ${chartPayload.totalFires} fires)`}
								subLabel="60m EMAs = gate, 15m EMAs = booster, VWAP = vwap_rejection ref. Arrow markers = engine fires. Hover the chart to inspect per-brick signals below."
								series={chartPayload.series}
								indicators={chartPayload.indicators}
								extraMarkers={chartPayload.extraMarkers}
								emitsCrosshair
								onCrosshairMove={setHoveredGlobalIdx}
								className="h-[480px]"
							/>
							{cursorBrick && (
								<SignalsAtCursor
									brick={cursorBrick}
									hovering={hoveredGlobalIdx !== null}
								/>
							)}
						</div>
					)}

					<div className="gap-s-200 flex flex-wrap items-center justify-between">
						<h2 className="text-small text-txt-100 font-semibold">
							{activeDay ? activeDay.dayKey : "Pick a day"}
							{activeDay && (
								<span className="text-tiny text-txt-300 ml-s-200 font-normal">
									{filteredBricks.length} / {activeDay.bricks.length} bricks
								</span>
							)}
						</h2>
						<div className="gap-s-100 flex">
							{FILTERS.map((m) => (
								<Button
									key={m}
									id={`lab-filter-${m}`}
									type="button"
									size="sm"
									variant={filter === m ? "default" : "outline"}
									onClick={() => setFilter(m)}
								>
									{m}
								</Button>
							))}
						</div>
					</div>

					{activeDay ? (
						<div className="border-bg-300 overflow-x-auto rounded-sm border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">#</TableHead>
										<TableHead>Time</TableHead>
										<TableHead className="text-right">Close</TableHead>
										<TableHead>60m</TableHead>
										<TableHead>15m</TableHead>
										<TableHead>Allowed</TableHead>
										<TableHead>Win</TableHead>
										<TableHead>CD</TableHead>
										<TableHead>Fired</TableHead>
										<TableHead>Tier</TableHead>
										<TableHead>Label</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredBricks.map((b) => (
										<BrickRow key={b.brickIndexInDay} brick={b} />
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<p className="text-tiny text-txt-300">Pick a day in the sidebar.</p>
					)}
				</div>
			</section>
		</div>
	)
}

interface BrickRowProps {
	readonly brick: EngineLabBrick
}

const BrickRow = ({ brick }: BrickRowProps) => {
	// Show HH:MM:SS instead of HH:MM. Renko bricks close on tick events,
	// not minute boundaries — many bricks can close within the same
	// minute. Showing seconds makes adjacent rows distinguishable for
	// debugging.
	const timePart = brick.timestamp.slice(11, 19) // HH:MM:SS UTC
	const blocked =
		brick.directionAllowed === null ||
		!brick.inTradingWindow ||
		brick.cooldownActive
	return (
		<TableRow
			className={brick.fired ? "bg-fb-success/10" : blocked ? "opacity-60" : ""}
		>
			<TableCell className="text-tiny font-mono">
				{brick.brickIndexInDay}
			</TableCell>
			<TableCell className="text-tiny font-mono">{timePart}</TableCell>
			<TableCell className="text-tiny text-right font-mono">
				{brick.close.toFixed(0)}
			</TableCell>
			<TableCell>
				<GateBadge state={brick.gate60m} />
			</TableCell>
			<TableCell>
				<GateBadge state={brick.gate15m} muted />
			</TableCell>
			<TableCell className="text-tiny font-mono">
				{brick.directionAllowed ?? "—"}
			</TableCell>
			<TableCell className="text-tiny">
				{brick.inTradingWindow ? "✓" : "—"}
			</TableCell>
			<TableCell className="text-tiny">
				{brick.cooldownActive ? "CD" : "—"}
			</TableCell>
			<TableCell className="font-semibold">
				{brick.fired ? (
					<span className="text-fb-success">FIRE</span>
				) : (
					<span className="text-txt-300">—</span>
				)}
			</TableCell>
			<TableCell className="text-tiny font-mono">{brick.tier ?? "—"}</TableCell>
			<TableCell className="text-tiny max-w-[280px] truncate">
				{brick.label ?? "—"}
			</TableCell>
		</TableRow>
	)
}

interface GateBadgeProps {
	readonly state: "BULL" | "BEAR" | "NO_SIGNAL"
	readonly muted?: boolean
}

const GateBadge = ({ state, muted = false }: GateBadgeProps) => {
	const cls =
		state === "BULL"
			? "text-fb-success"
			: state === "BEAR"
				? "text-destructive"
				: "text-txt-300"
	return (
		<span className={`text-tiny font-mono ${cls} ${muted ? "opacity-70" : ""}`}>
			{state}
		</span>
	)
}

interface StatTileProps {
	readonly label: string
	readonly value: number
	readonly tone?: "success" | "destructive" | "warning"
}

const StatTile = ({ label, value, tone }: StatTileProps) => {
	const cls =
		tone === "success"
			? "text-fb-success"
			: tone === "destructive"
				? "text-destructive"
				: tone === "warning"
					? "text-warning"
					: "text-txt-100"
	return (
		<div className="bg-bg-100 border-bg-300 rounded-sm border p-2">
			<div className="text-tiny text-txt-300 tracking-wide uppercase">
				{label}
			</div>
			<div className={`text-h3 font-mono font-semibold ${cls}`}>
				{value.toLocaleString()}
			</div>
		</div>
	)
}

interface LegendDotProps {
	readonly color: string
	readonly label: string
}

const LegendDot = ({ color, label }: LegendDotProps) => (
	<span className="gap-s-100 inline-flex items-center">
		<span
			className="inline-block h-2 w-2 rounded-full"
			style={{ backgroundColor: color }}
		/>
		<span>{label}</span>
	</span>
)

interface SignalsAtCursorProps {
	readonly brick: EngineLabBrick
	readonly hovering: boolean
}

const SignalsAtCursor = ({ brick, hovering }: SignalsAtCursorProps) => {
	const timePart = brick.timestamp.slice(0, 16).replace("T", " ")
	return (
		<div className="bg-bg-100 border-bg-300 space-y-s-200 rounded-sm border p-3">
			<div className="text-tiny text-txt-300 gap-s-200 flex flex-wrap items-center">
				<span className="font-semibold tracking-wide uppercase">
					Signals at cursor
				</span>
				<span className="font-mono">
					{hovering ? "" : "(last brick — hover the chart to scrub)"}
				</span>
				<span className="text-txt-100 font-mono">{timePart} UTC</span>
				<span className="font-mono">close {brick.close.toFixed(0)}</span>
			</div>
			<div className="gap-s-200 flex flex-wrap items-center">
				<SignalBadge
					label="60m"
					value={brick.gate60m}
					tone={
						brick.gate60m === "BULL"
							? "success"
							: brick.gate60m === "BEAR"
								? "destructive"
								: "muted"
					}
					emphasis
				/>
				<SignalBadge
					label="15m"
					value={brick.gate15m}
					tone={
						brick.gate15m === "BULL"
							? "success"
							: brick.gate15m === "BEAR"
								? "destructive"
								: "muted"
					}
				/>
				<SignalBadge
					label="MACD 5m"
					value={brick.macdSign ?? "—"}
					tone={
						brick.macdSign === "positive"
							? "success"
							: brick.macdSign === "negative"
								? "destructive"
								: "muted"
					}
				/>
				<SignalBadge
					label="EMA 5m"
					value={brick.ema5mSlope ?? "—"}
					tone={
						brick.ema5mSlope === "up"
							? "success"
							: brick.ema5mSlope === "down"
								? "destructive"
								: "muted"
					}
				/>
				<SignalBadge
					label="VWAP D"
					value={brick.vwapSide ?? "—"}
					tone={
						brick.vwapSide === "above"
							? "success"
							: brick.vwapSide === "below"
								? "destructive"
								: "muted"
					}
				/>
				<SignalBadge
					label="Pivot"
					value={brick.pivotBias ?? "—"}
					tone={
						brick.pivotBias === "fundo"
							? "success"
							: brick.pivotBias === "topo"
								? "destructive"
								: "muted"
					}
				/>
				<SignalBadge
					label="15m topo"
					value={
						brick.lastTopo15m !== null
							? brick.lastTopo15m.toLocaleString()
							: "—"
					}
					tone="destructive"
				/>
				<SignalBadge
					label="15m fundo"
					value={
						brick.lastFundo15m !== null
							? brick.lastFundo15m.toLocaleString()
							: "—"
					}
					tone="success"
				/>
				<SignalBadge
					label="Allowed"
					value={brick.directionAllowed ?? "—"}
					tone={
						brick.directionAllowed === "long"
							? "success"
							: brick.directionAllowed === "short"
								? "destructive"
								: "muted"
					}
					emphasis
				/>
				<SignalBadge
					label="In window"
					value={brick.inTradingWindow ? "yes" : "no"}
					tone={brick.inTradingWindow ? "success" : "muted"}
				/>
				<SignalBadge
					label="Cooldown"
					value={brick.cooldownActive ? "ACTIVE" : "—"}
					tone={brick.cooldownActive ? "warning" : "muted"}
				/>
				{brick.fired && (
					<SignalBadge
						label="Fire"
						value={`${brick.direction?.toUpperCase() ?? "?"} ${brick.tier ?? ""}`.trim()}
						tone={brick.direction === "long" ? "success" : "destructive"}
						emphasis
					/>
				)}
			</div>
		</div>
	)
}

type SignalTone = "success" | "destructive" | "warning" | "muted"

interface SignalBadgeProps {
	readonly label: string
	readonly value: string
	readonly tone: SignalTone
	readonly emphasis?: boolean
}

const SignalBadge = ({
	label,
	value,
	tone,
	emphasis = false,
}: SignalBadgeProps) => {
	const valueCls =
		tone === "success"
			? "text-fb-success"
			: tone === "destructive"
				? "text-destructive"
				: tone === "warning"
					? "text-warning"
					: "text-txt-300"
	return (
		<div
			className={`bg-bg-200 border-bg-300 px-s-200 py-s-100 rounded-sm border ${
				emphasis ? "border-bg-400" : ""
			}`}
		>
			<div className="text-tiny text-txt-300 tracking-wide uppercase">
				{label}
			</div>
			<div className={`text-small font-mono font-semibold ${valueCls}`}>
				{value}
			</div>
		</div>
	)
}

export { HawksEngineLab }
