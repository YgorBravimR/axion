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
import { assets, priceCandles } from "@/db/schema"
import { and, eq, gte, lte, asc } from "drizzle-orm"
import { BRT_OFFSET } from "@/lib/dates"
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

	const selectFields = {
		timestamp: priceCandles.timestamp,
		open: priceCandles.open,
		high: priceCandles.high,
		low: priceCandles.low,
		close: priceCandles.close,
		candleIndex: priceCandles.candleIndex,
		...(needsIndicators ? { indicators: priceCandles.indicators } : {}),
	}

	const rows = await db
		.select(selectFields)
		.from(priceCandles)
		.where(
			and(
				eq(priceCandles.assetId, assetId),
				eq(priceCandles.timeframeId, timeframeId),
				gte(priceCandles.timestamp, from),
				lte(priceCandles.timestamp, to)
			)
		)
		.orderBy(asc(priceCandles.timestamp))

	const requiredKeys = new Set(requiredIndicators)

	const candles: CandleRow[] = rows.map((r) => {
		const indicators: Record<string, number> = {}
		if (needsIndicators && "indicators" in r && r.indicators) {
			const raw = r.indicators as Record<string, number>
			for (const key of requiredKeys) {
				if (key in raw) {
					indicators[key] = raw[key]
				}
			}
		}

		return {
			timestamp: r.timestamp.toISOString(),
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
			candleIndex: r.candleIndex,
			indicators,
		}
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

		const result = runBacktest(candleResult.candles, recipe, assetConfig)

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
}): Promise<{
	success: boolean
	data?: { candles: CandleRow[]; assetConfig: AssetConfig }
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

		return {
			success: true,
			data: { candles: candleResult.candles, assetConfig },
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
