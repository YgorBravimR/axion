/**
 * Yahoo Finance Provider
 *
 * Uses Yahoo Finance v8 spark API — free, no API key required.
 * Now implements QuoteProvider: accepts a symbol list, returns Map<string, MarketQuote>.
 * Display metadata (names, flags) is applied by the orchestrator from the registry.
 *
 * @see https://query2.finance.yahoo.com/v8/finance/spark
 */

import type { MarketQuote, QuoteProvider } from "@/types/market"

const YAHOO_BASE_URL = "https://query2.finance.yahoo.com/v8/finance/spark"

// Yahoo v8 spark API allows a maximum of 20 symbols per request
const MAX_SYMBOLS_PER_BATCH = 20

// ── Yahoo v8 spark types ─────────────────────────────────────────────────────

interface YahooSparkResult {
	timestamp: number[]
	symbol: string
	chartPreviousClose: number
	close: number[]
}

type YahooSparkResponse = Record<string, YahooSparkResult>

// ── Mapping ──────────────────────────────────────────────────────────────────

const mapSparkQuote = (result: YahooSparkResult): MarketQuote => {
	const validCloses = result.close.filter((c) => c !== null && !Number.isNaN(c))
	const price = validCloses[validCloses.length - 1] ?? 0
	const previousClose = result.chartPreviousClose ?? 0
	const change = price - previousClose
	const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0

	// Session high/low from intraday 15m close values
	const sessionHigh = validCloses.length > 1 ? Math.max(...validCloses) : null
	const sessionLow = validCloses.length > 1 ? Math.min(...validCloses) : null

	return {
		symbol: result.symbol,
		name: result.symbol, // Overridden by orchestrator from registry
		price,
		change,
		changePercent,
		previousClose,
		sessionHigh,
		sessionLow,
		flag: "", // Overridden by orchestrator from registry
		updatedAt: result.timestamp[result.timestamp.length - 1]
			? new Date(
					result.timestamp[result.timestamp.length - 1] * 1000
				).toISOString()
			: new Date().toISOString(),
	}
}

// ── Batch fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch a single batch of symbols from Yahoo Finance v8 spark endpoint.
 * Uses 15m interval to get intraday data for session high/low computation.
 */
const fetchSparkBatch = async (
	symbols: string[]
): Promise<YahooSparkResponse> => {
	const symbolsParam = symbols.join(",")
	const url = `${YAHOO_BASE_URL}?symbols=${encodeURIComponent(symbolsParam)}&range=1d&interval=15m`

	const response = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0",
		},
		next: { revalidate: 0 },
	})

	if (!response.ok) {
		throw new Error(
			`Yahoo Finance API error: ${response.status} ${response.statusText}`
		)
	}

	return (await response.json()) as YahooSparkResponse
}

/**
 * Fetch quotes for the given symbols from Yahoo Finance.
 * Deduplicates, splits into batches of 20 (API limit), and runs them in parallel.
 *
 * @param symbols - List of Yahoo-compatible symbols to fetch
 * @returns Map of symbol → MarketQuote for successfully resolved symbols
 */
const fetchYahooQuotes = async (
	symbols: string[]
): Promise<Map<string, MarketQuote>> => {
	const unique = [...new Set(symbols)]
	const quoteMap = new Map<string, MarketQuote>()

	// Split into batches of MAX_SYMBOLS_PER_BATCH
	const batches: string[][] = []
	for (let i = 0; i < unique.length; i += MAX_SYMBOLS_PER_BATCH) {
		batches.push(unique.slice(i, i + MAX_SYMBOLS_PER_BATCH))
	}

	// Fetch all batches in parallel
	const results = await Promise.all(batches.map(fetchSparkBatch))

	for (const data of results) {
		for (const [symbol, result] of Object.entries(data)) {
			if (result?.close?.length > 0) {
				quoteMap.set(symbol, mapSparkQuote(result))
			}
		}
	}

	return quoteMap
}

// ── QuoteProvider export ─────────────────────────────────────────────────────

export const yahooProvider: QuoteProvider = {
	id: "yahoo",
	fetchQuotes: fetchYahooQuotes,
}
