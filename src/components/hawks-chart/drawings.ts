// Drawing primitives for the Hawks chart workspace and dev sandboxes.
//
// All drawings carry wall-clock timestamps (NOT brick indices). Each pane
// (5m / 15m / 60m) projects them onto its own brick-index axis via
// `projectDrawingsForPane`. This means a single user drawing renders
// consistently across all three timeframes — the natural fit for the
// "per user, per asset, global timeframe" persistence model.
//
// Supported drawing kinds:
//   - hline       horizontal price line (price-only, no time anchor)
//   - trendline   diagonal between two (time, price) points
//   - vline       vertical line at one wall-clock time (event marker)
//   - fibo        Fibonacci retracement between two (time, price) points
//   - position    long/short position simulator — entry, stop, target with
//                 live R-ratio + R$ value labels (mirrors Profit ProRT)

import type { UTCTimestamp } from "lightweight-charts"

type DrawingTool =
	| "cursor"
	| "hline"
	| "trendline"
	| "vline"
	| "fibo"
	| "position-long"
	| "position-short"

interface BaseDrawing {
	readonly id: string
	readonly color: string
	readonly label?: string
}

interface HLineDrawing extends BaseDrawing {
	readonly type: "hline"
	readonly price: number
}

interface TrendlineDrawing extends BaseDrawing {
	readonly type: "trendline"
	readonly startTimeMs: number
	readonly startPrice: number
	readonly endTimeMs: number
	readonly endPrice: number
}

interface VLineDrawing extends BaseDrawing {
	readonly type: "vline"
	readonly timeMs: number
}

interface FiboDrawing extends BaseDrawing {
	readonly type: "fibo"
	readonly startTimeMs: number
	readonly startPrice: number
	readonly endTimeMs: number
	readonly endPrice: number
	// Levels to render between start and end. Default = canonical fibo set;
	// kept overridable so a future "extended fibo" can use 1.272/1.414/1.618.
	readonly levels?: ReadonlyArray<number>
}

interface PositionDrawing extends BaseDrawing {
	readonly type: "position"
	readonly direction: "long" | "short"
	// Time window the position box spans (entry → simulated close). For a
	// "live" position the endTimeMs can equal startTimeMs + N bricks, or
	// `null` to extend to the right edge.
	readonly startTimeMs: number
	readonly endTimeMs: number
	readonly entryPrice: number
	readonly stopPrice: number
	readonly targetPrice: number
	// Position sizing — qty is in contracts. valuePerPoint resolves to the
	// asset's tick value; for WIN that's 0.20 R$ per point.
	readonly qty: number
	readonly valuePerPoint: number
}

type Drawing =
	HLineDrawing | TrendlineDrawing | VLineDrawing | FiboDrawing | PositionDrawing

// Per-pane projection. Each variant carries brick-index endpoints (not
// timestamps) so the chart renderer can hand the data straight to lightweight-
// charts series without further bookkeeping.
interface ProjectedTrendline {
	readonly id: string
	readonly startBrickIdx: number
	readonly startPrice: number
	readonly endBrickIdx: number
	readonly endPrice: number
	readonly color: string
}

interface ProjectedVLine {
	readonly id: string
	readonly brickIdx: number
	readonly color: string
	readonly label?: string
}

interface ProjectedFibo {
	readonly id: string
	readonly startBrickIdx: number
	readonly endBrickIdx: number
	readonly startPrice: number
	readonly endPrice: number
	readonly color: string
	readonly levels: ReadonlyArray<number>
}

interface ProjectedPosition {
	readonly id: string
	readonly direction: "long" | "short"
	readonly startBrickIdx: number
	readonly endBrickIdx: number
	readonly entryPrice: number
	readonly stopPrice: number
	readonly targetPrice: number
	readonly qty: number
	readonly valuePerPoint: number
	readonly color: string
}

interface ProjectedDrawings {
	readonly hlines: ReadonlyArray<HLineDrawing>
	readonly trendlines: ReadonlyArray<ProjectedTrendline>
	readonly vlines: ReadonlyArray<ProjectedVLine>
	readonly fibos: ReadonlyArray<ProjectedFibo>
	readonly positions: ReadonlyArray<ProjectedPosition>
}

const CANONICAL_FIBO_LEVELS: ReadonlyArray<number> = [
	0, 0.236, 0.382, 0.5, 0.618, 0.786, 1,
]

// Largest index whose times[i] <= target. Returns -1 if target precedes all
// bricks. Binary search; pane time arrays are guaranteed ascending.
const floorBrickIdx = (
	times: ReadonlyArray<number>,
	targetMs: number
): number => {
	let lo = 0
	let hi = times.length - 1
	let result = -1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (times[mid]! <= targetMs) {
			result = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return result
}

const projectDrawingsForPane = (
	drawings: ReadonlyArray<Drawing>,
	paneTimes: ReadonlyArray<number>
): ProjectedDrawings => {
	const hlines: HLineDrawing[] = []
	const trendlines: ProjectedTrendline[] = []
	const vlines: ProjectedVLine[] = []
	const fibos: ProjectedFibo[] = []
	const positions: ProjectedPosition[] = []
	const lastIdx = paneTimes.length - 1

	for (const d of drawings) {
		if (d.type === "hline") {
			hlines.push(d)
			continue
		}

		if (d.type === "vline") {
			const idx = floorBrickIdx(paneTimes, d.timeMs)
			if (idx < 0) {
				continue
			}
			vlines.push({ id: d.id, brickIdx: idx, color: d.color, label: d.label })
			continue
		}

		if (d.type === "trendline" || d.type === "fibo") {
			const startIdx = floorBrickIdx(paneTimes, d.startTimeMs)
			const endIdx = floorBrickIdx(paneTimes, d.endTimeMs)
			if (startIdx < 0 || endIdx < 0 || startIdx === endIdx) {
				// Lightweight-charts requires strictly-ascending `time` in
				// setData; collapsing the two endpoints to the same brick
				// would crash. Skip — pane window doesn't contain the spread.
				continue
			}
			const [lo, hi] =
				startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
			const [loPrice, hiPrice] =
				startIdx < endIdx
					? [d.startPrice, d.endPrice]
					: [d.endPrice, d.startPrice]
			if (d.type === "trendline") {
				trendlines.push({
					id: d.id,
					startBrickIdx: lo,
					startPrice: loPrice,
					endBrickIdx: hi,
					endPrice: hiPrice,
					color: d.color,
				})
			} else {
				fibos.push({
					id: d.id,
					startBrickIdx: lo,
					endBrickIdx: hi,
					startPrice: loPrice,
					endPrice: hiPrice,
					color: d.color,
					levels: d.levels ?? CANONICAL_FIBO_LEVELS,
				})
			}
			continue
		}

		if (d.type === "position") {
			const startIdx = floorBrickIdx(paneTimes, d.startTimeMs)
			let endIdx = floorBrickIdx(paneTimes, d.endTimeMs)
			if (startIdx < 0) {
				continue
			}
			// Clamp end to the pane's last brick when the position extends
			// past the visible window — keeps the box anchored to the right
			// edge instead of disappearing.
			if (endIdx < 0 || endIdx > lastIdx) {
				endIdx = lastIdx
			}
			if (endIdx <= startIdx) {
				endIdx = Math.min(lastIdx, startIdx + 1)
			}
			if (endIdx <= startIdx) {
				continue
			}
			positions.push({
				id: d.id,
				direction: d.direction,
				startBrickIdx: startIdx,
				endBrickIdx: endIdx,
				entryPrice: d.entryPrice,
				stopPrice: d.stopPrice,
				targetPrice: d.targetPrice,
				qty: d.qty,
				valuePerPoint: d.valuePerPoint,
				color: d.color,
			})
		}
	}

	return { hlines, trendlines, vlines, fibos, positions }
}

const makeId = (): string => {
	// Web-crypto is available in both the browser and Node 20+; the chart
	// workspace is "use client" so the browser branch always wins. The fallback
	// preserves backward compatibility with the legacy hawks-drawings module.
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID()
	}
	return Math.random().toString(36).slice(2, 10)
}

// Helper for the Fibo renderer — given start/end (low/high) prices and a
// 0..1 level, return the level's absolute price.
const fiboLevelPrice = (
	startPrice: number,
	endPrice: number,
	level: number
): number => startPrice + (endPrice - startPrice) * level

// Helper for the position drawing renderer — exposes the formatted R-ratio
// + R$ value so the renderer and the toolbar both display identical math.
interface PositionStats {
	readonly direction: "long" | "short"
	readonly entryPrice: number
	readonly stopPrice: number
	readonly targetPrice: number
	readonly stopPts: number
	readonly targetPts: number
	readonly stopValue: number
	readonly targetValue: number
	readonly riskRewardRatio: number
}

const computePositionStats = (p: {
	readonly direction: "long" | "short"
	readonly entryPrice: number
	readonly stopPrice: number
	readonly targetPrice: number
	readonly qty: number
	readonly valuePerPoint: number
}): PositionStats => {
	const stopPts = Math.abs(p.entryPrice - p.stopPrice)
	const targetPts = Math.abs(p.targetPrice - p.entryPrice)
	const stopValue = stopPts * p.qty * p.valuePerPoint
	const targetValue = targetPts * p.qty * p.valuePerPoint
	const riskRewardRatio = stopPts > 0 ? targetPts / stopPts : 0
	return {
		direction: p.direction,
		entryPrice: p.entryPrice,
		stopPrice: p.stopPrice,
		targetPrice: p.targetPrice,
		stopPts,
		targetPts,
		stopValue,
		targetValue,
		riskRewardRatio,
	}
}

// Convert a UTCTimestamp brick index back to its raw number — helper for
// callers that store endpoints in lightweight-charts coordinates.
const utcTimestampToIdx = (t: UTCTimestamp): number => t as number

export type {
	BaseDrawing,
	Drawing,
	DrawingTool,
	FiboDrawing,
	HLineDrawing,
	PositionDrawing,
	PositionStats,
	ProjectedDrawings,
	ProjectedFibo,
	ProjectedPosition,
	ProjectedTrendline,
	ProjectedVLine,
	TrendlineDrawing,
	VLineDrawing,
}
export {
	CANONICAL_FIBO_LEVELS,
	computePositionStats,
	fiboLevelPrice,
	floorBrickIdx,
	makeId,
	projectDrawingsForPane,
	utcTimestampToIdx,
}
