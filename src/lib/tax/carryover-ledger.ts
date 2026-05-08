interface MonthSummary {
	month: Date
	netGainCents: number   // positive = gain, negative = loss (after fees, before IR)
}

interface CarryoverState {
	balanceCents: number        // outstanding loss balance at END of this month (positive)
	monthsInDeficit: number     // running count of months that contributed to balance
	exhaustedAt: Date | null    // month when carryover was fully consumed; null if still outstanding
}

/**
 * Builds a running carryover chain from an ordered array of monthly net gain summaries.
 * Loss months add to the balance; gain months consume it before IR is applied.
 * No annual reset — balance accumulates indefinitely (BR day-trade law).
 *
 * @param months - ordered chronological array of monthly net gains (after fees, before IR)
 * @returns per-month carryover state array, same length as input
 */
const buildCarryoverChain = (months: MonthSummary[]): CarryoverState[] => {
	let balance = 0
	let monthsInDeficit = 0

	return months.map((monthData) => {
		const { netGainCents } = monthData

		if (netGainCents < 0) {
			balance += Math.abs(netGainCents)
			monthsInDeficit++
			return { balanceCents: balance, monthsInDeficit, exhaustedAt: null }
		}

		// Gain month: consume carryover
		const consumed = Math.min(balance, netGainCents)
		const wasPositive = balance > 0
		balance -= consumed

		const exhaustedAt = wasPositive && balance === 0 ? monthData.month : null
		return { balanceCents: balance, monthsInDeficit, exhaustedAt }
	})
}

export type { MonthSummary, CarryoverState }
export { buildCarryoverChain }
