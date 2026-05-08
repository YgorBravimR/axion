// Market Monitor Types

// ── Provider Architecture ────────────────────────────────────────────────────

export type ProviderId = "yahoo" | "brapi" | "coingecko"

export interface QuoteProvider {
	id: ProviderId
	fetchQuotes: (_symbols: string[]) => Promise<Map<string, MarketQuote>>
}

export interface SymbolDefinition {
	symbol: string
	name: string
	flag: string
	provider: ProviderId
	fallback?: ProviderId
	adrSymbol?: string
}

export interface GroupDefinition {
	id: string
	labelKey: string
	symbols: string[]
}

// ── Quote Types ──────────────────────────────────────────────────────────────

export interface MarketQuote {
	symbol: string
	name: string
	price: number
	change: number
	changePercent: number
	previousClose: number
	sessionHigh: number | null
	sessionLow: number | null
	flag: string
	updatedAt: string
}

export interface QuoteGroup {
	id: string
	labelKey: string
	quotes: MarketQuote[]
}

export type EventImpact = "low" | "medium" | "high"

export interface EconomicEvent {
	id: string
	time: string
	country: string
	event: string
	impact: EventImpact
	actual?: string
	forecast?: string
	previous?: string
}

export interface QuotesResponse {
	groups: QuoteGroup[]
	companions: Record<string, MarketQuote>
	lastUpdated: string
}

export interface CalendarResponse {
	events: EconomicEvent[]
	lastUpdated: string
}
