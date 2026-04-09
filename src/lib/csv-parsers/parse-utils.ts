import { BRT_OFFSET } from "@/lib/dates"

/** Pad a number to 2 digits for ISO date construction */
const pad2 = (n: number): string => String(n).padStart(2, "0")

/**
 * Normalizes a CSV header to lowercase snake_case.
 * Handles Portuguese character encoding issues (ç, ã) and
 * strips special characters that may appear from encoding artifacts.
 *
 * @param header - The raw header string from a CSV file
 * @returns Normalized lowercase snake_case header
 */
const normalizeHeader = (header: string): string => {
	return (
		header
			.toLowerCase()
			.trim()
			.replace(/[\s-]/g, "_")
			// Handle common encoding issues with Portuguese characters
			.replace(/[çã]/g, (char) => (char === "ç" ? "c" : "a"))
			// Remove special characters that might appear due to encoding
			.replace(/[^\w_]/g, "_")
			.replace(/_+/g, "_")
			.replace(/^_|_$/g, "")
	)
}

/**
 * Parses a number in Brazilian format where dots are thousand separators
 * and comma is the decimal separator (e.g., "1.234,56" becomes 1234.56).
 *
 * @param value - The Brazilian-formatted number string
 * @returns The parsed number, or null if invalid
 */
const parseBrazilianNumber = (value: string): number | null => {
	if (!value || value === "-") return null
	// Remove thousand separators (dots) and replace decimal comma with dot
	const cleaned = value.replace(/\./g, "").replace(",", ".").trim()
	const num = parseFloat(cleaned)
	return isNaN(num) ? null : num
}

/**
 * Parses Brazilian date/time format: DD/MM/YYYY HH:MM:SS
 * Times are interpreted as BRT (America/Sao_Paulo, UTC-3).
 * Constructs an ISO string with BRT_OFFSET so the resulting Date
 * stores the correct UTC instant regardless of the server's local timezone.
 *
 * @param value - Date string in "DD/MM/YYYY HH:MM:SS" or "DD/MM/YYYY" format
 * @returns Parsed Date object, or null if invalid
 */
const parseBrazilianDateTime = (value: string): Date | null => {
	if (!value) return null

	// Format: DD/MM/YYYY HH:MM:SS (e.g., "13/06/2025 12:10:56")
	const match = value.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
	)
	if (match) {
		const [, d, m, y, h, mi, s] = match.map(Number)
		const iso = `${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}${BRT_OFFSET}`
		const date = new Date(iso)
		if (!isNaN(date.getTime())) return date
	}

	// Try without time: DD/MM/YYYY — midnight BRT
	const dateOnlyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
	if (dateOnlyMatch) {
		const [, d, m, y] = dateOnlyMatch.map(Number)
		const iso = `${y}-${pad2(m)}-${pad2(d)}T00:00:00${BRT_OFFSET}`
		const date = new Date(iso)
		if (!isNaN(date.getTime())) return date
	}

	return null
}

/**
 * Parses Brazilian date/time format with milliseconds: DD/MM/YYYY HH:MM:SS.mmm
 * Handles timestamps like "17/03/2026 18:14:47.778".
 * Times are interpreted as BRT (America/Sao_Paulo, UTC-3).
 *
 * @param value - Date string in "DD/MM/YYYY HH:MM:SS.mmm" or "DD/MM/YYYY HH:MM:SS" or "DD/MM/YYYY" format
 * @returns Parsed Date object, or null if invalid
 */
const parseBrazilianDateTimeMs = (value: string): Date | null => {
	if (!value) return null

	// Format: DD/MM/YYYY HH:MM:SS.mmm (e.g., "17/03/2026 18:14:47.778")
	const match = value.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
	)
	if (match) {
		const [, d, m, y, h, mi, s] = match.map(Number)
		const ms = match[7] ? match[7].padEnd(3, "0") : "000"
		const iso = `${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}.${ms}${BRT_OFFSET}`
		const date = new Date(iso)
		if (!isNaN(date.getTime())) return date
	}

	// Try without time: DD/MM/YYYY — midnight BRT
	const dateOnlyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
	if (dateOnlyMatch) {
		const [, d, m, y] = dateOnlyMatch.map(Number)
		const iso = `${y}-${pad2(m)}-${pad2(d)}T00:00:00.000${BRT_OFFSET}`
		const date = new Date(iso)
		if (!isNaN(date.getTime())) return date
	}

	return null
}

/**
 * Detects the CSV delimiter (comma or semicolon) by analyzing
 * the frequency of each character across multiple lines.
 *
 * @param lines - Array of CSV lines to analyze
 * @returns The detected delimiter character ("," or ";")
 */
const detectDelimiter = (lines: string[]): string => {
	let totalSemicolons = 0
	let totalCommas = 0

	// Check first 10 lines to get a good sample
	const linesToCheck = lines.slice(0, Math.min(10, lines.length))
	for (const line of linesToCheck) {
		totalSemicolons += (line.match(/;/g) || []).length
		totalCommas += (line.match(/,/g) || []).length
	}

	return totalSemicolons > totalCommas ? ";" : ","
}

/**
 * Parses a single CSV line respecting quoted fields.
 * Handles escaped quotes (doubled quotes) within quoted values.
 *
 * @param line - The raw CSV line string
 * @param delimiter - The field delimiter character (defaults to ",")
 * @returns Array of parsed field values
 */
const parseCSVLine = (line: string, delimiter: string = ","): string[] => {
	const result: string[] = []
	let current = ""
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const char = line[i]
		const nextChar = line[i + 1]

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote
				current += '"'
				i++
			} else {
				// Toggle quote mode
				inQuotes = !inQuotes
			}
		} else if (char === delimiter && !inQuotes) {
			result.push(current.trim())
			current = ""
		} else {
			current += char
		}
	}

	result.push(current.trim())
	return result
}

export {
	pad2,
	normalizeHeader,
	parseBrazilianNumber,
	parseBrazilianDateTime,
	parseBrazilianDateTimeMs,
	detectDelimiter,
	parseCSVLine,
}
