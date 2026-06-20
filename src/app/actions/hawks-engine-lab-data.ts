"use server"

import { and, desc, eq, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { assets, hawksRenkoSizes, timeframes } from "@/db/schema"
import { requireRole } from "@/lib/auth-utils"
import { getCandleStore } from "@/lib/candle-store"
import { buildHtfWalker, lookupHtfGate } from "@/lib/backtest/hawks-htf-walker"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import {
	processHawksPlaybookCandle,
	createInitialHawksPlaybookState,
} from "@/lib/backtest/modules/entry/hawks-playbook"
import { buildDayContext, groupCandlesByDay } from "@/lib/backtest/day-grouper"
import {
	createStructuralPivotState,
	stepStructuralPivot,
} from "@/lib/backtest/hawks-structural-pivots"
import type { Direction } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import type {
	EmaSlope,
	EngineLabBrick,
	EngineLabCandle,
	EngineLabDayPayload,
	ExitMode,
	FiboAnchors,
	HawksEngineLabData,
	MacdSign,
	PivotBias,
	TradeLifecycle,
	VwapSide,
} from "./hawks-engine-lab-data.types"

const macdSignOf = (v: number | null | undefined): MacdSign | null => {
	if (typeof v !== "number") {
		return null
	}
	if (v > 0) {
		return "positive"
	}
	if (v < 0) {
		return "negative"
	}
	return "zero"
}

const emaSlopeOf = (
	fast: number | null | undefined,
	slow: number | null | undefined
): EmaSlope | null => {
	if (typeof fast !== "number" || typeof slow !== "number") {
		return null
	}
	if (fast > slow) {
		return "up"
	}
	if (fast < slow) {
		return "down"
	}
	return "flat"
}

const vwapSideOf = (
	close: number,
	vwap: number | null | undefined
): VwapSide | null => {
	if (typeof vwap !== "number") {
		return null
	}
	if (close > vwap) {
		return "above"
	}
	if (close < vwap) {
		return "below"
	}
	return "at"
}

const numFromInd = (c: CandleRow, key: string): number | undefined => {
	const v = c.indicators[key]
	return typeof v === "number" ? v : undefined
}

const ASSET_SYMBOL = "WIN"

const slimCandle = (c: CandleRow): EngineLabCandle => ({
	timestamp: c.timestamp,
	open: c.open,
	high: c.high,
	low: c.low,
	close: c.close,
	indicators: c.indicators as Readonly<Record<string, number | null>>,
})

// Forward-simulate one trade lifecycle starting at the fire brick. Spec §8
// engine flow — checks ordering per brick close: stop hit → target hit →
// breakeven update → trail activation → trail ratchet. EOD forced-close
// when no exit fires within the brick array.
//
// The simulator is parameterised by:
//   - `renkoSize` — the canonical 5m Renko brick body in points (= 100 for
//     WIN). All R math derives from this:
//       1R = 2 × renkoSize = exactly the price distance one opposite-color
//            brick covers in Renko (the brick has to retrace the prior
//            body THEN form its own body in the opposite direction). So
//            a single opposite-color close = 1R = stop hit.
//       2R = 4 × renkoSize (BE trigger threshold; the spec's "1R favor =
//            move to entry" rule)
//       3R = 6 × renkoSize (static target, trail activation, etc).
//     This replaces the older "brickBody derived from stopReference"
//     heuristic, which made R-size depend on the playbook's stop choice
//     and broke when wider stops were proposed.
//   - `stopReference` — absolute initial stop price. Computed by the
//     caller as `entry ± 2 × renkoSize` for consistency with the 1R
//     hard rule (2026-06-15 user directive).
//   - `targetPrice` — absolute price for take-profit. null = no target
//     (Mode 2 trail-only). For Mode 1 this is entry ± 3R; for Mode 3a/3b
//     it's the chosen fib T1/T2/T3 price.
//   - `trailAfter3R` — if true, the trail-after-3R primitive arms once
//     net favor reaches 3R AND a brick closes favorable, then ratchets
//     `close ± 2 × renkoSize` on every favorable update.
const simulateLifecycle = (
	bricks: ReadonlyArray<EngineLabBrick>,
	fireIdx: number,
	direction: Direction,
	entryClose: number,
	stopReference: number,
	renkoSize: number,
	exitMode: ExitMode,
	targetPrice: number | null,
	trailAfter3R: boolean
): TradeLifecycle => {
	const initialStop = stopReference
	const brickBody = renkoSize
	let beTriggered = false
	let beBrickIndexInDay: number | null = null
	let trailActivated = false
	let trailActivationBrickIndexInDay: number | null = null
	let currentStop = initialStop
	let exitBrickIndexInDay = bricks.length - 1
	let exitReason: TradeLifecycle["exitReason"] = "eod"
	let exitPrice = bricks[bricks.length - 1]!.close
	for (let j = fireIdx + 1; j < bricks.length; j++) {
		const fb = bricks[j]!
		const stopHit =
			direction === "long" ? fb.close <= currentStop : fb.close >= currentStop
		if (stopHit) {
			exitBrickIndexInDay = j
			exitReason = trailActivated
				? "stop_trail"
				: beTriggered
					? "stop_be"
					: "stop_initial"
			exitPrice = currentStop
			break
		}
		if (targetPrice !== null) {
			const targetHit =
				direction === "long" ? fb.close >= targetPrice : fb.close <= targetPrice
			if (targetHit) {
				exitBrickIndexInDay = j
				exitReason = "target"
				exitPrice = targetPrice
				break
			}
		}
		const netFavor =
			direction === "long" ? fb.close - entryClose : entryClose - fb.close
		const closedFavorable =
			direction === "long" ? fb.close > fb.open : fb.close < fb.open
		if (!beTriggered && closedFavorable && netFavor >= 2 * brickBody) {
			beTriggered = true
			beBrickIndexInDay = j
			currentStop = entryClose
		}
		if (trailAfter3R) {
			if (!trailActivated && closedFavorable && netFavor >= 6 * brickBody) {
				trailActivated = true
				trailActivationBrickIndexInDay = j
			}
			if (trailActivated) {
				const candidateStop =
					direction === "long"
						? fb.close - 2 * brickBody
						: fb.close + 2 * brickBody
				const moreFavorable =
					direction === "long"
						? candidateStop > currentStop
						: candidateStop < currentStop
				if (moreFavorable) {
					currentStop = candidateStop
				}
			}
		}
	}
	return {
		exitMode,
		beTriggered,
		beBrickIndexInDay,
		trailActivated,
		trailActivationBrickIndexInDay,
		exitBrickIndexInDay,
		exitReason,
		exitPrice,
		initialStop,
		target: targetPrice,
	}
}

// Compute the three fibo measured-move target prices per spec §5.
// Returns null when no valid 15m anchor pair is available — caller
// must fall back to trail-only or block the fire.
/**
 * Find the dominant impulse leg by walking 15m bricks backwards from the
 * fire's timestamp. "Dominant" = the topo→fundo (SHORT) / fundo→topo
 * (LONG) pair whose extreme is at least `MIN_SWING_BRICKS × renkoSize`
 * away from the retracement peak. Smaller intra-leg zigzags are
 * skipped — we keep walking backwards until the swing is large enough
 * to be the leg the current retracement is correcting against.
 *
 * Returns null when no qualifying pair exists in the visible history.
 */
const MIN_SWING_BRICKS = 3
/**
 * Walk backwards from `fromIdx` and find the most recent "local pivot"
 * brick whose extreme (high or low) qualifies as a swing point.
 *
 * A local low (FUNDO candidate) qualifies if it's the lowest low within
 * `LOCAL_WINDOW` bricks on each side AND the price subsequently rallied
 * at least `minSwing` above it (so it's not still the current trend's
 * extreme). Same for a local high (TOPO candidate) — must be the
 * highest in a window AND the price subsequently dropped ≥ minSwing.
 */
const LOCAL_WINDOW = 2
const findLocalLow = (
	candles15m: CandleRow[],
	fromIdx: number,
	minSwing: number,
	requirePostReversal: boolean
): number => {
	for (let i = fromIdx; i >= LOCAL_WINDOW; i--) {
		const c = candles15m[i]!
		let isLocal = true
		for (let j = 1; j <= LOCAL_WINDOW; j++) {
			const left = candles15m[i - j]
			const right = candles15m[i + j]
			if (left && left.low < c.low) {
				isLocal = false
				break
			}
			if (right && right.low < c.low) {
				isLocal = false
				break
			}
		}
		if (!isLocal) {
			continue
		}
		if (requirePostReversal) {
			let postRallyHigh = -Infinity
			for (let j = i + 1; j <= fromIdx; j++) {
				const c2 = candles15m[j]!
				if (c2.high > postRallyHigh) {
					postRallyHigh = c2.high
				}
			}
			if (postRallyHigh - c.low < minSwing) {
				continue
			}
		}
		return i
	}
	return -1
}
const findLocalHigh = (
	candles15m: CandleRow[],
	fromIdx: number,
	minSwing: number,
	requirePostReversal: boolean
): number => {
	for (let i = fromIdx; i >= LOCAL_WINDOW; i--) {
		const c = candles15m[i]!
		let isLocal = true
		for (let j = 1; j <= LOCAL_WINDOW; j++) {
			const left = candles15m[i - j]
			const right = candles15m[i + j]
			if (left && left.high > c.high) {
				isLocal = false
				break
			}
			if (right && right.high > c.high) {
				isLocal = false
				break
			}
		}
		if (!isLocal) {
			continue
		}
		if (requirePostReversal) {
			let postDropLow = Infinity
			for (let j = i + 1; j <= fromIdx; j++) {
				const c2 = candles15m[j]!
				if (c2.low < postDropLow) {
					postDropLow = c2.low
				}
			}
			if (c.high - postDropLow < minSwing) {
				continue
			}
		}
		return i
	}
	return -1
}

/**
 * Find the dominant impulse leg using "most recent local pivot pair"
 * semantics:
 *
 *   - SHORT: walk back from fire → find the most recent local FUNDO
 *     (impulse end) → walk further back to find the most recent local
 *     TOPO before it (impulse start). Then the retracement peak is the
 *     highest high BETWEEN impulse-end and the fire.
 *
 *   - LONG: mirror.
 *
 * If no clear retracement peak has formed yet (price hasn't rallied
 * back up after impulse-end), the peak is "the last high" — the
 * highest high between impulse-end and the fire's 15m brick. This
 * matches the user's rule: "If we don't have a yet a clear peak for
 * retracement, put on last high."
 */
const findDominantImpulse = (
	direction: Direction,
	fireTimestamp: string,
	candles15m: CandleRow[],
	renkoSizePoints: number
): {
	impulseStartPrice: number
	impulseEndPrice: number
	impulseStartAtTimestamp: string
	impulseEndAtTimestamp: string
	retracementPeak: number
	retracementPeakAtTimestamp: string
} | null => {
	const fireTs = new Date(fireTimestamp).getTime()
	let endIdx = -1
	for (let i = candles15m.length - 1; i >= 0; i--) {
		if (new Date(candles15m[i]!.timestamp).getTime() <= fireTs) {
			endIdx = i
			break
		}
	}
	if (endIdx < 0) {
		return null
	}
	const minSwing = MIN_SWING_BRICKS * renkoSizePoints
	if (direction === "short") {
		// Impulse-end: most recent local fundo. No post-rally requirement —
		// if the price is still falling, this IS the active impulse end
		// and the retracement-peak finder will fall through to "last
		// high" per the user rule.
		const fundoIdx = findLocalLow(candles15m, endIdx, minSwing, false)
		if (fundoIdx < 0) {
			return null
		}
		// Impulse-start: most recent local topo BEFORE the fundo. Require
		// post-drop ≥ minSwing — i.e. the topo must have meaningfully
		// dropped (otherwise it's not the start of an impulse).
		const topoIdx = findLocalHigh(candles15m, fundoIdx - 1, minSwing, true)
		if (topoIdx < 0) {
			return null
		}
		// Retracement peak = highest high STRICTLY AFTER fundoIdx
		// (i.e. fundoIdx + 1 .. endIdx). The peak cannot live on the
		// fundo brick itself — that's the impulse end, by definition
		// not the retracement. If there's no brick after fundoIdx (the
		// fire IS the fundo), reject the setup: no real retracement
		// has formed yet (user rule from 2026-06-15, image #60).
		if (fundoIdx + 1 > endIdx) {
			return null
		}
		let peakHigh = candles15m[fundoIdx + 1]!.high
		let peakIdx = fundoIdx + 1
		for (let j = fundoIdx + 2; j <= endIdx; j++) {
			const c = candles15m[j]!
			if (c.high > peakHigh) {
				peakHigh = c.high
				peakIdx = j
			}
		}
		// Require ≥ 2 renko bricks of actual retracement — anything less
		// means the price is still glued to the impulse-end (no rally
		// to short into). This filters "fired on the fundo or 1 brick
		// up" from a true retracement-then-short setup.
		if (peakHigh - candles15m[fundoIdx]!.low < 2 * renkoSizePoints) {
			return null
		}
		return {
			impulseStartPrice: candles15m[topoIdx]!.high,
			impulseEndPrice: candles15m[fundoIdx]!.low,
			impulseStartAtTimestamp: candles15m[topoIdx]!.timestamp,
			impulseEndAtTimestamp: candles15m[fundoIdx]!.timestamp,
			retracementPeak: peakHigh,
			retracementPeakAtTimestamp: candles15m[peakIdx]!.timestamp,
		}
	}
	// LONG: mirror — find local TOPO, then local FUNDO before it,
	// retracement peak = lowest low STRICTLY AFTER topoIdx.
	const topoIdx = findLocalHigh(candles15m, endIdx, minSwing, false)
	if (topoIdx < 0) {
		return null
	}
	const fundoIdx = findLocalLow(candles15m, topoIdx - 1, minSwing, true)
	if (fundoIdx < 0) {
		return null
	}
	if (topoIdx + 1 > endIdx) {
		return null
	}
	let peakLow = candles15m[topoIdx + 1]!.low
	let peakIdx = topoIdx + 1
	for (let j = topoIdx + 2; j <= endIdx; j++) {
		const c = candles15m[j]!
		if (c.low < peakLow) {
			peakLow = c.low
			peakIdx = j
		}
	}
	if (candles15m[topoIdx]!.high - peakLow < 2 * renkoSizePoints) {
		return null
	}
	return {
		impulseStartPrice: candles15m[fundoIdx]!.low,
		impulseEndPrice: candles15m[topoIdx]!.high,
		impulseStartAtTimestamp: candles15m[fundoIdx]!.timestamp,
		impulseEndAtTimestamp: candles15m[topoIdx]!.timestamp,
		retracementPeak: peakLow,
		retracementPeakAtTimestamp: candles15m[peakIdx]!.timestamp,
	}
}

const computeFiboAnchors = (
	direction: Direction,
	fireTimestamp: string,
	candles15m: CandleRow[],
	renkoSizePoints: number
): FiboAnchors | null => {
	// Walk 15m bricks backwards from the fire to find the most recent
	// local pivot pair (impulse start + end). The retracement peak is
	// derived from the rally/drop after impulse-end up to the fire — so
	// it can never be back-in-time from the impulse end. When no clear
	// rally has formed yet, the peak falls through to "last high before
	// fire" (per the explicit user rule from 2026-06-15).
	const dominant = findDominantImpulse(
		direction,
		fireTimestamp,
		candles15m,
		renkoSizePoints
	)
	if (dominant === null) {
		return null
	}
	const impulseSize = Math.abs(
		dominant.impulseEndPrice - dominant.impulseStartPrice
	)
	if (impulseSize <= 0) {
		return null
	}
	// SHORT: impulse went down (topo → fundo); projection subtracts from peak.
	// LONG: impulse went up (fundo → topo); projection adds to peak.
	const sign = direction === "short" ? -1 : 1
	return {
		retracementPeak: dominant.retracementPeak,
		retracementPeakAtTimestamp: dominant.retracementPeakAtTimestamp,
		impulseStartPrice: dominant.impulseStartPrice,
		impulseEndPrice: dominant.impulseEndPrice,
		impulseStartAtTimestamp: dominant.impulseStartAtTimestamp,
		impulseEndAtTimestamp: dominant.impulseEndAtTimestamp,
		impulseSize,
		t1: dominant.retracementPeak + sign * impulseSize * 0.764,
		t2: dominant.retracementPeak + sign * impulseSize * 1.0,
		t3: dominant.retracementPeak + sign * impulseSize * 1.618,
	}
}

const fetchTimeframeId = async (
	tfCode: "hawk_5m_win" | "hawk_15m_win" | "hawk_60m_win"
): Promise<string> => {
	const row = (
		await db
			.select({ id: timeframes.id })
			.from(timeframes)
			.where(eq(timeframes.code, tfCode))
			.limit(1)
	)[0]
	if (!row) {
		throw new Error(`Timeframe ${tfCode} not found`)
	}
	return row.id
}

const fetchTfCandles = async (
	tfCode: "hawk_5m_win" | "hawk_15m_win" | "hawk_60m_win",
	assetId: string,
	from: Date,
	to: Date
): Promise<CandleRow[]> => {
	const tfId = await fetchTimeframeId(tfCode)
	const rows = await getCandleStore().fetchRange({
		assetId,
		timeframeId: tfId,
		from,
		to,
		indicatorKeys: "*",
	})
	return rows.map((r) => ({
		timestamp: r.timestamp,
		open: r.open,
		high: r.high,
		low: r.low,
		close: r.close,
		candleIndex: r.candleIndex ?? 0,
		indicators: r.indicators,
	}))
}

/**
 * Run the v0.9 playbook orchestrator over a date range and return a
 * per-brick trace of every decision it made. Used by the engine lab
 * page (`/dev/hawks-engine-lab`) to inspect engine behavior without
 * touching the full backtest pipeline.
 *
 * Returns a per-day breakdown so the UI can scrub day-by-day.
 *
 * With all 3 playbook stubs returning null, the orchestrator never
 * fires today. To exercise the chart's marker-rendering pipeline (so
 * you can SEE how entries land on the chart before step 4 lands real
 * trigger logic), the action synthesizes one demo fire per
 * gate-allowed brick that satisfies a simple every-N-bricks pattern.
 * Demo fires are clearly tagged `demo:<direction>` in the label and
 * removed once any real playbook starts firing (i.e. when
 * `result.signal` is non-null, the demo path is skipped for that brick).
 */
export const loadHawksEngineLabData = async (
	from: string,
	to: string
): Promise<HawksEngineLabData> => {
	await requireRole("admin")

	const assetRow = (
		await db
			.select({ id: assets.id })
			.from(assets)
			.where(eq(assets.symbol, ASSET_SYMBOL))
			.limit(1)
	)[0]
	if (!assetRow) {
		throw new Error(`Asset ${ASSET_SYMBOL} not found`)
	}
	const assetId = assetRow.id

	const fromDate = new Date(`${from}T00:00:00Z`)
	const toDate = new Date(`${to}T23:59:59Z`)

	const [candles5m, candles15m] = await Promise.all([
		fetchTfCandles("hawk_5m_win", assetId, fromDate, toDate),
		fetchTfCandles("hawk_15m_win", assetId, fromDate, toDate),
	])

	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("hawksV0 preset is not hawks_playbook")
	}
	const config = hawksV0.entry.config

	// Precompute HTF walker over the full window once — same as engine.
	// Phase C: pass 15m candles so the walker also tracks 15m structural
	// pivots (anchors for the Phase E fibo measured-move targets).
	const htfWalker = buildHtfWalker(candles5m, config, candles15m)

	// Replay the orchestrator day-by-day, mirroring engine.ts.
	const days = groupCandlesByDay(candles5m)
	const days15m = groupCandlesByDay(candles15m)
	const sortedDayKeys = [...days.keys()].sort()

	// Build dayKey → canonical 5m Renko brick size map. Each week has its
	// own size stored in `hawks_renko_sizes` (effectiveDate = ISO week
	// Monday). We pull every row with effective_date ≤ last-day, then for
	// each day pick the row with the latest effective_date ≤ that day. The
	// canonical size is used for ALL R math in the lifecycle simulator
	// (1R = 2 × size_5m).
	const lastDayKey = sortedDayKeys[sortedDayKeys.length - 1] ?? ""
	// Normalize effective_date to a "YYYY-MM-DD" string regardless of
	// what the driver returns (postgres-js parses `date` columns to Date
	// objects; neon-serverless returns ISO strings). Date <= string
	// comparisons silently break via `Date.toString()` coercion, so we
	// canonicalize at the boundary.
	const toIsoDateString = (v: unknown): string => {
		if (typeof v === "string") {
			return v.slice(0, 10)
		}
		if (v instanceof Date) {
			const y = v.getUTCFullYear()
			const m = String(v.getUTCMonth() + 1).padStart(2, "0")
			const d = String(v.getUTCDate()).padStart(2, "0")
			return `${y}-${m}-${d}`
		}
		return ""
	}
	const renkoSizeRowsRaw = lastDayKey
		? await db
				.select({
					effectiveDate: hawksRenkoSizes.effectiveDate,
					size5m: hawksRenkoSizes.size5m,
				})
				.from(hawksRenkoSizes)
				.where(
					and(
						eq(hawksRenkoSizes.assetId, assetId),
						lte(hawksRenkoSizes.effectiveDate, lastDayKey)
					)
				)
				.orderBy(desc(hawksRenkoSizes.effectiveDate))
		: []
	// `hawks_renko_sizes.size_5m` stores the R NUMBER `N` (e.g. R20 = 20).
	// An R<N> brick has body = `(N − 1)` TICKS. 1 WIN tick = 5 POINTS.
	// So R<N> in points = `(N − 1) × 5`. Candle/brick prices are stored
	// in raw points (e.g. 190190.2), so all R math below works in
	// raw-point units — matching `candle.close - candle.open`.
	// See CLAUDE.md rule #0 and docs/gotchas.md.
	const TICK_POINTS = 5
	const rToPoints = (r: number): number => (r - 1) * TICK_POINTS
	const renkoSizeRows = renkoSizeRowsRaw.map((r) => ({
		effectiveDate: toIsoDateString(r.effectiveDate),
		size5m: rToPoints(r.size5m),
	}))
	const renkoSizeForDay = (dayKey: string): number => {
		for (const row of renkoSizeRows) {
			if (row.effectiveDate <= dayKey) {
				return row.size5m
			}
		}
		// Fallback already in POINTS — no R conversion needed.
		return config.brickSize5mPoints
	}

	const dayPayloads: EngineLabDayPayload[] = []
	let state = createInitialHawksPlaybookState()

	// Demo-fire cadence: fire on EVERY qualifying brick (VB +
	// gate-stable + brick-direction-match + in-window). The 5-brick
	// cooldown naturally spaces them. This shows the user every entry
	// the engine considers a candidate, which surfaces missing fires
	// the per-day cap previously hid. Set to false to suppress.
	const DEMO_FIRES = true

	// --- Cross-day trackers. Renko bricks have no time gap on day
	// boundaries (gaps fill with renko-sized synthetic bricks), so
	// structure carries across days. Pivot detector, topo/fundo memory,
	// running highs/lows since last confirmation, VB color, and prior
	// gate state all live outside the per-day loop and persist.
	let pivotState = createStructuralPivotState()
	let currentPivotBias: PivotBias = null
	// Dedup alternating-type pivots from the period-2 detector — see
	// `hawks-isolation-charts.tsx:547` for the pattern. Last confirmed
	// pivot prices (`_lastTopoPrice` / `_lastFundoPrice`) are derived
	// per-step from `pivotStep.pivot.price` when needed; the 5m/15m
	// structure gates that used to track them are disabled (see backlog
	// "fibo retracement anchor logic").
	let lastAdoptedPivotType: "topo" | "fundo" | null = null
	// Running extremes since the last confirmation. SHORT gate compares
	// runningHighSinceLastTopo against _lastTopoPrice — if price has
	// already broken above the last topo, we know the NEXT confirmed
	// topo will be higher, so we block the short pre-emptively (per
	// user spec: "even though the indicator did not mark the last high,
	// the price already broke its value, so it's 100% the next pivot
	// will be a higher high").
	let runningHighSinceLastTopo: number | null = null
	let runningLowSinceLastFundo: number | null = null
	// VB + gate-stability trackers (cross-day too).
	let priorBrickWasBullish: boolean | null = null
	let priorGate60m: "BULL" | "BEAR" | "NO_SIGNAL" | null = null

	for (const dayKey of sortedDayKeys) {
		const dayCandles = days.get(dayKey)!
		const bricks: EngineLabBrick[] = []
		// Canonical 5m Renko brick size for this day's ISO week — used
		// for ALL R math AND stamped on every brick row so the lab table
		// shows it column-by-column.
		const dayRenkoSize = renkoSizeForDay(dayKey)

		// --- Leg-shape tracker (expansion ≥ 4, retraction ≥ 2, single-brick
		// noise ignored). Operates over the per-day 5m brick stream.
		//
		// Vocabulary:
		//   - "expansion" = run of bricks in the gate direction
		//     (red for SHORT gate, green for LONG gate)
		//   - "retraction" = run of bricks in the opposite direction
		//
		// We don't know the gate direction in advance and it can flip across
		// the day, so we maintain two independent counters: one for a SHORT
		// view (expansion = bearish bricks) and one for a LONG view
		// (expansion = bullish bricks). At decision time we read the
		// counter that matches the current 60m gate.
		//
		// "Noise" rule (user spec): a single isolated opposite-direction
		// brick INSIDE an expansion is ignored — the expansion count keeps
		// growing. Two consecutive opposite bricks = real retraction begins.
		// We implement this via a 1-slot "tentative" buffer: when an
		// opposite brick appears mid-expansion we hold it; if the next
		// brick is back in gate-direction we extend expansion by +2
		// (the noise brick + the new brick); if the next brick confirms
		// the opposite direction we commit the retraction at length 2.
		type LegSide = "short" | "long"
		interface LegState {
			expansion: number // length of current gate-direction run
			retraction: number // length of current opposite run (≥ 2 to be real)
			noiseHeld: boolean // a single opposite brick inside expansion, pending confirmation
		}
		const initLeg = (): LegState => ({
			expansion: 0,
			retraction: 0,
			noiseHeld: false,
		})
		const legs: Record<LegSide, LegState> = {
			short: initLeg(),
			long: initLeg(),
		}
		// step both legs by one brick; called BEFORE the fire decision so
		// the decision sees the pre-fire leg state (we want to fire at the
		// VB itself — the first opposite brick after a real retraction).
		const stepLeg = (
			side: LegSide,
			brickIsGateDirection: boolean,
			brickIsOpposite: boolean
		) => {
			const l = legs[side]
			if (brickIsGateDirection) {
				if (l.retraction > 0) {
					// We were in a retraction; this brick is the first flip
					// back to gate direction = the VB. Reset and start a
					// new expansion of length 1.
					l.expansion = 1
					l.retraction = 0
					l.noiseHeld = false
				} else if (l.noiseHeld) {
					// Single opposite brick was just noise — count it +
					// this brick into the existing expansion.
					l.expansion += 2
					l.noiseHeld = false
				} else {
					l.expansion += 1
				}
			} else if (brickIsOpposite) {
				if (l.retraction > 0) {
					// Already retracting → keep counting.
					l.retraction += 1
				} else if (l.noiseHeld) {
					// Second consecutive opposite brick → noise upgraded to
					// real retraction at length 2.
					l.retraction = 2
					l.noiseHeld = false
				} else if (l.expansion > 0) {
					// First opposite brick after an expansion — tentative.
					l.noiseHeld = true
				}
				// else: no expansion to retract from; ignore.
			}
			// doji: no-op, hold state.
		}
		// Snapshot helper for "did the prior brick complete a real
		// retraction of ≥ 2?" — read at fire-decision time. The fire brick
		// itself is the VB flip back to gate-direction; at that point
		// stepLeg has already converted retraction → fresh expansion=1,
		// so we read a SHADOW of the prior state computed JUST BEFORE
		// stepping.
		let legPreStep!: { short: LegState; long: LegState }

		for (let i = 0; i < dayCandles.length; i++) {
			const candle = dayCandles[i]!
			const ctx = buildDayContext(candle, dayKey, i)
			const htfSnapshot = lookupHtfGate(htfWalker, candle)

			// Capture cooldown / gate state BEFORE the call so we can render
			// "why no fire" reasons accurately.
			const inTradingWindow =
				ctx.brtHHMM >= config.startTime && ctx.brtHHMM < config.endTime
			const directionAllowed =
				htfSnapshot?.gate60m === "BULL"
					? "long"
					: htfSnapshot?.gate60m === "BEAR"
						? "short"
						: null
			const cooldown = config.fireCooldownBricks ?? 5
			const cooldownActive =
				state.lastFireBrickIndex !== null &&
				ctx.candleIndexInDay - state.lastFireBrickIndex < cooldown

			const result = processHawksPlaybookCandle(
				candle,
				state,
				ctx,
				1, // tickSize — unused by orchestrator
				config,
				htfSnapshot,
				null
			)
			state = result.state

			// Step the period-2 structural pivot detector; forward-fill the
			// bias from the last confirmation. The detector is the same one
			// the engine + Indicator Lab use, so the badge sequence here
			// matches what the engine sees.
			const pivotStep = stepStructuralPivot(candle, i, pivotState)
			pivotState = pivotStep.state
			if (pivotStep.pivot) {
				currentPivotBias = pivotStep.pivot.type
				// Detector quirk: during a continuing bearish run, it
				// emits a fresh TOPO on every brick (each subsequent
				// event's `price` being the prior brick's low — noise).
				// The REAL topo is the FIRST emission of the run; same-
				// type repeats are noise. Indicator Lab dedups via
				// `if (m.type === lastType) continue` — apply that here.
				if (pivotStep.pivot.type !== lastAdoptedPivotType) {
					lastAdoptedPivotType = pivotStep.pivot.type
					if (pivotStep.pivot.type === "topo") {
						runningHighSinceLastTopo = null
					} else {
						runningLowSinceLastFundo = null
					}
				}
			}
			// Accumulate running extremes on EVERY brick since the last
			// pivot confirmation. The accumulator runs AFTER the pivot
			// reset above, so the confirmation brick's high/low is the
			// first sample of the new up/down-leg measurement. The detector
			// confirms after 2 opposite bricks, so on the confirmation
			// brick the price has clearly moved away from the peak — these
			// initial samples are far enough from the prior topo/fundo
			// to seed the tracker on the "safe" side.
			if (
				runningHighSinceLastTopo === null ||
				candle.high > runningHighSinceLastTopo
			) {
				runningHighSinceLastTopo = candle.high
			}
			if (
				runningLowSinceLastFundo === null ||
				candle.low < runningLowSinceLastFundo
			) {
				runningLowSinceLastFundo = candle.low
			}

			// Snapshot the PRE-step leg state for the fire decision below.
			// We want the fire brick (the VB flip) to be evaluated against
			// the leg shape that existed BEFORE it landed — i.e. is the
			// expansion that just got retracted ≥ 4 and the retraction
			// ≥ 2? After we step, retraction collapses to expansion=1.
			legPreStep = {
				short: { ...legs.short },
				long: { ...legs.long },
			}
			// Advance the leg trackers. SHORT side: gate-direction = bearish
			// brick. LONG side: gate-direction = bullish brick.
			const isBullish = candle.close > candle.open
			const isBearish = candle.close < candle.open
			stepLeg("short", isBearish, isBullish)
			stepLeg("long", isBullish, isBearish)

			// Raw indicator status at this brick — feeds the cursor-reactive
			// badge row in the lab. NOT direction-relative; alignment is
			// computed at render time.
			const macdSign = macdSignOf(numFromInd(candle, config.macd_key))
			// Using 15m EMA projection as the 5m EMA proxy until the spec's
			// TBD step adds dedicated 5m EMA keys (spec §2 Group C).
			const ema5mSlope = emaSlopeOf(
				numFromInd(candle, config.ema27_15m_key),
				numFromInd(candle, config.ema55_15m_key)
			)
			const vwapSide = vwapSideOf(
				candle.close,
				numFromInd(candle, config.vwap_d_key)
			)

			// Demo-fire path: only used to validate the chart marker pipeline
			// while playbook stubs return null. Skipped automatically the
			// moment a real playbook starts firing.
			//
			// Three hard constraints — all of these will carry over to
			// real playbooks in step 4+:
			//
			//   1. Direction-vs-brick-direction: LONGs only on bullish 5m
			//      bricks, SHORTs only on bearish.
			//   2. VB (Virada de Box): the brick must be the COLOR FLIP,
			//      not a continuation. SHORT requires prior brick bullish
			//      (or doji), LONG requires prior brick bearish. Firing
			//      mid-run is "chasing" — Hawks engine enters AT the box
			//      reversal, not on the 3rd or 4th brick of an existing leg.
			//   3. Gate stability: the 60m gate must have been in the same
			//      direction on the PRIOR brick too. Firing on the brick
			//      where the walker just flipped = entering on the news.
			//      Requires at least 1 brick of gate confirmation.
			// Apply the lab's methodology gates to REAL playbook fires the
			// same way they're applied to demo fires (spec §10): VB, leg-shape,
			// 5m HH/LL, gate-stability. Without this, mean_reversion (and
			// later retracement / vwap_rejection) would fire mid-chop every
			// few bricks.
			const realFiredRaw = result.signal !== null
			const isBullishBrick = candle.close > candle.open
			const isBearishBrick = candle.close < candle.open
			const brickDirectionAgrees =
				directionAllowed === "long"
					? isBullishBrick
					: directionAllowed === "short"
						? isBearishBrick
						: false
			// VB: prior brick must be opposite color (or doji). The first
			// brick of the day has priorBrickWasBullish === null which
			// blocks the demo fire — fine, no VB context yet anyway.
			const isVB =
				directionAllowed === "long"
					? priorBrickWasBullish === false // prior bearish, now bullish
					: directionAllowed === "short"
						? priorBrickWasBullish === true // prior bullish, now bearish
						: false
			// Gate stability: prior brick's gate60m must match the current
			// directionAllowed too. Blocks "entering on the flip".
			const gateStable =
				priorGate60m !== null &&
				priorGate60m === (htfSnapshot?.gate60m ?? "NO_SIGNAL") &&
				priorGate60m !== "NO_SIGNAL"
			// Leg-shape gate: the JUST-COMPLETED leg must show real
			// impulse + real pullback. Lab uses expansion ≥ 3 AND
			// retraction ≥ 2 (production is ≥ 4 / ≥ 2). Lower threshold
			// catches earlier setups but still filters out single-brick
			// noise.
			const legSide: LegSide | null = directionAllowed
			const legSnap = legSide !== null ? legPreStep[legSide] : null
			const legShapeOk =
				legSnap !== null && legSnap.expansion >= 4 && legSnap.retraction >= 2
			// 5m HH/LL gate (running-extreme version): we don't wait for
			// the period-2 detector to stamp a new pivot — if price has
			// ALREADY broken above the last confirmed topo (for SHORT) or
			// below the last confirmed fundo (for LONG), the next pivot
			// is guaranteed to be a higher-high / lower-low and we should
			// not fire. Per user spec (2026-06-14): "even though the
			// indicator did not mark the last high, the price already
			// broke its value, so it's 100% the next pivot will be a
			// higher high".
			//
			// Gate passes when the running extreme is STRICTLY on the
			// allowed side of the last confirmed pivot.
			// DISABLED 2026-06-15: this gate was over-aggressive. It
			// requires runningHigh < lastTopo (or <=), but the running
			// high accumulates throughout the new leg — any small
			// upward bounce after a topo trivially trips it. The 60m
			// HTF gate + leg-shape already prevent fires INTO a broken
			// topo at the timeframe-correct level.
			const fiveMinStructureOk = directionAllowed !== null
			// 15m structure guard — analogue of the 5m guard above, but
			// DISABLED 2026-06-15: same as fiveMinStructureOk — over-
			// aggressive, blocks valid setups. The htfSnapshot's
			// lastTopo15m/lastFundo15m are still available for re-enabling
			// (see backlog "fibo retracement anchor logic").
			const fifteenMinStructureOk = directionAllowed !== null
			// Real playbook fires must pass the same methodology gates as
			// demo fires — spec §10. Without this layer, mean_reversion fires
			// mid-chop every cooldown window.
			const labGatesPass =
				directionAllowed !== null &&
				inTradingWindow &&
				!cooldownActive &&
				brickDirectionAgrees &&
				isVB &&
				gateStable &&
				legShapeOk &&
				fiveMinStructureOk &&
				fifteenMinStructureOk
			const realFired = realFiredRaw && labGatesPass
			const canDemoFire = DEMO_FIRES && !realFired && labGatesPass
			let fired = realFired
			let direction = realFired ? result.signal!.direction : null
			let price = realFired ? result.signal!.price : null
			let stopReference = realFired
				? (result.signal!.stopReference ?? null)
				: null
			let label = realFired ? result.signal!.label : null
			let tier = realFired ? (result.signal!.quality?.tier ?? null) : null
			if (canDemoFire) {
				fired = true
				direction = directionAllowed
				price = candle.close
				// Stop = 2 brick bodies adverse (spec §1: 1R = 2 brick bodies).
				// Matches the real engine: stopReference = 2·open − close.
				const brickBody = Math.abs(candle.close - candle.open) || 100
				const adverseDelta =
					direction === "long" ? -(2 * brickBody) : 2 * brickBody
				stopReference = candle.close + adverseDelta
				label = `demo:${direction}`
				tier = "B"
				// Sync the orchestrator's cooldown tracker so the next 5 bricks
				// are honestly marked `cooldownActive`. Without this, the demo
				// path bypasses the cooldown the orchestrator owns and we'd
				// fire on every qualifying brick back-to-back.
				state = { ...state, lastFireBrickIndex: ctx.candleIndexInDay }
			}

			// Update trailing state for the NEXT brick's VB + gate-stability
			// checks. priorBrickWasBullish stays null on dojis so a doji
			// doesn't break a clean VB sequence — treat doji as neutral.
			if (isBullishBrick) {
				priorBrickWasBullish = true
			} else if (isBearishBrick) {
				priorBrickWasBullish = false
			}
			priorGate60m = htfSnapshot?.gate60m ?? "NO_SIGNAL"

			// Compute fibo anchors from 15m pivots only. The 5m running
			// high/low is no longer fed in — the retracement peak is
			// derived from the 15m bricks AFTER impulse-end up to the
			// fire (with "last high" fallback). See findDominantImpulse.
			let fiboAnchors: FiboAnchors | null = null
			if (fired && direction !== null) {
				fiboAnchors = computeFiboAnchors(
					direction,
					candle.timestamp,
					candles15m,
					dayRenkoSize
				)
				// Suppress fires that have no valid fibo geometry — the
				// lab is dedicated to fibo-anchor validation, so a fire
				// without anchors is noise. Don't restore the cooldown
				// here — keeping it absorbed prevents firing on the very
				// next brick.
				if (fiboAnchors === null) {
					fired = false
					direction = null
					price = null
					stopReference = null
					label = null
					tier = null
				}
			}
			bricks.push({
				brickIndexInDay: i,
				timestamp: candle.timestamp,
				open: candle.open,
				high: candle.high,
				low: candle.low,
				close: candle.close,
				renkoSize: dayRenkoSize,
				gate60m: htfSnapshot?.gate60m ?? "NO_SIGNAL",
				gate15m: htfSnapshot?.gate15m ?? "NO_SIGNAL",
				inTradingWindow,
				directionAllowed,
				cooldownActive,
				macdSign,
				ema5mSlope,
				vwapSide,
				pivotBias: currentPivotBias,
				lastTopo15m: htfSnapshot?.lastTopo15m ?? null,
				lastFundo15m: htfSnapshot?.lastFundo15m ?? null,
				fired,
				direction,
				price,
				stopReference,
				label,
				tier,
				lifecycleConservative: null,
				lifecycleModerate: null,
				lifecycleFiboT1: null,
				lifecycleFiboT2: null,
				lifecycleFiboT3: null,
				lifecycleFiboT1Trail: null,
				lifecycleFiboT2Trail: null,
				lifecycleFiboT3Trail: null,
				fiboAnchors,
				gateTrace:
					isVB && brickDirectionAgrees
						? {
								brickDirectionAgrees,
								isVB,
								gateStable,
								legShapeOk,
								fiveMinStructureOk,
								fifteenMinStructureOk,
								inTradingWindow,
								notCooldown: !cooldownActive,
								labGatesPass,
								canDemoFire,
								realFiredRaw,
							}
						: null,
			})
		}

		// Post-entry lifecycle simulator. For each fired brick, walk forward
		// simulating all exit modes; the lab UI toggles which one to render.
		//
		// 1R HARD STOP (2026-06-15 user directive): every fire uses the
		// week's canonical Renko brick body for ALL R math. The brick body
		// changes every ISO week per `hawks_renko_sizes` — we look it up
		// once per day from that table. Candle bodies CANNOT be used
		// because Renko occasionally emits "gap" bricks whose body =
		// N × canonical size; only the stored size_5m is reliable.
		//
		// The playbook's `stopReference` is OVERRIDDEN to
		// `entry ± 2 × renkoSize` — one opposite-color brick close in Renko =
		// exactly 1R because the brick has to retrace the prior body AND
		// form its own opposite body. This replaces the prior
		// "stop beyond max-extension" rule which produced 1.5R-1.7R stops
		// on some fires (images #31, #32 of the 2026-06-15 scrub).
		//
		//   - Mode 1 (conservative): static 3R target, no trail.
		//   - Mode 2 (moderate): no target; trail activates at 3R then
		//     ratchets 2 × renkoSize behind each favorable close.
		//   - Mode 3a/3b (fibo): T1/T2/T3 measured-move target, +/- trail.
		// Per-week canonical Renko brick body (already looked up at the
		// top of this day's iteration; same value stamped on every brick).
		const renkoSize = dayRenkoSize
		for (let i = 0; i < bricks.length; i++) {
			const fire = bricks[i]!
			if (!fire.fired || fire.direction === null || fire.price === null) {
				continue
			}
			// Override stopReference with the canonical 1R hard stop.
			const hardStop =
				fire.direction === "long"
					? fire.price - 2 * renkoSize
					: fire.price + 2 * renkoSize
			const static3RTarget =
				fire.direction === "long"
					? fire.price + 6 * renkoSize
					: fire.price - 6 * renkoSize
			const lifecycleConservative = simulateLifecycle(
				bricks,
				i,
				fire.direction,
				fire.price,
				hardStop,
				renkoSize,
				"conservative",
				static3RTarget,
				false
			)
			const lifecycleModerate = simulateLifecycle(
				bricks,
				i,
				fire.direction,
				fire.price,
				hardStop,
				renkoSize,
				"moderate",
				null,
				true
			)
			// Phase E — fibo measured-move modes. 3a (target only) and 3b
			// (target + trail). When the 15m anchors are missing we omit
			// the fibo lifecycles entirely (the UI shows N/A).
			const fa = fire.fiboAnchors
			const fiboLifecycle = (
				targetPrice: number,
				exitMode: ExitMode,
				withTrail: boolean
			): TradeLifecycle =>
				simulateLifecycle(
					bricks,
					i,
					fire.direction!,
					fire.price!,
					hardStop,
					renkoSize,
					exitMode,
					targetPrice,
					withTrail
				)
			// Update the fire's stopReference to the canonical hard stop so the
			// chart's dashed-line overlay (and any downstream consumer) reads
			// the same stop the simulator used.
			bricks[i] = {
				...fire,
				stopReference: hardStop,
				lifecycleConservative,
				lifecycleModerate,
				lifecycleFiboT1: fa ? fiboLifecycle(fa.t1, "fibo_T1", false) : null,
				lifecycleFiboT2: fa ? fiboLifecycle(fa.t2, "fibo_T2", false) : null,
				lifecycleFiboT3: fa ? fiboLifecycle(fa.t3, "fibo_T3", false) : null,
				lifecycleFiboT1Trail: fa
					? fiboLifecycle(fa.t1, "fibo_T1_trail", true)
					: null,
				lifecycleFiboT2Trail: fa
					? fiboLifecycle(fa.t2, "fibo_T2_trail", true)
					: null,
				lifecycleFiboT3Trail: fa
					? fiboLifecycle(fa.t3, "fibo_T3_trail", true)
					: null,
			}
		}

		// No-stacking pass (2026-06-15). Once a fire is taken, the position
		// is open until its exit brick — any subsequent "fire" inside that
		// window is a phantom stack and must be suppressed.
		//
		// We use CONSERVATIVE (Mode 1) as the canonical gate. It's the
		// methodology baseline — what the engine would actually do given a
		// single static 3R target. Moderate's run-forever trail can hold a
		// position to EOD, which if used as the gate would suppress every
		// fire after the first one most days. Other modes are visualization
		// overlays; toggling them doesn't change what the engine takes.
		let openUntilIdx = -1
		for (let i = 0; i < bricks.length; i++) {
			const fire = bricks[i]!
			if (!fire.fired) {
				continue
			}
			if (i <= openUntilIdx) {
				bricks[i] = {
					...fire,
					fired: false,
					direction: null,
					price: null,
					stopReference: null,
					label: null,
					tier: null,
					lifecycleConservative: null,
					lifecycleModerate: null,
					lifecycleFiboT1: null,
					lifecycleFiboT2: null,
					lifecycleFiboT3: null,
					lifecycleFiboT1Trail: null,
					lifecycleFiboT2Trail: null,
					lifecycleFiboT3Trail: null,
					fiboAnchors: null,
				}
				continue
			}
			if (fire.lifecycleConservative) {
				openUntilIdx = fire.lifecycleConservative.exitBrickIndexInDay
			}
		}

		dayPayloads.push({
			dayKey,
			bricks,
			candles: dayCandles.map(slimCandle),
			candles15m: (days15m.get(dayKey) ?? []).map(slimCandle),
		})
	}

	return {
		from,
		to,
		assetSymbol: ASSET_SYMBOL,
		days: dayPayloads,
		stats: {
			totalDays: dayPayloads.length,
			totalBricks: dayPayloads.reduce((acc, d) => acc + d.bricks.length, 0),
			totalFires: dayPayloads.reduce(
				(acc, d) => acc + d.bricks.filter((b) => b.fired).length,
				0
			),
			bricksGateBull: countBy(dayPayloads, (b) => b.gate60m === "BULL"),
			bricksGateBear: countBy(dayPayloads, (b) => b.gate60m === "BEAR"),
			bricksGateNoSignal: countBy(
				dayPayloads,
				(b) => b.gate60m === "NO_SIGNAL"
			),
		},
	}
}

const countBy = (
	days: EngineLabDayPayload[],
	pred: (_b: EngineLabBrick) => boolean
): number => days.reduce((acc, d) => acc + d.bricks.filter(pred).length, 0)
