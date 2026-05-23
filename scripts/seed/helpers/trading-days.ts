import { isB3Holiday } from "@/lib/market/holidays"

// B3 trading day = weekday and not a B3 holiday.
// Holiday data is the single source of truth in @/lib/market/holidays —
// never inline holiday lists here.
export const isTradingDay = (date: Date): boolean => {
	const dayOfWeek = date.getDay()
	if (dayOfWeek === 0 || dayOfWeek === 6) {
		return false
	}
	const dateStr = date.toISOString().split("T")[0]
	if (!dateStr) {
		return false
	}
	return !isB3Holiday(dateStr)
}

export const getTradingDays = (startDate: Date, endDate: Date): Date[] => {
	const days: Date[] = []
	const current = new Date(startDate)
	while (current <= endDate) {
		if (isTradingDay(current)) {
			days.push(new Date(current))
		}
		current.setDate(current.getDate() + 1)
	}
	return days
}

// B3 trading hours 09:00–17:55 São Paulo = 12:00–20:55 UTC.
export const randomTradingTime = (
	date: Date,
	rand: () => number,
	startHour = 12,
	endHour = 20
): string => {
	const hour = startHour + Math.floor(rand() * (endHour - startHour))
	const minute = Math.floor(rand() * 60)
	const d = new Date(date)
	d.setUTCHours(hour, minute, 0, 0)
	return d.toISOString().replace("T", " ").replace("Z", "+00")
}

// Exit time = entry + 15min..4h, capped at 20:55 UTC (17:55 São Paulo).
export const generateExitTime = (
	entryTime: string,
	rand: () => number
): string => {
	const entry = new Date(entryTime.replace(" ", "T").replace("+00", "Z"))
	const durationMinutes = 15 + Math.floor(rand() * 225)
	entry.setMinutes(entry.getMinutes() + durationMinutes)
	if (entry.getUTCHours() >= 21) {
		entry.setUTCHours(20, 55, 0, 0)
	}
	return entry.toISOString().replace("T", " ").replace("Z", "+00")
}
