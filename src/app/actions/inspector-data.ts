"use server"

import { and, asc, desc, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { assets, hawksRenkoSizes, priceCandles, timeframes } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import type {
	GetInspectorWindowParams,
	GetOverviewRangeParams,
	InspectorBrickSizes,
	InspectorCandleRow,
	InspectorWindowResult,
	OverviewRangeResult,
} from "@/types/inspector"

const DEFAULT_PADDING_5M = 2 * 60 * 60 * 1000
const DEFAULT_PADDING_15M = 8 * 60 * 60 * 1000
const DEFAULT_PADDING_60M = 2 * 24 * 60 * 60 * 1000

const FALLBACK_SIZES: InspectorBrickSizes = {
	size5m: 21,
	size15m: 39,
	size60m: 84,
	effectiveDate: null,
	weekNumber: null,
}

export const getInspectorWindow = async (
	params: GetInspectorWindowParams
): Promise<InspectorWindowResult> => {
	try {
		await requireAuth()

		const centerMs = new Date(params.centerTime).getTime()
		if (!Number.isFinite(centerMs)) {
			return { status: "error", message: "Invalid centerTime" }
		}
		const padding5m = params.paddingMs5m ?? DEFAULT_PADDING_5M
		const padding15m = params.paddingMs15m ?? DEFAULT_PADDING_15M
		const padding60m = params.paddingMs60m ?? DEFAULT_PADDING_60M

		const assetRow = (
			await db
				.select({ id: assets.id, symbol: assets.symbol })
				.from(assets)
				.where(eq(assets.symbol, params.assetSymbol))
				.limit(1)
		)[0]
		if (!assetRow) {
			return {
				status: "error",
				message: `Asset ${params.assetSymbol} not found`,
			}
		}

		const tfRows = await db
			.select({ id: timeframes.id, code: timeframes.code })
			.from(timeframes)
		const tfIdByCode = new Map(tfRows.map((r) => [r.code, r.id]))
		const tfId5m = tfIdByCode.get("hawk_5m_win")
		const tfId15m = tfIdByCode.get("hawk_15m_win")
		const tfId60m = tfIdByCode.get("hawk_60m_win")
		if (!tfId5m || !tfId15m || !tfId60m) {
			return {
				status: "error",
				message:
					"hawk_5m_win / hawk_15m_win / hawk_60m_win timeframe missing in DB — run scripts/materialize-hawks-timeframes.ts",
			}
		}

		const fetchRange = async (tfId: string, paddingMs: number) =>
			db
				.select({
					timestamp: priceCandles.timestamp,
					open: priceCandles.open,
					high: priceCandles.high,
					low: priceCandles.low,
					close: priceCandles.close,
					indicators: priceCandles.indicators,
				})
				.from(priceCandles)
				.where(
					and(
						eq(priceCandles.assetId, assetRow.id),
						eq(priceCandles.timeframeId, tfId),
						gte(priceCandles.timestamp, new Date(centerMs - paddingMs)),
						lte(priceCandles.timestamp, new Date(centerMs + paddingMs))
					)
				)
				.orderBy(asc(priceCandles.timestamp))

		const [rows5m, rows15m, rows60m] = await Promise.all([
			fetchRange(tfId5m, padding5m),
			fetchRange(tfId15m, padding15m),
			fetchRange(tfId60m, padding60m),
		])

		const centerDateStr = new Date(centerMs).toISOString().slice(0, 10)
		const sizeRow = (
			await db
				.select({
					effectiveDate: hawksRenkoSizes.effectiveDate,
					weekNumber: hawksRenkoSizes.weekNumber,
					size5m: hawksRenkoSizes.size5m,
					size15m: hawksRenkoSizes.size15m,
					size60m: hawksRenkoSizes.size60m,
				})
				.from(hawksRenkoSizes)
				.where(lte(hawksRenkoSizes.effectiveDate, centerDateStr))
				.orderBy(desc(hawksRenkoSizes.effectiveDate))
				.limit(1)
		)[0]
		const sizes: InspectorBrickSizes = sizeRow
			? {
					size5m: sizeRow.size5m,
					size15m: sizeRow.size15m,
					size60m: sizeRow.size60m,
					effectiveDate: sizeRow.effectiveDate,
					weekNumber: sizeRow.weekNumber,
				}
			: FALLBACK_SIZES

		const toCandleRow = (r: {
			timestamp: Date
			open: string
			high: string
			low: string
			close: string
			indicators: unknown
		}): InspectorCandleRow => ({
			timestamp: r.timestamp.toISOString(),
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
			indicators: (r.indicators ?? {}) as Record<string, number>,
		})

		return {
			status: "success",
			data: {
				candles5m: rows5m.map(toCandleRow),
				candles15m: rows15m.map(toCandleRow),
				candles60m: rows60m.map(toCandleRow),
				sizes,
				assetSymbol: assetRow.symbol,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message:
				error instanceof Error
					? error.message
					: "Failed to fetch inspector window",
		}
	}
}

export const getOverviewRange = async (
	params: GetOverviewRangeParams
): Promise<OverviewRangeResult> => {
	try {
		await requireAuth()

		const assetRow = (
			await db
				.select({ id: assets.id })
				.from(assets)
				.where(eq(assets.symbol, params.assetSymbol))
				.limit(1)
		)[0]
		if (!assetRow) {
			return {
				status: "error",
				message: `Asset ${params.assetSymbol} not found`,
			}
		}

		const tfRows = await db
			.select({ id: timeframes.id, code: timeframes.code })
			.from(timeframes)
		const tfId5m = tfRows.find((t) => t.code === "hawk_5m_win")?.id
		if (!tfId5m) {
			return {
				status: "error",
				message:
					"hawk_5m_win timeframe missing in DB — run scripts/materialize-hawks-timeframes.ts",
			}
		}

		const fromDate = new Date(`${params.fromDate}T00:00:00Z`)
		const toDate = new Date(`${params.toDate}T23:59:59Z`)

		const rows = await db
			.select({
				timestamp: priceCandles.timestamp,
				open: priceCandles.open,
				high: priceCandles.high,
				low: priceCandles.low,
				close: priceCandles.close,
				indicators: priceCandles.indicators,
			})
			.from(priceCandles)
			.where(
				and(
					eq(priceCandles.assetId, assetRow.id),
					eq(priceCandles.timeframeId, tfId5m),
					gte(priceCandles.timestamp, fromDate),
					lte(priceCandles.timestamp, toDate)
				)
			)
			.orderBy(asc(priceCandles.timestamp))

		const sizeRow = (
			await db
				.select({
					effectiveDate: hawksRenkoSizes.effectiveDate,
					weekNumber: hawksRenkoSizes.weekNumber,
					size5m: hawksRenkoSizes.size5m,
					size15m: hawksRenkoSizes.size15m,
					size60m: hawksRenkoSizes.size60m,
				})
				.from(hawksRenkoSizes)
				.where(lte(hawksRenkoSizes.effectiveDate, params.fromDate))
				.orderBy(desc(hawksRenkoSizes.effectiveDate))
				.limit(1)
		)[0]

		return {
			status: "success",
			data: {
				candles5m: rows.map((r) => ({
					timestamp: r.timestamp.toISOString(),
					open: Number(r.open),
					high: Number(r.high),
					low: Number(r.low),
					close: Number(r.close),
					indicators: (r.indicators ?? {}) as Record<string, number>,
				})),
				sizes: sizeRow
					? {
							size5m: sizeRow.size5m,
							size15m: sizeRow.size15m,
							size60m: sizeRow.size60m,
							effectiveDate: sizeRow.effectiveDate,
							weekNumber: sizeRow.weekNumber,
						}
					: FALLBACK_SIZES,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message:
				error instanceof Error ? error.message : "Failed to fetch overview",
		}
	}
}
