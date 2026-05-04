interface DailyResult {
	date: Date
	grossPnlCents: number
}

interface IrrfByDay {
	date: Date
	irrfCents: number
}

interface IrrfResult {
	totalIrrfCents: number
	irrfByDay: IrrfByDay[]
}

/**
 * Accumulates IRRF withheld at source across trading days.
 * IRRF = irrfRateBps / 10000 × max(0, dailyGrossPnl).
 * Only days with positive gross P&L contribute.
 *
 * @param days - array of daily results (date + grossPnlCents)
 * @param irrfRateBps - withholding rate in basis points (default 100 = 1%)
 * @returns totalIrrfCents and per-day breakdown
 */
const accumulateIrrf = (days: DailyResult[], irrfRateBps: number): IrrfResult => {
	const irrfByDay = days.map((day) => ({
		date: day.date,
		irrfCents: day.grossPnlCents > 0
			? Math.round((day.grossPnlCents * irrfRateBps) / 10000)
			: 0,
	}))

	const totalIrrfCents = irrfByDay.reduce((sum, day) => sum + day.irrfCents, 0)

	return { totalIrrfCents, irrfByDay }
}

export type { DailyResult, IrrfByDay, IrrfResult }
export { accumulateIrrf }
