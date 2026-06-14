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
import type { CandleRow } from "@/types/candle"
import type {
	EngineLabBrick,
	EngineLabCandle,
	EngineLabDayPayload,
	HawksEngineLabData,
} from "./hawks-engine-lab-data.types"

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

	// Demo-fire cadence: fire one synthetic entry per day for the first
	// gate-allowed + cooldown-elapsed brick. One fire per day is enough
	// to validate the marker pipeline visually without polluting the
	// chart. Set to false to suppress.
	const DEMO_FIRES = true

	for (const dayKey of sortedDayKeys) {
		const dayCandles = days.get(dayKey)!
		const bricks: EngineLabBrick[] = []
		let demoFireBricksLeftThisDay = DEMO_FIRES ? 1 : 0

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

			// Demo-fire path: only used to validate the chart marker pipeline
			// while playbook stubs return null. Skipped automatically the
			// moment a real playbook starts firing.
			//
			// Direction-vs-brick-direction guard: a real entry can only fire
			// on a brick that moves IN the trade direction. LONGs require a
			// bullish 5m brick (close > open); SHORTs require a bearish one.
			// Firing a SHORT on a bullish brick would mean "we just saw price
			// move up, so we sell" — structurally wrong. Mirror for LONG.
			const realFired = result.signal !== null
			const isBullishBrick = candle.close > candle.open
			const isBearishBrick = candle.close < candle.open
			const brickDirectionAgrees =
				directionAllowed === "long"
					? isBullishBrick
					: directionAllowed === "short"
						? isBearishBrick
						: false
			const canDemoFire =
				DEMO_FIRES &&
				!realFired &&
				demoFireBricksLeftThisDay > 0 &&
				directionAllowed !== null &&
				inTradingWindow &&
				!cooldownActive &&
				brickDirectionAgrees
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
				demoFireBricksLeftThisDay--
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
