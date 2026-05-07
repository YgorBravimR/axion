"use server"

import { db } from "@/db/drizzle"
import { trades, tradingAccounts } from "@/db/schema"
import { eq, and, gte, desc, inArray } from "drizzle-orm"
import { subDays } from "date-fns"
import { fromCents } from "@/lib/money"
import { calculateWinRate } from "@/lib/calculations"
import { requireAuth } from "@/app/actions/auth"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { isFrameworkSignal } from "@/lib/error-utils"
import {
	detectAllPatterns,
	type CoachingInsight,
	type TradeForCoaching,
} from "@/lib/coaching/pattern-detector"
import {
	buildCoachingPrompt,
	type CoachingPrompt,
} from "@/lib/coaching/prompt-builder"
import { computeOverallStats } from "@/lib/analytics-helpers"
import type { ActionResponse, OverallStats } from "@/types"
import type { CoachingContext } from "./coaching.types"

// ============================================================================
// SERVER ACTION
// ============================================================================

/**
 * Aggregates trade data, detects patterns, and builds coaching context.
 * Phase 1: returns insights + prompt (no LLM call).
 * Phase 2: will call Claude API with the prompt and return AI response.
 *
 * @param days - Number of days to analyze (default: 90)
 */
export const getCoachingContext = async (
	days = 90
): Promise<ActionResponse<CoachingContext>> => {
	try {
		// Validate days parameter
		const safeDays = Math.max(1, Math.min(365, Math.floor(days)))

		const authContext = await requireAuth()
		const accountCondition = authContext.showAllAccounts
			? inArray(trades.accountId, authContext.allAccountIds)
			: eq(trades.accountId, authContext.accountId)

		const effectiveNow = await getServerEffectiveNow()
		const dateFrom = subDays(effectiveNow, safeDays)

		// Fetch trades with strategy names
		const allTrades = await db.query.trades.findMany({
			where: and(
				accountCondition,
				eq(trades.isArchived, false),
				gte(trades.entryDate, dateFrom)
			),
			with: {
				strategy: true,
			},
			orderBy: [desc(trades.entryDate)],
		})

		if (allTrades.length === 0) {
			return {
				status: "success",
				message: "No trades found for coaching analysis",
				data: {
					insights: [],
					prompt: buildCoachingPrompt({
						stats: null,
						insights: [],
						tradeCount: 0,
						periodDays: safeDays,
						accountType: "personal",
						topAssets: [],
					}),
					stats: null,
					tradeCount: 0,
					periodDays: safeDays,
				},
			}
		}

		// Map trades to coaching format
		const coachingTrades: TradeForCoaching[] = allTrades.map((t) => ({
			entryDate: new Date(t.entryDate),
			exitDate: t.exitDate ? new Date(t.exitDate) : null,
			pnl: t.pnl,
			outcome: t.outcome as "win" | "loss" | "breakeven" | null,
			realizedRMultiple: t.realizedRMultiple,
			asset: t.asset,
			direction: t.direction,
			strategyName: t.strategy?.name ?? null,
			setupRank: t.setupRank as "A" | "AA" | "AAA" | null,
			rating: t.rating as "A" | "B" | "C" | "D" | "F" | null,
			followedPlan: t.followedPlan,
			commission: t.commission,
			fees: t.fees,
		}))

		// Detect patterns
		const insights = detectAllPatterns(coachingTrades)

		// Compute overall stats (reuse existing helper)
		const statsInput = allTrades.map((t) => ({
			pnl: t.pnl,
			commission: t.commission,
			fees: t.fees,
			outcome: t.outcome,
			realizedRMultiple: t.realizedRMultiple,
			followedPlan: t.followedPlan,
		}))
		const stats = computeOverallStats(statsInput)

		// Compute top assets
		const assetMap = new Map<string, { wins: number; total: number }>()
		for (const trade of allTrades) {
			if (trade.outcome !== "win" && trade.outcome !== "loss") {
				continue
			}
			const entry = assetMap.get(trade.asset) || { wins: 0, total: 0 }
			entry.total++
			if (trade.outcome === "win") {
				entry.wins++
			}
			assetMap.set(trade.asset, entry)
		}

		const topAssets = Array.from(assetMap.entries())
			.map(([asset, data]) => ({
				asset,
				tradeCount: data.total,
				winRate: calculateWinRate(data.wins, data.total),
			}))
			.toSorted((a, b) => b.tradeCount - a.tradeCount)
			.slice(0, 5)

		// Determine account type
		const account = authContext.showAllAccounts
			? null
			: await db.query.tradingAccounts.findFirst({
					where: eq(tradingAccounts.id, authContext.accountId),
				})
		const accountType = account?.accountType ?? "personal"

		// Build prompt
		const prompt = buildCoachingPrompt({
			stats,
			insights,
			tradeCount: allTrades.length,
			periodDays: safeDays,
			accountType,
			topAssets,
		})

		return {
			status: "success",
			message: "Coaching context generated",
			data: {
				insights,
				prompt,
				stats,
				tradeCount: allTrades.length,
				periodDays: safeDays,
			},
		}
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error generating coaching context:", error)
		}
		return {
			status: "error",
			message: "Failed to generate coaching context",
		}
	}
}
