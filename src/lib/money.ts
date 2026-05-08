/**
 * Money utilities for handling currency as integers (cents)
 * Storing money as cents avoids floating-point precision issues
 */

/**
 * Convert dollars to cents for storage
 * @param dollars - Amount in dollars (e.g., 10.50)
 * @returns Amount in cents (e.g., 1050)
 */
export const toCents = (
	dollars: number | string | null | undefined
): number => {
	if (dollars === null || dollars === undefined || dollars === "") {
		return 0
	}
	const value = typeof dollars === "string" ? parseFloat(dollars) : dollars
	if (isNaN(value)) {
		return 0
	}
	return Math.round(value * 100)
}

/**
 * Convert cents to dollars for display
 * @param cents - Amount in cents (e.g., 1050)
 * @returns Amount in dollars (e.g., 10.50)
 */
export const fromCents = (
	cents: number | string | null | undefined
): number => {
	if (cents === null || cents === undefined || cents === "") {
		return 0
	}
	const value = typeof cents === "string" ? Number(cents) : cents
	if (isNaN(value)) {
		return 0
	}
	return value / 100
}

/**
 * Format cents as currency string
 * @param cents - Amount in cents
 * @param currency - Currency code (default: USD)
 * @returns Formatted currency string
 */
export const formatCentsAsCurrency = (
	cents: number | string | null | undefined,
	currency = "USD"
): string => {
	const dollars = fromCents(cents)
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(dollars)
}

/**
 * Parse a currency input string to cents
 * Handles common formats: "$10.50", "10,50", "10.50", "1050"
 * @param input - User input string
 * @returns Amount in cents
 */
export const parseCurrencyToCents = (input: string): number => {
	// Remove currency symbols and whitespace
	let cleaned = input.replace(/[$€£¥₹R\s]/g, "").trim()

	// Handle comma as decimal separator (European format)
	// If there's exactly one comma and no period, treat comma as decimal
	const commaCount = (cleaned.match(/,/g) || []).length
	const periodCount = (cleaned.match(/\./g) || []).length

	if (commaCount === 1 && periodCount === 0) {
		cleaned = cleaned.replace(",", ".")
	} else {
		// Remove commas used as thousand separators
		cleaned = cleaned.replace(/,/g, "")
	}

	const value = parseFloat(cleaned)
	if (isNaN(value)) {
		return 0
	}

	return toCents(value)
}

/**
 * Normalize a numeric value to a clean string for DB storage.
 * Strips trailing zeros and decimal points to ensure consistent formatting.
 * e.g., 187295.00000000 → "187295", 182990.5 → "182990.5", 10 → "10"
 *
 * @param value - Number or numeric string to normalize
 * @returns Normalized string, or null if value is null/undefined
 */
export const toNumericString = (
	value: number | string | null | undefined
): string | null => {
	if (value === null || value === undefined) {
		return null
	}
	const num = typeof value === "string" ? Number(value) : value
	if (Number.isNaN(num)) {
		return null
	}
	return num.toString()
}

/**
 * Add two cent values safely
 */
export const addCents = (a: number, b: number): number => {
	return Math.round(a + b)
}

/**
 * Subtract cent values safely
 */
export const subtractCents = (a: number, b: number): number => {
	return Math.round(a - b)
}

/**
 * Multiply cents by a factor (e.g., for position size)
 */
export const multiplyCents = (cents: number, factor: number): number => {
	return Math.round(cents * factor)
}

/**
 * Divide cents by a divisor
 */
export const divideCents = (cents: number, divisor: number): number => {
	if (divisor === 0) {
		return 0
	}
	return Math.round(cents / divisor)
}
