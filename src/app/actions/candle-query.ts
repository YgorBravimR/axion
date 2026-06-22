"use server"

import { getTranslations } from "next-intl/server"
import type {
	CandleQueryParams,
	CandleRow,
	IndicatorGroupWithKeys,
	TradeChartData,
} from "@/types/candle"
import type { TradeExecution } from "@/db/schema"
import { db } from "@/db/drizzle"
import {
	indicatorGroups,
	indicatorDefinitions,
	trades,
	assets,
	priceDataVersions,
	timeframes,
} from "@/db/schema"
import { and, eq, asc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getCandleStore } from "@/lib/candle-store"
import { getActiveAccountModeForUser } from "@/lib/hawks/account-context"
import { getBrtDateParts } from "@/lib/dates"

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
	const t = await getTranslations("candleQuery.errors")
	try {
		// Without this gate, a stale session lets middleware catch the action and
		// return an HTML /login redirect — which the client's Server Action
		// runtime then throws as "unexpected response," leaving any caller that
		// doesn't .catch() stuck in a loading state forever.
		await requireAuth()

		// Fetch indicator groups with their keys — we'll project every key
		// from the candle store so the chart can toggle any indicator.
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

		const allIndicatorKeys = groups.flatMap((g) =>
			g.indicators.map((i) => i.key)
		)

		const candles: CandleRow[] = await getCandleStore().fetchRange({
			assetId: params.assetId,
			timeframeId: params.timeframeId,
			from: params.from,
			to: params.to,
			indicatorKeys: allIndicatorKeys,
		})

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
			message: error instanceof Error ? error.message : t("fetchFailed"),
		}
	}
}

// Fetch available assets with price data.
//
// Candle bytes live in R2 Parquet (one file per asset+timeframe);
// `priceDataVersions` is the on-Postgres registry. `firstCandleAt` /
// `lastCandleAt` are captured by each loader at ingest, so the dropdown
// can show a date range without hitting R2.
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
				candleDateFrom: v.firstCandleAt?.toISOString() ?? null,
				candleDateTo: v.lastCandleAt?.toISOString() ?? null,
			})),
		}
	} catch {
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
		const { accountId } = await requireAuth()

		// 1. Fetch the trade by ID with executions
		const trade = await db.query.trades.findFirst({
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
		const [firstVersion] = versions
		if (!firstVersion) {
			return {
				status: "error",
				message: `No candle data available for asset "${trade.asset}"`,
			}
		}
		const matchedVersion = trade.timeframeId
			? (versions.find((v) => v.timeframe.id === trade.timeframeId) ??
				firstVersion)
			: firstVersion

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

		// In hawks mode the canonical chart timeframe is hawk_5m_win.
		// Without this preference the fallback picks an arbitrary first
		// price_data_versions row (often a tiny R36/etc. parquet), so the
		// trade detail chart renders only a handful of bricks.
		const mode = await getActiveAccountModeForUser()
		if (mode === "hawks") {
			const hawkTf = await db.query.timeframes.findFirst({
				where: eq(timeframes.code, "hawk_5m_win"),
				columns: { id: true },
			})
			if (hawkTf) {
				const hawkVersion = await db.query.priceDataVersions.findFirst({
					where: and(
						eq(priceDataVersions.assetId, asset.id),
						eq(priceDataVersions.timeframeId, hawkTf.id)
					),
					columns: { assetId: true, timeframeId: true },
				})
				if (hawkVersion) {
					return {
						assetId: hawkVersion.assetId,
						timeframeId: hawkVersion.timeframeId,
					}
				}
			}
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

		// Full trading day (09:00-18:00 BRT) of the entry date.
		// Slicing toISOString() returns the UTC date — for late-evening BRT
		// entries that crosses into the next day. Resolve the BRT-local date
		// explicitly so the window stays on the correct trading day.
		const { year, month, day } = getBrtDateParts(entryTime)
		const entryDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
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
