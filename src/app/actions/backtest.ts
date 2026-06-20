"use server"

import type {
	BacktestResult,
	AssetConfig,
	BacktestInput,
} from "@/types/backtest"
import type { DataSourceInfo, CandleRow } from "@/types/candle"
import { backtestInputSchema } from "@/lib/validations/backtest"
import { runBacktest } from "@/lib/backtest/engine"
import { getAssetsWithPriceData } from "@/app/actions/candle-query"
import { db } from "@/db/drizzle"
import { assets, timeframes } from "@/db/schema"
import { eq } from "drizzle-orm"
import { BRT_OFFSET } from "@/lib/dates"
import {
	getDailyAnchors,
	candleTimestampToBrtDate,
} from "@/lib/indicators/daily-anchors"
import { getCandleStore } from "@/lib/candle-store"
import { getTranslations } from "next-intl/server"

const MAX_CANDLES = 500_000

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fetchAssetConfig = async (
	assetId: string
): Promise<AssetConfig | null> => {
	const asset = await db.query.assets.findFirst({
		where: eq(assets.id, assetId),
		columns: { tickSize: true, tickValue: true, currency: true },
	})
	if (!asset) {
		return null
	}
	return {
		tickSize: Number(asset.tickSize),
		tickValueCents: asset.tickValue,
		currency: asset.currency,
	}
}

const fetchCandles15m = async (
	assetId: string,
	dateRange: { from: string; to: string }
): Promise<CandleRow[]> => {
	const tfRow = (
		await db
			.select({ id: timeframes.id })
			.from(timeframes)
			.where(eq(timeframes.code, "hawk_15m_win"))
			.limit(1)
	)[0]
	if (!tfRow) {
		return []
	}
	const from = new Date(`${dateRange.from}T09:00:00${BRT_OFFSET}`)
	const to = new Date(`${dateRange.to}T18:00:00${BRT_OFFSET}`)
	const rows = await getCandleStore().fetchRange({
		assetId,
		timeframeId: tfRow.id,
		from,
		to,
		indicatorKeys: "*",
	})
	return rows.map((r) => ({
		timestamp: r.timestamp,
		open: r.open,
		high: r.high,
		low: r.low,
		close: r.close,
		candleIndex: r.candleIndex ?? 0,
		indicators: r.indicators,
	}))
}

const fetchCandles = async (
	params: {
		assetId: string
		timeframeId: string
		dateRange: { from: string; to: string }
		requiredIndicators: string[]
	},
	t: Awaited<ReturnType<typeof getTranslations<"backtest">>>
): Promise<{ candles: CandleRow[] } | { error: string }> => {
	const { assetId, timeframeId, dateRange, requiredIndicators } = params
	const from = new Date(`${dateRange.from}T09:00:00${BRT_OFFSET}`)
	const to = new Date(`${dateRange.to}T18:00:00${BRT_OFFSET}`)
	const needsIndicators = requiredIndicators.length > 0

	// Pull rows via the candle store (R2 Parquet via DuckDB).
	const baseRows = await getCandleStore().fetchRange({
		assetId,
		timeframeId,
		from,
		to,
		indicatorKeys: needsIndicators ? requiredIndicators : undefined,
	})

	// Daily session anchors (ajuste, prior O/H/L/C, pivots, …) live in
	// `asset_session_anchors`, one row per (asset, BRT date). Anchor data
	// stays on Postgres regardless of candle backend; merge per-row below.
	const anchorsByDate = needsIndicators
		? await getDailyAnchors(assetId, dateRange.from, dateRange.to)
		: new Map<string, Record<string, unknown>>()

	const candles: CandleRow[] = baseRows.map((row) => {
		if (!needsIndicators) {
			return row
		}
		const anchorPayload = anchorsByDate.get(
			candleTimestampToBrtDate(new Date(row.timestamp))
		)
		if (!anchorPayload) {
			return row
		}
		// Fill in any indicator the row didn't carry but the anchor does.
		// Per-row keys win over anchors (anchors are session-constant).
		const merged: Record<string, number> = { ...row.indicators }
		for (const key of requiredIndicators) {
			if (merged[key] === undefined) {
				const anchorValue = anchorPayload[key]
				if (typeof anchorValue === "number") {
					merged[key] = anchorValue
				}
			}
		}
		return { ...row, indicators: merged }
	})

	if (candles.length === 0) {
		return { error: t("errors.noCandles") }
	}

	if (candles.length > MAX_CANDLES) {
		return {
			error: t("errors.datasetTooLarge", {
				count: candles.length.toLocaleString(),
				max: MAX_CANDLES.toLocaleString(),
			}),
		}
	}

	return { candles }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Run a single backtest with the given configuration.
 *
 * This is the Python migration boundary:
 * Today: calls runBacktest() directly
 * Tomorrow: POST to Python microservice
 */
export const runBacktestAction = async (
	input: BacktestInput
): Promise<{ success: boolean; data?: BacktestResult; error?: string }> => {
	const t = await getTranslations("backtest")
	try {
		const validated = backtestInputSchema.safeParse(input)
		if (!validated.success) {
			return {
				success: false,
				error: validated.error.issues[0]?.message ?? t("errors.invalidParams"),
			}
		}

		const { assetId, timeframeId, dateRange, recipe } = validated.data

		const assetConfig = await fetchAssetConfig(assetId)
		if (!assetConfig) {
			return { success: false, error: t("errors.assetNotFound") }
		}

		const candleResult = await fetchCandles(
			{
				assetId,
				timeframeId,
				dateRange,
				requiredIndicators: recipe.requiredIndicators,
			},
			t
		)

		if ("error" in candleResult) {
			return { success: false, error: candleResult.error }
		}

		// Hawks playbook needs the 15m candle stream to power the
		// `htfPivotAligned` booster (engine.ts → buildHtfWalker). Without it
		// the AAA tier is unreachable. Fetch 15m candles alongside the
		// primary stream when the recipe is hawks_playbook.
		const candles15m =
			recipe.entry.type === "hawks_playbook"
				? await fetchCandles15m(assetId, dateRange)
				: []

		const result = runBacktest(
			candleResult.candles,
			recipe as Parameters<typeof runBacktest>[1],
			assetConfig,
			candles15m
		)

		return { success: true, data: result }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : t("errors.engineError"),
		}
	}
}

/**
 * Get available assets with price data for the backtest form.
 * Wraps the existing getAssetsWithPriceData() function.
 */
export const getBacktestDataSources = async (): Promise<{
	status: "success" | "error"
	data?: DataSourceInfo[]
	message?: string
}> => {
	const t = await getTranslations("backtest")
	try {
		const result = await getAssetsWithPriceData()
		if (result.status === "error") {
			return { status: "error", message: t("errors.failedToLoadDataSources") }
		}
		return { status: "success", data: result.data }
	} catch {
		return { status: "error", message: t("errors.failedToLoadDataSources") }
	}
}

/**
 * Fetch candles + asset config without running the engine.
 * The client runs runBacktest() locally for zero-server-cost optimization.
 */
export const fetchBacktestData = async (params: {
	assetId: string
	timeframeId: string
	dateRange: { from: string; to: string }
	requiredIndicators: string[]
	includeHtf15m?: boolean
}): Promise<{
	success: boolean
	data?: {
		candles: CandleRow[]
		candles15m?: CandleRow[]
		assetConfig: AssetConfig
	}
	error?: string
}> => {
	const t = await getTranslations("backtest")
	try {
		const assetConfig = await fetchAssetConfig(params.assetId)
		if (!assetConfig) {
			return { success: false, error: t("errors.assetNotFound") }
		}

		const candleResult = await fetchCandles(params, t)
		if ("error" in candleResult) {
			return { success: false, error: candleResult.error }
		}

		const candles15m = params.includeHtf15m
			? await fetchCandles15m(params.assetId, params.dateRange)
			: undefined

		return {
			success: true,
			data: { candles: candleResult.candles, candles15m, assetConfig },
		}
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: t("errors.failedToFetchBacktestData"),
		}
	}
}
