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

export { hhmmToTimeString, timeStringToHhmm }
