/**
 * Trade-to-fill matching engine.
 *
 * Given fills extracted from a nota de corretagem and existing trades in the DB,
 * this engine matches fills to trades by (asset, date, direction, quantity).
 *
 * The algorithm:
 * 1. Group fills by (normalizedAsset, date)
 * 2. For each group, query trades for that asset+date
 * 3. Match using direction and quantity with price tolerance
 */

import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import type { Trade } from "@/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { getStartOfDay, getEndOfDay } from "@/lib/dates"
import type {
	NotaFill,
	AssetFillGroup,
	EnrichmentMatch,
	NotaEnrichmentPreview,
} from "./types"

/**
 * Group fills by (normalizedAsset, date) and compute weighted averages.
 */
const groupFillsByAsset = (
	fills: NotaFill[],
	notaDate: Date
): AssetFillGroup[] => {
	const groupMap = new Map<string, AssetFillGroup>()

	for (const fill of fills) {
		const key = fill.normalizedAsset

		if (!groupMap.has(key)) {
			groupMap.set(key, {
				asset: fill.normalizedAsset,
				date: notaDate,
				buyFills: [],
				sellFills: [],
				totalBuyQty: 0,
				totalSellQty: 0,
				weightedAvgBuyPrice: 0,
				weightedAvgSellPrice: 0,
			})
		}

		const group = groupMap.get(key)!

		if (fill.side === "C") {
			group.buyFills.push(fill)
			group.totalBuyQty += fill.quantity
		} else {
			group.sellFills.push(fill)
			group.totalSellQty += fill.quantity
		}
	}

	// Compute weighted averages
	for (const group of groupMap.values()) {
		if (group.totalBuyQty > 0) {
			const totalBuyValue = group.buyFills.reduce(
				(sum, f) => sum + f.price * f.quantity,
				0
			)
			group.weightedAvgBuyPrice = totalBuyValue / group.totalBuyQty
		}

		if (group.totalSellQty > 0) {
			const totalSellValue = group.sellFills.reduce(
				(sum, f) => sum + f.price * f.quantity,
				0
			)
			group.weightedAvgSellPrice = totalSellValue / group.totalSellQty
		}
	}

	return [...groupMap.values()]
}

/**
 * Calculate price delta percentage between two prices.
 */
const priceDeltaPercent = (notaPrice: number, tradePrice: number): number => {
	if (tradePrice === 0) {
		return 100
	}
	return Math.abs((notaPrice - tradePrice) / tradePrice) * 100
}

/**
 * Attempt to match a single trade against a fill group.
 * For a long trade: BUY fills = entries, SELL fills = exits.
 * For a short trade: SELL fills = entries, BUY fills = exits.
 */
const matchTradeToGroup = (
	trade: Trade,
	group: AssetFillGroup
): EnrichmentMatch => {
	const tradeDirection = trade.direction
	const tradePositionSize = Number(trade.positionSize)
	const tradeEntryPrice = Number(trade.entryPrice)

	// Determine entry/exit fills based on direction
	const entryFills =
		tradeDirection === "long" ? group.buyFills : group.sellFills
	const exitFills = tradeDirection === "long" ? group.sellFills : group.buyFills
	const totalEntryQty =
		tradeDirection === "long" ? group.totalBuyQty : group.totalSellQty
	const avgEntryPrice =
		tradeDirection === "long"
			? group.weightedAvgBuyPrice
			: group.weightedAvgSellPrice
	const avgExitPrice =
		tradeDirection === "long"
			? group.weightedAvgSellPrice
			: group.weightedAvgBuyPrice

	// Check if trade already has executions (already enriched)
	if (trade.executionMode === "scaled") {
		return {
			tradeId: trade.id,
			trade,
			status: "already_enriched",
			entryFills,
			exitFills,
			computedAvgEntry: avgEntryPrice,
			computedAvgExit: avgExitPrice,
			priceDeltaPercent: priceDeltaPercent(avgEntryPrice, tradeEntryPrice),
			message: "nota.alreadyEnrichedScaled",
		}
	}

	// Validate quantity match
	if (totalEntryQty !== tradePositionSize) {
		return {
			tradeId: trade.id,
			trade,
			status: "quantity_mismatch",
			entryFills,
			exitFills,
			computedAvgEntry: avgEntryPrice,
			computedAvgExit: avgExitPrice,
			priceDeltaPercent: priceDeltaPercent(avgEntryPrice, tradeEntryPrice),
			message: `Quantity mismatch: nota has ${totalEntryQty} entry fills, trade has ${tradePositionSize} contracts`,
		}
	}

	// Validate price proximity (tolerance: 0.5% or more generous for averaged prices)
	const entryDelta = priceDeltaPercent(avgEntryPrice, tradeEntryPrice)
	const PRICE_TOLERANCE = 0.5 // 0.5% tolerance

	if (entryDelta > PRICE_TOLERANCE) {
		return {
			tradeId: trade.id,
			trade,
			status: "price_mismatch",
			entryFills,
			exitFills,
			computedAvgEntry: avgEntryPrice,
			computedAvgExit: avgExitPrice,
			priceDeltaPercent: entryDelta,
			message: `Entry price mismatch: nota avg ${avgEntryPrice.toFixed(2)} vs trade ${tradeEntryPrice.toFixed(2)} (${entryDelta.toFixed(2)}% delta)`,
		}
	}

	return {
		tradeId: trade.id,
		trade,
		status: "matched",
		entryFills,
		exitFills,
		computedAvgEntry: avgEntryPrice,
		computedAvgExit: avgExitPrice,
		priceDeltaPercent: entryDelta,
	}
}

/**
 * Match nota fills against existing trades for a given account.
 *
 * @param fills - Parsed fills from the nota
 * @param notaDate - Session date from the nota header
 * @param accountId - Current trading account ID
 * @param userId - Current user ID (for DEK decryption)
 */
const matchNotaFillsToTrades = async (
	fills: NotaFill[],
	notaDate: Date,
	accountId: string,
	userId: string
): Promise<NotaEnrichmentPreview> => {
	const matches: EnrichmentMatch[] = []
	const allUnmatchedFills: NotaFill[] = []
	const allUnmatchedTrades: Trade[] = []
	const warnings: string[] = []

	// Group fills by asset
	const groups = groupFillsByAsset(fills, notaDate)

	for (const group of groups) {
		// Query trades for this asset on this date
		const startOfDay = getStartOfDay(notaDate)
		const endOfDay = getEndOfDay(notaDate)

		// eslint-disable-next-line no-await-in-loop -- per-asset trade query for nota matching; sequential because match results accumulate into confirmed/unmatched lists
		const decryptedTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				eq(trades.asset, group.asset),
				gte(trades.entryDate, startOfDay),
				lte(trades.entryDate, endOfDay),
				eq(trades.isArchived, false)
			),
		})

		if (decryptedTrades.length === 0) {
			// No trades found for this asset+date — all fills are unmatched
			allUnmatchedFills.push(...group.buyFills, ...group.sellFills)
			warnings.push(
				`No trades found for ${group.asset} on ${notaDate.toISOString().split("T")[0]}`
			)
			continue
		}

		if (decryptedTrades.length === 1) {
			// Single trade: direct match attempt
			const match = matchTradeToGroup(decryptedTrades[0]!, group)
			matches.push(match)
			continue
		}

		// Multiple trades for same asset+date: try to match each
		// Group fills into subsets that match each trade's position size
		const unmatchedBuyFills = [...group.buyFills]
		const unmatchedSellFills = [...group.sellFills]

		// Sort trades chronologically
		const sortedTrades = decryptedTrades.toSorted(
			(a, b) => a.entryDate.getTime() - b.entryDate.getTime()
		)

		for (const trade of sortedTrades) {
			const tradeSize = Number(trade.positionSize)
			const tradeDirection = trade.direction

			// For this trade, find matching fills
			const fillsPool =
				tradeDirection === "long" ? unmatchedBuyFills : unmatchedSellFills
			const exitPool =
				tradeDirection === "long" ? unmatchedSellFills : unmatchedBuyFills

			// Greedy: take fills that sum to the trade's position size
			let accumulated = 0
			const matchedEntryFills: NotaFill[] = []
			const matchedExitFills: NotaFill[] = []

			// Try to accumulate entry fills
			const entryIndicesToRemove: number[] = []
			for (let i = 0; i < fillsPool.length && accumulated < tradeSize; i++) {
				if (accumulated + fillsPool[i]!.quantity <= tradeSize) {
					matchedEntryFills.push(fillsPool[i]!)
					accumulated += fillsPool[i]!.quantity
					entryIndicesToRemove.push(i)
				}
			}

			if (accumulated !== tradeSize) {
				// Couldn't find exact fill subset — mark as ambiguous
				matches.push({
					tradeId: trade.id,
					trade,
					status: "ambiguous",
					entryFills: matchedEntryFills,
					exitFills: [],
					computedAvgEntry: 0,
					computedAvgExit: 0,
					priceDeltaPercent: 0,
					message: `Could not find fills totaling ${tradeSize} contracts for ${group.asset} (found ${accumulated})`,
				})
				continue
			}

			// Remove matched entry fills from pool (in reverse to keep indices stable)
			for (let i = entryIndicesToRemove.length - 1; i >= 0; i--) {
				fillsPool.splice(entryIndicesToRemove[i]!, 1)
			}

			// Try to match exit fills similarly
			let exitAccumulated = 0
			const exitIndicesToRemove: number[] = []
			for (let i = 0; i < exitPool.length && exitAccumulated < tradeSize; i++) {
				if (exitAccumulated + exitPool[i]!.quantity <= tradeSize) {
					matchedExitFills.push(exitPool[i]!)
					exitAccumulated += exitPool[i]!.quantity
					exitIndicesToRemove.push(i)
				}
			}

			// Remove matched exit fills from pool
			for (let i = exitIndicesToRemove.length - 1; i >= 0; i--) {
				exitPool.splice(exitIndicesToRemove[i]!, 1)
			}

			// Build a temporary group for this trade
			const avgEntry =
				matchedEntryFills.length > 0
					? matchedEntryFills.reduce((s, f) => s + f.price * f.quantity, 0) /
						accumulated
					: 0
			const avgExit =
				matchedExitFills.length > 0
					? matchedExitFills.reduce((s, f) => s + f.price * f.quantity, 0) /
						exitAccumulated
					: 0

			const tradeEntryPrice = Number(trade.entryPrice)
			const entryDelta = priceDeltaPercent(avgEntry, tradeEntryPrice)

			const status =
				trade.executionMode === "scaled"
					? ("already_enriched" as const)
					: entryDelta > 0.5
						? ("price_mismatch" as const)
						: ("matched" as const)

			matches.push({
				tradeId: trade.id,
				trade,
				status,
				entryFills: matchedEntryFills,
				exitFills: matchedExitFills,
				computedAvgEntry: avgEntry,
				computedAvgExit: avgExit,
				priceDeltaPercent: entryDelta,
				message:
					status === "price_mismatch"
						? `nota.priceDelta|${entryDelta.toFixed(2)}`
						: status === "already_enriched"
							? "nota.alreadyEnriched"
							: undefined,
			})
		}

		// Any remaining fills are unmatched
		allUnmatchedFills.push(...unmatchedBuyFills, ...unmatchedSellFills)

		// Any trades without a match are unmatched
		const matchedTradeIds = new Set(matches.map((m) => m.tradeId))
		for (const trade of sortedTrades) {
			if (!matchedTradeIds.has(trade.id)) {
				allUnmatchedTrades.push(trade)
			}
		}
	}

	return {
		notaDate,
		brokerName: fills[0]?.normalizedAsset ? "Extracted from PDF" : "Unknown",
		totalFills: fills.length,
		matches,
		unmatchedFills: allUnmatchedFills,
		unmatchedTrades: allUnmatchedTrades,
		warnings,
	}
}

export { matchNotaFillsToTrades, groupFillsByAsset }
