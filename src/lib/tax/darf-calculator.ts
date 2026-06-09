import { fromBasisPoints, type BasisPoints } from "./rate-conversion"

// Lei 9.430/96 art. 68: DARF is only required when monthly IR owed is ≥ R$10.00.
// Amounts strictly below this threshold are treated as exempt this month.
// NOTE: art. 68 §1° actually requires deferring sub-threshold amounts to be summed
// with the next month's IR until the cumulative value crosses R$10. We do NOT implement
// that deferral here — see docs/backlog.md "DARF sub-threshold deferral (art. 68 §1°)".
// Practical impact is small (sub-R$10 cases are rare in day-trade) and skews in the
// user's favor (slight under-taxation, never over-taxation or unnecessary filing).
const DARF_MINIMUM_FILING_CENTS = 1000

interface DarfInput {
	grossGainCents: number // sum of day-trade P&L for the month (before fees/taxes)
	totalFeesCents: number // sum of all fees: corretagem + registro + emolumentos + ISS
	irrfCents: number // already-withheld 1% IRRF sum for the month
	carryoverInCents: number // accumulated loss at start of month (positive = loss owed)
	irRateBps: BasisPoints // e.g. asBasisPoints(2000) = 20.00%
	subjectToPersonalIr: boolean // false for prop accounts
}

interface DarfOutput {
	netGainBeforeCarryover: number // grossGain − totalFees
	carryoverConsumed: number // portion of carryoverIn offset against gain
	carryoverOut: number // remaining carryover passed to next month
	taxableGain: number // netGain − carryoverConsumed (≥ 0)
	irGross: number // taxableGain × irRateBps / 10000
	darfDue: number // max(0, irGross − irrfCents), then zeroed if below R$10 floor
	belowMinimumThreshold: boolean // true when 0 < (irGross − irrfCents) < R$10 (Lei 9.430/96 art. 68)
}

/**
 * Computes monthly DARF obligation for a Brazilian day-trade account.
 * ISS is included in totalFeesCents as an informational deduction (municipal tax).
 * Loss-carryover (Prejuízo a Compensar) offsets taxable gain before IR is applied.
 * Applies the R$10.00 minimum filing threshold per Lei 9.430/96 art. 68 — amounts
 * below that floor return `darfDue=0` with `belowMinimumThreshold=true` so downstream
 * consumers can distinguish "no tax owed at all" from "owed but exempt this month".
 *
 * @param input - monthly P&L, fees, IRRF, prior carryover, and rate config
 * @returns DARF breakdown including carryover propagation and minimum-threshold flag
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
			belowMinimumThreshold: false,
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
			belowMinimumThreshold: false,
		}
	}

	// Gain month: consume carryover balance first
	const carryoverConsumed = Math.min(
		input.carryoverInCents,
		netGainBeforeCarryover
	)
	const carryoverOut = input.carryoverInCents - carryoverConsumed
	const taxableGain = netGainBeforeCarryover - carryoverConsumed

	const irGross = Math.round(taxableGain * fromBasisPoints(input.irRateBps))
	// IRRF already paid at source deducts from IR owed; never negative
	const irNetOfIrrf = Math.max(0, irGross - input.irrfCents)
	// Lei 9.430/96 art. 68: floor sub-R$10 amounts to 0 (no DARF filing required)
	const belowMinimumThreshold =
		irNetOfIrrf > 0 && irNetOfIrrf < DARF_MINIMUM_FILING_CENTS
	const darfDue = belowMinimumThreshold ? 0 : irNetOfIrrf

	return {
		netGainBeforeCarryover,
		carryoverConsumed,
		carryoverOut,
		taxableGain,
		irGross,
		darfDue,
		belowMinimumThreshold,
	}
}

export type { DarfInput, DarfOutput }
export { computeDarf, DARF_MINIMUM_FILING_CENTS }
