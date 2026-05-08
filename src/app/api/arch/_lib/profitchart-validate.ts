import { db } from "@/db/drizzle"
import {
	assets,
	strategies,
	tags as tagsTable,
	tradingAccounts,
	trades as tradesTable,
} from "@/db/schema"
import type { Strategy, Tag, Timeframe } from "@/db/schema"
import { B3_FUT_PREFIXES, resolveTradeAsset } from "@/lib/asset-resolution"
import { calculateAssetPnL } from "@/lib/calculations"
import type { CsvTradeInput } from "@/lib/csv-parser"
import { computeTradeHash } from "@/lib/deduplication"
import { fromCents } from "@/lib/money"
import { getAssetFees } from "@/app/actions/accounts"
import { and, eq, inArray } from "drizzle-orm"
import type { ArchAuthContext } from "./auth"

interface ProfitChartProcessedTrade {
	id: string
	rowNumber: number
	status: "valid" | "warning" | "skipped"
	errors: { field: string; message: string }[]
	warnings: { message: string }[]
	skipReason?: string
	originalData: CsvTradeInput
	assetFound: boolean
	assetConfig?: {
		id: string
		symbol: string
		tickSize: number
		tickValue: number
		commission: number
		fees: number
	}
	grossPnl: number | null
	netPnl: number | null
	totalCosts: number | null
	ticksGained: number | null
}

interface ProfitChartValidationResult {
	trades: ProfitChartProcessedTrade[]
	summary: {
		total: number
		valid: number
		warnings: number
		skipped: number
		duplicates: number
		grossPnl: number
		netPnl: number
		totalCosts: number
	}
	strategies: Strategy[]
	timeframes: Timeframe[]
	tags: Tag[]
	accountType: "personal" | "prop" | "replay"
}

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
	const original = originalCode.toUpperCase()
	if (assetMap.has(original)) {
		return assetMap.get(original) ?? null
	}
	return null
}

/**
 * Validate parsed ProfitChart CSV trades against an arch auth context.
 *
 * Mirrors the in-app `validateCsvTrades` server action: looks up assets,
 * computes P&L with fees, marks duplicates via dedup hash, and returns
 * lookup data (strategies/timeframes/tags) so callers can build edits.
 *
 * Diverges from the session action in:
 *   - No `requireAuth()` / `getCurrentAccount()` calls.
 *   - `accountType` resolved from a direct tradingAccounts query.
 *   - Strategies/tags scoped to `auth.userId`.
 */
const validateProfitChartTrades = async (
	csvTrades: CsvTradeInput[],
	auth: ArchAuthContext,
	accountId: string
): Promise<ProfitChartValidationResult> => {
	const [account] = await db
		.select({ accountType: tradingAccounts.accountType })
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.limit(1)

	const accountType: "personal" | "prop" | "replay" =
		account?.accountType ?? "personal"

	const symbolsToLookup = new Set<string>()
	for (const trade of csvTrades) {
		const normalized = trade.normalizedAsset.toUpperCase()
		symbolsToLookup.add(normalized)
		symbolsToLookup.add(trade.originalAssetCode.toUpperCase())
		if (B3_FUT_PREFIXES.includes(normalized)) {
			symbolsToLookup.add(`${normalized}FUT`)
		}
	}

	const foundAssets = symbolsToLookup.size
		? await db.query.assets.findMany({
				where: and(
					eq(assets.isActive, true),
					inArray(assets.symbol, [...symbolsToLookup])
				),
			})
		: []

	const assetMap = new Map(foundAssets.map((a) => [a.symbol.toUpperCase(), a]))

	const feesEntries = await Promise.all(
		foundAssets.map(async (asset) => {
			const fees = await getAssetFees(asset.symbol, accountId)
			return [asset.symbol.toUpperCase(), fees] as const
		})
	)
	const feesMap = new Map<string, { commission: number; fees: number }>(
		feesEntries
	)

	const [accountStrategies, accountTimeframes, accountTags] = await Promise.all(
		[
			db.query.strategies.findMany({
				where: eq(strategies.userId, auth.userId),
				orderBy: (s, { asc }) => [asc(s.name)],
			}),
			db.query.timeframes.findMany({
				orderBy: (t, { asc }) => [asc(t.name)],
			}),
			db.query.tags.findMany({
				where: eq(tagsTable.userId, auth.userId),
				orderBy: (t, { asc }) => [asc(t.name)],
			}),
		]
	)

	// Pre-compute dedup hashes
	const hashToIndex = new Map<string, number[]>()
	for (const [index, trade] of csvTrades.entries()) {
		if (!trade.entryPrice || !trade.entryDate || !trade.positionSize) {
			continue
		}
		const hash = computeTradeHash({
			accountId,
			asset: trade.normalizedAsset.toUpperCase(),
			direction: trade.direction,
			entryDate: new Date(trade.entryDate),
			entryPrice: Number(trade.entryPrice),
			exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
			positionSize: Number(trade.positionSize),
		})
		const existing = hashToIndex.get(hash) ?? []
		existing.push(index)
		hashToIndex.set(hash, existing)
	}

	const allHashes = [...hashToIndex.keys()]
	const existingHashes = new Set<string>()
	const HASH_BATCH = 100
	for (let i = 0; i < allHashes.length; i += HASH_BATCH) {
		const batch = allHashes.slice(i, i + HASH_BATCH)
		// eslint-disable-next-line no-await-in-loop -- SQL parameter limit batching
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

	const processedTrades: ProfitChartProcessedTrade[] = []
	let summaryGrossPnl = 0
	let summaryNetPnl = 0
	let summaryTotalCosts = 0
	let validCount = 0
	let warningCount = 0
	let skippedCount = 0
	let duplicateCount = 0

	for (const [i, trade] of csvTrades.entries()) {
		const rowNumber = i + 1
		const processed: ProfitChartProcessedTrade = {
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
		}

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
				processed.skipReason = "Duplicate: this trade has already been imported"
				skippedCount++
				duplicateCount++
				processedTrades.push(processed)
				continue
			}
		}

		processed.assetFound = true
		const fees = feesMap.get(assetConfig.symbol.toUpperCase()) ?? {
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

		if (trade.exitPrice && trade.entryPrice) {
			const tickSize = processed.assetConfig.tickSize
			const tickValue = fromCents(processed.assetConfig.tickValue)
			const positionSize = Number(trade.positionSize)
			const contractsExecuted = positionSize * 2

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
			processed.warnings.push({
				message: "No exit price - P&L cannot be calculated",
			})
		}

		if (processed.warnings.length > 0) {
			processed.status = "warning"
			warningCount++
		} else {
			validCount++
		}

		processedTrades.push(processed)
	}

	return {
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
		accountType,
	}
}

export { validateProfitChartTrades }
export type { ProfitChartProcessedTrade, ProfitChartValidationResult }
