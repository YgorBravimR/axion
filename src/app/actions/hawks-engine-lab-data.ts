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
	EngineLabDayPayload,
	HawksEngineLabData,
} from "./hawks-engine-lab-data.types"

const ASSET_SYMBOL = "WIN"

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
 * Note: with all 3 playbook stubs returning null, `fires` will be
 * empty on every brick. The interesting columns until steps 4-6 land
 * are `gate60m`, `gate15m`, `directionAllowed`, and `cooldownActive`.
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

	for (const dayKey of sortedDayKeys) {
		const dayCandles = days.get(dayKey)!
		const bricks: EngineLabBrick[] = []

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
				fired: result.signal !== null,
				direction: result.signal?.direction ?? null,
				price: result.signal?.price ?? null,
				stopReference: result.signal?.stopReference ?? null,
				label: result.signal?.label ?? null,
				tier: result.signal?.quality?.tier ?? null,
			})
		}

		dayPayloads.push({
			dayKey,
			bricks,
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
