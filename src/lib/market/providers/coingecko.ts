/**
 * CoinGecko Provider (Crypto)
 *
 * Free API for crypto prices. Now the primary provider for crypto symbols.
 * Implements QuoteProvider: accepts symbol list, returns Map<string, MarketQuote>.
 *
 * @see https://www.coingecko.com/en/api/documentation
 */

import type { MarketQuote, QuoteProvider } from "@/types/market"

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3/simple/price"

// Map Yahoo-style crypto symbols to CoinGecko API IDs
const YAHOO_TO_COINGECKO: Record<string, string> = {
	"BTC-USD": "bitcoin",
	"ETH-USD": "ethereum",
}

/**
 * Fetch crypto prices from CoinGecko.
 *
 * @param symbols - Canonical symbols (e.g., "BTC-USD", "ETH-USD")
 * @returns Map of symbol → MarketQuote for successfully resolved symbols
 */
const fetchCoinGeckoQuotes = async (
	symbols: string[]
): Promise<Map<string, MarketQuote>> => {
	const quoteMap = new Map<string, MarketQuote>()

	const coinIds = symbols
		.map((s) => YAHOO_TO_COINGECKO[s])
		.filter((id): id is string => id !== undefined)

	if (coinIds.length === 0) {
		return quoteMap
	}

	const idsParam = coinIds.join(",")
	const url = `${COINGECKO_BASE_URL}?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true`

	const response = await fetch(url, {
		next: { revalidate: 0 },
	})

	if (!response.ok) {
		throw new Error(
			`CoinGecko API error: ${response.status} ${response.statusText}`
		)
	}

	const data = (await response.json()) as Record<
		string,
		{ usd?: number; usd_24h_change?: number }
	>

	for (const yahooSymbol of symbols) {
		const coinId = YAHOO_TO_COINGECKO[yahooSymbol]
		if (!coinId || !data[coinId]) {
			continue
		}

		const coinData = data[coinId]
		const price = coinData.usd ?? 0
		const changePercent = coinData.usd_24h_change ?? 0
		// Estimate previous close from current price and 24h % change
		const previousClose =
			changePercent !== 0 ? price / (1 + changePercent / 100) : price
		const change = price - previousClose

		quoteMap.set(yahooSymbol, {
			symbol: yahooSymbol,
			name: yahooSymbol, // Overridden by orchestrator from registry
			price,
			change,
			changePercent,
			previousClose,
			sessionHigh: null,
			sessionLow: null,
			flag: "", // Overridden by orchestrator from registry
			updatedAt: new Date().toISOString(),
		})
	}

	return quoteMap
}

// ── QuoteProvider export ─────────────────────────────────────────────────────

export const coingeckoProvider: QuoteProvider = {
	id: "coingecko",
	fetchQuotes: fetchCoinGeckoQuotes,
}
