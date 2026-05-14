"use server"

import { db } from "@/db/drizzle"
import {
	assets,
	timeframes,
	priceCandles,
	indicatorDefinitions,
	indicatorGroups,
	priceDataVersions,
} from "@/db/schema"
import { sql, eq } from "drizzle-orm"
import { z } from "zod"
import { parseCandleCSV } from "@/lib/csv-parsers/candle-parser"
import {
	KNOWN_INDICATOR_MAPPINGS,
	KNOWN_INDICATOR_GROUPS,
} from "@/lib/csv-parsers/candle-header-mappings"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"
import type { ActionResponse } from "@/types"
import type {
	CandleValidationResult,
	CandleImportResult,
} from "./candle-import.types"

// ==========================================
// Zod Schemas
// ==========================================

const uuidSchema = z.string().uuid("Invalid UUID format")

// ==========================================
// Validate Candle Import
// ==========================================

/**
 * Validates and previews a candle CSV import without committing to the database.
 *
 * @param fileContent - Raw CSV file content
 * @param assetSymbol - Symbol of the asset (e.g., "WIN", "WDO")
 * @param timeframeCode - Timeframe code (e.g., "5m", "15m")
 * @returns Validation result with parsed candles and metadata
 */
export const validateCandleImport = async (
	formData: FormData
): Promise<ActionResponse<CandleValidationResult>> => {
	const t = await getTranslations("candleImport")
	try {
		const file = formData.get("csv") as File | null
		const assetSymbol = (formData.get("assetSymbol") as string | null) ?? ""
		const timeframeCode = (formData.get("timeframeCode") as string | null) ?? ""

		if (!file) {
			return { status: "error", message: t("errors.csvParseFailed") }
		}

		const fileContent = await file.text()

		// Step 1: Parse the CSV
		const parseResult = parseCandleCSV(fileContent)

		if (!parseResult.success) {
			return {
				status: "error",
				message: t("errors.csvParseFailed"),
				errors: parseResult.errors.map((error) => ({
					code: "PARSE_ERROR",
					detail: `Row ${error.row}: [${error.field}] ${error.message}`,
				})),
			}
		}

		// Step 2: Look up the asset by symbol (case-insensitive)
		const normalizedSymbol = assetSymbol.trim().toUpperCase()
		const matchedAsset = await db.query.assets.findFirst({
			where: eq(assets.symbol, normalizedSymbol),
		})

		if (!matchedAsset) {
			return {
				status: "error",
				message: t("errors.assetNotFound", { symbol: assetSymbol }),
			}
		}

		// Step 3: Look up the timeframe by code
		const normalizedCode = timeframeCode.trim().toLowerCase()
		const allTimeframes = await db.query.timeframes.findMany({
			where: eq(timeframes.isActive, true),
		})
		const matchedTimeframe = allTimeframes.find(
			(tf) => tf.code.toLowerCase() === normalizedCode
		)

		if (!matchedTimeframe) {
			return {
				status: "error",
				message: t("errors.timeframeNotFound", {
					code: timeframeCode,
					available: allTimeframes.map((tf) => tf.code).join(", "),
				}),
			}
		}

		// Step 4: Fetch allowlist to split indicators into registered vs skipped
		const registeredKeys = await db.query.indicatorDefinitions.findMany({
			where: eq(indicatorDefinitions.isActive, true),
			columns: { key: true },
		})
		const allowedKeys = new Set(registeredKeys.map((r) => r.key))

		const registeredIndicators = parseResult.detectedIndicators.filter((i) =>
			allowedKeys.has(i.key)
		)
		const skippedIndicators = parseResult.detectedIndicators.filter(
			(i) => !allowedKeys.has(i.key)
		)

		// Step 5: Return validation result — only flat scalars to avoid RSC nesting limits
		return {
			status: "success",
			message: t("actions.validated", {
				count: parseResult.candles.length,
				symbol: matchedAsset.symbol,
				timeframe: matchedTimeframe.name,
			}),
			data: {
				assetId: matchedAsset.id,
				assetName: matchedAsset.name,
				timeframeId: matchedTimeframe.id,
				timeframeName: matchedTimeframe.name,
				rowCount: parseResult.candles.length,
				dateFrom: parseResult.dateRange?.from.toISOString() ?? null,
				dateTo: parseResult.dateRange?.to.toISOString() ?? null,
				registeredIndicatorCount: registeredIndicators.length,
				skippedIndicatorCount: skippedIndicators.length,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "validateCandleImport"),
		}
	}
}

// ==========================================
// Commit Candle Import
// ==========================================

/**
 * Re-parses CSV content and commits candles to the database using bulk upsert.
 * Processes in chunks of 1,000 rows for memory efficiency.
 * Filters indicator values through an allowlist of registered definitions.
 * Accepts raw CSV text to avoid RSC serialization limits on large candle arrays.
 *
 * @param assetId - UUID of the target asset
 * @param timeframeId - UUID of the target timeframe
 * @param csvContent - Raw CSV file content (re-parsed server-side)
 * @returns Total rows imported, newly registered indicators, and skipped indicators
 */
export const commitCandleImport = async (
	formData: FormData
): Promise<ActionResponse<CandleImportResult>> => {
	const t = await getTranslations("candleImport")
	try {
		const assetId = (formData.get("assetId") as string | null) ?? ""
		const timeframeId = (formData.get("timeframeId") as string | null) ?? ""
		const file = formData.get("csv") as File | null

		// Step 1: Validate UUIDs
		const assetIdResult = uuidSchema.safeParse(assetId)
		if (!assetIdResult.success) {
			return { status: "error", message: t("errors.invalidAssetId") }
		}

		const timeframeIdResult = uuidSchema.safeParse(timeframeId)
		if (!timeframeIdResult.success) {
			return { status: "error", message: t("errors.invalidTimeframeId") }
		}

		if (!file) {
			return { status: "error", message: t("errors.csvParseFailed") }
		}

		// Step 2: Re-parse the CSV server-side — FormData transfers file as raw bytes,
		// bypassing the RSC binary encoding that fails on large strings.
		const csvContent = await file.text()
		const parseResult = parseCandleCSV(csvContent)
		if (!parseResult.success) {
			return {
				status: "error",
				message: t("errors.csvParseFailed"),
				errors: parseResult.errors.map((error) => ({
					code: "PARSE_ERROR",
					detail: `Row ${error.row}: [${error.field}] ${error.message}`,
				})),
			}
		}

		const candles = parseResult.candles

		if (candles.length === 0) {
			return { status: "error", message: t("errors.noCandlesToImport") }
		}

		// Step 3: Auto-register indicator definitions first — must happen before the
		// allowlist fetch so that first-time imports store all indicator values.
		const indicatorKeysInImport = new Set<string>()
		for (const candle of candles) {
			for (const key of Object.keys(candle.indicators)) {
				indicatorKeysInImport.add(key)
			}
		}

		const newIndicators: string[] = []
		const skippedKeys = new Set<string>()

		if (indicatorKeysInImport.size > 0) {
			const allGroups = await db.query.indicatorGroups.findMany()
			const groupKeyToId = new Map<string, string>()
			for (const group of allGroups) {
				groupKeyToId.set(group.key, group.id)
			}

			const indicatorValues = Array.from(indicatorKeysInImport).map((key) => {
				const knownMapping = KNOWN_INDICATOR_MAPPINGS.find((m) => m.key === key)
				return {
					key,
					displayName: knownMapping?.displayName ?? key,
					groupId: knownMapping
						? (groupKeyToId.get(knownMapping.groupKey) ?? null)
						: null,
					csvHeader: knownMapping?.csvHeader ?? null,
				}
			})

			for (const indicator of indicatorValues) {
				if (!indicator.groupId) {
					skippedKeys.add(indicator.key)
					continue
				}

				// eslint-disable-next-line no-await-in-loop -- sequential to avoid duplicate key races
				const existing = await db.query.indicatorDefinitions.findFirst({
					where: eq(indicatorDefinitions.key, indicator.key),
				})

				if (!existing) {
					// eslint-disable-next-line no-await-in-loop -- sequential insert after existence check
					await db.insert(indicatorDefinitions).values({
						key: indicator.key,
						displayName: indicator.displayName,
						groupId: indicator.groupId,
						csvHeader: indicator.csvHeader,
					})
					newIndicators.push(indicator.key)
				}
			}
		}

		// Step 4: Fetch updated allowlist — now includes any newly registered indicators
		const registeredKeys = await db.query.indicatorDefinitions.findMany({
			where: eq(indicatorDefinitions.isActive, true),
			columns: { key: true },
		})
		const allowedKeys = new Set(registeredKeys.map((r) => r.key))

		// Step 5: Insert candles in chunks
		const CHUNK_SIZE = 1000

		for (let i = 0; i < candles.length; i += CHUNK_SIZE) {
			const rawChunk = candles.slice(i, i + CHUNK_SIZE)

			// Deduplicate within chunk by (timestamp + candleIndex) — PostgreSQL rejects
			// ON CONFLICT DO UPDATE when the same conflict key appears twice in one INSERT batch.
			const deduped = new Map<string, (typeof rawChunk)[number]>()
			for (const candle of rawChunk) {
				const key = `${candle.timestamp.toISOString()}::${candle.candleIndex}`
				deduped.set(key, candle)
			}
			const chunk = Array.from(deduped.values())

			const values = chunk.map((candle) => {
				const filteredIndicators: Record<string, number> = {}
				for (const [key, value] of Object.entries(candle.indicators)) {
					if (allowedKeys.has(key)) {
						filteredIndicators[key] = value
					} else {
						skippedKeys.add(key)
					}
				}

				return {
					assetId,
					timeframeId,
					timestamp: candle.timestamp,
					open: candle.open.toString(),
					high: candle.high.toString(),
					low: candle.low.toString(),
					close: candle.close.toString(),
					candleIndex: candle.candleIndex,
					indicators: filteredIndicators,
				}
			})

			// eslint-disable-next-line no-await-in-loop -- batch inserts are intentionally sequential to avoid saturating the DB connection pool
			await db
				.insert(priceCandles)
				.values(values)
				.onConflictDoUpdate({
					target: [
						priceCandles.assetId,
						priceCandles.timeframeId,
						priceCandles.timestamp,
						priceCandles.candleIndex,
					],
					set: {
						open: sql`EXCLUDED.open`,
						high: sql`EXCLUDED.high`,
						low: sql`EXCLUDED.low`,
						close: sql`EXCLUDED.close`,
						indicators: sql`COALESCE(price_candles.indicators, '{}'::jsonb) || EXCLUDED.indicators`,
						updatedAt: sql`NOW()`,
					},
				})
		}

		// Step 6: Upsert price data version
		const existingVersion = await db.query.priceDataVersions.findFirst({
			where: sql`${priceDataVersions.assetId} = ${assetId} AND ${priceDataVersions.timeframeId} = ${timeframeId}`,
		})

		if (existingVersion) {
			await db
				.update(priceDataVersions)
				.set({
					version: existingVersion.version + 1,
					lastImportedAt: new Date(),
					rowCount: candles.length,
					updatedAt: new Date(),
				})
				.where(eq(priceDataVersions.id, existingVersion.id))
		} else {
			await db.insert(priceDataVersions).values({
				assetId,
				timeframeId,
				version: 1,
				lastImportedAt: new Date(),
				rowCount: candles.length,
			})
		}

		return {
			status: "success",
			message: t("actions.importSuccess", {
				count: candles.length,
				newIndicators: newIndicators.length,
				skipped: skippedKeys.size,
			}),
			data: {
				totalRows: candles.length,
				newIndicators,
				skippedIndicators: Array.from(skippedKeys),
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "commitCandleImport"),
		}
	}
}

// ==========================================
// Seed Indicator Definitions
// ==========================================

/**
 * Seeds indicator groups and known indicator definitions.
 * First upserts all groups from KNOWN_INDICATOR_GROUPS, then upserts
 * all indicators from KNOWN_INDICATOR_MAPPINGS with resolved groupIds.
 * Idempotent — uses onConflictDoNothing on unique key columns.
 */
export const seedIndicatorDefinitions = async (): Promise<
	ActionResponse<{ seeded: number }>
> => {
	const t = await getTranslations("candleImport")
	try {
		// Step 1: Upsert all indicator groups
		if (KNOWN_INDICATOR_GROUPS.length > 0) {
			const groupValues = KNOWN_INDICATOR_GROUPS.map((group, index) => ({
				key: group.key,
				displayName: group.displayName,
				description: group.description,
				sortOrder: index,
			}))

			await db
				.insert(indicatorGroups)
				.values(groupValues)
				.onConflictDoNothing({ target: indicatorGroups.key })
		}

		// Step 2: Fetch all groups from DB to get their IDs
		const groups = await db.query.indicatorGroups.findMany()

		// Step 3: Build groupKey → groupId map
		const groupKeyToId = new Map<string, string>()
		for (const group of groups) {
			groupKeyToId.set(group.key, group.id)
		}

		// Step 4: Upsert all indicator definitions with resolved groupIds
		const values = KNOWN_INDICATOR_MAPPINGS.map((mapping, index) => {
			const resolvedGroupId = groupKeyToId.get(mapping.groupKey)
			if (!resolvedGroupId) {
				throw new Error(
					`Group "${mapping.groupKey}" not found for indicator "${mapping.key}"`
				)
			}
			return {
				key: mapping.key,
				displayName: mapping.displayName,
				csvHeader: mapping.csvHeader,
				sortOrder: index,
				groupId: resolvedGroupId,
			}
		})

		const result = await db
			.insert(indicatorDefinitions)
			.values(values)
			.onConflictDoNothing({ target: indicatorDefinitions.key })

		return {
			status: "success",
			message: t("actions.seededIndicators", {
				mappings: values.length,
				groups: groups.length,
			}),
			data: {
				seeded: result.rowCount ?? 0,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "seedIndicatorDefinitions"),
		}
	}
}
