"use server"

import type {
	CandleQueryParams,
	CandleRow,
	IndicatorGroupWithKeys,
	DataSourceInfo,
	TradeChartData,
} from "@/types/candle"
import type { TradeExecution } from "@/db/schema"
import { db } from "@/db/drizzle"
import {
	priceCandles,
	indicatorGroups,
	indicatorDefinitions,
	trades,
	assets,
	priceDataVersions,
} from "@/db/schema"
import { and, eq, gte, lte, asc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { toSafeErrorMessage } from "@/lib/error-utils"

// Fetch candles for a specific time range
export const getCandlesForRange = async (
	params: CandleQueryParams
): Promise<{
	status: "success" | "error"
	message: string
	data?: {
		candles: CandleRow[]
		indicatorGroups: IndicatorGroupWithKeys[]
	}
}> => {
	try {
		const rows = await db
			.select({
				timestamp: priceCandles.timestamp,
				open: priceCandles.open,
				high: priceCandles.high,
				low: priceCandles.low,
				close: priceCandles.close,
				candleIndex: priceCandles.candleIndex,
				indicators: priceCandles.indicators,
			})
			.from(priceCandles)
			.where(
				and(
					eq(priceCandles.assetId, params.assetId),
					eq(priceCandles.timeframeId, params.timeframeId),
					gte(priceCandles.timestamp, params.from),
					lte(priceCandles.timestamp, params.to)
				)
			)
			.orderBy(asc(priceCandles.timestamp))

		// Fetch indicator groups with their keys
		const groups = await db.query.indicatorGroups.findMany({
			where: eq(indicatorGroups.isActive, true),
			with: {
				indicators: {
					where: eq(indicatorDefinitions.isActive, true),
					columns: { key: true, displayName: true },
				},
			},
			orderBy: asc(indicatorGroups.sortOrder),
		})

		const candles: CandleRow[] = rows.map((r) => ({
			timestamp: r.timestamp.toISOString(),
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
			candleIndex: r.candleIndex,
			indicators: (r.indicators ?? {}) as Record<string, number>,
		}))

		const indicatorGroupsData: IndicatorGroupWithKeys[] = groups.map((g) => ({
			key: g.key,
			displayName: g.displayName,
			indicatorKeys: g.indicators.map((i) => ({
				key: i.key,
				displayName: i.displayName,
			})),
		}))

		return {
			status: "success",
			message: `Found ${candles.length} candles`,
			data: { candles, indicatorGroups: indicatorGroupsData },
		}
	} catch (error) {
		return {
			status: "error",
			message:
				error instanceof Error ? error.message : "Failed to fetch candles",
		}
	}
}

// Fetch available assets with price data
export const getAssetsWithPriceData = async () => {
	try {
		const versions = await db.query.priceDataVersions.findMany({
			with: {
				asset: {
					columns: {
						id: true,
						symbol: true,
						name: true,
						tickSize: true,
						tickValue: true,
						currency: true,
					},
				},
				timeframe: { columns: { id: true, code: true, name: true } },
			},
		})

		return {
			status: "success" as const,
			data: versions.map((v) => ({
				assetId: v.asset.id,
				assetSymbol: v.asset.symbol,
				assetName: v.asset.name,
				assetTickSize: Number(v.asset.tickSize),
				assetTickValueCents: v.asset.tickValue,
				assetCurrency: v.asset.currency,
				timeframeId: v.timeframe.id,
				timeframeCode: v.timeframe.code,
				timeframeName: v.timeframe.name,
				rowCount: v.rowCount,
				lastImported: v.lastImportedAt?.toISOString() ?? null,
			})),
		}
	} catch (error) {
		return { status: "error" as const, data: [] }
	}
}

/** Trade data shape returned by getTradeWithCandles */
/**
 * Fetch a trade by ID with surrounding candle data for chart rendering.
 *
 * 1. Fetches the trade (with executions) and verifies ownership
 * 2. Looks up which asset+timeframe combo has candle data in priceDataVersions
 * 3. Fetches candles for the trade's time range with 30-minute padding
 * 4. Returns trade details + candles + indicator groups
 */
export const getTradeWithCandles = async (
	tradeId: string
): Promise<{
	status: "success" | "error"
	message: string
	data?: TradeChartData
}> => {
	try {
		const { accountId, userId } = await requireAuth()

		// 1. Fetch the trade by ID with executions
		let trade = await db.query.trades.findFirst({
			where: and(
				eq(trades.id, tradeId),
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false)
			),
			with: {
				executions: true,
				timeframe: true,
			},
		})

		if (!trade) {
			return {
				status: "error",
				message: "Trade not found",
			}
		}

		// Decrypt trade fields
		const dek = await getUserDek(userId)
		if (dek) {
			trade = decryptTradeFields(trade, dek)
		}

		// 2. Determine the asset — look up the asset record by symbol
		const assetRecord = await db.query.assets.findFirst({
			where: eq(assets.symbol, trade.asset),
		})

		if (!assetRecord) {
			return {
				status: "error",
				message: `Asset "${trade.asset}" not found in asset registry`,
			}
		}

		// 3. Find the best matching price data version for this asset
		// Use the trade's timeframeId if available, otherwise pick the first available
		const versions = await db.query.priceDataVersions.findMany({
			where: eq(priceDataVersions.assetId, assetRecord.id),
			with: {
				timeframe: true,
			},
		})

		if (versions.length === 0) {
			return {
				status: "error",
				message: `No candle data available for asset "${trade.asset}"`,
			}
		}

		// Prefer the trade's timeframe if it has candle data; otherwise use the first available
		const matchedVersion = trade.timeframeId
			? (versions.find((v) => v.timeframe.id === trade.timeframeId) ??
				versions[0])
			: versions[0]

		// 4. Build the time range: 30 minutes before entry, 30 minutes after exit
		const PADDING_MS = 30 * 60 * 1000
		const entryDate = new Date(trade.entryDate)
		const exitDate = trade.exitDate ? new Date(trade.exitDate) : new Date()
		const from = new Date(entryDate.getTime() - PADDING_MS)
		const to = new Date(exitDate.getTime() + PADDING_MS)

		// 5. Fetch candles for the range
		const candleResult = await getCandlesForRange({
			assetId: assetRecord.id,
			timeframeId: matchedVersion.timeframe.id,
			from,
			to,
		})

		if (candleResult.status === "error" || !candleResult.data) {
			return {
				status: "error",
				message: candleResult.message,
			}
		}

		// 6. Map executions to the simplified shape
		const executionsList: TradeChartData["executions"] = (
			trade.executions ?? []
		).map((exec: TradeExecution) => ({
			type: exec.executionType,
			price: Number(exec.price),
			quantity: Number(exec.quantity),
			timestamp: exec.executionDate.toISOString(),
		}))

		return {
			status: "success",
			message: `Found ${candleResult.data.candles.length} candles for trade`,
			data: {
				trade: {
					id: trade.id,
					direction: trade.direction,
					entryDate: trade.entryDate.toISOString(),
					exitDate: trade.exitDate?.toISOString() ?? null,
					entryPrice: Number(trade.entryPrice),
					exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
					stopLoss: trade.stopLoss ? Number(trade.stopLoss) : null,
					takeProfit: trade.takeProfit ? Number(trade.takeProfit) : null,
					pnl: trade.pnl ? Number(trade.pnl) : null,
					outcome: trade.outcome,
					asset: trade.asset,
					positionSize: Number(trade.positionSize),
				},
				executions: executionsList,
				candles: candleResult.data.candles,
				indicatorGroups: candleResult.data.indicatorGroups,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: toSafeErrorMessage(error, "getTradeWithCandles"),
		}
	}
}

/**
 * Check if candle data exists for a given asset symbol.
 * Lightweight query — just checks priceDataVersions.
 */
export const getCandleDataForAsset = async (
	assetSymbol: string
): Promise<{ assetId: string; timeframeId: string } | null> => {
	try {
		const asset = await db.query.assets.findFirst({
			where: eq(assets.symbol, assetSymbol.toUpperCase()),
			columns: { id: true },
		})
		if (!asset) {
			return null
		}

		const version = await db.query.priceDataVersions.findFirst({
			where: eq(priceDataVersions.assetId, asset.id),
			columns: { assetId: true, timeframeId: true },
		})

		return version
			? { assetId: version.assetId, timeframeId: version.timeframeId }
			: null
	} catch {
		return null
	}
}

/**
 * Fetch candles surrounding a trade's time range.
 * Used by the trade detail page when candle data is available.
 * Accepts trade timestamps directly to avoid re-fetching the trade.
 */
export const getCandlesForTrade = async (params: {
	assetId: string
	timeframeId: string
	entryDate: string
	exitDate?: string | null
}): Promise<{
	status: "success" | "error"
	message: string
	data?: {
		candles: CandleRow[]
		indicatorGroups: IndicatorGroupWithKeys[]
	}
}> => {
	try {
		const entryTime = new Date(params.entryDate)

		// Full trading day (09:00-18:00 BRT) of the entry date
		const entryDateStr = entryTime.toISOString().slice(0, 10) // YYYY-MM-DD
		const from = new Date(`${entryDateStr}T09:00:00-03:00`)
		const to = new Date(`${entryDateStr}T18:00:00-03:00`)

		return getCandlesForRange({
			assetId: params.assetId,
			timeframeId: params.timeframeId,
			from,
			to,
		})
	} catch {
		return { status: "error", message: "Failed to fetch candles for trade" }
	}
}
