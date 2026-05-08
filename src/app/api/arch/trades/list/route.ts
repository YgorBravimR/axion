import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { and, desc, asc, count } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError, formatTradeForArch } from "../../_lib/helpers"
import {
	parseArchFilters,
	parseArchPostDecryptFilters,
	matchesPostDecryptFilters,
} from "../../_lib/filters"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"

type SortByColumn =
	| "entryDate"
	| "exitDate"
	| "pnl"
	| "realizedRMultiple"
	| "asset"
	| "outcome"
	| "rOutcome"
	| "createdAt"
type SortOrder = "asc" | "desc"

const VALID_SORT_COLUMNS: SortByColumn[] = [
	"entryDate",
	"exitDate",
	"pnl",
	"realizedRMultiple",
	"asset",
	"outcome",
	"rOutcome",
	"createdAt",
]
const VALID_SORT_ORDERS: SortOrder[] = ["asc", "desc"]
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

const sortColumnMap = {
	entryDate: trades.entryDate,
	exitDate: trades.exitDate,
	pnl: trades.pnl,
	realizedRMultiple: trades.realizedRMultiple,
	asset: trades.asset,
	outcome: trades.outcome,
	rOutcome: trades.rOutcome,
	createdAt: trades.createdAt,
} as const

/**
 * Clamps a numeric query param between 0 and `max`, returning fallback if invalid.
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

/**
 * GET /api/arch/trades/list
 *
 * Paginated trade list with full filter capacity.
 *
 * SQL filters (efficient): dateFrom/To, assets, directions, outcomes, rating,
 * setupRank, executionMode, source, followedPlan, isArchived, strategy/strategyIds,
 * timeframe/timeframeIds, tags/tagIds.
 *
 * Post-decrypt filters (applied after row decryption — narrows the page):
 * - hourFrom, hourTo: 0-23, entry-date hour
 * - pnlMin, pnlMax: numeric dollars
 *
 * Note: when post-decrypt filters are active, the response `total` reflects the
 * SQL-pre-filter count. The returned `items.length` may be smaller than `limit`
 * because filtering happens after the page is loaded. Callers should rely on
 * `pagination.hasMore` for cursor-style traversal.
 */
const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const searchParams = request.nextUrl.searchParams

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

		const conditions = await parseArchFilters(searchParams, auth)
		const postFilters = parseArchPostDecryptFilters(searchParams)
		const whereClause = and(...conditions)

		const [totalRow] = await db
			.select({ total: count() })
			.from(trades)
			.where(whereClause)

		const total = totalRow?.total ?? 0

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

		const dek = await getUserDek(auth.userId)
		const decryptedTrades = dek
			? result.map((trade) => decryptTradeFields(trade, dek))
			: result

		const filteredTrades = decryptedTrades.filter((trade) =>
			matchesPostDecryptFilters(
				{
					entryDate: trade.entryDate as Date | string,
					pnl: (trade as { pnl?: string | number | null }).pnl ?? null,
				},
				postFilters
			)
		)

		const formattedTrades = filteredTrades.map((trade) =>
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
