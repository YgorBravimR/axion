"use server"

import { eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { assets, timeframes } from "@/db/schema"
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
	stopReference: number | null,
	exitMode: ExitMode,
	targetPrice: number | null,
	trailAfter3R: boolean
): TradeLifecycle => {
	const initialStop = stopReference ?? entryClose
	const brickBody = Math.abs(initialStop - entryClose) / 2
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
const computeFiboAnchors = (
	direction: Direction,
	retracementPeak: number | null,
	lastTopo15m: number | null,
	lastFundo15m: number | null
): FiboAnchors | null => {
	if (
		retracementPeak === null ||
		lastTopo15m === null ||
		lastFundo15m === null
	) {
		return null
	}
	const impulseSize = Math.abs(lastTopo15m - lastFundo15m)
	if (impulseSize <= 0) {
		return null
	}
	// SHORT: impulse went down (topo → fundo); projection subtracts from peak.
	// LONG: impulse went up (fundo → topo); projection adds to peak.
	const sign = direction === "short" ? -1 : 1
	return {
		retracementPeak,
		impulseStartPrice: direction === "short" ? lastTopo15m : lastFundo15m,
		impulseEndPrice: direction === "short" ? lastFundo15m : lastTopo15m,
		impulseSize,
		t1: retracementPeak + sign * impulseSize * 0.764,
		t2: retracementPeak + sign * impulseSize * 1.0,
		t3: retracementPeak + sign * impulseSize * 1.618,
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
	const sortedDayKeys = [...days.keys()].sort()

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
	// Last CONFIRMED swing pivots from the period-2 detector. The
	// detector emits noise topos during a continuing bearish run (and
	// noise fundos during a bullish run), so we dedup by alternating
	// type — same pattern as `hawks-isolation-charts.tsx:547`.
	let lastTopoPrice: number | null = null
	let lastFundoPrice: number | null = null
	let lastAdoptedPivotType: "topo" | "fundo" | null = null
	// Running extremes since the last confirmation. SHORT gate compares
	// runningHighSinceLastTopo against lastTopoPrice — if price has
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
				htfSnapshot
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
						lastTopoPrice = pivotStep.pivot.price
						runningHighSinceLastTopo = null
					} else {
						lastFundoPrice = pivotStep.pivot.price
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
			const realFired = result.signal !== null
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
			// Leg-shape gate: the JUST-COMPLETED leg must show expansion ≥ 4
			// (real impulse) AND retraction ≥ 2 (real pullback, not a
			// single-brick wick). Read from the PRE-step snapshot since
			// this brick IS the VB flip and stepLeg has already collapsed
			// retraction → fresh expansion=1.
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
			const fiveMinStructureOk =
				directionAllowed === "short"
					? lastTopoPrice !== null &&
						runningHighSinceLastTopo !== null &&
						runningHighSinceLastTopo < lastTopoPrice
					: directionAllowed === "long"
						? lastFundoPrice !== null &&
							runningLowSinceLastFundo !== null &&
							runningLowSinceLastFundo > lastFundoPrice
						: false
			const canDemoFire =
				DEMO_FIRES &&
				!realFired &&
				directionAllowed !== null &&
				inTradingWindow &&
				!cooldownActive &&
				brickDirectionAgrees &&
				isVB &&
				gateStable &&
				legShapeOk &&
				fiveMinStructureOk
			let fired = realFired
			let direction = result.signal?.direction ?? null
			let price = result.signal?.price ?? null
			let stopReference = result.signal?.stopReference ?? null
			let label = result.signal?.label ?? null
			let tier = result.signal?.quality?.tier ?? null
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

			// Capture retracement-peak anchor at fire time (spec §5).
			// SHORT entry uses runningHighSinceLastTopo, LONG uses
			// runningLowSinceLastFundo. The 15m anchors come from the HtfWalker.
			let fiboAnchors: FiboAnchors | null = null
			if (fired && direction !== null) {
				const retracementPeak =
					direction === "short"
						? runningHighSinceLastTopo
						: runningLowSinceLastFundo
				fiboAnchors = computeFiboAnchors(
					direction,
					retracementPeak,
					htfSnapshot?.lastTopo15m ?? null,
					htfSnapshot?.lastFundo15m ?? null
				)
			}
			bricks.push({
				brickIndexInDay: i,
				timestamp: candle.timestamp,
				open: candle.open,
				high: candle.high,
				low: candle.low,
				close: candle.close,
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
			})
		}

		// Phase B + D — post-entry lifecycle simulator. For each fired
		// brick, walk forward simulating BOTH conservative (Mode 1) and
		// moderate (Mode 2) exits. The lab UI toggles which one to render.
		//
		//   - Initial stop at signal.stopReference (≈ entry ± 2 brickBodies).
		//   - Breakeven trigger (universal): net favorable price reaches 1R
		//     AND current brick closes favorable (spec §2).
		//   - Mode 1 (conservative): static 3R target, no trail.
		//   - Mode 2 (moderate): no target; trail activates at 3R (= 6 ×
		//     renkoSize favorable AND favorable brick close) and from
		//     there the stop trails `brick.close ± 2 × renkoSize` on every
		//     brick close, never moving adversely (spec §7).
		//   - EOD: forced close at the last brick of the day.
		//
		// The renkoSize per fire is derived from the entry brick's body
		// (close-to-open). Hawks bricks have constant body magnitude per
		// triple, so this is a stable per-fire constant.
		for (let i = 0; i < bricks.length; i++) {
			const fire = bricks[i]!
			if (!fire.fired || fire.direction === null || fire.price === null) {
				continue
			}
			const initialStop = fire.stopReference ?? fire.price
			const brickBody = Math.abs(initialStop - fire.price) / 2
			const static3RTarget =
				fire.direction === "long"
					? fire.price + 6 * brickBody
					: fire.price - 6 * brickBody
			const lifecycleConservative = simulateLifecycle(
				bricks,
				i,
				fire.direction,
				fire.price,
				fire.stopReference,
				"conservative",
				static3RTarget,
				false
			)
			const lifecycleModerate = simulateLifecycle(
				bricks,
				i,
				fire.direction,
				fire.price,
				fire.stopReference,
				"moderate",
				null,
				true
			)
			// Phase E — fibo measured-move modes. 3a (target only) and 3b
			// (target + trail). When the 15m anchors are missing we omit
			// the fibo lifecycles entirely (the UI shows N/A); we don't
			// auto-fall-back to trail-only here so the user can see when
			// fibo anchors were unavailable.
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
					fire.stopReference,
					exitMode,
					targetPrice,
					withTrail
				)
			bricks[i] = {
				...fire,
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

		dayPayloads.push({
			dayKey,
			bricks,
			candles: dayCandles.map(slimCandle),
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
