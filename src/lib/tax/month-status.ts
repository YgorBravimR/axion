const isMonthFinalized = (year: number, month: number, now: Date = new Date()): boolean => {
	const targetIndex = year * 12 + (month - 1)
	const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth()
	return targetIndex < nowIndex
}

const isMonthCurrent = (year: number, month: number, now: Date = new Date()): boolean => {
	const targetIndex = year * 12 + (month - 1)
	const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth()
	return targetIndex === nowIndex
}

export { isMonthFinalized, isMonthCurrent }
