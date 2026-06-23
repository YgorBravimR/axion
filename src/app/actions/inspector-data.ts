"use server"

import { and, between, desc, eq, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	assets,
	assetSessionAnchors,
	hawksRenkoSizes,
	timeframes,
} from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { getCandleStore } from "@/lib/candle-store"
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
		// Asymmetric override wins when provided — same window across all three
		// timeframes so the panes share a comparable time slice.
		const padding5m = params.paddingMs5m ?? DEFAULT_PADDING_5M
		const padding15m = params.paddingMs15m ?? DEFAULT_PADDING_15M
		const padding60m = params.paddingMs60m ?? DEFAULT_PADDING_60M
		const useAsymmetric =
			params.paddingMsBefore !== undefined ||
			params.paddingMsAfter !== undefined
		const paddingBefore = params.paddingMsBefore ?? 0
		const paddingAfter = params.paddingMsAfter ?? 0

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

		const store = getCandleStore()
		const fetchRange = (tfId: string, paddingMs: number) => {
			const from = useAsymmetric
				? new Date(centerMs - paddingBefore)
				: new Date(centerMs - paddingMs)
			const to = useAsymmetric
				? new Date(centerMs + paddingAfter)
				: new Date(centerMs + paddingMs)
			return store.fetchRange({
				assetId: assetRow.id,
				timeframeId: tfId,
				from,
				to,
				indicatorKeys: "*",
			})
		}

		const [rows5m, rows15m, rows60m] = await Promise.all([
			fetchRange(tfId5m, padding5m),
			fetchRange(tfId15m, padding15m),
			fetchRange(tfId60m, padding60m),
		])

		// `ajuste` / `ajuste_adj` live in `asset_session_anchors` (one row per
		// day, not in parquet — see docs/hawks-strategy/indicator-isolation/
		// group-d-vwap.md). Inject them onto each 5m brick's indicators map
		// so the chart can render them as horizontal-by-day step lines.
		const windowFrom = useAsymmetric
			? new Date(centerMs - paddingBefore)
			: new Date(centerMs - padding5m)
		const windowTo = useAsymmetric
			? new Date(centerMs + paddingAfter)
			: new Date(centerMs + padding5m)
		const anchorRows = await db
			.select({
				date: assetSessionAnchors.date,
				payload: assetSessionAnchors.payload,
			})
			.from(assetSessionAnchors)
			.where(
				and(
					eq(assetSessionAnchors.assetId, assetRow.id),
					between(
						assetSessionAnchors.date,
						windowFrom.toISOString().slice(0, 10),
						windowTo.toISOString().slice(0, 10)
					)
				)
			)
		const ajusteByDay = new Map<
			string,
			{ ajuste?: number; ajusteAdj?: number }
		>()
		for (const a of anchorRows) {
			const payload = a.payload as {
				ajuste?: number | null
				ajuste_adj?: number | null
			}
			ajusteByDay.set(a.date, {
				ajuste: payload.ajuste ?? undefined,
				ajusteAdj: payload.ajuste_adj ?? undefined,
			})
		}
		const injectAjuste = (rows: typeof rows5m) => {
			for (const r of rows) {
				const dayKey = r.timestamp.slice(0, 10)
				const anchor = ajusteByDay.get(dayKey)
				if (!anchor) {
					continue
				}
				if (anchor.ajuste !== undefined) {
					r.indicators.ajuste = anchor.ajuste
				}
				if (anchor.ajusteAdj !== undefined) {
					r.indicators.ajuste_adj = anchor.ajusteAdj
				}
			}
		}
		injectAjuste(rows5m)
		injectAjuste(rows15m)
		injectAjuste(rows60m)

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
				.where(
					and(
						eq(hawksRenkoSizes.assetId, assetRow.id),
						lte(hawksRenkoSizes.effectiveDate, centerDateStr)
					)
				)
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
			timestamp: string
			open: number
			high: number
			low: number
			close: number
			indicators: Record<string, number>
		}): InspectorCandleRow => ({
			timestamp: r.timestamp,
			open: r.open,
			high: r.high,
			low: r.low,
			close: r.close,
			indicators: r.indicators,
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

		const rows = await getCandleStore().fetchRange({
			assetId: assetRow.id,
			timeframeId: tfId5m,
			from: fromDate,
			to: toDate,
			indicatorKeys: "*",
		})

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
				.where(
					and(
						eq(hawksRenkoSizes.assetId, assetRow.id),
						lte(hawksRenkoSizes.effectiveDate, params.fromDate)
					)
				)
				.orderBy(desc(hawksRenkoSizes.effectiveDate))
				.limit(1)
		)[0]

		return {
			status: "success",
			data: {
				candles5m: rows.map((r) => ({
					timestamp: r.timestamp,
					open: r.open,
					high: r.high,
					low: r.low,
					close: r.close,
					indicators: r.indicators,
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
