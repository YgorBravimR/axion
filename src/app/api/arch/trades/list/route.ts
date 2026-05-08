import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeTags } from "@/db/schema"
import { eq, and, gte, lte, inArray, desc, asc, count } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError, formatTradeForArch } from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import {
	resolveStrategyName,
	resolveTagNames,
	resolveTimeframeName,
} from "../../_lib/resolve-names"

type SortByColumn = "entryDate" | "pnl" | "realizedRMultiple" | "asset"
type SortOrder = "asc" | "desc"

const VALID_SORT_COLUMNS: SortByColumn[] = [
	"entryDate",
	"pnl",
	"realizedRMultiple",
	"asset",
]
const VALID_SORT_ORDERS: SortOrder[] = ["asc", "desc"]
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

const sortColumnMap = {
	entryDate: trades.entryDate,
	pnl: trades.pnl,
	realizedRMultiple: trades.realizedRMultiple,
	asset: trades.asset,
} as const

/**
 * Clamps a numeric query param between min and max, returning a fallback if invalid.
 *
 * @param value - Raw query param string
 * @param fallback - Default value when param is absent or invalid
 * @param max - Upper bound
 * @returns Clamped integer
 */
const clampInt = (
	value: string | null,
	fallback: number,
	max: number
): number => {
	if (!value) {
		return fallback
	}
	const parsed = parseInt(value, 10)
	if (Number.isNaN(parsed) || parsed < 0) {
		return fallback
	}
	return Math.min(parsed, max)
}

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams

		// Parse query params
		const dateFrom = searchParams.get("dateFrom")
		const dateTo = searchParams.get("dateTo")
		const assetsParam = searchParams.get("assets")
		const directionsParam = searchParams.get("directions")
		const outcomesParam = searchParams.get("outcomes")
		const strategyParam = searchParams.get("strategy")
		const tagsParam = searchParams.get("tags")
		const timeframeParam = searchParams.get("timeframe")
		const limit = clampInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)
		const offset = clampInt(
			searchParams.get("offset"),
			0,
			Number.MAX_SAFE_INTEGER
		)

		const sortByRaw = searchParams.get("sortBy") as SortByColumn | null
		const sortBy: SortByColumn =
			sortByRaw && VALID_SORT_COLUMNS.includes(sortByRaw)
				? sortByRaw
				: "entryDate"

		const sortOrderRaw = searchParams.get("sortOrder") as SortOrder | null
		const sortOrder: SortOrder =
			sortOrderRaw && VALID_SORT_ORDERS.includes(sortOrderRaw)
				? sortOrderRaw
				: "desc"

		const assets = assetsParam
			? assetsParam
					.split(",")
					.map((asset) => asset.trim())
					.filter(Boolean)
			: []
		const directions = directionsParam
			? (directionsParam
					.split(",")
					.map((direction) => direction.trim())
					.filter(Boolean) as ("long" | "short")[])
			: []
		const outcomes = outcomesParam
			? (outcomesParam
					.split(",")
					.map((outcome) => outcome.trim())
					.filter(Boolean) as ("win" | "loss" | "breakeven")[])
			: []
		const tagNames = tagsParam
			? tagsParam
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean)
			: []

		const conditions = [
			buildAccountCondition(auth),
			eq(trades.isArchived, false),
		]

		if (dateFrom) {
			conditions.push(gte(trades.entryDate, new Date(dateFrom)))
		}
		if (dateTo) {
			conditions.push(lte(trades.entryDate, new Date(dateTo)))
		}
		if (assets.length) {
			conditions.push(inArray(trades.asset, assets))
		}
		if (directions.length) {
			conditions.push(inArray(trades.direction, directions))
		}
		if (outcomes.length) {
			conditions.push(inArray(trades.outcome, outcomes))
		}

		// Resolve fuzzy names
		if (strategyParam) {
			const strategyId = await resolveStrategyName(strategyParam, auth.userId)
			if (strategyId) {
				conditions.push(eq(trades.strategyId, strategyId))
			}
		}

		if (timeframeParam) {
			const timeframeId = await resolveTimeframeName(timeframeParam)
			if (timeframeId) {
				conditions.push(eq(trades.timeframeId, timeframeId))
			}
		}

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

		const whereClause = and(...conditions)

		// Get total count
		const [totalRow] = await db
			.select({ total: count() })
			.from(trades)
			.where(whereClause)

		const total = totalRow?.total ?? 0

		// Get paginated trades with relations
		const sortColumn = sortColumnMap[sortBy]
		const orderFn = sortOrder === "asc" ? asc : desc

		const result = await db.query.trades.findMany({
			where: whereClause,
			with: {
				strategy: true,
				timeframe: true,
				tradeTags: { with: { tag: true } },
			},
			orderBy: [orderFn(sortColumn)],
			limit,
			offset,
		})

		// Decrypt fields
		const dek = await getUserDek(auth.userId)
		const decryptedTrades = dek
			? result.map((trade) => decryptTradeFields(trade, dek))
			: result

		// Format for Arch response
		const formattedTrades = decryptedTrades.map((trade) =>
			formatTradeForArch(trade)
		)

		return archSuccess("Trades retrieved", {
			items: formattedTrades,
			pagination: {
				total,
				limit,
				offset,
				hasMore: offset + result.length < total,
			},
		})
	} catch (error) {
		return archError(
			"Failed to fetch trades",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
