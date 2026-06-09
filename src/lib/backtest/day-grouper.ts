import type { CandleRow } from "@/types/candle"
import type { DayContext } from "@/types/backtest"

/** BRT is fixed UTC-3 (Brazil abolished DST in 2019) */
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

/**
 * Fast BRT extraction from ISO timestamp — avoids Intl.DateTimeFormat.
 * Returns { year, month, day, hour, minute, hhmm, ms } all in BRT.
 */
const extractBrt = (timestampMs: number) => {
	const brtMs = timestampMs + BRT_OFFSET_MS
	const d = new Date(brtMs)
	const year = d.getUTCFullYear()
	const month = d.getUTCMonth() + 1
	const day = d.getUTCDate()
	const hour = d.getUTCHours()
	const minute = d.getUTCMinutes()
	return {
		year,
		month,
		day,
		hour,
		minute,
		hhmm: hour * 100 + minute,
		dayKey: `${year}-${month < 10 ? "0" : ""}${month}-${day < 10 ? "0" : ""}${day}`,
	}
}

/**
 * Group candles by BRT calendar day (00:00-23:59).
 *
 * Performance: uses fast arithmetic BRT extraction instead of Intl.DateTimeFormat.
 * For 80K candles this is ~50x faster than the Intl-based approach.
 * Every candle on a given BRT calendar day is included, regardless of time-of-day.
 */
const groupCandlesByDay = (candles: CandleRow[]): Map<string, CandleRow[]> => {
	const days = new Map<string, CandleRow[]>()

	// Pre-parse timestamps once (avoid repeated new Date() in sort)
	const tsCache = new Map<string, number>()

	for (const candle of candles) {
		const ms = Date.parse(candle.timestamp)
		tsCache.set(candle.timestamp, ms)
		const brt = extractBrt(ms)

		const existing = days.get(brt.dayKey)
		if (existing) {
			existing.push(candle)
		} else {
			days.set(brt.dayKey, [candle])
		}
	}

	// Sort each day: timestamp ASC, then candleIndex ASC for Renko determinism
	for (const [, dayCandlesArr] of days) {
		dayCandlesArr.sort((a, b) => {
			const timeDiff =
				(tsCache.get(a.timestamp) ?? 0) - (tsCache.get(b.timestamp) ?? 0)
			if (timeDiff !== 0) {
				return timeDiff
			}
			return (a.candleIndex ?? 0) - (b.candleIndex ?? 0)
		})
	}

	return days
}

/**
 * Build a DayContext for a candle. Fast arithmetic, no Intl.
 */
const buildDayContext = (
	candle: CandleRow,
	dayKey: string,
	candleIndexInDay: number
): DayContext => {
	const ms = new Date(candle.timestamp).getTime()
	const brt = extractBrt(ms)

	return {
		dayKey,
		candleIndexInDay,
		brtHour: brt.hour,
		brtMinute: brt.minute,
		brtHHMM: brt.hhmm,
	}
}

export { groupCandlesByDay, buildDayContext }
