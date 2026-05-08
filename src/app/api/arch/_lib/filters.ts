import type { SQL } from "drizzle-orm"
import { eq, gte, lte, inArray } from "drizzle-orm"
import { trades, tradeTags } from "@/db/schema"
import { db } from "@/db/drizzle"
import type { ArchAuthContext } from "./auth"
import {
	resolveStrategyName,
	resolveTagNames,
	resolveTimeframeName,
} from "./resolve-names"
import { fromCents } from "@/lib/money"

interface ArchPostDecryptFilters {
	hourFrom?: number
	hourTo?: number
	pnlMin?: number
	pnlMax?: number
}

interface ArchPostDecryptCandidate {
	entryDate: Date | string
	pnl?: number | string | null
}

const splitCsv = (raw: string | null): string[] =>
	raw
		? raw
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean)
		: []

const parseBool = (raw: string | null): boolean | undefined => {
	if (raw === null) {
		return undefined
	}
	if (raw === "true") {
		return true
	}
	if (raw === "false") {
		return false
	}
	return undefined
}

const parseIntInRange = (
	raw: string | null,
	min: number,
	max: number
): number | undefined => {
	if (raw === null) {
		return undefined
	}
	const parsed = parseInt(raw, 10)
	if (Number.isNaN(parsed) || parsed < min || parsed > max) {
		return undefined
	}
	return parsed
}

const parseFloatParam = (raw: string | null): number | undefined => {
	if (raw === null) {
		return undefined
	}
	const parsed = Number(raw)
	return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Parses standard Arch query params into Drizzle WHERE conditions.
 * Handles fuzzy name resolution for strategy, tags, and timeframe.
 *
 * Supported params:
 * - dateFrom, dateTo: ISO date strings
 * - assets: comma-separated asset symbols
 * - directions: comma-separated ("long", "short")
 * - outcomes: comma-separated ("win", "loss", "breakeven")
 * - rating: comma-separated ("A","B","C","D","F")
 * - setupRank: comma-separated ("A","AA","AAA")
 * - executionMode: comma-separated ("simple","scaled")
 * - source: comma-separated trade sources (e.g. "manual","arch","csv")
 * - followedPlan: "true" | "false"
 * - isArchived: "true" | "false" (default false)
 * - strategy: fuzzy name → resolved to ID
 * - tags: comma-separated fuzzy names → resolved to IDs
 * - timeframe: fuzzy name → resolved to ID
 * - strategyIds, tagIds, timeframeIds: direct ID lists (bypass fuzzy)
 *
 * Post-decrypt-only filters (NOT applied here): hourFrom, hourTo, pnlMin, pnlMax.
 * Use parseArchPostDecryptFilters for those.
 */
const parseArchFilters = async (
	searchParams: URLSearchParams,
	auth: ArchAuthContext
): Promise<SQL[]> => {
	const includeArchived = parseBool(searchParams.get("isArchived")) === true
	const conditions: SQL[] = [buildAccountCondition(auth)]
	if (!includeArchived) {
		conditions.push(eq(trades.isArchived, false))
	}

	// Date range
	const dateFrom = searchParams.get("dateFrom")
	const dateTo = searchParams.get("dateTo")
	if (dateFrom) {
		conditions.push(gte(trades.entryDate, new Date(dateFrom)))
	}
	if (dateTo) {
		conditions.push(lte(trades.entryDate, new Date(dateTo)))
	}

	// Direct array filters
	const assets = splitCsv(searchParams.get("assets"))
	if (assets.length) {
		conditions.push(inArray(trades.asset, assets))
	}

	const directions = splitCsv(searchParams.get("directions")) as (
		| "long"
		| "short"
	)[]
	if (directions.length) {
		conditions.push(inArray(trades.direction, directions))
	}

	const outcomes = splitCsv(searchParams.get("outcomes")) as (
		| "win"
		| "loss"
		| "breakeven"
	)[]
	if (outcomes.length) {
		conditions.push(inArray(trades.outcome, outcomes))
	}

	const ratings = splitCsv(searchParams.get("rating")) as (
		| "A"
		| "B"
		| "C"
		| "D"
		| "F"
	)[]
	if (ratings.length) {
		conditions.push(inArray(trades.rating, ratings))
	}

	const setupRanks = splitCsv(searchParams.get("setupRank")) as (
		| "A"
		| "AA"
		| "AAA"
	)[]
	if (setupRanks.length) {
		conditions.push(inArray(trades.setupRank, setupRanks))
	}

	const executionModes = splitCsv(searchParams.get("executionMode")) as (
		| "simple"
		| "scaled"
	)[]
	if (executionModes.length) {
		conditions.push(inArray(trades.executionMode, executionModes))
	}

	const sources = splitCsv(searchParams.get("source"))
	if (sources.length) {
		conditions.push(inArray(trades.source, sources))
	}

	const followedPlan = parseBool(searchParams.get("followedPlan"))
	if (followedPlan !== undefined) {
		conditions.push(eq(trades.followedPlan, followedPlan))
	}

	// Fuzzy name resolution
	const strategyParam = searchParams.get("strategy")
	if (strategyParam) {
		const strategyId = await resolveStrategyName(strategyParam, auth.userId)
		if (strategyId) {
			conditions.push(eq(trades.strategyId, strategyId))
		}
	}

	const timeframeParam = searchParams.get("timeframe")
	if (timeframeParam) {
		const timeframeId = await resolveTimeframeName(timeframeParam)
		if (timeframeId) {
			conditions.push(eq(trades.timeframeId, timeframeId))
		}
	}

	const tagNames = splitCsv(searchParams.get("tags"))
	if (tagNames.length) {
		const tagIds = await resolveTagNames(tagNames, auth.userId)
		if (tagIds.length) {
			const tradesWithTags = db
				.select({ tradeId: tradeTags.tradeId })
				.from(tradeTags)
				.where(inArray(tradeTags.tagId, tagIds))
			conditions.push(inArray(trades.id, tradesWithTags))
		}
	}

	// Direct ID filters (bypass fuzzy resolution)
	const strategyIds = splitCsv(searchParams.get("strategyIds"))
	if (strategyIds.length) {
		conditions.push(inArray(trades.strategyId, strategyIds))
	}

	const tagIdList = splitCsv(searchParams.get("tagIds"))
	if (tagIdList.length) {
		const tradesWithTags = db
			.select({ tradeId: tradeTags.tradeId })
			.from(tradeTags)
			.where(inArray(tradeTags.tagId, tagIdList))
		conditions.push(inArray(trades.id, tradesWithTags))
	}

	const timeframeIds = splitCsv(searchParams.get("timeframeIds"))
	if (timeframeIds.length) {
		conditions.push(inArray(trades.timeframeId, timeframeIds))
	}

	return conditions
}

/**
 * Parses post-decrypt filters that cannot be expressed as SQL because the
 * underlying columns are encrypted ciphertext. Apply against decrypted rows.
 *
 * - hourFrom/hourTo: integer 0-23, inclusive on both sides (entry-date hour, server local time).
 * - pnlMin/pnlMax: numeric P&L bounds in dollars (not cents).
 */
const parseArchPostDecryptFilters = (
	searchParams: URLSearchParams
): ArchPostDecryptFilters => ({
	hourFrom: parseIntInRange(searchParams.get("hourFrom"), 0, 23),
	hourTo: parseIntInRange(searchParams.get("hourTo"), 0, 23),
	pnlMin: parseFloatParam(searchParams.get("pnlMin")),
	pnlMax: parseFloatParam(searchParams.get("pnlMax")),
})

/**
 * Predicate that returns true when a (decrypted) trade row matches the
 * post-decrypt filter set. Returns true for empty filters.
 */
const matchesPostDecryptFilters = (
	trade: ArchPostDecryptCandidate,
	filters: ArchPostDecryptFilters
): boolean => {
	const hasAny =
		filters.hourFrom !== undefined ||
		filters.hourTo !== undefined ||
		filters.pnlMin !== undefined ||
		filters.pnlMax !== undefined
	if (!hasAny) {
		return true
	}

	if (filters.hourFrom !== undefined || filters.hourTo !== undefined) {
		const hour = new Date(trade.entryDate).getHours()
		if (filters.hourFrom !== undefined && hour < filters.hourFrom) {
			return false
		}
		if (filters.hourTo !== undefined && hour > filters.hourTo) {
			return false
		}
	}

	if (filters.pnlMin !== undefined || filters.pnlMax !== undefined) {
		// pnl on disk is cents (string). fromCents handles both number and string.
		const pnlDollars = fromCents(trade.pnl)
		if (filters.pnlMin !== undefined && pnlDollars < filters.pnlMin) {
			return false
		}
		if (filters.pnlMax !== undefined && pnlDollars > filters.pnlMax) {
			return false
		}
	}

	return true
}

/**
 * Builds the account ownership condition for trade queries.
 * Returns an inArray condition when showAllAccounts is true, otherwise eq for the default account.
 */
const buildAccountCondition = (auth: ArchAuthContext): SQL =>
	auth.showAllAccounts
		? inArray(trades.accountId, auth.allAccountIds)
		: eq(trades.accountId, auth.accountId)

export {
	parseArchFilters,
	parseArchPostDecryptFilters,
	matchesPostDecryptFilters,
	buildAccountCondition,
}
export type { ArchPostDecryptFilters }
