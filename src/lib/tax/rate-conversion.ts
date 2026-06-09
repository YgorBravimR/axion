/**
 * Rate conversion helpers for Brazilian tax calculations.
 *
 * Brazilian tax law (Lei 11.033/2004 day-trade IR, Lei 9.430/96 DARF) uses
 * basis-points representation (0–10000 scale) for rates to avoid floating-point
 * decimals at storage and config layer. The /10000 conversion is applied here,
 * in one place, so callers can never silently forget it.
 *
 * Example: `Math.round(taxableGain * fromBasisPoints(asBasisPoints(2000)))` applies 20% IR.
 */

declare const __basisPointsBrand: unique symbol

/**
 * Branded type for basis-points values.
 *
 * A `BasisPoints` is a number that has been validated to be in the 0–10000 range
 * (e.g., 2000 = 20%, 100 = 1%). The brand prevents accidental mixing of basis-points
 * values with raw percent values (e.g., passing 20 when 2000 was required).
 *
 * Use the `asBasisPoints()` helper to brand a raw number at boundary layers
 * (DB queries, test fixtures) where a number enters the tax system.
 */
export type BasisPoints = number & { readonly [__basisPointsBrand]: true }

/**
 * Tags a numeric value as `BasisPoints` (0–10000 scale, e.g., 2000 = 20%).
 *
 * Use at boundaries where a raw `number` enters the tax layer — typically
 * DB query results (where Drizzle returns `number`) or test fixtures.
 * Production code that operates on already-branded `BasisPoints` values
 * should NOT need to call this helper.
 *
 * In dev, throws if the value is outside 0–10000 (invalid basis points).
 * In production, the validation runs but always returns the branded value.
 *
 * @param value - numeric value to brand
 * @returns the same number, typed as `BasisPoints`
 *
 * @example
 * // At DB boundary: convert raw number to BasisPoints
 * const irRate = asBasisPoints(rates.irRateBps) // rates.irRateBps was `number` from DB
 * const tax = Math.round(income * fromBasisPoints(irRate))
 */
const asBasisPoints = (value: number): BasisPoints => {
	if (process.env.NODE_ENV !== "production") {
		if (!Number.isFinite(value) || value < 0 || value > 10000) {
			throw new Error(
				`asBasisPoints: ${value} is outside the 0–10000 range. ` +
					`Did you pass a percent (e.g., 20) where basis points (2000) were expected?`
			)
		}
	}
	return value as BasisPoints
}

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
 * @param bps - basis-points value (already branded with `BasisPoints` type)
 * @returns decimal multiplier (e.g., 2000 bps → 0.2)
 *
 * @example
 * const irRate = asBasisPoints(2000) // 20% in basis points
 * const tax = Math.round(income * fromBasisPoints(irRate)) // 20% of income
 */
const fromBasisPoints = (bps: BasisPoints): number => bps / 10000

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

export { asBasisPoints, fromBasisPoints, fromPercentString }
