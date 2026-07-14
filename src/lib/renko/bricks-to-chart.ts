import type { CandlestickData, UTCTimestamp } from "lightweight-charts"
import type { RenkoBrick } from "./brick-generator"

// Minimal shape needed to render DB rows as bricks. Both `InspectorCandleRow`
// (typed in src/types/inspector.ts) and the overview-window rows satisfy this.
interface CandleRowLike {
	readonly timestamp: string | Date
	readonly open: number
	readonly high: number
	readonly low: number
	readonly close: number
}

interface BrickChartSeries {
	readonly data: CandlestickData<UTCTimestamp>[]
	readonly times: number[]
}

/**
 * Convert a Renko brick stream into the candlestick-series shape Lightweight
 * Charts expects. Each brick becomes a synthetic OHLC where the body fills
 * the full brick range and the wicks collapse to zero (`high = max(open,
 * close)`, `low = min(open, close)`). The chart's `time` axis is the brick
 * index, not the brick close timestamp — that lets us render a non-uniform
 * Renko stream as if it were uniformly-spaced bars while still preserving
 * the chronological order. The parallel `times[]` array maps each index
 * back to the brick's `closeTimestamp` epoch so cross-TF sync can compute
 * containing-brick relationships.
 */
const bricksToCandleSeries = (
	bricks: readonly RenkoBrick[]
): BrickChartSeries => {
	const data: CandlestickData<UTCTimestamp>[] = []
	const times: number[] = []
	for (let i = 0; i < bricks.length; i++) {
		const b = bricks[i]!
		const high = Math.max(b.open, b.close)
		const low = Math.min(b.open, b.close)
		data.push({
			time: i as UTCTimestamp,
			open: b.open,
			high,
			low,
			close: b.close,
		})
		times.push(b.closeTimestamp.getTime())
	}
	return { data, times }
}

/**
 * DB rows in `price_candles` ARE Renko bricks already (the loader persists
 * one row per ProfitChart-painted brick with real intra-brick O/H/L/C). When
 * we want to render those rows on a chart, do NOT pipe them through
 * `generateRenkoBricks` + `bricksToCandleSeries` — that synthesizer collapses
 * the high/low to `max(open,close)` / `min(open,close)` (wickless bricks) and
 * may produce a different brick count if `sizeR` ≠ the brick size on disk.
 *
 * This native conversion preserves the real wicks and emits exactly one chart
 * candle per DB row, with the brick index as the x-axis time.
 */
const candlesToBrickSeriesNative = (
	candles: readonly CandleRowLike[]
): BrickChartSeries => {
	const data: CandlestickData<UTCTimestamp>[] = []
	const times: number[] = []
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i]!
		data.push({
			time: i as UTCTimestamp,
			open: c.open,
			high: c.high,
			low: c.low,
			close: c.close,
		})
		times.push(
			c.timestamp instanceof Date
				? c.timestamp.getTime()
				: new Date(c.timestamp).getTime()
		)
	}
	return { data, times }
}

interface SyncMapEntry {
	readonly idx15m: number | null
	readonly idx60m: number | null
}

/**
 * Build a `5mBrickIndex → { 15mBrickIndex, 60mBrickIndex }` lookup so the
 * orchestrator can drive 15m/60m crosshairs from the 5m crosshair without
 * a search at every move event. For each 5m brick's `closeTimestamp`, find
 * the 15m/60m brick whose `[openTs, closeTs)` contains that moment — in
 * practice: the smallest index whose `closeTimestamp >= 5m.closeTimestamp`,
 * via binary search on the parallel `times[]` array. Returns `null` for a
 * target chart when the 5m brick falls before its first brick or after its
 * last (boundary case, handled by the caller as "don't move crosshair").
 */
const buildCrosshairSyncMap = (
	bricks5mTimes: readonly number[],
	bricks15mTimes: readonly number[],
	bricks60mTimes: readonly number[]
): Map<number, SyncMapEntry> => {
	const findContaining = (
		targetMs: number,
		arr: readonly number[]
	): number | null => {
		let lo = 0
		let hi = arr.length - 1
		let result: number | null = null
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1
			if (arr[mid]! >= targetMs) {
				result = mid
				hi = mid - 1
			} else {
				lo = mid + 1
			}
		}
		return result
	}

	const map = new Map<number, SyncMapEntry>()
	for (let i = 0; i < bricks5mTimes.length; i++) {
		const t = bricks5mTimes[i]!
		map.set(i, {
			idx15m: findContaining(t, bricks15mTimes),
			idx60m: findContaining(t, bricks60mTimes),
		})
	}
	return map
}

/**
 * Find the brick index whose `closeTimestamp` is closest to (or equal to)
 * the given target epoch. Used to map trade entry/exit wall-clock times
 * onto brick indices for marker placement and price-line endpoints.
 */
const findBrickIndexForTime = (
	bricksTimes: readonly number[],
	targetMs: number
): number => {
	if (bricksTimes.length === 0) {
		return 0
	}
	let bestIdx = 0
	let bestDelta = Number.POSITIVE_INFINITY
	for (let i = 0; i < bricksTimes.length; i++) {
		const delta = Math.abs(bricksTimes[i]! - targetMs)
		if (delta < bestDelta) {
			bestDelta = delta
			bestIdx = i
		}
	}
	return bestIdx
}

/**
 * Look up an indicator value series aligned to brick indices. For each
 * brick, finds the candle whose timestamp matches the brick's
 * `closeTimestamp` and returns its `indicators[key]` value. Returns `null`
 * for bricks whose candle is missing the key (the chart skips `null`s).
 *
 * Used to overlay precomputed EMAs / VWAP / MACD line series on top of the
 * Renko bricks. Indicator values come from the candle JSONB populated by
 * the CSV ingest pipeline — no client-side TA math.
 */
/**
 * Detect "session breaks" in a brick-time array — adjacent bricks whose
 * close-timestamps are more than `gapHours` apart. Returns a Set of brick
 * indices where a break STARTS (the brick right after the gap). Used by
 * `indicatorValuesByBrickIndex` to insert WhitespaceData at the gap so the
 * line series doesn't draw a long diagonal across the gap.
 *
 * Default 6h covers any overnight gap (B3 close-to-open ≈ 15h) plus
 * weekends and holidays — and is far above any in-session brick gap,
 * which sits in the seconds-to-minutes range even on slow tape. Probe
 * data (2026-06-30) found 17 EMA jumps >500pts across the year, all at
 * overnight session boundaries — the 60h threshold previously used
 * caught only the long-holiday subset and let the regular nightly gaps
 * draw a 30-50-brick diagonal across the chart ("monster" lines).
 */
const findSessionGaps = (
	bricksTimes: readonly number[],
	gapHours = 6
): Set<number> => {
	const gaps = new Set<number>()
	const gapMs = gapHours * 3600_000
	for (let i = 1; i < bricksTimes.length; i++) {
		if (bricksTimes[i]! - bricksTimes[i - 1]! > gapMs) {
			gaps.add(i)
		}
	}
	return gaps
}

// Indicator point series for a Lightweight-Charts LineSeries. Includes both
// real values (`{time, value}`) and whitespace markers (`{time}` only) so the
// line gets cut at session boundaries.
type IndicatorPoint =
	{ time: UTCTimestamp; value: number } | { time: UTCTimestamp }

const indicatorValuesByBrickIndex = (
	bricksTimes: readonly number[],
	candles: readonly {
		readonly timestamp: string
		readonly indicators: Record<string, number>
	}[],
	key: string
): Array<IndicatorPoint> => {
	if (candles.length === 0 || bricksTimes.length === 0) {
		return []
	}
	const candleByMs = new Map<number, Record<string, number>>()
	for (const c of candles) {
		candleByMs.set(new Date(c.timestamp).getTime(), c.indicators)
	}
	const sortedCandleTimes = Array.from(candleByMs.keys()).sort((a, b) => a - b)

	const findFloor = (target: number): number | null => {
		let lo = 0
		let hi = sortedCandleTimes.length - 1
		let result: number | null = null
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1
			if (sortedCandleTimes[mid]! <= target) {
				result = sortedCandleTimes[mid]!
				lo = mid + 1
			} else {
				hi = mid - 1
			}
		}
		return result
	}

	const sessionGaps = findSessionGaps(bricksTimes)

	const out: Array<IndicatorPoint> = []
	for (let i = 0; i < bricksTimes.length; i++) {
		// At every session boundary, emit a Whitespace point INSTEAD of the
		// real value at that brick. Lightweight-charts requires strictly
		// ascending `time` — pushing a whitespace and a real point at the
		// same index would assert "data must be asc ordered by time".
		// Sacrificing one brick of indicator at the session boundary cuts
		// the long diagonal across the holiday/weekend gap cleanly.
		if (sessionGaps.has(i)) {
			out.push({ time: i as UTCTimestamp })
			continue
		}
		const candleMs = findFloor(bricksTimes[i]!)
		if (candleMs === null) {
			continue
		}
		const indicators = candleByMs.get(candleMs)
		const v = indicators?.[key]
		if (typeof v === "number" && Number.isFinite(v)) {
			out.push({ time: i as UTCTimestamp, value: v })
		}
	}
	return out
}

/**
 * ISO-week-year key for an epoch, evaluated in São Paulo (BRT) local time.
 * Returns a `${isoYear}-${isoWeek}` string — stable across the host machine's
 * timezone because the Y-M-D is pulled via Intl in `America/Sao_Paulo` first,
 * then the ISO-week math runs on those pure numbers.
 *
 * ISO 8601: week 1 is the week containing the first Thursday of the year;
 * weeks start on Monday. A late-December date can belong to week 1 of the
 * NEXT year, and an early-January date to the last week of the PREVIOUS year —
 * the returned key encodes the ISO-week-year, not the calendar year, so
 * week-boundary detection stays correct across the Dec/Jan seam.
 */
const brtIsoWeekKey = (epochMs: number): string => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date(epochMs))
	const get = (type: string): number =>
		Number(parts.find((p) => p.type === type)?.value)
	const y = get("year")
	const m = get("month")
	const d = get("day")
	// Pure ISO-week calc on the BRT calendar date (UTC math on a synthetic
	// date carrying the BRT Y-M-D — no further timezone influence).
	const date = new Date(Date.UTC(y, m - 1, d))
	const dayNum = date.getUTCDay() || 7 // Mon=1..Sun=7
	date.setUTCDate(date.getUTCDate() + 4 - dayNum) // shift to the week's Thursday
	const isoYear = date.getUTCFullYear()
	const yearStart = new Date(Date.UTC(isoYear, 0, 1))
	const isoWeek = Math.ceil(
		((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
	)
	return `${isoYear}-${isoWeek}`
}

export interface BoundaryMarker {
	readonly brickIdx: number
	readonly kind: "day" | "week"
}

/**
 * Classify session-gap boundaries into day vs week markers. Reuses
 * `findSessionGaps` (the >6h overnight-gap detector) to find each trading-day
 * boundary, then upgrades a boundary to `week` when the brick after the gap
 * falls in a different BRT ISO-week than the brick before it. Emits one marker
 * per boundary index (week supersedes day — never both at the same index).
 */
const computeBoundaryMarkers = (
	bricksTimes: readonly number[]
): ReadonlyArray<BoundaryMarker> => {
	const gaps = findSessionGaps(bricksTimes)
	const out: BoundaryMarker[] = []
	for (const idx of gaps) {
		const before = bricksTimes[idx - 1]
		const after = bricksTimes[idx]
		if (
			before === undefined ||
			after === undefined ||
			!Number.isFinite(before) ||
			!Number.isFinite(after)
		) {
			continue
		}
		const kind = brtIsoWeekKey(after) !== brtIsoWeekKey(before) ? "week" : "day"
		out.push({ brickIdx: idx, kind })
	}
	out.sort((a, b) => a.brickIdx - b.brickIdx)
	return out
}

export type { BrickChartSeries, CandleRowLike, IndicatorPoint, SyncMapEntry }
export {
	brtIsoWeekKey,
	bricksToCandleSeries,
	buildCrosshairSyncMap,
	candlesToBrickSeriesNative,
	computeBoundaryMarkers,
	findBrickIndexForTime,
	findSessionGaps,
	indicatorValuesByBrickIndex,
}
