"use server"

import { and, desc, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	assets,
	hawksRenkoSizes,
	timeframes,
	trades,
	tradingAccounts,
} from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import { getCandleStore } from "@/lib/candle-store"
import type { InspectorBrickSizes, InspectorCandleRow } from "@/types/inspector"
import type {
	HawksChartFullWindowResult,
	HawksChartTradeMarker,
} from "./hawks-chart-data.types"

// Wide-window bounds — the candle store backs onto R2/Parquet via DuckDB and
// will only return what actually exists, so over-asking has no cost beyond
// the DuckDB filter step.
const RANGE_FROM = new Date("2020-01-01T00:00:00Z")
const RANGE_TO = new Date("2099-12-31T23:59:59Z")

const FALLBACK_SIZES: InspectorBrickSizes = {
	size5m: 21,
	size15m: 39,
	size60m: 84,
	effectiveDate: null,
	weekNumber: null,
}

export const getHawksFullWindow = async (
	assetSymbol: string
): Promise<HawksChartFullWindowResult> => {
	try {
		const auth = await requireAuth()

		const assetRow = (
			await db
				.select({ id: assets.id, symbol: assets.symbol })
				.from(assets)
				.where(eq(assets.symbol, assetSymbol))
				.limit(1)
		)[0]
		if (!assetRow) {
			return {
				status: "error",
				message: `Asset ${assetSymbol} not found`,
			}
		}

		// Look up the three hawks timeframe IDs in one query.
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
		const fetchAll = (tfId: string) =>
			store.fetchRange({
				assetId: assetRow.id,
				timeframeId: tfId,
				from: RANGE_FROM,
				to: RANGE_TO,
				indicatorKeys: "*",
			})

		// All three TFs + the latest-effective brick-size row + the user's
		// hawks-tagged trades in one fan-out. Each query stands alone, so
		// Promise.all keeps the action under the inspector's typical budget
		// even when the parquet store has years of data.
		const [rows5m, rows15m, rows60m, sizeRow, tradeRows] = await Promise.all([
			fetchAll(tfId5m),
			fetchAll(tfId15m),
			fetchAll(tfId60m),
			db
				.select({
					effectiveDate: hawksRenkoSizes.effectiveDate,
					weekNumber: hawksRenkoSizes.weekNumber,
					size5m: hawksRenkoSizes.size5m,
					size15m: hawksRenkoSizes.size15m,
					size60m: hawksRenkoSizes.size60m,
				})
				.from(hawksRenkoSizes)
				.where(eq(hawksRenkoSizes.assetId, assetRow.id))
				.orderBy(desc(hawksRenkoSizes.effectiveDate))
				.limit(1)
				.then((rows) => rows[0] ?? null),
			// Trade markers — scoped to (current user's accounts × this asset ×
			// hawk_5m_win timeframe). Trades in other timeframes do not belong
			// on the hawks chart; the join keeps them out cleanly without a
			// post-filter. The `trades` table stores the asset as a varchar
			// symbol (not an FK) — match on `assetSymbol`, not the assets PK.
			db
				.select({
					id: trades.id,
					entryDate: trades.entryDate,
					exitDate: trades.exitDate,
					direction: trades.direction,
					entryPrice: trades.entryPrice,
					exitPrice: trades.exitPrice,
					rMultiple: trades.realizedRMultiple,
					// Use the stored outcome — it was set by `determineOutcome`
					// (src/lib/calculations.ts) at trade-save time, which honors
					// the per-account `breakevenTicks` rule (trades within ±N
					// ticks of entry are scratches, not wins/losses). Re-deriving
					// from rMultiple here would skip the BE-tick band.
					outcome: trades.outcome,
					// Planned stop/target for the position-box rendering. Nullable
					// for legacy trades where the user didn't log them.
					stopLoss: trades.stopLoss,
					takeProfit: trades.takeProfit,
				})
				.from(trades)
				.innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id))
				.where(
					and(
						eq(tradingAccounts.userId, auth.userId),
						eq(trades.asset, assetRow.symbol),
						eq(trades.timeframeId, tfId5m),
						gte(trades.entryDate, RANGE_FROM),
						lte(trades.entryDate, RANGE_TO)
					)
				),
		])

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

		const tradeMarkers: HawksChartTradeMarker[] = tradeRows.map((t) => {
			// trades.entryPrice / exitPrice are stored as decimal strings in
			// milli-points (the audit-debugger formatter divides by 1000 to
			// display). For chart placement we want the raw price the candles
			// use — same milli-point scale.
			const entryPrice = Number(t.entryPrice)
			const exitPrice = t.exitPrice !== null ? Number(t.exitPrice) : null
			const rMultiple =
				t.rMultiple !== null && t.rMultiple !== undefined
					? Number(t.rMultiple)
					: null

			// Stop / target are text columns — parse defensively. Empty or
			// non-numeric text → null, which the chart renders as "no stop
			// band" / "no target band" for that trade.
			const parsePrice = (raw: string | null): number | null => {
				if (raw === null || raw === undefined || raw === "") {
					return null
				}
				const n = Number(raw)
				return Number.isFinite(n) ? n : null
			}
			const stopPrice = parsePrice(t.stopLoss)
			const targetPrice = parsePrice(t.takeProfit)

			return {
				id: t.id,
				entryTime: t.entryDate.toISOString(),
				exitTime: t.exitDate ? t.exitDate.toISOString() : null,
				direction: t.direction,
				entryPrice,
				exitPrice,
				rMultiple,
				// `trades.outcome` is nullable in the schema (open trades, or
				// pre-enrichment legacy rows). Fall back to "breakeven" so the
				// marker still renders — picking a neutral color is the least-
				// surprising default when the outcome isn't known.
				outcome: t.outcome ?? "breakeven",
				stopPrice,
				targetPrice,
			}
		})

		return {
			status: "success",
			data: {
				assetSymbol: assetRow.symbol,
				candles5m: rows5m.map(toCandleRow),
				candles15m: rows15m.map(toCandleRow),
				candles60m: rows60m.map(toCandleRow),
				sizes,
				tradeMarkers,
			},
		}
	} catch (err) {
		return {
			status: "error",
			message:
				err instanceof Error
					? err.message
					: "Failed to load hawks chart window",
		}
	}
}
