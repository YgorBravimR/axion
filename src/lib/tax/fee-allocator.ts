interface FeeRates {
	txCorretagemCents: number    // per contract, e.g. 5 = R$0.05
	txRegistroCents: number      // per contract, e.g. 74 = R$0.74
	emolumentosCents: number     // per contract, e.g. 40 = R$0.40
	issRatePercent: number       // % of txCorretagem (total), e.g. 5.00 for SP 5%
}

interface DayFeeInput {
	contractsExecuted: number
	rates: FeeRates
}

interface DayFeeOutput {
	txCorretagem: number   // cents
	txRegistro: number     // cents
	emolumentos: number    // cents
	iss: number            // cents — txCorretagem × issRatePercent / 100
	subtotal: number       // cents — sum of all four
}

/**
 * Computes the fee breakdown for a single trading day.
 * ISS is computed as a percentage of total txCorretagem (not per-contract flat).
 * All monetary outputs are in BRL cents (integers).
 *
 * @param input - contracts executed and fee rate configuration
 * @returns itemized fee breakdown with subtotal
 */
const computeDayFees = (input: DayFeeInput): DayFeeOutput => {
	const { contractsExecuted, rates } = input

	const txCorretagem = Math.round(rates.txCorretagemCents * contractsExecuted)
	const txRegistro   = Math.round(rates.txRegistroCents * contractsExecuted)
	const emolumentos  = Math.round(rates.emolumentosCents * contractsExecuted)
	// ISS is charged on the total txCorretagem for the trade/day, not per contract
	const iss          = Math.round(txCorretagem * rates.issRatePercent / 100)

	return {
		txCorretagem,
		txRegistro,
		emolumentos,
		iss,
		subtotal: txCorretagem + txRegistro + emolumentos + iss,
	}
}

export type { FeeRates, DayFeeInput, DayFeeOutput }
export { computeDayFees }
