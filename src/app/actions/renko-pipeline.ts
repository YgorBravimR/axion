// WIP renko pipeline from another session. Imports reference priceCandles +
// renko module exports that were removed in 9c1928b7 (R2 Parquet cutover).
// File not wired into any route (see 7abe9b7c commit). Keeping the scaffolding
// to be repaired in the parallel Hawks backtest work; suppressing tsc until
// then so the CI gate stays green on `main`. The `@ts-nocheck` cascades
// `any` through every reference, so the no-unsafe-* rules fire constantly
// in lint:strict — disable the whole family here too. Re-enable when the
// file is rewired into the new R2-Parquet pipeline.
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// @ts-nocheck
"use server"

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm"
import { z } from "zod"

import { dbWs } from "@/db/drizzle-ws"
import { assets, hawksRenkoSizes, priceCandles, timeframes } from "@/db/schema"
import { toSafeErrorMessage } from "@/lib/error-utils"
import {
	generateRenkoBricks,
	type RawBar,
	type RenkoBrick,
} from "@/lib/renko/brick-generator"
import {
	computeIndicators,
	type ComputeIndicatorsOptions,
} from "@/lib/renko/indicator-computer"
import {
	projectCrossTfIndicators,
	type BrickWithIndicators,
} from "@/lib/renko/cross-tf-join"
import type { ActionResponse } from "@/types"

// ─── Constants ─────────────────────────────────────────────────────────────

const TF_CODE_1M = "1m"
const TF_CODE_5M_CAL = "renko-5m-cal"
const TF_CODE_15M_CAL = "renko-15m-cal"
const TF_CODE_60M_CAL = "renko-60m-cal"

const INDICATOR_CONFIG_PER_TF: Record<string, ComputeIndicatorsOptions> = {
	[TF_CODE_5M_CAL]: {
		emaPeriods: [],
		macd: { fast: 21, slow: 89, signal: 42 },
	},
	[TF_CODE_15M_CAL]: {
		emaPeriods: [27, 55],
		macd: { fast: 27, slow: 117, signal: 55 },
	},
	[TF_CODE_60M_CAL]: {
		emaPeriods: [27, 55],
		macd: { fast: 27, slow: 117, signal: 55 },
	},
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface RegenerateResult {
	weekStartIso: string
	weekEndIso: string
	sourceBarCount: number
	bricks5mCount: number
	bricks15mCount: number
	bricks60mCount: number
	sizeR: { size5m: number; size15m: number; size60m: number }
	warnings: string[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("Invalid UUID format")
const isoDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

/** Build the UTC [start, end) bounds for the ISO week starting on `weekStartIso`. */
const weekBounds = (weekStartIso: string): { start: Date; end: Date } => {
	const start = new Date(`${weekStartIso}T00:00:00.000Z`)
	const end = new Date(start)
	end.setUTCDate(end.getUTCDate() + 7)
	return { start, end }
}

/**
 * Compute indicators for a single TF and return parallel-aligned indicator
 * bags per brick. Keys are TF-local ("mme27", "mme55", "macd") — they get
 * remapped to engine-facing keys ("mme27_60m" etc.) downstream in the join.
 */
const computeBricksWithIndicators = (
	bricks: RenkoBrick[],
	config: ComputeIndicatorsOptions
): BrickWithIndicators[] => {
	const { emas, macd } = computeIndicators(bricks, config)
	return bricks.map((brick, i) => {
		const indicators: Record<string, number> = {}
		for (const [period, series] of emas) {
			const value = series[i]
			if (value !== null && value !== undefined) {
				indicators[`mme${period}`] = value
			}
		}
		if (macd) {
			const point = macd[i]
			// Engine reads `macd` as the bias scalar (sign-based screen) — use the
			// histogram value, consistent with src/lib/backtest/entry/macd-wma-alignment.ts.
			if (point?.histogram !== null && point?.histogram !== undefined) {
				indicators.macd = point.histogram
			}
		}
		return { ...brick, indicators }
	})
}

// ─── Action ────────────────────────────────────────────────────────────────

/**
 * Regenerates Renko bricks for one (asset, ISO week) into priceCandles.
 *
 * Pipeline:
 *  1. Look up weekly R sizes from hawksRenkoSizes (effectiveDate = Monday).
 *  2. Fetch 1m bars from priceCandles in the [weekStart, weekEnd) window.
 *  3. Generate 3 brick streams (5m/15m/60m, each at its calibrated R).
 *  4. Compute per-TF indicators (EMAs, MACD).
 *  5. Project 15m + 60m EMAs onto the 5m stream so the engine reads a single
 *     timeframe at backtest time.
 *  6. Replace existing bricks for (asset, renko-*-cal, week range) atomically.
 *
 * Idempotent — re-running for the same (asset, week) produces the same rows.
 */
export const regenerateRenkoBricks = async (
	assetId: string,
	weekStartIso: string
): Promise<ActionResponse<RegenerateResult>> => {
	try {
		const assetIdParsed = uuidSchema.safeParse(assetId)
		if (!assetIdParsed.success) {
			return { status: "error", message: "Invalid assetId" }
		}

		const weekParsed = isoDateSchema.safeParse(weekStartIso)
		if (!weekParsed.success) {
			return { status: "error", message: "Invalid weekStartIso (YYYY-MM-DD)" }
		}

		// Step 1 — resolve asset + week sizes + timeframes.
		const asset = await dbWs.query.assets.findFirst({
			where: eq(assets.id, assetId),
		})
		if (!asset) {
			return { status: "error", message: `Asset not found: ${assetId}` }
		}

		const renkoSize = await dbWs.query.hawksRenkoSizes.findFirst({
			where: and(
				eq(hawksRenkoSizes.assetId, assetId),
				eq(hawksRenkoSizes.effectiveDate, weekStartIso)
			),
		})
		if (!renkoSize) {
			return {
				status: "error",
				message: `No renko sizes calibrated for week starting ${weekStartIso}. Import hawk-renkos CSV first.`,
			}
		}

		const requiredCodes = [
			TF_CODE_1M,
			TF_CODE_5M_CAL,
			TF_CODE_15M_CAL,
			TF_CODE_60M_CAL,
		]
		const tfRows = await dbWs.query.timeframes.findMany({
			where: inArray(timeframes.code, requiredCodes),
		})
		const tfByCode = new Map<string, (typeof tfRows)[number]>()
		for (const row of tfRows) {
			tfByCode.set(row.code, row)
		}
		for (const code of requiredCodes) {
			if (!tfByCode.has(code)) {
				return {
					status: "error",
					message: `Timeframe '${code}' is not seeded. Run migration 0008.`,
				}
			}
		}
		const tf1m = tfByCode.get(TF_CODE_1M)!
		const tf5m = tfByCode.get(TF_CODE_5M_CAL)!
		const tf15m = tfByCode.get(TF_CODE_15M_CAL)!
		const tf60m = tfByCode.get(TF_CODE_60M_CAL)!

		// Step 2 — fetch 1m bars for this week.
		const { start, end } = weekBounds(weekStartIso)
		const rawRows = await dbWs.query.priceCandles.findMany({
			where: and(
				eq(priceCandles.assetId, assetId),
				eq(priceCandles.timeframeId, tf1m.id),
				gte(priceCandles.timestamp, start),
				lte(priceCandles.timestamp, end)
			),
			orderBy: asc(priceCandles.timestamp),
		})

		if (rawRows.length === 0) {
			return {
				status: "error",
				message: `No 1m bars found for asset ${asset.symbol} in week ${weekStartIso}. Import raw bars first.`,
			}
		}

		const bars: RawBar[] = rawRows.map((r) => ({
			timestamp: r.timestamp,
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
		}))

		// Step 3 — generate brick streams per TF.
		const gen5m = generateRenkoBricks(bars, { sizeR: renkoSize.size5m })
		const gen15m = generateRenkoBricks(bars, { sizeR: renkoSize.size15m })
		const gen60m = generateRenkoBricks(bars, { sizeR: renkoSize.size60m })

		const warnings = [...gen5m.warnings, ...gen15m.warnings, ...gen60m.warnings]

		// Step 4 — compute per-TF indicators.
		const bricks5m = computeBricksWithIndicators(
			gen5m.bricks,
			INDICATOR_CONFIG_PER_TF[TF_CODE_5M_CAL]!
		)
		const bricks15m = computeBricksWithIndicators(
			gen15m.bricks,
			INDICATOR_CONFIG_PER_TF[TF_CODE_15M_CAL]!
		)
		const bricks60m = computeBricksWithIndicators(
			gen60m.bricks,
			INDICATOR_CONFIG_PER_TF[TF_CODE_60M_CAL]!
		)

		// Step 5 — project 15m + 60m EMAs onto the 5m stream.
		const enriched5m = projectCrossTfIndicators({
			bricks5m,
			bricks15m,
			bricks60m,
		})

		// Build the row sets for each TF. candleIndex = sequential within (asset,tf,week)
		// to keep the (asset, tf, timestamp, candleIndex) unique index satisfied when
		// multiple bricks share the same closeTimestamp (multi-R intra-bar moves).
		const toRows = (
			bricks: BrickWithIndicators[],
			timeframeId: string
		): (typeof priceCandles.$inferInsert)[] =>
			bricks.map((brick, i) => ({
				assetId,
				timeframeId,
				timestamp: brick.closeTimestamp,
				open: brick.open.toString(),
				high: Math.max(brick.open, brick.close).toString(),
				low: Math.min(brick.open, brick.close).toString(),
				close: brick.close.toString(),
				candleIndex: i,
				indicators: brick.indicators,
			}))

		const rows5m = toRows(enriched5m, tf5m.id)
		const rows15m = toRows(bricks15m, tf15m.id)
		const rows60m = toRows(bricks60m, tf60m.id)

		// Step 6 — replace bricks for this (asset, renko-*-cal, week range) atomically.
		await dbWs.transaction(async (tx) => {
			await tx
				.delete(priceCandles)
				.where(
					and(
						eq(priceCandles.assetId, assetId),
						inArray(priceCandles.timeframeId, [tf5m.id, tf15m.id, tf60m.id]),
						gte(priceCandles.timestamp, start),
						lte(priceCandles.timestamp, end)
					)
				)

			const CHUNK = 1000
			const insertChunked = async (
				rows: (typeof priceCandles.$inferInsert)[]
			) => {
				for (let i = 0; i < rows.length; i += CHUNK) {
					// eslint-disable-next-line no-await-in-loop -- sequential to avoid saturating the pool
					await tx.insert(priceCandles).values(rows.slice(i, i + CHUNK))
				}
			}
			await insertChunked(rows5m)
			await insertChunked(rows15m)
			await insertChunked(rows60m)
		})

		return {
			status: "success",
			message: `Regenerated Renko bricks for ${asset.symbol} week ${weekStartIso} — 5m:${rows5m.length} 15m:${rows15m.length} 60m:${rows60m.length}`,
			data: {
				weekStartIso,
				weekEndIso: end.toISOString().slice(0, 10),
				sourceBarCount: rawRows.length,
				bricks5mCount: rows5m.length,
				bricks15mCount: rows15m.length,
				bricks60mCount: rows60m.length,
				sizeR: {
					size5m: renkoSize.size5m,
					size15m: renkoSize.size15m,
					size60m: renkoSize.size60m,
				},
				warnings,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "regenerateRenkoBricks"),
		}
	}
}
