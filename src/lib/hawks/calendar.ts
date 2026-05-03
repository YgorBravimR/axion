/**
 * Hawks no-trade calendar.
 *
 * Pedro's protocols define hard no-trade windows around macro events:
 * - Copom (B3): no trades 30 min before / 60 min after rate decision
 * - FOMC (US): same window — affects DXY → carries to mini-dólar
 * - PEU (Petrobras earnings): WIN/IND skip the close
 * - CPI (US, monthly Wed/Thu): WDO/DOL caution window 30 min around release
 *
 * v1 ships a small static seed of known 2025–2026 dates. Replace with a real
 * macro feed (e.g., Investing.com / FED API) in a follow-up.
 *
 * @see docs/hawks-mode-research.md § 5
 */

type HawksEventKind = "copom" | "fomc" | "peu" | "cpi"

interface HawksCalendarEvent {
	kind: HawksEventKind
	date: string // ISO date YYYY-MM-DD (event day, BRT)
	label: string
	noTradeStart: string // HH:mm BRT
	noTradeEnd: string // HH:mm BRT
	affectedSymbols: string[]
}

/**
 * Static seed. Dates published by B3, Federal Reserve, Petrobras IR. Always
 * verify against the source before trading — this is a fallback, not truth.
 */
const HAWKS_CALENDAR_SEED: HawksCalendarEvent[] = [
	{ kind: "copom", date: "2026-01-28", label: "Copom #271", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-03-18", label: "Copom #272", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-05-06", label: "Copom #273", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-06-17", label: "Copom #274", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-07-29", label: "Copom #275", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-09-16", label: "Copom #276", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-11-04", label: "Copom #277", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },
	{ kind: "copom", date: "2026-12-09", label: "Copom #278", noTradeStart: "17:30", noTradeEnd: "19:00", affectedSymbols: ["WIN", "IND", "WDO", "DOL"] },

	{ kind: "fomc", date: "2026-01-28", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-03-18", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-04-29", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-06-17", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-07-29", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-09-16", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-11-04", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },
	{ kind: "fomc", date: "2026-12-16", label: "FOMC Decision", noTradeStart: "16:00", noTradeEnd: "17:30", affectedSymbols: ["WDO", "DOL", "WIN", "IND"] },

	{ kind: "cpi", date: "2026-01-13", label: "US CPI", noTradeStart: "10:30", noTradeEnd: "11:00", affectedSymbols: ["WDO", "DOL"] },
	{ kind: "cpi", date: "2026-02-11", label: "US CPI", noTradeStart: "10:30", noTradeEnd: "11:00", affectedSymbols: ["WDO", "DOL"] },
	{ kind: "cpi", date: "2026-03-11", label: "US CPI", noTradeStart: "10:30", noTradeEnd: "11:00", affectedSymbols: ["WDO", "DOL"] },
	{ kind: "cpi", date: "2026-04-15", label: "US CPI", noTradeStart: "10:30", noTradeEnd: "11:00", affectedSymbols: ["WDO", "DOL"] },
	{ kind: "cpi", date: "2026-05-12", label: "US CPI", noTradeStart: "10:30", noTradeEnd: "11:00", affectedSymbols: ["WDO", "DOL"] },
	{ kind: "cpi", date: "2026-06-10", label: "US CPI", noTradeStart: "10:30", noTradeEnd: "11:00", affectedSymbols: ["WDO", "DOL"] },

	{ kind: "peu", date: "2026-02-26", label: "Petrobras earnings (Q4)", noTradeStart: "16:00", noTradeEnd: "18:00", affectedSymbols: ["WIN", "IND"] },
	{ kind: "peu", date: "2026-05-12", label: "Petrobras earnings (Q1)", noTradeStart: "16:00", noTradeEnd: "18:00", affectedSymbols: ["WIN", "IND"] },
	{ kind: "peu", date: "2026-08-11", label: "Petrobras earnings (Q2)", noTradeStart: "16:00", noTradeEnd: "18:00", affectedSymbols: ["WIN", "IND"] },
	{ kind: "peu", date: "2026-11-10", label: "Petrobras earnings (Q3)", noTradeStart: "16:00", noTradeEnd: "18:00", affectedSymbols: ["WIN", "IND"] },
]

const toIsoDate = (date: Date) => {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, "0")
	const d = String(date.getDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

const listHawksEventsForRange = ({
	from,
	to,
}: {
	from: Date
	to: Date
}): HawksCalendarEvent[] => {
	const fromIso = toIsoDate(from)
	const toIso = toIsoDate(to)
	return HAWKS_CALENDAR_SEED.filter(
		(event) => event.date >= fromIso && event.date <= toIso
	).sort((a, b) => a.date.localeCompare(b.date))
}

const listHawksEventsForDate = (date: Date): HawksCalendarEvent[] => {
	const iso = toIsoDate(date)
	return HAWKS_CALENDAR_SEED.filter((event) => event.date === iso)
}

const listUpcomingHawksEvents = (limit = 6): HawksCalendarEvent[] => {
	const today = toIsoDate(new Date())
	return HAWKS_CALENDAR_SEED.filter((event) => event.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(0, limit)
}

export {
	HAWKS_CALENDAR_SEED,
	listHawksEventsForRange,
	listHawksEventsForDate,
	listUpcomingHawksEvents,
	toIsoDate,
}
export type { HawksEventKind, HawksCalendarEvent }
