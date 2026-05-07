/**
 * BCB (Banco Central do Brasil) Economic Calendar Provider
 *
 * Uses two free data sources — no API key required:
 * 1. Hardcoded COPOM meeting dates (published annually by BCB)
 * 2. BCB SGS (time series) API to detect today's indicator releases
 *
 * For each key economic series, we fetch the last data point.
 * If the point's date matches today → the indicator was released → add to calendar.
 * COPOM dates are hardcoded because they're known in advance (like B3 holidays).
 *
 * @see https://api.bcb.gov.br
 * @see https://www.bcb.gov.br/controleinflacao/agendacopom
 */

import type { EconomicEvent, EventImpact } from "@/types/market"

// ── COPOM Meeting Dates ──────────────────────────────────────────────────────
// Decisions are announced on the second day (Wednesday) after market close (~18:30 BRT)
// @see https://www.bcb.gov.br/controleinflacao/agendacopom

const COPOM_DATES: string[] = [
	// 2025
	"2025-01-29",
	"2025-03-19",
	"2025-05-07",
	"2025-06-18",
	"2025-07-30",
	"2025-09-17",
	"2025-11-05",
	"2025-12-10",
	// 2026
	"2026-01-28",
	"2026-03-18",
	"2026-05-06",
	"2026-06-17",
	"2026-08-05",
	"2026-09-16",
	"2026-10-28",
	"2026-12-09",
]

const copomDateSet = new Set(COPOM_DATES)

// ── BCB SGS Key Series ───────────────────────────────────────────────────────
// Each series is fetched to check if a new data point was released today.
// @see https://dadosabertos.bcb.gov.br/

interface BcbSeries {
	id: number
	name: string
	impact: EventImpact
}

const KEY_SERIES: BcbSeries[] = [
	{ id: 433, name: "IPCA Inflation", impact: "high" },
	{ id: 432, name: "Selic Target Rate", impact: "high" },
	{ id: 189, name: "IGP-M Price Index", impact: "medium" },
	{ id: 24364, name: "Unemployment Rate", impact: "medium" },
	{ id: 4380, name: "IBC-Br Economic Activity", impact: "medium" },
	{ id: 22707, name: "Trade Balance", impact: "low" },
]

interface SgsDataPoint {
	data: string // "DD/MM/YYYY"
	valor: string // "0.52"
}

const SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs"

/**
 * Fetch the last data point from a BCB SGS series.
 * Returns null on failure — never throws.
 */
const fetchSeriesLast = async (
	seriesId: number
): Promise<SgsDataPoint | null> => {
	try {
		const url = `${SGS_BASE_URL}.${seriesId}/dados/ultimos/1?formato=json`
		const response = await fetch(url, { next: { revalidate: 0 } })
		if (!response.ok) {
			return null
		}
		const data = (await response.json()) as SgsDataPoint[]
		return data[0] ?? null
	} catch {
		return null
	}
}

/** Convert BCB date "DD/MM/YYYY" to "YYYY-MM-DD" */
const parseBcbDate = (bcbDate: string): string => {
	const [day, month, year] = bcbDate.split("/")
	return `${year}-${month}-${day}`
}

/**
 * Fetch today's Brazilian economic events.
 * Combines hardcoded COPOM dates + BCB SGS indicator releases.
 * Returns empty array if no events match today.
 */
export const fetchBcbCalendar = async (): Promise<EconomicEvent[]> => {
	const today = new Date().toISOString().split("T")[0]
	const events: EconomicEvent[] = []

	// 1. Check if today is a COPOM decision day
	if (copomDateSet.has(today)) {
		events.push({
			id: `bcb-copom-${today}`,
			time: `${today}T21:30:00Z`, // ~18:30 BRT = 21:30 UTC
			country: "BR",
			event: "COPOM Interest Rate Decision",
			impact: "high",
			actual: undefined,
			forecast: undefined,
			previous: undefined,
		})
	}

	// 2. Check key SGS series for today's releases (all in parallel)
	const results = await Promise.allSettled(
		KEY_SERIES.map(async (series) => {
			const point = await fetchSeriesLast(series.id)
			if (!point) {
				return null
			}

			const releaseDate = parseBcbDate(point.data)
			if (releaseDate !== today) {
				return null
			}

			return { series, value: point.valor }
		})
	)

	for (const result of results) {
		if (result.status !== "fulfilled" || !result.value) {
			continue
		}

		const { series, value } = result.value

		// If this is the Selic rate on a COPOM day, attach to the COPOM event instead
		if (series.id === 432 && copomDateSet.has(today)) {
			const copomEvent = events.find((e) => e.id === `bcb-copom-${today}`)
			if (copomEvent) {
				copomEvent.actual = `${value}%`
				continue
			}
		}

		events.push({
			id: `bcb-sgs-${series.id}-${today}`,
			time: `${today}T12:00:00Z`, // Most BCB releases are morning BRT (~09:00)
			country: "BR",
			event: series.name,
			impact: series.impact,
			actual: value,
			forecast: undefined,
			previous: undefined,
		})
	}

	return events
}
