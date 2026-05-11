import type { Page } from "@playwright/test"
import type {
	CalendarResponse,
	EconomicEvent,
	MarketQuote,
	QuoteGroup,
	QuotesResponse,
} from "@/types/market"

/**
 * Deterministic Market Monitor mock for the journey suite.
 *
 * The product's `/api/market/quotes` and `/api/market/calendar` endpoints
 * fan out to third-party providers (Yahoo, brapi, CoinGecko, Investing).
 * In CI we cannot depend on those, and even in demo runs we want
 * reproducible numbers so screenshots stay stable across recordings.
 *
 * This helper intercepts both endpoints via `page.route()` and returns
 * fixed fixtures wrapped in the project's standard `ActionResponse<T>`
 * envelope (`{ status, message, data }`). Install it before navigating
 * to any page that renders MarketMonitorContent (e.g. `/en/monitor` or
 * the Command Center's Market Monitor tab).
 *
 * Usage:
 *   await installMarketMonitorMock(page)
 *   await page.goto("/en/monitor")
 */

const QUOTE_TIMESTAMP = "2026-05-11T12:30:00.000Z"

const buildQuote = (
	symbol: string,
	name: string,
	flag: string,
	price: number,
	changePercent: number
): MarketQuote => {
	const previousClose = price / (1 + changePercent / 100)
	const change = price - previousClose
	return {
		symbol,
		name,
		price,
		change: Number(change.toFixed(4)),
		changePercent,
		previousClose: Number(previousClose.toFixed(4)),
		sessionHigh: Number((price * 1.005).toFixed(4)),
		sessionLow: Number((price * 0.992).toFixed(4)),
		flag,
		updatedAt: QUOTE_TIMESTAMP,
	}
}

const TRADER_QUOTES: MarketQuote[] = [
	buildQuote("ES=F", "S&P 500 Futures", "🇺🇸", 5240.5, 0.42),
	buildQuote("NQ=F", "Nasdaq-100 Futures", "🇺🇸", 18320.75, 0.61),
	buildQuote("^VIX", "VIX", "🇺🇸", 14.32, -2.18),
	buildQuote("EWZ", "iShares MSCI Brazil ETF", "🇧🇷", 27.85, 0.91),
	buildQuote("6L=F", "Brazilian Real Futures", "🇧🇷", 0.1965, -0.35),
	buildQuote("VALE", "Vale S.A. (ADR)", "🇧🇷", 11.42, 1.24),
	buildQuote("PBR", "Petrobras (ADR)", "🇧🇷", 14.18, 0.78),
	buildQuote("^TYX", "30-Year Treasury Yield", "🇺🇸", 4.612, -0.45),
	buildQuote("IFNC.SA", "Financials Index", "🇧🇷", 12450.0, 0.55),
	buildQuote("ICOM.SA", "Consumption Index", "🇧🇷", 1840.5, -0.22),
]

const INDICES_QUOTES: MarketQuote[] = [
	buildQuote("^GSPC", "S&P 500", "🇺🇸", 5238.1, 0.38),
	buildQuote("^DJI", "Dow Jones", "🇺🇸", 39450.25, 0.21),
	buildQuote("^IXIC", "Nasdaq Composite", "🇺🇸", 16720.4, 0.55),
	buildQuote("^FTSE", "FTSE 100", "🇬🇧", 8210.6, 0.18),
	buildQuote("^GDAXI", "DAX", "🇩🇪", 18540.2, 0.32),
	buildQuote("^N225", "Nikkei 225", "🇯🇵", 38120.5, -0.41),
	buildQuote("^HSI", "Hang Seng", "🇭🇰", 19420.8, 0.62),
	buildQuote("^BVSP", "Ibovespa", "🇧🇷", 132450.0, 0.84),
]

const B3_QUOTES: MarketQuote[] = [
	buildQuote("VALE3.SA", "Vale ON", "🇧🇷", 64.2, 1.18),
	buildQuote("ITUB4.SA", "Itaú Unibanco PN", "🇧🇷", 32.45, 0.65),
	buildQuote("PETR4.SA", "Petrobras PN", "🇧🇷", 38.92, 0.81),
	buildQuote("PETR3.SA", "Petrobras ON", "🇧🇷", 41.05, 0.72),
	buildQuote("AZZA3.SA", "Azzas 2154 ON", "🇧🇷", 38.5, -0.32),
	buildQuote("BBDC4.SA", "Bradesco PN", "🇧🇷", 14.18, 0.43),
	buildQuote("SBSP3.SA", "Sabesp ON", "🇧🇷", 82.6, 1.05),
	buildQuote("ITSA4.SA", "Itaúsa PN", "🇧🇷", 10.95, 0.27),
	buildQuote("BPAC11.SA", "BTG Pactual UNT", "🇧🇷", 33.8, 0.59),
	buildQuote("WEGE3.SA", "WEG ON", "🇧🇷", 41.2, -0.45),
	buildQuote("BBAS3.SA", "Banco do Brasil ON", "🇧🇷", 28.65, 0.36),
	buildQuote("ABEV3.SA", "Ambev ON", "🇧🇷", 11.85, -0.17),
]

const COMMODITIES_QUOTES: MarketQuote[] = [
	buildQuote("GC=F", "Gold Futures", "🌐", 2412.5, 0.55),
	buildQuote("SI=F", "Silver Futures", "🌐", 28.7, 0.92),
	buildQuote("CL=F", "WTI Crude Futures", "🌐", 78.6, -0.31),
	buildQuote("BZ=F", "Brent Crude Futures", "🌐", 82.9, -0.22),
]

const FXCRYPTO_QUOTES: MarketQuote[] = [
	buildQuote("BRL=X", "USD/BRL", "🇧🇷", 5.092, 0.18),
	buildQuote("EURUSD=X", "EUR/USD", "🇪🇺", 1.0815, 0.09),
	buildQuote("GBPUSD=X", "GBP/USD", "🇬🇧", 1.2545, -0.12),
	buildQuote("USDJPY=X", "USD/JPY", "🇯🇵", 155.4, 0.21),
	buildQuote("DX-Y.NYB", "US Dollar Index", "🇺🇸", 105.2, -0.08),
	buildQuote("BTC-USD", "Bitcoin", "🌐", 62540.0, 1.42),
	buildQuote("ETH-USD", "Ethereum", "🌐", 3015.5, 0.88),
]

const GROUPS: QuoteGroup[] = [
	{ id: "trader", labelKey: "groups.trader", quotes: TRADER_QUOTES },
	{ id: "indices", labelKey: "groups.indices", quotes: INDICES_QUOTES },
	{ id: "b3", labelKey: "groups.b3", quotes: B3_QUOTES },
	{
		id: "commodities",
		labelKey: "groups.commodities",
		quotes: COMMODITIES_QUOTES,
	},
	{ id: "fxcrypto", labelKey: "groups.fxcrypto", quotes: FXCRYPTO_QUOTES },
]

// Hero/companions covers the top-card row; the consumer reads it via
// `companions[symbol]` so the keys must match HERO_SYMBOLS in registry.ts.
const COMPANIONS: Record<string, MarketQuote> = {
	"^BVSP": INDICES_QUOTES[7],
	"ES=F": TRADER_QUOTES[0],
	"BRL=X": FXCRYPTO_QUOTES[0],
	"EWZ": TRADER_QUOTES[3],
	"^VIX": TRADER_QUOTES[2],
	"BTC-USD": FXCRYPTO_QUOTES[5],
}

const QUOTES_RESPONSE: QuotesResponse = {
	groups: GROUPS,
	companions: COMPANIONS,
	lastUpdated: QUOTE_TIMESTAMP,
}

const CALENDAR_EVENTS: EconomicEvent[] = [
	{
		id: "mock-cpi-us",
		time: "08:30",
		country: "US",
		event: "Core CPI YoY",
		impact: "high",
		forecast: "3.6%",
		previous: "3.8%",
	},
	{
		id: "mock-pmi-eu",
		time: "10:00",
		country: "EU",
		event: "Manufacturing PMI",
		impact: "medium",
		forecast: "47.2",
		previous: "46.8",
	},
	{
		id: "mock-jobless-us",
		time: "08:30",
		country: "US",
		event: "Initial Jobless Claims",
		impact: "medium",
		forecast: "215K",
		previous: "208K",
	},
	{
		id: "mock-copom-br",
		time: "18:30",
		country: "BR",
		event: "COPOM Interest Rate Decision",
		impact: "high",
		forecast: "10.50%",
		previous: "10.75%",
	},
	{
		id: "mock-retail-br",
		time: "09:00",
		country: "BR",
		event: "Retail Sales MoM",
		impact: "low",
		forecast: "0.4%",
		previous: "0.2%",
	},
]

const CALENDAR_RESPONSE: CalendarResponse = {
	events: CALENDAR_EVENTS,
	lastUpdated: QUOTE_TIMESTAMP,
}

/**
 * Intercept Market Monitor's two data endpoints and return deterministic
 * fixtures. Idempotent — calling twice replaces the prior handlers.
 *
 * @param page - Playwright page whose context will receive the routes
 */
export const installMarketMonitorMock = async (page: Page): Promise<void> => {
	await page.unroute("**/api/market/quotes")
	await page.unroute("**/api/market/calendar")

	await page.route("**/api/market/quotes", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				status: "success",
				message: "Market quotes retrieved (mocked)",
				data: QUOTES_RESPONSE,
			}),
		})
	})

	await page.route("**/api/market/calendar", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				status: "success",
				message: "Economic calendar retrieved (mocked)",
				data: CALENDAR_RESPONSE,
			}),
		})
	})
}
