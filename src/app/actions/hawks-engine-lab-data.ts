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
import type { CandleRow } from "@/types/candle"
import type {
	EmaSlope,
	EngineLabBrick,
	EngineLabCandle,
	EngineLabDayPayload,
	HawksEngineLabData,
	MacdSign,
	PivotBias,
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

	const candles5m = await fetchTfCandles(
		"hawk_5m_win",
		assetId,
		fromDate,
		toDate
	)

	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("hawksV0 preset is not hawks_playbook")
	}
	const config = hawksV0.entry.config

	// Precompute HTF walker over the full window once — same as engine.
	const htfWalker = buildHtfWalker(candles5m, config)

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

	for (const dayKey of sortedDayKeys) {
		const dayCandles = days.get(dayKey)!
		const bricks: EngineLabBrick[] = []

		// Per-day structural pivot detector (period-2 Dow theory) — same
		// detector used by the engine + Indicator Lab. Resets at day
		// boundary; bias forward-fills until the next confirmation.
		let pivotState = createStructuralPivotState()
		let currentPivotBias: PivotBias = null

		// Track prior-brick color for the VB (Virada de Box) entry constraint
		// + last-gate-state for the gate-stability constraint. Both are
		// per-day; reset at day boundary.
		let priorBrickWasBullish: boolean | null = null
		let priorGate60m: "BULL" | "BEAR" | "NO_SIGNAL" | null = null

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

		// --- Soft 5m HH/LL gate.
		// SHORT allowed when the LAST swing-high (topo) is LOWER than the
		// prior swing-high. LONG allowed when the LAST swing-low (fundo)
		// is HIGHER than the prior swing-low. Lows/highs of the OTHER side
		// are ignored (user picked option B).
		let lastTopoPrice: number | null = null
		let priorTopoPrice: number | null = null
		let lastFundoPrice: number | null = null
		let priorFundoPrice: number | null = null

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
				if (pivotStep.pivot.type === "topo") {
					priorTopoPrice = lastTopoPrice
					lastTopoPrice = pivotStep.pivot.price
				} else {
					priorFundoPrice = lastFundoPrice
					lastFundoPrice = pivotStep.pivot.price
				}
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
			// Soft 5m HH/LL gate (user spec option B): SHORT requires last
			// swing-high lower than prior swing-high; LONG requires last
			// swing-low higher than prior swing-low. NULL on either pivot
			// → not enough structure yet → fire blocked.
			const fiveMinStructureOk =
				directionAllowed === "short"
					? lastTopoPrice !== null &&
						priorTopoPrice !== null &&
						lastTopoPrice < priorTopoPrice
					: directionAllowed === "long"
						? lastFundoPrice !== null &&
							priorFundoPrice !== null &&
							lastFundoPrice > priorFundoPrice
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
				// Stop ~1 brick body away in the adverse direction.
				const adverseDelta =
					direction === "long"
						? -(Math.abs(candle.close - candle.open) || 100)
						: Math.abs(candle.close - candle.open) || 100
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
				fired,
				direction,
				price,
				stopReference,
				label,
				tier,
			})
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
