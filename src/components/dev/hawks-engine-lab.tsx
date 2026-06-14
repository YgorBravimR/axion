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
		const indicators = [
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
		// FIRE markers: render as proper arrow markers (the same visual
		// language as /backtest and /hawks-isolation). LONG = arrowUp below
		// bar (green), SHORT = arrowDown above bar (red). Per-day brickIdx
		// shifted by the day's offset = global chart x-axis position.
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
			}
		}
		return {
			series,
			indicators,
			extraMarkers: fireMarkers,
			allBricks,
			totalDays: data.days.length,
			totalBricks: allCandles.length,
			totalFires: fireMarkers.length,
		}
	}, [data])

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
	const timePart = brick.timestamp.slice(11, 16) // HH:MM UTC
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
