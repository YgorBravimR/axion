/** Convert HHMM integer (e.g., 905) to "HH:MM" string (e.g., "09:05") */
const hhmmToTimeString = (hhmm: number): string => {
	const h = Math.floor(hhmm / 100)
	const m = hhmm % 100
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Convert "HH:MM" string (e.g., "09:05") to HHMM integer (e.g., 905) */
const timeStringToHhmm = (time: string): number => {
	const [h, m] = time.split(":").map(Number)
	return (h ?? 9) * 100 + (m ?? 0)
}

/**
 * Convert local Date to "YYYY-MM-DD" string, preserving local midnight.
 * react-day-picker emits Date at local midnight; this extracts the local
 * calendar date (not UTC) so timezone-east-of-UTC users see the correct day.
 */
const formatLocalYMD = (d: Date): string => {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${y}-${m}-${day}`
}

/**
 * Convert "YYYY-MM-DD" string to local Date at midnight.
 * Used to restore dates from serialized form (e.g., backtest results).
 */
const parseLocalYMD = (s: string): Date => {
	const [y, m, d] = s.split("-").map(Number)
	return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export { hhmmToTimeString, timeStringToHhmm, formatLocalYMD, parseLocalYMD }
