/**
 * NaN-safe number parsing for fractal-plan calculations.
 * Handles corrupt/invalid inputs gracefully with fallback values.
 */

/**
 * Parse a value to a finite number, with fallback.
 * Guards against null, undefined, NaN, Infinity, and -Infinity.
 *
 * @param value - value to parse (string, number, null, or undefined)
 * @param fallback - fallback value if input is not finite (default 0)
 * @returns parsed finite number or fallback
 */
export const parseFiniteNumber = (
	value: string | number | null | undefined,
	fallback: number = 0
): number => {
	if (value === null || value === undefined) {
		return fallback
	}
	const n = typeof value === "string" ? parseFloat(value) : value
	return Number.isFinite(n) ? n : fallback
}

/**
 * Parse a value to a finite number or null.
 * Returns null when input is null/undefined/NaN/Infinity; otherwise the parsed value.
 *
 * @param value - value to parse (string, number, null, or undefined)
 * @returns parsed finite number or null
 */
export const parseFiniteOrNull = (
	value: string | number | null | undefined
): number | null => {
	if (value === null || value === undefined) {
		return null
	}
	const n = typeof value === "string" ? parseFloat(value) : value
	return Number.isFinite(n) ? n : null
}
