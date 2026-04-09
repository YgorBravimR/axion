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
import type { RawCandleRow, DetectedIndicator } from "@/lib/csv-parsers/candle-parser"
import type { ActionResponse } from "@/types"

// ==========================================
// Types
// ==========================================

interface CandleValidationResult {
	assetId: string
	assetName: string
	timeframeId: string
	timeframeName: string
	rowCount: number
	dateRange: { from: Date; to: Date } | null
	detectedIndicators: DetectedIndicator[]
	registeredIndicators: DetectedIndicator[]
	skippedIndicators: DetectedIndicator[]
	errors: Array<{ row: number; field: string; message: string }>
	warnings: Array<{ row: number; message: string }>
	candles: RawCandleRow[]
}

interface CandleImportResult {
	totalRows: number
	newIndicators: string[]
	skippedIndicators: string[]
}

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
const validateCandleImport = async (
	fileContent: string,
	assetSymbol: string,
	timeframeCode: string
): Promise<ActionResponse<CandleValidationResult>> => {
	try {
		// Step 1: Parse the CSV
		const parseResult = parseCandleCSV(fileContent)

		if (!parseResult.success) {
			return {
				status: "error",
				message: "CSV parsing failed",
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
				message: `Asset "${assetSymbol}" not found. Add it in Settings → Assets before importing candle data.`,
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
				message: `Timeframe "${timeframeCode}" not found. Available timeframes: ${allTimeframes.map((tf) => tf.code).join(", ")}`,
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

		// Step 5: Return validation result
		return {
			status: "success",
			message: `Validated ${parseResult.candles.length} candles for ${matchedAsset.symbol} (${matchedTimeframe.name})`,
			data: {
				assetId: matchedAsset.id,
				assetName: matchedAsset.name,
				timeframeId: matchedTimeframe.id,
				timeframeName: matchedTimeframe.name,
				rowCount: parseResult.candles.length,
				dateRange: parseResult.dateRange,
				detectedIndicators: parseResult.detectedIndicators,
				registeredIndicators,
				skippedIndicators,
				errors: parseResult.errors,
				warnings: parseResult.warnings,
				candles: parseResult.candles,
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
 * Commits parsed candles to the database using bulk upsert.
 * Processes in chunks of 1,000 rows for memory efficiency.
 * Filters indicator values through an allowlist of registered definitions.
 *
 * @param assetId - UUID of the target asset
 * @param timeframeId - UUID of the target timeframe
 * @param candles - Parsed candle rows from validateCandleImport
 * @returns Total rows imported, newly registered indicators, and skipped indicators
 */
const commitCandleImport = async (
	assetId: string,
	timeframeId: string,
	candles: RawCandleRow[]
): Promise<ActionResponse<CandleImportResult>> => {
	try {
		// Step 1: Validate UUIDs
		const assetIdResult = uuidSchema.safeParse(assetId)
		if (!assetIdResult.success) {
			return { status: "error", message: "Invalid asset ID format" }
		}

		const timeframeIdResult = uuidSchema.safeParse(timeframeId)
		if (!timeframeIdResult.success) {
			return { status: "error", message: "Invalid timeframe ID format" }
		}

		if (candles.length === 0) {
			return { status: "error", message: "No candles to import" }
		}

		// Step 2: Fetch registered indicator keys (allowlist)
		const registeredKeys = await db.query.indicatorDefinitions.findMany({
			where: eq(indicatorDefinitions.isActive, true),
			columns: { key: true },
		})
		const allowedKeys = new Set(registeredKeys.map((r) => r.key))

		// Track skipped keys
		const skippedKeys = new Set<string>()

		// Step 3: Insert candles in chunks
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

		// Step 4: Auto-register new indicators
		const indicatorKeysInImport = new Set<string>()
		for (const candle of candles) {
			for (const key of Object.keys(candle.indicators)) {
				indicatorKeysInImport.add(key)
			}
		}

		const newIndicators: string[] = []

		if (indicatorKeysInImport.size > 0) {
			// Build indicator definitions for all keys found in this import
			// First, fetch all groups to resolve groupKey → groupId
			const allGroups = await db.query.indicatorGroups.findMany()
			const groupKeyToId = new Map<string, string>()
			for (const group of allGroups) {
				groupKeyToId.set(group.key, group.id)
			}

			const indicatorValues = Array.from(indicatorKeysInImport).map((key) => {
				// Check if it's a known indicator from KNOWN_INDICATOR_MAPPINGS
				const knownMapping = KNOWN_INDICATOR_MAPPINGS.find(
					(mapping) => mapping.key === key
				)

				return {
					key,
					displayName: knownMapping?.displayName ?? key,
					groupId: knownMapping ? (groupKeyToId.get(knownMapping.groupKey) ?? null) : null,
					csvHeader: knownMapping?.csvHeader ?? null,
				}
			})

			// Upsert indicator definitions — skip on conflict (key is unique)
			// Only auto-register indicators that have a resolved groupId (groupId is required)
			for (const indicator of indicatorValues) {
				if (!indicator.groupId) {
					skippedKeys.add(indicator.key)
					continue
				}

				const existing = await db.query.indicatorDefinitions.findFirst({
					where: eq(indicatorDefinitions.key, indicator.key),
				})

				if (!existing) {
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

		// Step 5: Upsert price data version
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
			message: `Successfully imported ${candles.length} candles${newIndicators.length > 0 ? ` and registered ${newIndicators.length} new indicator(s)` : ""}${skippedKeys.size > 0 ? `. Skipped ${skippedKeys.size} unregistered indicator(s)` : ""}`,
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
const seedIndicatorDefinitions = async (): Promise<
	ActionResponse<{ seeded: number }>
> => {
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
				throw new Error(`Group "${mapping.groupKey}" not found for indicator "${mapping.key}"`)
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
			message: `Seeded indicator definitions (${values.length} known mappings across ${groups.length} groups)`,
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

export type { CandleValidationResult, CandleImportResult }
export { validateCandleImport, commitCandleImport, seedIndicatorDefinitions }
