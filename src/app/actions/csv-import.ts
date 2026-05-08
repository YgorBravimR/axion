"use server"

import { db } from "@/db/drizzle"
import type { Tag } from "@/db/schema"
import { assets, strategies, tags, trades as tradesTable } from "@/db/schema"
import { B3_FUT_PREFIXES, resolveTradeAsset } from "@/lib/asset-resolution"
import { calculateAssetPnL } from "@/lib/calculations"
import type { CsvTradeInput } from "@/lib/csv-parser"
import { computeTradeHash } from "@/lib/deduplication"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { fromCents } from "@/lib/money"
import type { ActionResponse } from "@/types"
import { and, eq, inArray } from "drizzle-orm"
import { getAssetFees } from "./accounts"
import { getCurrentAccount, requireAuth } from "./auth"
import type {
	CsvImportResult,
	CsvValidationResult,
	ProcessedCsvTrade,
} from "./csv-import.types"
import { bulkCreateTrades } from "./trades"

// ==========================================
// Validate CSV Trades
// ==========================================

/**
 * Find asset by symbol using the centralized resolution pipeline.
 * Resolves the symbol to its canonical form, then looks up in the asset map.
 */
const findAssetBySymbol = (
	normalizedSymbol: string,
	originalCode: string,
	assetMap: Map<string, typeof assets.$inferSelect>
): typeof assets.$inferSelect | null => {
	const registeredSymbols = new Set(assetMap.keys())
	const resolved = resolveTradeAsset(normalizedSymbol, registeredSymbols)

	if (resolved.found) {
		return assetMap.get(resolved.symbol) ?? null
	}

	// Fallback: try original code
	const original = originalCode.toUpperCase()
	if (assetMap.has(original)) {
		return assetMap.get(original)!
	}

	return null
}

/**
 * Validates parsed CSV trades, looks up assets, and calculates P&L with fees
 */
export const validateCsvTrades = async (
	csvTrades: CsvTradeInput[]
): Promise<ActionResponse<CsvValidationResult>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const account = await getCurrentAccount()
		if (!account) {
			return { status: "error", message: "Account not found" }
		}

		// Collect unique asset symbols (normalized + original + FUT variants)
		const symbolsToLookup = new Set<string>()
		for (const trade of csvTrades) {
			const normalized = trade.normalizedAsset.toUpperCase()
			symbolsToLookup.add(normalized)
			symbolsToLookup.add(trade.originalAssetCode.toUpperCase())
			// Add FUT variant for B3 futures
			if (B3_FUT_PREFIXES.includes(normalized)) {
				symbolsToLookup.add(`${normalized}FUT`)
			}
		}

		// Batch lookup all possible asset symbols
		const foundAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.isActive, true),
				inArray(assets.symbol, [...symbolsToLookup])
			),
		})
		const assetMap = new Map(
			foundAssets.map((a) => [a.symbol.toUpperCase(), a])
		)

		// Batch lookup fees for found assets
		const feesMap = new Map<string, { commission: number; fees: number }>()
		for (const asset of foundAssets) {
			// eslint-disable-next-line no-await-in-loop -- sequential asset fee lookups; small N (user-defined assets per account, typically <20)
			const fees = await getAssetFees(asset.symbol, accountId)
			feesMap.set(asset.symbol.toUpperCase(), fees)
		}

		// Get strategies, timeframes, and tags for the UI (tags & strategies are user-level, not account-level)
		const [accountStrategies, accountTimeframes, accountTags] =
			await Promise.all([
				db.query.strategies.findMany({
					where: eq(strategies.userId, userId),
					orderBy: (s, { asc }) => [asc(s.name)],
				}),
				db.query.timeframes.findMany({
					orderBy: (t, { asc }) => [asc(t.name)],
				}),
				db.query.tags.findMany({
					where: eq(tags.userId, userId),
					orderBy: (t, { asc }) => [asc(t.name)],
				}),
			])

		// Process each trade
		const processedTrades: ProcessedCsvTrade[] = []
		let summaryGrossPnl = 0
		let summaryNetPnl = 0
		let summaryTotalCosts = 0
		let validCount = 0
		let warningCount = 0
		let skippedCount = 0
		let duplicateCount = 0

		// Pre-compute dedup hashes for batch lookup
		const hashToIndex = new Map<string, number[]>()
		for (let i = 0; i < csvTrades.length; i++) {
			const trade = csvTrades[i]!
			if (trade.entryPrice && trade.entryDate && trade.positionSize) {
				const hash = computeTradeHash({
					accountId,
					asset: trade.normalizedAsset.toUpperCase(),
					direction: trade.direction,
					entryDate: new Date(trade.entryDate),
					entryPrice: Number(trade.entryPrice),
					exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
					positionSize: Number(trade.positionSize),
				})
				const existing = hashToIndex.get(hash) || []
				existing.push(i)
				hashToIndex.set(hash, existing)
			}
		}

		// Batch query existing hashes
		const allHashes = [...hashToIndex.keys()]
		const existingHashes = new Set<string>()
		if (allHashes.length > 0) {
			// Query in batches of 100 to avoid SQL parameter limits
			const HASH_BATCH = 100
			for (let i = 0; i < allHashes.length; i += HASH_BATCH) {
				const batch = allHashes.slice(i, i + HASH_BATCH)
				// eslint-disable-next-line no-await-in-loop -- SQL parameter limit requires batching; batches are independent but must accumulate results sequentially
				const found = await db
					.select({ hash: tradesTable.deduplicationHash })
					.from(tradesTable)
					.where(
						and(
							eq(tradesTable.accountId, accountId),
							inArray(tradesTable.deduplicationHash, batch),
							eq(tradesTable.isArchived, false)
						)
					)
				for (const row of found) {
					if (row.hash) {
						existingHashes.add(row.hash)
					}
				}
			}
		}

		for (let i = 0; i < csvTrades.length; i++) {
			const trade = csvTrades[i]!
			const rowNumber = i + 1

			const processed: ProcessedCsvTrade = {
				id: crypto.randomUUID(),
				rowNumber,
				status: "valid",
				errors: [],
				warnings: [],
				originalData: trade,
				assetFound: false,
				grossPnl: null,
				netPnl: null,
				totalCosts: null,
				ticksGained: null,
				edits: {},
			}

			// Check if asset exists (try multiple variations)
			const assetConfig = findAssetBySymbol(
				trade.normalizedAsset,
				trade.originalAssetCode,
				assetMap
			)

			if (!assetConfig) {
				processed.status = "skipped"
				processed.skipReason = `Asset "${trade.normalizedAsset}" (or "${trade.normalizedAsset}FUT") is not configured. Add it in Settings → Assets.`
				skippedCount++
				processedTrades.push(processed)
				continue
			}

			// Check for duplicates via dedup hash
			if (trade.entryPrice && trade.entryDate && trade.positionSize) {
				const hash = computeTradeHash({
					accountId,
					asset: assetConfig.symbol.toUpperCase(),
					direction: trade.direction,
					entryDate: new Date(trade.entryDate),
					entryPrice: Number(trade.entryPrice),
					exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
					positionSize: Number(trade.positionSize),
				})
				if (existingHashes.has(hash)) {
					processed.status = "skipped"
					processed.skipReason =
						"Duplicate: this trade has already been imported"
					skippedCount++
					duplicateCount++
					processedTrades.push(processed)
					continue
				}
			}

			processed.assetFound = true
			const fees = feesMap.get(assetConfig.symbol.toUpperCase()) || {
				commission: 0,
				fees: 0,
			}

			processed.assetConfig = {
				id: assetConfig.id,
				symbol: assetConfig.symbol,
				tickSize: parseFloat(assetConfig.tickSize),
				tickValue: assetConfig.tickValue,
				commission: fees.commission,
				fees: fees.fees,
			}

			// Calculate P&L if we have exit price
			if (trade.exitPrice && trade.entryPrice) {
				const tickSize = processed.assetConfig.tickSize
				const tickValue = fromCents(processed.assetConfig.tickValue)
				const positionSize = Number(trade.positionSize)
				const contractsExecuted = positionSize * 2 // entry + exit

				const pnlResult = calculateAssetPnL({
					entryPrice: Number(trade.entryPrice),
					exitPrice: Number(trade.exitPrice),
					positionSize,
					direction: trade.direction,
					tickSize,
					tickValue,
					commission: fromCents(fees.commission),
					fees: fromCents(fees.fees),
					contractsExecuted,
				})

				processed.ticksGained = Number(pnlResult.ticksGained)
				processed.grossPnl = Number(pnlResult.grossPnl)
				processed.netPnl = Number(pnlResult.netPnl)
				processed.totalCosts = Number(pnlResult.totalCosts)

				summaryGrossPnl += Number(pnlResult.grossPnl)
				summaryNetPnl += Number(pnlResult.netPnl)
				summaryTotalCosts += Number(pnlResult.totalCosts)
			} else {
				// Add warning if no exit price
				processed.warnings.push({
					message: "No exit price - P&L cannot be calculated",
				})
			}

			// Pre-populate edits from CSV data by matching against DB records
			if (trade.strategyCode) {
				const csvStrategy = trade.strategyCode.toLowerCase()
				const matchedStrategy = accountStrategies.find(
					(s) =>
						s.code.toLowerCase() === csvStrategy ||
						s.name.toLowerCase() === csvStrategy
				)
				if (matchedStrategy) {
					processed.edits.strategyId = matchedStrategy.id
				}
			}

			if (trade.timeframeCode) {
				const csvTimeframe = trade.timeframeCode.toLowerCase()
				const matchedTimeframe = accountTimeframes.find(
					(tf) =>
						tf.code.toLowerCase() === csvTimeframe ||
						tf.name.toLowerCase() === csvTimeframe
				)
				if (matchedTimeframe) {
					processed.edits.timeframeId = matchedTimeframe.id
				}
			}

			if (trade.tagNames?.length) {
				const matchedTagIds = trade.tagNames
					.map((name) =>
						accountTags.find(
							(tag) => tag.name.toLowerCase() === name.toLowerCase()
						)
					)
					.filter((tag): tag is Tag => !!tag)
					.map((tag) => tag.id)
				if (matchedTagIds.length > 0) {
					processed.edits.tagIds = matchedTagIds
				}
			}

			if (trade.followedPlan !== undefined && trade.followedPlan !== null) {
				processed.edits.followedPlan = trade.followedPlan
			}

			// Pre-populate risk fields from CSV data
			if (trade.stopLoss !== undefined && trade.stopLoss !== null) {
				processed.edits.stopLoss = Number(trade.stopLoss)
			}
			if (trade.takeProfit !== undefined && trade.takeProfit !== null) {
				processed.edits.takeProfit = Number(trade.takeProfit)
			}

			// Check for warnings
			if (processed.warnings.length > 0) {
				processed.status = "warning"
				warningCount++
			} else {
				validCount++
			}

			processedTrades.push(processed)
		}

		return {
			status: "success",
			message: `Validated ${csvTrades.length} trades`,
			data: {
				trades: processedTrades,
				summary: {
					total: csvTrades.length,
					valid: validCount,
					warnings: warningCount,
					skipped: skippedCount,
					duplicates: duplicateCount,
					grossPnl: summaryGrossPnl,
					netPnl: summaryNetPnl,
					totalCosts: summaryTotalCosts,
				},
				strategies: accountStrategies,
				timeframes: accountTimeframes,
				tags: accountTags,
				accountType: account.accountType,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "validateCsvTrades"),
		}
	}
}

// ==========================================
// Import CSV Trades
// ==========================================

/**
 * Imports selected validated trades
 */
export const importCsvTrades = async (
	trades: ProcessedCsvTrade[]
): Promise<ActionResponse<CsvImportResult>> => {
	try {
		const { userId } = await requireAuth()

		// Filter to only valid/warning trades (not skipped)
		const validTrades = trades.filter(
			(t) => t.status !== "skipped" && t.assetFound
		)

		if (validTrades.length === 0) {
			return {
				status: "error",
				message: "No valid trades to import",
			}
		}

		// Collect strategy/tag IDs from edits so we can resolve them to codes/names
		const editedStrategyIds = [
			...new Set(
				validTrades
					.map((t) => t.edits.strategyId)
					.filter((id): id is string => !!id)
			),
		]
		const editedTagIds = [
			...new Set(validTrades.flatMap((t) => t.edits.tagIds || [])),
		]

		// Batch lookup strategies and tags by ID for resolving edits (user-level, not account-level)
		const strategyIdMap = new Map<string, string>() // id → code
		if (editedStrategyIds.length > 0) {
			const foundStrategies = await db.query.strategies.findMany({
				where: and(
					eq(strategies.userId, userId),
					inArray(strategies.id, editedStrategyIds)
				),
			})
			for (const s of foundStrategies) {
				strategyIdMap.set(s.id, s.code || s.name)
			}
		}

		const tagIdMap = new Map<string, string>() // id → name
		if (editedTagIds.length > 0) {
			const foundTags = await db.query.tags.findMany({
				where: and(eq(tags.userId, userId), inArray(tags.id, editedTagIds)),
			})
			for (const t of foundTags) {
				tagIdMap.set(t.id, t.name)
			}
		}

		// Convert ProcessedCsvTrade to CsvTradeInput with edits applied
		const tradesForImport: CsvTradeInput[] = validTrades.map((t) => {
			const base = { ...t.originalData }

			// Apply edits — resolve IDs back to codes/names for bulkCreateTrades
			if (t.edits.strategyId) {
				const strategyCode = strategyIdMap.get(t.edits.strategyId)
				if (strategyCode) {
					base.strategyCode = strategyCode
				}
			}
			if (t.edits.timeframeId) {
				base.timeframeId = t.edits.timeframeId
			}
			if (t.edits.tagIds?.length) {
				const tagNames = t.edits.tagIds
					.map((id) => tagIdMap.get(id))
					.filter((name): name is string => !!name)
				if (tagNames.length > 0) {
					base.tagNames = tagNames
				}
			}
			if (t.edits.preTradeThoughts) {
				base.preTradeThoughts = t.edits.preTradeThoughts
			}
			if (t.edits.postTradeReflection) {
				base.postTradeReflection = t.edits.postTradeReflection
			}
			if (t.edits.lessonLearned) {
				base.lessonLearned = t.edits.lessonLearned
			}
			if (t.edits.followedPlan !== undefined) {
				base.followedPlan = t.edits.followedPlan
			}
			if (t.edits.disciplineNotes) {
				base.disciplineNotes = t.edits.disciplineNotes
			}
			if (t.edits.stopLoss) {
				base.stopLoss = t.edits.stopLoss
			}
			if (t.edits.takeProfit) {
				base.takeProfit = t.edits.takeProfit
			}

			return base
		})

		// Use existing bulk import
		const result = await bulkCreateTrades(tradesForImport)

		if (result.status === "error") {
			return {
				status: "error",
				message: result.message,
			}
		}

		return {
			status: "success",
			message: `Successfully imported ${result.data?.successCount || 0} trades`,
			data: {
				success: result.data?.successCount || 0,
				failed: result.data?.failedCount || 0,
				errors: result.data?.errors || [],
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "importCsvTrades"),
		}
	}
}
