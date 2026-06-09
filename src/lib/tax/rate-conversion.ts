/**
 * Rate conversion helpers for Brazilian tax calculations.
 *
 * Brazilian tax law (Lei 11.033/2004 day-trade IR, Lei 9.430/96 DARF) uses
 * basis-points representation (0–10000 scale) for rates to avoid floating-point
 * decimals at storage and config layer. The /10000 conversion is applied here,
 * in one place, so callers can never silently forget it.
 *
 * Example: `Math.round(taxableGain * fromBasisPoints(2000))` applies 20% IR.
 */

/**
 * Converts a basis-points value (0–10000 scale, e.g., 2000 = 20%) to its
 * decimal equivalent for multiplication against a money amount.
 *
 * Basis points are a standard financial representation for rates where:
 * - 100 bps = 1%
 * - 1000 bps = 10%
 * - 2000 bps = 20%
 * - 10000 bps = 100%
 *
 * Used for Brazilian tax rates: day-trade IR (normally 2000 bps = 20%) and
 * IRRF withholding (normally 100 bps = 1%).
 *
 * @param bps - basis-points value (0–10000 range expected for percent rates)
 * @returns decimal multiplier (e.g., 2000 bps → 0.2)
 *
 * @example
 * const irRate = 2000 // 20% in basis points
 * const tax = Math.round(income * fromBasisPoints(irRate)) // 20% of income
 */
const fromBasisPoints = (bps: number): number => bps / 10000

/**
 * Parses a percent-as-string value (e.g., `"5.00"` for ISS municipal tax rate)
 * to its decimal equivalent.
 *
 * The string form is a legacy storage shape inherited from fee-rate configuration.
 * Centralizing the parse here makes string footguns impossible (concatenation,
 * missed parseFloat, type coercion errors). See Z15-2 MAJOR finding in the
 * Wave 3 calculations audit (`docs/scans/calculations-audit/wave3-15-unit-conversion.md`).
 *
 * @param percentString - percent on 0–100 scale stored as numeric string
 * @returns decimal multiplier (e.g., "5.00" → 0.05, "100" → 1)
 *
 * @example
 * const issRate = "5.00" // 5% municipal tax, stored as string
 * const fee = Math.round(corretagem * fromPercentString(issRate)) // 5% of corretagem
 */
const fromPercentString = (percentString: string): number => {
	const parsed = parseFloat(percentString)
	if (!Number.isFinite(parsed)) {
		return 0
	}
	return parsed / 100
}

export { fromBasisPoints, fromPercentString }
