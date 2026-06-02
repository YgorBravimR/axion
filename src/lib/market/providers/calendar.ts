/**
 * Economic Calendar Provider
 *
 * Fetches today's economic events from the Fair Economy (Forex Factory) feed.
 * Returns raw ISO dates — the client formats them in the user's local timezone.
 *
 * Filtered to only show events from US, BR, EU, CN — the most relevant
 * economies for Brazilian futures traders. Events are further filtered to
 * B3 session hours (08:00–19:00 BRT) to show only actionable news.
 *
 * LIMITATION: The Fair Economy feed (Forex Factory mirror) does NOT include
 * BRL events (IPCA, Selic, etc.) — it only covers G10 currencies.
 * To add Brazilian economic events, a paid API would be needed:
 *   - FinnHub (https://finnhub.io) — has BR events, requires API key
 *   - Trading Economics (https://tradingeconomics.com) — paid tier
 * @see https://nfs.faireconomy.media/ff_calendar_thisweek.json
 */

import type { EconomicEvent, EventImpact } from "@/types/market"

const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

interface FairEconomyEvent {
	title: string
	country: string
	date: string
	impact: string
	forecast: string
	previous: string
	actual?: string
}

const mapImpact = (impact: string): EventImpact => {
	const normalized = impact.toLowerCase()
	if (normalized === "high" || normalized === "holiday") {
		return "high"
	}
	if (normalized === "medium") {
		return "medium"
	}
	return "low"
}

// Only show events from economies most relevant to Brazilian traders
const COUNTRY_FILTER = new Set(["USD", "BRL", "EUR", "CNY"])

const mapCountryCode = (currency: string): string => {
	const mapping: Record<string, string> = {
		USD: "US",
		BRL: "BR",
		EUR: "EU",
		CNY: "CN",
	}
	return mapping[currency] || currency
}

// B3 session window in BRT (UTC-3): 08:00 to 19:00
// Events outside this range are not actionable for day-session traders
const B3_SESSION_START_HOUR_BRT = 8
const B3_SESSION_END_HOUR_BRT = 19

/**
 * Check if an event falls within B3 session hours (08:00–19:00 BRT).
 * Converts the event's UTC time to America/Sao_Paulo timezone.
 */
const isWithinB3Session = (isoDate: string): boolean => {
	const date = new Date(isoDate)
	if (Number.isNaN(date.getTime())) {
		return true
	} // Keep events with unparseable dates

	// Get the hour in Sao Paulo timezone
	const brtHour =
		parseInt(
			new Intl.DateTimeFormat("en-US", {
				timeZone: "America/Sao_Paulo",
				hour: "numeric",
				hour12: false,
			}).format(date)
		) % 24

	return (
		brtHour >= B3_SESSION_START_HOUR_BRT && brtHour < B3_SESSION_END_HOUR_BRT
	)
}

/**
 * Fetch today's economic calendar events.
 * Returns all impact levels (high, medium, low) for US, BR, EU, CN.
 * Filtered to B3 session hours only.
 * Times are returned as raw ISO strings for client-side formatting.
 */
export const fetchEconomicCalendar = async (): Promise<EconomicEvent[]> => {
	const response = await fetch(CALENDAR_URL, {
		next: { revalidate: 0 },
	})

	if (!response.ok) {
		throw new Error(
			`Calendar API error: ${response.status} ${response.statusText}`
		)
	}

	const events = (await response.json()) as FairEconomyEvent[]

	// Filter for today's events — compare in UTC to match API dates
	const now = new Date()
	const todayUTC = now.toISOString().split("T")[0]
	// Also check local date in case of timezone offset
	const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
		.toISOString()
		.split("T")[0]

	return events
		.filter((event) => {
			const eventDate = event.date.split("T")[0]
			const isToday = eventDate === todayUTC || eventDate === todayLocal
			const isRelevantCountry = COUNTRY_FILTER.has(event.country)
			const isDuringSession = isWithinB3Session(event.date)
			return isToday && isRelevantCountry && isDuringSession
		})
		.map(
			(event, index): EconomicEvent => ({
				id: `cal-${todayUTC ?? ""}-${index}`,
				time: event.date,
				country: mapCountryCode(event.country),
				event: event.title,
				impact: mapImpact(event.impact),
				actual: event.actual || undefined,
				forecast: event.forecast || undefined,
				previous: event.previous || undefined,
			})
		)
		.sort((a, b) => a.time.localeCompare(b.time))
}
