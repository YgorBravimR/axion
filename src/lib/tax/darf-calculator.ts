import { fromBasisPoints, type BasisPoints } from "./rate-conversion"

// Lei 9.430/96 art. 68 §1°: DARF is only required when monthly IR owed is ≥ R$10.00.
// Sub-threshold amounts (0 < amount < R$10) are deferred to the next month and summed
// with future IR until the cumulative value crosses R$10, at which point the deferred
// balance is owed. This ensures strict compliance with art. 68 §1°: "Os valores não
// pagos, em razão do disposto neste artigo, serão adicionados ao imposto devido no
// período subseqüente, em que se atinja o valor mínimo."
const DARF_MINIMUM_FILING_CENTS = 1000

interface DarfInput {
	grossGainCents: number // sum of day-trade P&L for the month (before fees/taxes)
	totalFeesCents: number // sum of all fees: corretagem + registro + emolumentos + ISS
	irrfCents: number // already-withheld 1% IRRF sum for the month
	carryoverInCents: number // accumulated loss at start of month (positive = loss owed)
	deferredIrInCents: number // sub-threshold IR carried from prior months (always >= 0)
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
	deferredIrOutCents: number // sub-threshold IR carried to next month
	belowMinimumThreshold: boolean // true when cumulative IR (deferred + current) < R$10 (Lei 9.430/96 art. 68)
}

/**
 * Computes monthly DARF obligation for a Brazilian day-trade account.
 * ISS is included in totalFeesCents as an informational deduction (municipal tax).
 * Loss-carryover (Prejuízo a Compensar) offsets taxable gain before IR is applied.
 * Sub-threshold IR deferral (Lei 9.430/96 art. 68 §1°): when the sum of deferredIrIn
 * and current month's IR is below R$10.00, the entire cumulative amount is deferred to
 * the next month. Once cumulative IR crosses R$10, the next eligible month emits a DARF
 * with the full deferred balance. This ensures strict compliance with art. 68 §1°.
 *
 * @param input - monthly P&L, fees, IRRF, prior carryover, deferred IR, and rate config
 * @returns DARF breakdown including carryover/deferral propagation and minimum-threshold flag
 */
const computeDarf = (input: DarfInput): DarfOutput => {
	// Prop accounts: personal IR does not apply; preserve deferred balance
	if (!input.subjectToPersonalIr) {
		return {
			netGainBeforeCarryover: 0,
			carryoverConsumed: 0,
			carryoverOut: input.carryoverInCents,
			taxableGain: 0,
			irGross: 0,
			darfDue: 0,
			deferredIrOutCents: input.deferredIrInCents,
			belowMinimumThreshold: false,
		}
	}

	const netGainBeforeCarryover = input.grossGainCents - input.totalFeesCents

	// Loss month: add absolute net loss to carryover, no tax owed; preserve deferred balance
	if (netGainBeforeCarryover <= 0) {
		return {
			netGainBeforeCarryover,
			carryoverConsumed: 0,
			carryoverOut: input.carryoverInCents + Math.abs(netGainBeforeCarryover),
			taxableGain: 0,
			irGross: 0,
			darfDue: 0,
			deferredIrOutCents: input.deferredIrInCents,
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
	// Lei 9.430/96 art. 68 §1°: accumulate deferred IR with current month's IR
	const cumulativeIr = input.deferredIrInCents + irNetOfIrrf

	// Below-threshold check: true if cumulative IR is between 0 (exclusive) and R$10 (exclusive)
	const belowMinimumThreshold =
		cumulativeIr > 0 && cumulativeIr < DARF_MINIMUM_FILING_CENTS

	// Deferral logic: if cumulative is still below threshold, defer everything to next month
	let darfDue: number
	let deferredIrOutCents: number

	if (belowMinimumThreshold) {
		// Cumulative IR is still sub-R$10: defer the entire balance forward
		darfDue = 0
		deferredIrOutCents = cumulativeIr
	} else {
		// Either zero (no tax) or crossed the R$10 threshold: emit the full accumulated total
		darfDue = cumulativeIr
		deferredIrOutCents = 0
	}

	return {
		netGainBeforeCarryover,
		carryoverConsumed,
		carryoverOut,
		taxableGain,
		irGross,
		darfDue,
		deferredIrOutCents,
		belowMinimumThreshold,
	}
}

export type { DarfInput, DarfOutput }
export { computeDarf, DARF_MINIMUM_FILING_CENTS }
