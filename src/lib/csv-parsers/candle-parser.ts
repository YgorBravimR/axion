/**
 * ProfitChart candle CSV parser.
 * Parses OHLC candle data with dynamic indicator columns into structured rows.
 */

import {
	parseBrazilianDateTimeMs,
	parseBrazilianNumber,
	detectDelimiter,
	parseCSVLine,
} from "@/lib/csv-parsers/parse-utils"
import { resolveIndicatorKey, slugifyHeader } from "./candle-header-mappings"

interface RawCandleRow {
	timestamp: Date
	open: number
	high: number
	low: number
	close: number
	candleIndex: number | null
	indicators: Record<string, number>
}

interface DetectedIndicator {
	csvHeader: string
	key: string
	groupKey: string
	isNew: boolean
}

interface CandleParseResult {
	success: boolean
	candles: RawCandleRow[]
	detectedIndicators: DetectedIndicator[]
	errors: Array<{ row: number; field: string; message: string }>
	warnings: Array<{ row: number; message: string }>
	dateRange: { from: Date; to: Date } | null
}

/** OHLC field names for the column mapping */
type OhlcField = "timestamp" | "open" | "high" | "low" | "close" | "candleIndex"

interface OhlcColumnMapping {
	columnIndex: number
	type: "ohlc"
	field: OhlcField
}

interface IndicatorColumnMapping {
	columnIndex: number
	type: "indicator"
	indicatorKey: string
	csvHeader: string
	groupKey: string
	isNew: boolean
}

type ColumnMapping = OhlcColumnMapping | IndicatorColumnMapping

/** Sentinel threshold — values beyond this are treated as missing data */
const SENTINEL_THRESHOLD = 1e15

/** Strategy-level indicator keys where 0 means "not set" */
const STRATEGY_LEVEL_KEYS = new Set([
	"entrada",
	"stop",
	"alvo_final",
	"breakeven_trailing",
	"breakeven_trigger",
	"trailing_trigger",
])

/**
 * Normalize a header for OHLC detection.
 * Strips accents and lowercases, but preserves spaces for matching against OHLC_HEADERS.
 */
const normalizeForOhlcMatch = (header: string): string =>
	header
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")

/**
 * Classify a header column as an OHLC field.
 * Returns the corresponding OhlcField name, or null if not an OHLC column.
 *
 * @param header - The raw CSV header
 * @param columnIndex - Zero-based column position (used to disambiguate "Fechamento")
 */
const classifyOhlcHeader = (
	header: string,
	columnIndex: number
): OhlcField | null => {
	const normalized = normalizeForOhlcMatch(header)

	if (normalized === "data") {
		return "timestamp"
	}
	if (normalized === "abertura") {
		return "open"
	}
	if (normalized === "maxima" || normalized === "máxima") {
		return "high"
	}
	if (normalized === "minima" || normalized === "mínima") {
		return "low"
	}

	// "Fechamento" is only the close price when it appears as the 5th column (index 4)
	if (normalized === "fechamento" && columnIndex === 4) {
		return "close"
	}

	if (
		normalized === "contador de candles" ||
		normalized === "contador_de_candles"
	) {
		return "candleIndex"
	}

	return null
}

/**
 * Parse a ProfitChart candle CSV file into structured candle rows with indicators.
 *
 * @param content - The raw CSV file content
 * @returns Parsed candles, detected indicators, errors, and warnings
 */
const parseCandleCSV = (content: string): CandleParseResult => {
	const errors: CandleParseResult["errors"] = []
	const warnings: CandleParseResult["warnings"] = []
	const candles: RawCandleRow[] = []

	const lines = content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)

	if (lines.length < 2) {
		return {
			success: false,
			candles: [],
			detectedIndicators: [],
			errors: [
				{
					row: 0,
					field: "file",
					message: "CSV must contain at least a header and one data row",
				},
			],
			warnings: [],
			dateRange: null,
		}
	}

	// Step 1: Detect delimiter
	const delimiter = detectDelimiter(lines)

	// Step 2: Parse header row
	const rawHeaders = parseCSVLine(lines[0], delimiter)

	// Step 3: Build column mappings
	const columnMappings: ColumnMapping[] = []
	const detectedIndicatorMap = new Map<string, DetectedIndicator>()

	for (let colIndex = 0; colIndex < rawHeaders.length; colIndex++) {
		const rawHeader = rawHeaders[colIndex]
		if (!rawHeader) {
			continue
		}

		// Check if it's an OHLC column
		const ohlcField = classifyOhlcHeader(rawHeader, colIndex)
		if (ohlcField) {
			columnMappings.push({
				columnIndex: colIndex,
				type: "ohlc",
				field: ohlcField,
			})
			continue
		}

		// Check if it matches a known indicator
		const knownMapping = resolveIndicatorKey(rawHeader)
		if (knownMapping) {
			columnMappings.push({
				columnIndex: colIndex,
				type: "indicator",
				indicatorKey: knownMapping.key,
				csvHeader: rawHeader,
				groupKey: knownMapping.groupKey,
				isNew: false,
			})
			detectedIndicatorMap.set(knownMapping.key, {
				csvHeader: rawHeader,
				key: knownMapping.key,
				groupKey: knownMapping.groupKey,
				isNew: false,
			})
			continue
		}

		// Unknown header — auto-generate key
		const autoKey = slugifyHeader(rawHeader)
		if (autoKey) {
			columnMappings.push({
				columnIndex: colIndex,
				type: "indicator",
				indicatorKey: autoKey,
				csvHeader: rawHeader,
				groupKey: "unknown",
				isNew: true,
			})
			detectedIndicatorMap.set(autoKey, {
				csvHeader: rawHeader,
				key: autoKey,
				groupKey: "unknown",
				isNew: true,
			})
		}
	}

	// Step 4: Parse data rows
	for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
		const line = lines[rowIndex]
		if (!line) {
			continue
		}

		const values = parseCSVLine(line, delimiter)

		let timestamp: Date | null = null
		let open: number | null = null
		let high: number | null = null
		let low: number | null = null
		let close: number | null = null
		let candleIndex: number | null = null
		const indicators: Record<string, number> = {}

		let hasOhlcError = false

		for (const mapping of columnMappings) {
			const rawValue = values[mapping.columnIndex]
			if (rawValue === undefined || rawValue === "") {
				continue
			}

			if (mapping.type === "ohlc") {
				switch (mapping.field) {
					case "timestamp": {
						timestamp = parseBrazilianDateTimeMs(rawValue)
						if (!timestamp) {
							errors.push({
								row: rowIndex + 1,
								field: "timestamp",
								message: `Invalid timestamp: "${rawValue}"`,
							})
							hasOhlcError = true
						}
						break
					}
					case "open": {
						const parsed = parseBrazilianNumber(rawValue)
						if (parsed === null || isNaN(parsed)) {
							errors.push({
								row: rowIndex + 1,
								field: "open",
								message: `Invalid open value: "${rawValue}"`,
							})
							hasOhlcError = true
						} else {
							open = parsed
						}
						break
					}
					case "high": {
						const parsed = parseBrazilianNumber(rawValue)
						if (parsed === null || isNaN(parsed)) {
							errors.push({
								row: rowIndex + 1,
								field: "high",
								message: `Invalid high value: "${rawValue}"`,
							})
							hasOhlcError = true
						} else {
							high = parsed
						}
						break
					}
					case "low": {
						const parsed = parseBrazilianNumber(rawValue)
						if (parsed === null || isNaN(parsed)) {
							errors.push({
								row: rowIndex + 1,
								field: "low",
								message: `Invalid low value: "${rawValue}"`,
							})
							hasOhlcError = true
						} else {
							low = parsed
						}
						break
					}
					case "close": {
						const parsed = parseBrazilianNumber(rawValue)
						if (parsed === null || isNaN(parsed)) {
							errors.push({
								row: rowIndex + 1,
								field: "close",
								message: `Invalid close value: "${rawValue}"`,
							})
							hasOhlcError = true
						} else {
							close = parsed
						}
						break
					}
					case "candleIndex": {
						const parsed = parseBrazilianNumber(rawValue)
						candleIndex =
							parsed !== null && !isNaN(parsed) ? Math.round(parsed) : null
						break
					}
				}
			}

			if (mapping.type === "indicator") {
				const parsed = parseBrazilianNumber(rawValue)

				// Skip null/NaN values
				if (parsed === null || isNaN(parsed)) {
					continue
				}

				// Sentinel filter: absurd values from ProfitChart mean "no data"
				if (Math.abs(parsed) > SENTINEL_THRESHOLD) {
					continue
				}

				// Strategy-level indicators treat 0 as "not set"
				if (parsed === 0 && STRATEGY_LEVEL_KEYS.has(mapping.indicatorKey)) {
					continue
				}

				indicators[mapping.indicatorKey] = parsed
			}
		}

		// Skip rows with missing required OHLC fields
		if (
			hasOhlcError ||
			!timestamp ||
			open === null ||
			high === null ||
			low === null ||
			close === null
		) {
			if (!hasOhlcError) {
				const missingFields = [
					!timestamp && "timestamp",
					open === null && "open",
					high === null && "high",
					low === null && "low",
					close === null && "close",
				].filter(Boolean)

				errors.push({
					row: rowIndex + 1,
					field: missingFields.join(", "),
					message: `Missing required OHLC fields: ${missingFields.join(", ")}`,
				})
			}
			continue
		}

		candles.push({
			timestamp,
			open,
			high,
			low,
			close,
			candleIndex,
			indicators,
		})
	}

	// Step 5: Calculate date range
	let dateRange: CandleParseResult["dateRange"] = null
	if (candles.length > 0) {
		dateRange = {
			from: candles[0].timestamp,
			to: candles[candles.length - 1].timestamp,
		}
	}

	// Step 6: Collect all detected indicators
	const detectedIndicators = Array.from(detectedIndicatorMap.values())

	return {
		success: candles.length > 0,
		candles,
		detectedIndicators,
		errors,
		warnings,
		dateRange,
	}
}

export type { RawCandleRow, DetectedIndicator, CandleParseResult }
export { parseCandleCSV }
