/**
 * Daily session anchors — `(asset, BRT date)` constants surfaced via
 * `asset_session_anchors`.
 *
 * Use this module for any value that is FIXED across the trading day:
 *   - `ajuste`     — D-1 settlement price (from B3 / ProfitChart)
 *   - `ajuste_adj` — adjusted settlement / official close
 *   - (future)     — prior_open / prior_high / prior_low / prior_close /
 *                    pivot R1/R2/S1/S2 / opening range / anchored VWAPs
 *
 * The table stores the values exactly once per (asset, day) — they are
 * NOT duplicated across every candle row. To make engine code that
 * still reads `candle.indicators.<key>` keep working, callers fetch a
 * batched `Map<BRT-date, payload>` and pass it to
 * `enrichCandlesWithAnchors(candles, anchorsByDate)` before handing
 * candles to the engine. The enrichment writes the payload keys onto
 * each candle's `indicators` blob in-memory (no DB write).
 */

import { db } from "@/db/drizzle"
import { assetSessionAnchors } from "@/db/schema"
import { and, between, eq } from "drizzle-orm"
import { z } from "zod"

// BRT is UTC-3 fixed (Brazil dropped DST in 2019). In milliseconds:
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

/**
 * Canonical shape of `asset_session_anchors.payload`. All keys are
 * optional — older days may carry only `ajuste`; richer days may
 * carry pivots and prior O/H/L/C. Coerced + validated at read time.
 */
export const dailyAnchorPayloadSchema = z
	.object({
		ajuste: z.number().optional(),
		ajuste_adj: z.number().optional(),
		prior_open: z.number().optional(),
		prior_high: z.number().optional(),
		prior_low: z.number().optional(),
		prior_close: z.number().optional(),
		pivot_r1: z.number().optional(),
		pivot_r2: z.number().optional(),
		pivot_s1: z.number().optional(),
		pivot_s2: z.number().optional(),
		opening_range_high: z.number().optional(),
		opening_range_low: z.number().optional(),
	})
	.passthrough() // unknown keys flow through untouched

export type DailyAnchorPayload = z.infer<typeof dailyAnchorPayloadSchema>

/** ISO date string `YYYY-MM-DD` (BRT). */
export type IsoDate = string

/**
 * Convert a candle timestamp (UTC) to its BRT trading-day ISO date.
 * Pre-2019 DST is intentionally ignored — Brazil dropped DST in 2019.
 */
export const candleTimestampToBrtDate = (ts: Date): IsoDate => {
	const brt = new Date(ts.getTime() + BRT_OFFSET_MS)
	return brt.toISOString().slice(0, 10)
}

/**
 * Batched lookup. Fetches all anchor rows for `assetId` within the BRT
 * date range, parses the JSONB through the Zod schema, returns a Map
 * keyed by ISO date (YYYY-MM-DD).
 *
 * Designed to be called ONCE per backtest run (not per candle).
 */
export const getDailyAnchors = async (
	assetId: string,
	fromDate: IsoDate,
	toDate: IsoDate
): Promise<Map<IsoDate, DailyAnchorPayload>> => {
	const rows = await db
		.select({
			date: assetSessionAnchors.date,
			payload: assetSessionAnchors.payload,
		})
		.from(assetSessionAnchors)
		.where(
			and(
				eq(assetSessionAnchors.assetId, assetId),
				between(assetSessionAnchors.date, fromDate, toDate)
			)
		)
	const out = new Map<IsoDate, DailyAnchorPayload>()
	for (const r of rows) {
		const parsed = dailyAnchorPayloadSchema.safeParse(r.payload)
		if (parsed.success) {
			out.set(r.date, parsed.data)
		}
	}
	return out
}

interface CandleWithIndicators {
	timestamp: Date
	indicators: Record<string, unknown> | null
}

/**
 * Mutates each candle's `indicators` in place, merging the anchor
 * payload for that candle's BRT date. Existing JSONB keys on the
 * candle take precedence — this is additive, not destructive.
 *
 * The mutation is intentional: it keeps engine code that reads
 * `candle.indicators.ajuste` working without a signature change.
 */
export const enrichCandlesWithAnchors = (
	candles: CandleWithIndicators[],
	anchorsByDate: Map<IsoDate, DailyAnchorPayload>
): { enriched: number; missing: number } => {
	let enriched = 0
	let missing = 0
	for (const c of candles) {
		const dateKey = candleTimestampToBrtDate(c.timestamp)
		const payload = anchorsByDate.get(dateKey)
		if (!payload) {
			missing++
			continue
		}
		// JSONB column is `null` when no indicators were attached at ingest.
		// We allocate a fresh object so the engine never receives `null`
		// after enrichment — simpler downstream guards.
		const current =
			c.indicators === null ? {} : (c.indicators as Record<string, unknown>)
		for (const [key, value] of Object.entries(payload)) {
			if (!(key in current)) {
				current[key] = value
			}
		}
		c.indicators = current
		enriched++
	}
	return { enriched, missing }
}
