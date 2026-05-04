interface DarfInput {
	grossGainCents: number        // sum of day-trade P&L for the month (before fees/taxes)
	totalFeesCents: number        // sum of all fees: corretagem + registro + emolumentos + ISS
	irrfCents: number             // already-withheld 1% IRRF sum for the month
	carryoverInCents: number      // accumulated loss at start of month (positive = loss owed)
	irRateBps: number             // e.g. 2000 = 20.00%
	subjectToPersonalIr: boolean  // false for prop accounts
}

interface DarfOutput {
	netGainBeforeCarryover: number    // grossGain − totalFees
	carryoverConsumed: number         // portion of carryoverIn offset against gain
	carryoverOut: number              // remaining carryover passed to next month
	taxableGain: number               // netGain − carryoverConsumed (≥ 0)
	irGross: number                   // taxableGain × irRateBps / 10000
	darfDue: number                   // max(0, irGross − irrfCents)
}

/**
 * Computes monthly DARF obligation for a Brazilian day-trade account.
 * ISS is included in totalFeesCents as an informational deduction (municipal tax).
 * Loss-carryover (Prejuízo a Compensar) offsets taxable gain before IR is applied.
 *
 * @param input - monthly P&L, fees, IRRF, prior carryover, and rate config
 * @returns DARF breakdown including carryover propagation
 */
const computeDarf = (input: DarfInput): DarfOutput => {
	// Prop accounts: personal IR does not apply
	if (!input.subjectToPersonalIr) {
		return {
			netGainBeforeCarryover: 0,
			carryoverConsumed: 0,
			carryoverOut: input.carryoverInCents,
			taxableGain: 0,
			irGross: 0,
			darfDue: 0,
		}
	}

	const netGainBeforeCarryover = input.grossGainCents - input.totalFeesCents

	// Loss month: add absolute net loss to carryover, no tax owed
	if (netGainBeforeCarryover <= 0) {
		return {
			netGainBeforeCarryover,
			carryoverConsumed: 0,
			carryoverOut: input.carryoverInCents + Math.abs(netGainBeforeCarryover),
			taxableGain: 0,
			irGross: 0,
			darfDue: 0,
		}
	}

	// Gain month: consume carryover balance first
	const carryoverConsumed = Math.min(input.carryoverInCents, netGainBeforeCarryover)
	const carryoverOut = input.carryoverInCents - carryoverConsumed
	const taxableGain = netGainBeforeCarryover - carryoverConsumed

	const irGross = Math.round((taxableGain * input.irRateBps) / 10000)
	// IRRF already paid at source deducts from IR owed; never negative
	const darfDue = Math.max(0, irGross - input.irrfCents)

	return {
		netGainBeforeCarryover,
		carryoverConsumed,
		carryoverOut,
		taxableGain,
		irGross,
		darfDue,
	}
}

export type { DarfInput, DarfOutput }
export { computeDarf }
