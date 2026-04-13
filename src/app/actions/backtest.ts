"use server"

import type { BacktestResult, AssetConfig, BacktestInput } from "@/types/backtest"
import type { DataSourceInfo, CandleRow } from "@/types/candle"
import { backtestInputSchema } from "@/lib/validations/backtest"
import { runBacktest } from "@/lib/backtest/engine"
import { getAssetsWithPriceData } from "@/app/actions/candle-query"
import { db } from "@/db/drizzle"
import { assets, priceCandles } from "@/db/schema"
import { and, eq, gte, lte, asc } from "drizzle-orm"
import { BRT_OFFSET } from "@/lib/dates"

const MAX_CANDLES = 500_000

/**
 * Run a single backtest with the given configuration.
 *
 * This is the Python migration boundary:
 * Today: calls runBacktest() directly
 * Tomorrow: POST to Python microservice
 */
const runBacktestAction = async (
	input: BacktestInput
): Promise<{ success: boolean; data?: BacktestResult; error?: string }> => {
	try {
		// Validate input
		const validated = backtestInputSchema.safeParse(input)
		if (!validated.success) {
			return { success: false, error: validated.error.issues[0]?.message ?? "Invalid parameters" }
		}

		const { assetId, timeframeId, dateRange, recipe } = validated.data

		// Fetch asset for tickSize/tickValue
		const asset = await db.query.assets.findFirst({
			where: eq(assets.id, assetId),
			columns: { tickSize: true, tickValue: true, currency: true },
		})

		if (!asset) {
			return { success: false, error: "Asset not found" }
		}

		const assetConfig: AssetConfig = {
			tickSize: Number(asset.tickSize),
			tickValueCents: asset.tickValue,
			currency: asset.currency,
		}

		// Build date range with BRT boundaries
		const from = new Date(`${dateRange.from}T09:00:00${BRT_OFFSET}`)
		const to = new Date(`${dateRange.to}T18:00:00${BRT_OFFSET}`)

		// Adaptive candle query — only fetch indicators the strategy actually needs
		const needsIndicators = recipe.requiredIndicators.length > 0

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

		const requiredKeys = new Set(recipe.requiredIndicators)

		const candles: CandleRow[] = rows.map((r) => {
			// Filter indicators to only the keys the strategy needs
			let indicators: Record<string, number> = {}
			if (needsIndicators && "indicators" in r && r.indicators) {
				const raw = r.indicators as Record<string, number>
				for (const key of requiredKeys) {
					if (key in raw) indicators[key] = raw[key]
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
			return { success: false, error: "No candle data found for the selected date range" }
		}

		if (candles.length > MAX_CANDLES) {
			return { success: false, error: `Dataset too large (${candles.length.toLocaleString()} candles). Maximum: ${MAX_CANDLES.toLocaleString()}` }
		}

		// Run the engine (pure computation — no DB calls)
		const result = runBacktest(candles, recipe, assetConfig)

		return { success: true, data: result }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Backtest engine error",
		}
	}
}

/**
 * Get available assets with price data for the backtest form.
 * Wraps the existing getAssetsWithPriceData() function.
 */
const getBacktestDataSources = async (): Promise<{
	success: boolean
	data?: DataSourceInfo[]
	error?: string
}> => {
	try {
		const result = await getAssetsWithPriceData()
		if (result.status === "error") {
			return { success: false, error: "Failed to load data sources" }
		}
		return { success: true, data: result.data }
	} catch {
		return { success: false, error: "Failed to load data sources" }
	}
}

export { runBacktestAction, getBacktestDataSources }
