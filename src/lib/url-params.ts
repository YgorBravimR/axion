/**
 * Pure serialization helpers for URL search params.
 * Shared by hooks (client) AND server page components.
 * No React dependencies — works in any environment.
 */

/** Splits a CSV param value into an array, returns [] for null/empty */
const parseArrayParam = (value: string | null): string[] => {
	if (!value) {
		return []
	}
	return value.split(",").filter(Boolean)
}

/** Joins an array to CSV, returns null for empty arrays */
const serializeArrayParam = (values: string[]): string | null => {
	if (values.length === 0) {
		return null
	}
	return values.join(",")
}

/** Parses an ISO date string param, returns null for invalid/null */
const parseDateParam = (value: string | null): Date | null => {
	if (!value) {
		return null
	}
	const date = new Date(value)
	if (isNaN(date.getTime())) {
		return null
	}
	return date
}

/** Serializes a Date to ISO date string (YYYY-MM-DD), returns null for null */
const serializeDateParam = (date: Date | null): string | null => {
	if (!date) {
		return null
	}
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

/** Parses a boolean param — "1" is true, anything else is false */
const parseBooleanParam = (value: string | null): boolean => {
	return value === "1"
}

/** Parses a numeric param with a fallback for invalid/null values */
const parseNumberParam = (value: string | null, fallback: number): number => {
	if (!value) {
		return fallback
	}
	const num = Number(value)
	if (isNaN(num)) {
		return fallback
	}
	return num
}

export {
	parseArrayParam,
	serializeArrayParam,
	parseDateParam,
	serializeDateParam,
	parseBooleanParam,
	parseNumberParam,
}
