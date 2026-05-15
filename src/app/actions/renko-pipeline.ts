"use server"

import { db } from "@/db/drizzle"
import { assets, timeframes, priceCandles, hawksRenkoSizes } from "@/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { toSafeErrorMessage } from "@/lib/error-utils"
import {
	generateRenkoBricksWeekly,
	isoWeekMondayKey,
} from "@/lib/renko/weekly-walk"
import { computeEma, computeMacd } from "@/lib/renko/indicator-computer"
import {
	projectIndicators,
	type ProjectedSource,
	type SeriesPoint,
} from "@/lib/renko/cross-tf-join"
import type { RawBar, RenkoBrick } from "@/lib/renko/brick-generator"

import type { ActionResponse } from "@/types"
import type { RegenerateRenkoResult } from "./renko-pipeline.types"

// ───────────────────────────────────────────────────────────
// Renko TF metadata — these are the three calibration-driven
// timeframes that the Hawks v0 pipeline produces. The `code`
// strings are stable contracts: they're what the engine + UI
// look up by. The `name` is human-facing; safe to retitle.
// ───────────────────────────────────────────────────────────

const RENKO_TFS = [
	{
		code: "renko-5m-cal" as const,
		name: "Renko (5m calibration)",
		valueMinutes: 5,
		sortOrder: 100,
	},
	{
		code: "renko-15m-cal" as const,
		name: "Renko (15m calibration)",
		valueMinutes: 15,
		sortOrder: 101,
	},
	{
		code: "renko-60m-cal" as const,
		name: "Renko (60m calibration)",
		valueMinutes: 60,
		sortOrder: 102,
	},
]

const inputSchema = z.object({
	assetSymbol: z.string().min(1).max(20),
})

// ───────────────────────────────────────────────────────────
// Step helpers
// ───────────────────────────────────────────────────────────

/** Insert the three renko-*-cal timeframes if they don't exist. Returns their IDs. */
const ensureRenkoTimeframes = async (): Promise<
	Record<(typeof RENKO_TFS)[number]["code"], string>
> => {
	await db
		.insert(timeframes)
		.values(
			RENKO_TFS.map((tf) => ({
				code: tf.code,
				name: tf.name,
				type: "renko" as const,
				value: tf.valueMinutes,
				unit: "points" as const,
				sortOrder: tf.sortOrder,
				isActive: true,
			}))
		)
		.onConflictDoNothing({ target: timeframes.code })

	const rows = await db.query.timeframes.findMany()
	const out = {} as Record<(typeof RENKO_TFS)[number]["code"], string>
	for (const tf of RENKO_TFS) {
		const found = rows.find((r) => r.code === tf.code)
		if (!found) {
			throw new Error(
				`Renko timeframe seed failed: ${tf.code} not found after upsert`
			)
		}
		out[tf.code] = found.id
	}
	return out
}

/** Look up the 1m time-based timeframe (raw input source). */
const requireOneMinuteTimeframe = async (): Promise<string> => {
	const tf = await db.query.timeframes.findFirst({
		where: eq(timeframes.code, "1m"),
	})
	if (!tf) {
		throw new Error(
			"Required timeframe '1m' not found. Seed it before regenerating Renko."
		)
	}
	return tf.id
}

const loadRawBars = async (
	assetId: string,
	oneMinuteId: string
): Promise<(RawBar & { readonly indicators: Record<string, number> })[]> => {
	const rows = await db
		.select({
			timestamp: priceCandles.timestamp,
			open: priceCandles.open,
			high: priceCandles.high,
			low: priceCandles.low,
			close: priceCandles.close,
			indicators: priceCandles.indicators,
		})
		.from(priceCandles)
		.where(
			and(
				eq(priceCandles.assetId, assetId),
				eq(priceCandles.timeframeId, oneMinuteId)
			)
		)
		.orderBy(asc(priceCandles.timestamp))

	return rows.map((r) => ({
		timestamp: r.timestamp,
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
		indicators: (r.indicators ?? {}) as Record<string, number>,
	}))
}

const loadWeeklySizes = async (): Promise<{
	readonly size5m: Map<string, number>
	readonly size15m: Map<string, number>
	readonly size60m: Map<string, number>
}> => {
	const rows = await db
		.select()
		.from(hawksRenkoSizes)
		.orderBy(asc(hawksRenkoSizes.effectiveDate))

	const size5m = new Map<string, number>()
	const size15m = new Map<string, number>()
	const size60m = new Map<string, number>()
	for (const r of rows) {
		// effectiveDate is PG `date` → Drizzle returns string "YYYY-MM-DD"
		const k = r.effectiveDate as unknown as string
		size5m.set(k, r.size5m)
		size15m.set(k, r.size15m)
		size60m.set(k, r.size60m)
	}
	return { size5m, size15m, size60m }
}

/**
 * Build a sparse SeriesPoint[] for cross-TF projection from a brick series
 * + indicator array. Null values stay null (warmup is visible to the
 * projection so we don't artificially extend an indicator backwards).
 */
const toSeriesPoints = (
	bricks: readonly RenkoBrick[],
	values: readonly (number | null)[]
): SeriesPoint[] => {
	const out: SeriesPoint[] = []
	for (let i = 0; i < bricks.length; i++) {
		out.push({
			closeTimestamp: bricks[i]!.closeTimestamp,
			value: values[i] ?? null,
		})
	}
	return out
}

// ───────────────────────────────────────────────────────────
// Main action
// ───────────────────────────────────────────────────────────

export const regenerateRenkoBricks = async (
	formData: FormData
): Promise<ActionResponse<RegenerateRenkoResult>> => {
	try {
		const parsed = inputSchema.safeParse({
			assetSymbol: (formData.get("assetSymbol") as string | null) ?? "",
		})
		if (!parsed.success) {
			return {
				status: "error",
				message: "Invalid input",
				errors: parsed.error.issues.map((e) => ({
					code: "VALIDATION",
					detail: e.message,
					field: e.path.join("."),
				})),
			}
		}

		const symbol = parsed.data.assetSymbol.trim().toUpperCase()

		const asset = await db.query.assets.findFirst({
			where: eq(assets.symbol, symbol),
		})
		if (!asset) {
			return {
				status: "error",
				message: `Asset not found: ${symbol}`,
			}
		}

		const renkoTfIds = await ensureRenkoTimeframes()
		const oneMinuteId = await requireOneMinuteTimeframe()

		const rawBars = await loadRawBars(asset.id, oneMinuteId)
		if (rawBars.length === 0) {
			return {
				status: "error",
				message: `No 1m raw bars found for ${symbol}. Import raw OHLC first.`,
			}
		}

		const sizes = await loadWeeklySizes()
		if (sizes.size5m.size === 0) {
			return {
				status: "error",
				message: "No weekly Renko sizes loaded. Import hawksRenkoSizes first.",
			}
		}

		// 60m bricks + EMAs + MACD
		const w60 = generateRenkoBricksWeekly(rawBars, {
			sizeByEffectiveDate: sizes.size60m,
		})
		const closes60 = w60.bricks.map((b) => b.close)
		const ema27_60 = computeEma(closes60, 27)
		const ema55_60 = computeEma(closes60, 55)
		const macd60 = computeMacd(closes60, { fast: 12, slow: 26, signal: 9 })

		// 15m bricks + EMA27
		const w15 = generateRenkoBricksWeekly(rawBars, {
			sizeByEffectiveDate: sizes.size15m,
		})
		const closes15 = w15.bricks.map((b) => b.close)
		const ema27_15 = computeEma(closes15, 27)

		// 5m host bricks (no on-self indicators; everything projected in)
		const w5 = generateRenkoBricksWeekly(rawBars, {
			sizeByEffectiveDate: sizes.size5m,
		})

		// Project 60m and 15m indicators onto 5m host. We use the MACD line
		// (fast EMA − slow EMA) as the "macd" key — see gotchas note on
		// ProfitChart MACD semantics.
		const sources: ProjectedSource[] = [
			{
				key: "mme27_60m",
				series: toSeriesPoints(w60.bricks, ema27_60),
			},
			{
				key: "mme55_60m",
				series: toSeriesPoints(w60.bricks, ema55_60),
			},
			{
				key: "mme27_15m",
				series: toSeriesPoints(w15.bricks, ema27_15),
			},
			{
				key: "macd",
				series: toSeriesPoints(w60.bricks, macd60.line),
			},
		]
		const projected5m = projectIndicators(
			w5.bricks.map((b) => ({ closeTimestamp: b.closeTimestamp })),
			sources
		)

		// Per-TF enrichment for storage. 5m gets projected keys; 15m/60m
		// get their own indicators (useful for later debug / inspection).
		const enriched60 = w60.bricks.map((brick, i) => ({
			brick,
			indicators: stripNulls({
				ema27: ema27_60[i],
				ema55: ema55_60[i],
				macd_line: macd60.line[i],
				macd_signal: macd60.signal[i],
				macd_hist: macd60.histogram[i],
			}),
		}))
		const enriched15 = w15.bricks.map((brick, i) => ({
			brick,
			indicators: stripNulls({ ema27: ema27_15[i] }),
		}))
		const enriched5 = w5.bricks.map((brick, i) => ({
			brick,
			indicators: stripNulls(projected5m[i] ?? {}),
		}))

		// Wipe + replace inside a single transaction to keep state consistent.
		const renkoIdToEnriched: {
			tfId: string
			code: (typeof RENKO_TFS)[number]["code"]
			rows: { brick: RenkoBrick; indicators: Record<string, number> }[]
		}[] = [
			{
				tfId: renkoTfIds["renko-60m-cal"],
				code: "renko-60m-cal",
				rows: enriched60,
			},
			{
				tfId: renkoTfIds["renko-15m-cal"],
				code: "renko-15m-cal",
				rows: enriched15,
			},
			{
				tfId: renkoTfIds["renko-5m-cal"],
				code: "renko-5m-cal",
				rows: enriched5,
			},
		]

		await db.transaction(async (tx) => {
			for (const group of renkoIdToEnriched) {
				// Sequential awaits inside transaction are intentional — Drizzle's
				// tx isn't safe under Promise.all; ordering must be preserved.
				// eslint-disable-next-line no-await-in-loop
				await tx
					.delete(priceCandles)
					.where(
						and(
							eq(priceCandles.assetId, asset.id),
							eq(priceCandles.timeframeId, group.tfId)
						)
					)

				if (group.rows.length === 0) {
					continue
				}

				const BATCH = 1_000
				for (let i = 0; i < group.rows.length; i += BATCH) {
					const slice = group.rows.slice(i, i + BATCH)
					const values = slice.map((row, idx) => {
						const candleIndex = i + idx
						const b = row.brick
						return {
							assetId: asset.id,
							timeframeId: group.tfId,
							timestamp: b.closeTimestamp,
							open: b.open.toFixed(2),
							high: Math.max(b.open, b.close).toFixed(2),
							low: Math.min(b.open, b.close).toFixed(2),
							close: b.close.toFixed(2),
							candleIndex,
							indicators: row.indicators,
						}
					})
					// eslint-disable-next-line no-await-in-loop
					await tx.insert(priceCandles).values(values)
				}
			}
		})

		const allWarnings = [...w60.warnings, ...w15.warnings, ...w5.warnings]
		const weeksCovered = new Set(
			rawBars.map((b) => isoWeekMondayKey(b.timestamp))
		).size

		const result: RegenerateRenkoResult = {
			assetSymbol: symbol,
			rawBarsLoaded: rawBars.length,
			perTimeframe: [
				{
					code: "renko-60m-cal",
					bricksGenerated: enriched60.length,
					warnings: w60.warnings,
				},
				{
					code: "renko-15m-cal",
					bricksGenerated: enriched15.length,
					warnings: w15.warnings,
				},
				{
					code: "renko-5m-cal",
					bricksGenerated: enriched5.length,
					warnings: w5.warnings,
				},
			],
			weeksCovered,
		}

		return {
			status: "success",
			message: `Regenerated ${enriched5.length + enriched15.length + enriched60.length} Renko bricks for ${symbol}${
				allWarnings.length > 0 ? ` (with ${allWarnings.length} warnings)` : ""
			}`,
			data: result,
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
		}
	}
}

const stripNulls = (
	obj: Record<string, number | null | undefined>
): Record<string, number> => {
	const out: Record<string, number> = {}
	for (const [k, v] of Object.entries(obj)) {
		if (v !== null && v !== undefined && Number.isFinite(v)) {
			out[k] = v
		}
	}
	return out
}
