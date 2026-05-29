import type { CandleRow } from "@/types/candle"
import type { StrategyRecipe } from "@/types/backtest"

const STORAGE_SCHEMA_VERSION = 2

const hashString = (input: string): string => {
	let h = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i)
		h = Math.imul(h, 0x01000193) >>> 0
	}
	return h.toString(16).padStart(8, "0")
}

const hashCandles = (candles: CandleRow[]): string => {
	if (candles.length === 0) {
		return "empty"
	}
	const first = candles[0]!
	const last = candles[candles.length - 1]!
	const sample =
		candles.length > 4 ? [candles[Math.floor(candles.length / 2)]!] : []
	const payload = [first, ...sample, last]
		.map((c) => `${c.timestamp.toISOString()}|${c.open}|${c.close}`)
		.join(";")
	return `${candles.length}-${hashString(payload)}`
}

const hashDateRange = (from: string, to: string): string =>
	hashString(`${from}..${to}`)

const hashRecipeConfig = (recipe: StrategyRecipe): string =>
	hashString(JSON.stringify(recipe))

interface SweepProvenance {
	sweepId: string
	datasetHash: string
	candleCount: number
	dateRangeHash: string
	dateFrom: string
	dateTo: string
	engineVersion: string
	createdAt: string
}

const buildSweepProvenance = (
	candles: CandleRow[],
	dateFrom: string,
	dateTo: string,
	engineVersion: string
): SweepProvenance => ({
	sweepId: crypto.randomUUID(),
	datasetHash: hashCandles(candles),
	candleCount: candles.length,
	dateRangeHash: hashDateRange(dateFrom, dateTo),
	dateFrom,
	dateTo,
	engineVersion,
	createdAt: new Date().toISOString(),
})

export {
	STORAGE_SCHEMA_VERSION,
	hashCandles,
	hashDateRange,
	hashRecipeConfig,
	buildSweepProvenance,
}
export type { SweepProvenance }
