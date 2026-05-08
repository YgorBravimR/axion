/**
 * Market Data Orchestrator
 *
 * Replaces the sequential cascade with parallel provider dispatch.
 * Each provider gets one batched call; results are merged; unresolved
 * symbols retry on their declared fallback provider.
 *
 * Calendar fetching (FairEconomy + BCB) is unchanged and runs in parallel.
 */

import type {
	MarketQuote,
	QuoteGroup,
	EconomicEvent,
	QuoteProvider,
	ProviderId,
} from "@/types/market"
import {
	GROUPS,
	SYMBOLS,
	getSymbolsByProvider,
	getSymbolsNeedingFallback,
	getCompanionSymbols,
} from "./registry"
import { yahooProvider } from "./providers/yahoo"
import { coingeckoProvider } from "./providers/coingecko"
import { fetchEconomicCalendar } from "./providers/calendar"
import { fetchBcbCalendar } from "./providers/bcb"

// ── Provider registry ────────────────────────────────────────────────────────

const PROVIDERS: Map<ProviderId, QuoteProvider> = new Map([
	["yahoo", yahooProvider],
	["coingecko", coingeckoProvider],
])

// ── Quote orchestration ──────────────────────────────────────────────────────

interface QuotesResult {
	groups: QuoteGroup[]
	companions: Record<string, MarketQuote>
}

/**
 * Apply display metadata (name, flag) from the symbol registry onto a quote.
 * Mutates the quote in place for consistency with registry-defined labels.
 */
const applyDisplayMetadata = (quote: MarketQuote): MarketQuote => {
	const def = SYMBOLS.get(quote.symbol)
	if (def) {
		quote.name = def.name
		quote.flag = def.flag
	}
	return quote
}

/**
 * Merge a map of quotes into the target, optionally skipping already-resolved symbols.
 */
const mergeQuotes = (
	target: Map<string, MarketQuote>,
	source: Map<string, MarketQuote>,
	skipExisting = false
): void => {
	for (const [symbol, quote] of source) {
		if (skipExisting && target.has(symbol)) {
			continue
		}
		target.set(symbol, quote)
	}
}

/**
 * Fetch market quotes from all providers in parallel, with fallback retry.
 *
 * 1. Group symbols by primary provider using the registry
 * 2. Fire all providers simultaneously
 * 3. Merge results into a single quote map
 * 4. For any unresolved symbols, check fallback providers and retry
 * 5. Assemble QuoteGroup[] from registry GROUPS, applying display metadata
 */
export const fetchMarketQuotes = async (): Promise<QuotesResult> => {
	const providerSymbols = getSymbolsByProvider()
	const quoteMap = new Map<string, MarketQuote>()

	// ── Phase 1: parallel primary fetch ──────────────────────────────────────
	const primaryTasks: Promise<Map<string, MarketQuote>>[] = []

	for (const [providerId, symbols] of providerSymbols.entries()) {
		const provider = PROVIDERS.get(providerId)
		if (!provider || symbols.length === 0) {
			continue
		}

		primaryTasks.push(
			provider.fetchQuotes(symbols).catch((error) => {
				console.error(
					`[MARKET:Orchestrator] ${providerId} primary failed:`,
					error
				)
				return new Map<string, MarketQuote>()
			})
		)
	}

	const primaryResults = await Promise.all(primaryTasks)
	for (const result of primaryResults) {
		mergeQuotes(quoteMap, result)
	}

	// ── Phase 2: fallback retry for unresolved symbols ───────────────────────
	const resolved = new Set(quoteMap.keys())
	const fallbackTasks: Promise<Map<string, MarketQuote>>[] = []

	for (const [providerId, provider] of PROVIDERS.entries()) {
		const fallbackSymbols = getSymbolsNeedingFallback(providerId, resolved)
		if (fallbackSymbols.length === 0) {
			continue
		}

		fallbackTasks.push(
			provider.fetchQuotes(fallbackSymbols).catch((error) => {
				console.error(
					`[MARKET:Orchestrator] ${providerId} fallback failed:`,
					error
				)
				return new Map<string, MarketQuote>()
			})
		)
	}

	if (fallbackTasks.length > 0) {
		const fallbackResults = await Promise.all(fallbackTasks)
		for (const result of fallbackResults) {
			mergeQuotes(quoteMap, result, true)
		}
	}

	// ── Phase 3: assemble groups with display metadata from registry ─────────
	const groups: QuoteGroup[] = GROUPS.map((group) => ({
		id: group.id,
		labelKey: group.labelKey,
		quotes: group.symbols
			.map((symbol) => quoteMap.get(symbol))
			.filter((q): q is MarketQuote => q !== undefined)
			.map(applyDisplayMetadata),
	}))

	// ── Phase 4: build companion ADR map ─────────────────────────────────
	const companionMap = getCompanionSymbols()
	const companions: Record<string, MarketQuote> = {}

	for (const [, adrSymbol] of companionMap) {
		const adrQuote = quoteMap.get(adrSymbol)
		if (adrQuote) {
			companions[adrSymbol] = applyDisplayMetadata(adrQuote)
		}
	}

	return { groups, companions }
}

// ── Calendar fetching (unchanged logic) ──────────────────────────────────────

/**
 * Fetch economic calendar — merges FairEconomy (global) + BCB (BR) events.
 *
 * Both providers run in parallel with Promise.allSettled so one failing
 * doesn't block the other. Results are merged and sorted by time.
 */
export const fetchCalendar = async (): Promise<EconomicEvent[]> => {
	const [fairEconomy, bcb] = await Promise.allSettled([
		fetchEconomicCalendar(),
		fetchBcbCalendar(),
	])

	const events: EconomicEvent[] = []

	if (fairEconomy.status === "fulfilled") {
		events.push(...fairEconomy.value)
	} else {
		console.error(
			"[MARKET:Orchestrator] Fair Economy failed:",
			fairEconomy.reason
		)
	}

	if (bcb.status === "fulfilled") {
		events.push(...bcb.value)
	} else {
		console.error("[MARKET:Orchestrator] BCB failed:", bcb.reason)
	}

	return events.sort((a, b) => a.time.localeCompare(b.time))
}
