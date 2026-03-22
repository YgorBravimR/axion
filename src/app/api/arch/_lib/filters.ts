import type { SQL } from "drizzle-orm"
import { eq, and, gte, lte, inArray } from "drizzle-orm"
import { trades, tradeTags } from "@/db/schema"
import { db } from "@/db/drizzle"
import type { ArchAuthContext } from "./auth"
import {
	resolveStrategyName,
	resolveTagNames,
	resolveTimeframeName,
} from "./resolve-names"

/**
 * Parses standard Arch query params into Drizzle WHERE conditions.
 * Handles fuzzy name resolution for strategy, tags, and timeframe.
 *
 * Supported params:
 * - dateFrom, dateTo: ISO date strings
 * - assets: comma-separated asset symbols
 * - directions: comma-separated ("long", "short")
 * - outcomes: comma-separated ("win", "loss", "breakeven")
 * - strategy: fuzzy name → resolved to ID
 * - tags: comma-separated fuzzy names → resolved to IDs
 * - timeframe: fuzzy name → resolved to ID
 * - strategyIds, tagIds, timeframeIds: direct ID lists (bypass fuzzy)
 */
const parseArchFilters = async (
	searchParams: URLSearchParams,
	auth: ArchAuthContext
): Promise<SQL[]> => {
	const conditions: SQL[] = [
		buildAccountCondition(auth),
		eq(trades.isArchived, false),
	]

	// Date range
	const dateFrom = searchParams.get("dateFrom")
	const dateTo = searchParams.get("dateTo")
	if (dateFrom) conditions.push(gte(trades.entryDate, new Date(dateFrom)))
	if (dateTo) conditions.push(lte(trades.entryDate, new Date(dateTo)))

	// Direct array filters
	const assetsParam = searchParams.get("assets")
	if (assetsParam) {
		const assets = assetsParam
			.split(",")
			.map((a) => a.trim())
			.filter(Boolean)
		if (assets.length) conditions.push(inArray(trades.asset, assets))
	}

	const directionsParam = searchParams.get("directions")
	if (directionsParam) {
		const directions = directionsParam
			.split(",")
			.map((d) => d.trim())
			.filter(Boolean) as ("long" | "short")[]
		if (directions.length)
			conditions.push(inArray(trades.direction, directions))
	}

	const outcomesParam = searchParams.get("outcomes")
	if (outcomesParam) {
		const outcomes = outcomesParam
			.split(",")
			.map((o) => o.trim())
			.filter(Boolean) as ("win" | "loss" | "breakeven")[]
		if (outcomes.length) conditions.push(inArray(trades.outcome, outcomes))
	}

	// Fuzzy name resolution
	const strategyParam = searchParams.get("strategy")
	if (strategyParam) {
		const strategyId = await resolveStrategyName(strategyParam, auth.userId)
		if (strategyId) conditions.push(eq(trades.strategyId, strategyId))
	}

	const timeframeParam = searchParams.get("timeframe")
	if (timeframeParam) {
		const timeframeId = await resolveTimeframeName(timeframeParam)
		if (timeframeId) conditions.push(eq(trades.timeframeId, timeframeId))
	}

	const tagsParam = searchParams.get("tags")
	if (tagsParam) {
		const tagNames = tagsParam
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean)
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
	}

	// Direct ID filters (bypass fuzzy resolution)
	const strategyIds = searchParams.get("strategyIds")
	if (strategyIds) {
		const ids = strategyIds
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean)
		if (ids.length) conditions.push(inArray(trades.strategyId, ids))
	}

	const tagIds = searchParams.get("tagIds")
	if (tagIds) {
		const ids = tagIds
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean)
		if (ids.length) {
			const tradesWithTags = db
				.select({ tradeId: tradeTags.tradeId })
				.from(tradeTags)
				.where(inArray(tradeTags.tagId, ids))
			conditions.push(inArray(trades.id, tradesWithTags))
		}
	}

	const timeframeIds = searchParams.get("timeframeIds")
	if (timeframeIds) {
		const ids = timeframeIds
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean)
		if (ids.length) conditions.push(inArray(trades.timeframeId, ids))
	}

	return conditions
}

/**
 * Builds the account ownership condition for trade queries.
 * Returns an inArray condition when showAllAccounts is true, otherwise eq for the default account.
 */
const buildAccountCondition = (auth: ArchAuthContext): SQL =>
	auth.showAllAccounts
		? inArray(trades.accountId, auth.allAccountIds)
		: eq(trades.accountId, auth.accountId)

export { parseArchFilters, buildAccountCondition }
