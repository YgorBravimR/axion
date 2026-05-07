/**
 * ProfitChart OCR Parser
 *
 * Parses OCR text from ProfitChart screenshots into structured trade data.
 * Handles dynamic column detection, Brazilian number formats, and B3 futures normalization.
 *
 * Features:
 * - Fuzzy header matching (tolerates OCR errors)
 * - Pattern-based data extraction (fallback when headers fail)
 * - B3 futures asset normalization (WING26 → WIN)
 */

import type {
	OcrRawResult,
	OcrParseResult,
	ProfitChartSummary,
	ProfitChartExecution,
	ColumnDetectionResult,
	DetectedColumn,
	ProfitChartColumnType,
	AssetNormalizationResult,
	OcrError,
	OcrWarning,
	OcrImportInput,
	ParsedTrade,
} from "./types"
import {
	HEADER_MAPPINGS,
	REQUIRED_COLUMNS,
	B3_FUTURES_MAPPINGS,
	B3_MONTH_CODES,
} from "./types"

// ==========================================
// Fuzzy String Matching
// ==========================================

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (a: string, b: string): number => {
	const matrix: number[][] = []

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i]
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1]
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1 // deletion
				)
			}
		}
	}

	return matrix[b.length][a.length]
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
const stringSimilarity = (a: string, b: string): number => {
	const maxLen = Math.max(a.length, b.length)
	if (maxLen === 0) return 1
	const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase())
	return 1 - distance / maxLen
}

/**
 * Find best match for a header using fuzzy matching
 */
const findBestHeaderMatch = (
	header: string,
	threshold = 0.6
): ProfitChartColumnType | null => {
	const normalized = normalizeHeader(header)
	let bestMatch: ProfitChartColumnType | null = null
	let bestScore = threshold

	// First try exact match
	if (HEADER_MAPPINGS[normalized]) {
		return HEADER_MAPPINGS[normalized]
	}

	// Try fuzzy matching against all known headers
	for (const [knownHeader, columnType] of Object.entries(HEADER_MAPPINGS)) {
		const score = stringSimilarity(normalized, knownHeader)
		if (score > bestScore) {
			bestScore = score
			bestMatch = columnType
		}

		// Also try if the header contains or is contained by known header
		if (normalized.includes(knownHeader) || knownHeader.includes(normalized)) {
			if (score + 0.2 > bestScore) {
				bestScore = score + 0.2
				bestMatch = columnType
			}
		}
	}

	return bestMatch
}

// ==========================================
// Number Parsing (Brazilian Format)
// ==========================================

/**
 * Parse Brazilian number format
 * Brazilian format: 1.234,56 (dot as thousand separator, comma as decimal)
 * Also handles: 187.450 (which could be 187450 or 187.45)
 */
export const parseBrazilianNumber = (value: string): number | null => {
	if (!value || value.trim() === "") return null

	// Clean the string
	let cleaned = value.trim()

	// Remove currency symbols, spaces, and common OCR artifacts
	cleaned = cleaned.replace(/[R$\s]/g, "")

	// Handle "V" or "C" suffix (Venda/Compra indicators in quantity)
	cleaned = cleaned.replace(/[VC]$/i, "").trim()

	// Remove any remaining non-numeric chars except . , -
	cleaned = cleaned.replace(/[^\d.,-]/g, "")

	if (!cleaned) return null

	// If it has both dots and commas, it's Brazilian format
	// 1.234,56 → 1234.56
	if (cleaned.includes(",") && cleaned.includes(".")) {
		cleaned = cleaned.replace(/\./g, "").replace(",", ".")
	}
	// If only comma, it's the decimal separator
	// 1234,56 → 1234.56
	else if (cleaned.includes(",")) {
		cleaned = cleaned.replace(",", ".")
	}
	// If only dots - for prices like 187.450, treat the dot as decimal
	// This is ProfitChart's format for prices

	const num = parseFloat(cleaned)
	return isNaN(num) ? null : num
}

/**
 * Parse time string (HH:MM:SS) - tolerates OCR errors
 */
export const parseTimeString = (value: string): string | null => {
	if (!value) return null

	// Clean common OCR errors (o → 0, l → 1, etc.)
	const cleaned = value
		.replace(/[oO]/g, "0")
		.replace(/[lI]/g, "1")
		.replace(/[sS]$/g, "") // Remove trailing 's' that OCR might add

	// Match HH:MM:SS pattern (allowing some flexibility)
	const match = cleaned.match(/(\d{1,2}):(\d{2}):(\d{2})/)
	if (!match) return null

	const [, hours, minutes, seconds] = match
	return `${hours.padStart(2, "0")}:${minutes}:${seconds}`
}

/**
 * Parse quantity with potential "V" (Venda) or "C" (Compra) suffix
 * e.g., "9 V" → 9, "10 C" → 10
 */
export const parseQuantity = (value: string): number | null => {
	if (!value) return null

	// Clean and extract just the number
	const cleaned = value.replace(/[^\d]/g, "")
	if (!cleaned) return null

	return parseInt(cleaned, 10)
}

// ==========================================
// B3 Futures Asset Normalization
// ==========================================

/**
 * Extract futures contract information from code
 * Pattern: [PREFIX][MONTH][YEAR] e.g., WING26, WDOH25
 */
export const normalizeB3Asset = (
	contractCode: string
): AssetNormalizationResult => {
	const code = contractCode.toUpperCase().trim()

	// Pattern: 2-3 letter prefix + 1 letter month + 2 digit year
	const futuresMatch = code.match(/^([A-Z]{2,3})([FGHJKMNQUVXZ])(\d{2})$/i)

	if (futuresMatch) {
		const [, prefix, monthCode, year] = futuresMatch
		const monthName = B3_MONTH_CODES[monthCode.toUpperCase()]

		return {
			originalCode: code,
			normalizedSymbol: prefix.toUpperCase(),
			isRecognized: B3_FUTURES_MAPPINGS.some(
				(m) => m.prefix === prefix.toUpperCase()
			),
			isFutures: true,
			expirationMonth: monthName,
			expirationYear: `20${year}`,
		}
	}

	// Not a futures contract, return as-is
	return {
		originalCode: code,
		normalizedSymbol: code,
		isRecognized: false,
		isFutures: false,
	}
}

// ==========================================
// Pattern-Based Data Extraction
// ==========================================

// Regex patterns for ProfitChart data
const PATTERNS = {
	// Asset pattern: 3-6 uppercase letters followed by optional number/letter
	asset: /^([A-Z]{3,6}\d{0,2}[A-Z]?\d{0,2})/i,
	// Time pattern: HH:MM:SS
	time: /(\d{1,2}:\d{2}:\d{2})/,
	// Price pattern: number with possible decimal (185.875, 185,875, or 185875)
	price: /(\d{3,6}[.,]?\d{0,3})/,
	// Quantity pattern: small number possibly followed by C/V
	quantity: /\b(\d{1,3})\s*[CV]?\b/i,
	// B3 futures pattern - allows optional prefix and SPACE in contract code
	// Matches: WING25, WDOH26, v WING25, "WING 26" (with space), WIN G26
	futures: /(?:^|\s)[vV]?\s*([A-Z]{3,4})\s*([FGHJKMNQUVXZ])\s*(\d{2})\b/i,
}

/**
 * Extract data from a line using pattern matching (fallback method)
 */
const extractDataFromLine = (
	line: string
): {
	asset?: string
	time?: string
	quantity?: number
	price?: number
	isSummary: boolean
} => {
	const result: ReturnType<typeof extractDataFromLine> = { isSummary: false }

	// Try to find asset (futures contract)
	const futuresMatch = line.match(PATTERNS.futures)
	if (futuresMatch) {
		result.asset = futuresMatch[1].toUpperCase()
		result.isSummary = true
	}

	// Find all times in the line
	const times = line.match(/\d{1,2}:\d{2}:\d{2}/g) || []
	if (times.length > 0) {
		result.time = times[0]
	}

	// Find prices (numbers with 5-6 digits, possibly with decimal)
	const prices = line.match(/\d{3}\.\d{3}/g) || line.match(/\d{6}/g) || []
	const firstPrice = prices[0]
	if (firstPrice) {
		const price = parseBrazilianNumber(firstPrice)
		if (price) {
			result.price = price
		}
	}

	// Find quantity - must be between time and price, not part of time
	// Pattern: TIME QTY PRICE (e.g., "09:48:01 10 185.875")
	const timeMatch = line.match(/(\d{1,2}:\d{2}:\d{2})/)
	const priceMatch = line.match(/(\d{3}\.\d{3})/)

	if (timeMatch && priceMatch) {
		const timeEndIndex = line.indexOf(timeMatch[1]) + timeMatch[1].length
		const priceStartIndex = line.indexOf(priceMatch[1])

		if (priceStartIndex > timeEndIndex) {
			const betweenTimeAndPrice = line.substring(timeEndIndex, priceStartIndex)
			// Look for quantity with optional C/V suffix first, then plain number
			const qtyMatch = betweenTimeAndPrice.match(/\b(\d{1,3})\s*[CV]?\b/i)
			if (qtyMatch) {
				const qty = parseInt(qtyMatch[1], 10)
				if (qty > 0 && qty < 1000) {
					result.quantity = qty
				}
			}
		}
	} else {
		// Fallback: look for number with C/V suffix anywhere
		const qtyMatch = line.match(/\b(\d{1,2})\s*[CV]\b/i)
		if (qtyMatch) {
			const qty = parseInt(qtyMatch[1], 10)
			if (qty > 0 && qty < 100) {
				result.quantity = qty
			}
		}
	}

	return result
}

// ==========================================
// Column Detection
// ==========================================

/**
 * Normalize header text for matching
 */
const normalizeHeader = (header: string): string => {
	return header
		.toLowerCase()
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // Remove accents
		.replace(/\s+/g, " ")
}

/**
 * Detect columns from header row with fuzzy matching
 * Uses multiple splitting strategies to handle variable OCR spacing
 */
export const detectColumns = (headerLine: string): ColumnDetectionResult => {
	const columns: DetectedColumn[] = []
	const detected = new Set<ProfitChartColumnType>()

	// Try multiple splitting strategies
	// Strategy 1: Split by 2+ spaces or tabs
	let headers = headerLine
		.split(/\s{2,}|\t/)
		.map((h) => h.trim())
		.filter(Boolean)

	// Strategy 2: If not many headers found, also try combining adjacent words
	// that form known two-word headers like "Prego Compra"
	if (headers.length < 5) {
		const singleSpaceHeaders = headerLine.split(/\s+/).filter(Boolean)
		const combined: string[] = []

		for (let i = 0; i < singleSpaceHeaders.length; i++) {
			const current = singleSpaceHeaders[i]
			const next = singleSpaceHeaders[i + 1]

			// Try combining with next word for two-word headers
			if (next) {
				const twoWord = `${current} ${next}`.toLowerCase()
				const normalizedTwoWord = normalizeHeader(twoWord)

				// Check if the two-word combo matches a known header
				if (
					HEADER_MAPPINGS[normalizedTwoWord] ||
					findBestHeaderMatch(`${current} ${next}`, 0.7)
				) {
					combined.push(`${current} ${next}`)
					i++ // Skip next word since we combined
					continue
				}
			}
			combined.push(current)
		}

		// Use combined headers if we got more matches
		if (combined.length > headers.length) {
			headers = combined
		}
	}

	for (let index = 0; index < headers.length; index++) {
		const header = headers[index]

		// Use fuzzy matching to find best column type (lower threshold for OCR errors)
		const matchedType = findBestHeaderMatch(header, 0.45)

		if (matchedType && !detected.has(matchedType)) {
			detected.add(matchedType)
			columns.push({
				type: matchedType,
				index,
				header,
				isRequired: REQUIRED_COLUMNS.includes(matchedType),
			})
		}
	}

	// Find missing required columns
	const missingRequired = REQUIRED_COLUMNS.filter((col) => !detected.has(col))

	return {
		columns,
		missingRequired,
		hasAllRequired: missingRequired.length === 0,
	}
}

// ==========================================
// Row Parsing
// ==========================================

interface ParsedRow {
	asset?: string
	time?: string
	closingTime?: string
	quantity?: number
	buyPrice?: number
	sellPrice?: number
	isSummary: boolean
}

/**
 * Parse a single data row based on detected columns
 */
const parseDataRow = (
	line: string,
	columns: DetectedColumn[]
): ParsedRow | null => {
	// If no columns detected, use pattern-based extraction
	if (columns.length === 0) {
		const extracted = extractDataFromLine(line)
		return {
			asset: extracted.asset,
			time: extracted.time,
			quantity: extracted.quantity,
			buyPrice: extracted.price,
			isSummary: extracted.isSummary,
		}
	}

	// Split by multiple spaces
	const values = line
		.split(/\s{2,}|\t/)
		.map((v) => v.trim())
		.filter(Boolean)

	if (values.length < 2) return null

	const row: ParsedRow = { isSummary: false }

	// Check if this is a summary row (has asset name) or execution row (starts with time)
	const firstValue = values[0]
	const isTimeOnly = /^\d{1,2}:\d{2}:\d{2}$/.test(firstValue)

	// If first value is time only, this is an execution row
	// The values are shifted since asset column is empty
	const valueOffset = isTimeOnly ? -1 : 0

	for (const col of columns) {
		const valueIndex = col.index + valueOffset
		const value = values[valueIndex]

		if (!value) continue

		switch (col.type) {
			case "asset":
				if (!isTimeOnly) {
					// Clean up asset - extract just the contract code
					const assetMatch =
						value.match(PATTERNS.futures) || value.match(PATTERNS.asset)
					if (assetMatch) {
						row.asset = assetMatch[1].toUpperCase()
						row.isSummary = true
					}
				}
				break

			case "openingTime":
				row.time = parseTimeString(value) ?? undefined
				break

			case "closingTime":
				row.closingTime = parseTimeString(value) ?? undefined
				break

			case "quantity":
				row.quantity = parseQuantity(value) ?? undefined
				break

			case "buyPrice":
				row.buyPrice = parseBrazilianNumber(value) ?? undefined
				break

			case "sellPrice":
				row.sellPrice = parseBrazilianNumber(value) ?? undefined
				break
		}
	}

	return row
}

/**
 * Check if a line is a summary row (has two times = opening and closing)
 * Summary rows have the pattern: [asset?] TIME TIME [duration] [prices...]
 * Execution rows have: TIME QTY PRICE
 */
const isSummaryRow = (line: string): boolean => {
	const times = line.match(/\d{1,2}:\d{2}:\d{2}/g) || []
	// Summary rows have 2+ times (opening, closing), execution rows have 1
	return times.length >= 2
}

/**
 * Try to extract asset from a mangled line
 * Looks for patterns like "v WING25", "WING 26" (with space), "Fr 8 wins" (mangled), etc.
 */
/** Fuzzy patterns for detecting B3 futures when OCR mangles the text */
const FUZZY_FUTURES_PATTERNS = [
	{ pattern: /\bwin\s*[ghjkmnquvxz]?\s*\d{0,2}/i, asset: "WIN" },
	{ pattern: /\bwdo\s*[ghjkmnquvxz]?\s*\d{0,2}/i, asset: "WDO" },
	{ pattern: /\bind\s*[ghjkmnquvxz]?\s*\d{0,2}/i, asset: "IND" },
	{ pattern: /\bdol\s*[ghjkmnquvxz]?\s*\d{0,2}/i, asset: "DOL" },
] as const

/**
 * Try to extract asset from a mangled line
 * Looks for patterns like "v WING25", "WING 26" (with space), "Fr 8 wins" (mangled), etc.
 */
const extractAssetFromLine = (
	line: string
): { asset: string; original: string } | null => {
	// First try clean futures pattern (handles spaces like "WING 26")
	const futuresMatch = line.match(PATTERNS.futures)
	if (futuresMatch) {
		const [, prefix, monthCode, year] = futuresMatch
		const reconstructedCode = `${prefix}${monthCode}${year}`.toUpperCase()
		const assetInfo = normalizeB3Asset(reconstructedCode)
		return {
			asset: assetInfo.normalizedSymbol,
			original: assetInfo.originalCode,
		}
	}

	// Try fuzzy patterns for mangled OCR text
	for (const { pattern, asset } of FUZZY_FUTURES_PATTERNS) {
		if (pattern.test(line)) {
			return { asset, original: asset }
		}
	}

	return null
}

/**
 * Parse lines using pattern-based extraction (fallback when column detection fails)
 * Now supports multiple trades with improved summary row detection
 */
const parseWithPatterns = (
	lines: string[]
): { trades: ParsedTrade[]; warnings: OcrWarning[] } => {
	const warnings: OcrWarning[] = []
	const trades: ParsedTrade[] = []
	let currentTrade: {
		summary: ProfitChartSummary
		executions: ProfitChartExecution[]
	} | null = null
	let tradeCounter = 0

	const finalizeTrade = () => {
		if (currentTrade && currentTrade.executions.length > 0) {
			// Determine direction from executions
			const entries = currentTrade.executions.filter((e) => e.type === "entry")
			const exits = currentTrade.executions.filter((e) => e.type === "exit")

			// If we have both entries and exits, direction is based on which came first chronologically
			if (entries.length > 0) {
				currentTrade.summary.direction = "long" // Buy first = long
			} else if (exits.length > 0) {
				currentTrade.summary.direction = "short" // Sell first = short
			}

			// Update total quantity
			currentTrade.summary.totalQuantity = currentTrade.executions.reduce(
				(sum, e) => sum + e.quantity,
				0
			)

			trades.push({
				id: `trade-${tradeCounter++}`,
				summary: currentTrade.summary,
				executions: currentTrade.executions,
			})
		}
		currentTrade = null
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		const rowNum = i + 1

		// Skip header-like lines
		const lowerLine = line.toLowerCase()
		if (
			lowerLine.includes("ativo") ||
			lowerLine.includes("abertura") ||
			lowerLine.includes("ato ") ||
			lowerLine.includes("fechamento")
		) {
			continue
		}

		// Skip empty or very short lines
		if (line.trim().length < 10) continue

		// Check if this is a summary row (two times = new trade)
		if (isSummaryRow(line)) {
			// Finalize previous trade
			finalizeTrade()

			// Extract asset (may be mangled)
			const assetInfo = extractAssetFromLine(line)
			const times = line.match(/\d{1,2}:\d{2}:\d{2}/g) || []
			const prices = (line.match(/\d{3}\.\d{3}/g) || []).map((p) =>
				parseBrazilianNumber(p)
			)

			currentTrade = {
				summary: {
					asset: assetInfo?.asset ?? "UNKNOWN",
					originalContractCode: assetInfo?.original ?? "UNKNOWN",
					openingTime: times[0] || "",
					closingTime: times[1] || null,
					totalQuantity: 0,
					avgBuyPrice: prices[0] ?? null,
					avgSellPrice: prices[1] ?? null,
					direction: null,
				},
				executions: [],
			}

			if (!assetInfo) {
				warnings.push({
					line: rowNum,
					message: `ocr.warnings.assetNotDetected|${line.substring(0, 50)}`,
				})
			}
			continue
		}

		// Try to parse as execution row (single time + quantity + price)
		const times = line.match(/\d{1,2}:\d{2}:\d{2}/g) || []
		const priceMatches = line.match(/\d{3}\.\d{3}/g) || []

		// Execution row should have exactly 1 time and 1 price
		const firstTime = times[0]
		const firstPriceMatch = priceMatches[0]

		if (
			times.length === 1 &&
			priceMatches.length >= 1 &&
			firstTime &&
			firstPriceMatch
		) {
			const time = firstTime
			const priceMatch = firstPriceMatch

			// Extract quantity between time and price
			const timeEndIndex = line.indexOf(time) + time.length
			const priceStartIndex = line.indexOf(priceMatch)
			const betweenTimeAndPrice = line.substring(timeEndIndex, priceStartIndex)

			const qtyMatch = betweenTimeAndPrice.match(/\b(\d{1,3})\b/)
			const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1
			const price = parseBrazilianNumber(priceMatch)

			if (price && quantity > 0 && quantity < 1000) {
				// If no current trade, create one (orphan executions)
				if (!currentTrade) {
					currentTrade = {
						summary: {
							asset: "UNKNOWN",
							originalContractCode: "UNKNOWN",
							openingTime: time,
							closingTime: null,
							totalQuantity: 0,
							avgBuyPrice: null,
							avgSellPrice: null,
							direction: null,
						},
						executions: [],
					}
					warnings.push({
						line: rowNum,
						message: "ocr.warnings.executionWithoutSummary",
					})
				}

				// Determine entry/exit based on price proximity to summary prices
				let type: "entry" | "exit"

				if (
					currentTrade.summary.avgBuyPrice !== null &&
					currentTrade.summary.avgSellPrice !== null
				) {
					const buyDiff = Math.abs(price - currentTrade.summary.avgBuyPrice)
					const sellDiff = Math.abs(price - currentTrade.summary.avgSellPrice)
					type = buyDiff <= sellDiff ? "entry" : "exit"
				} else {
					// Fallback: first execution is entry, rest alternate or use price comparison
					type = currentTrade.executions.length === 0 ? "entry" : "exit"
				}

				currentTrade.executions.push({
					time,
					quantity,
					price,
					type,
					rowIndex: rowNum,
				})
			}
		}
	}

	// Don't forget the last trade
	finalizeTrade()

	return { trades, warnings }
}

// ==========================================
// Vertical Text Parser (for Google Vision output)
// ==========================================

/** B3 futures base asset codes */
const B3_ASSET_CODES = "WIN|WDO|IND|DOL|BGI|CCM|ICF|SFI|DI1"

/** Regex for matching B3 asset codes with optional month code and year */
const B3_ASSET_REGEX = new RegExp(
	`^(${B3_ASSET_CODES})\\s*([GHJKMNQUVXZ])?\\s*(\\d{2})?$`,
	"i"
)

interface LineData<T> {
	line: number
	value: T
}

/**
 * Slice a portion of array for a specific trade index
 */
const sliceTradeData = <T>(
	data: T[],
	tradeIndex: number,
	perTrade: number
): T[] => {
	const start = tradeIndex * perTrade
	return data.slice(start, start + perTrade)
}

/**
 * Sort executions by time string (HH:MM:SS)
 */
const sortByTime = <T extends { time: string }>(executions: T[]): T[] =>
	[...executions].sort((a, b) => {
		const timeA = a.time.replace(/:/g, "")
		const timeB = b.time.replace(/:/g, "")
		return timeA.localeCompare(timeB)
	})

/**
 * Classify executions as entry/exit based on quantity balancing
 * For closed trades: entry qty equals exit qty
 */
const classifyEntryExit = (
	rawExecutions: Array<{
		time: string
		quantity: number
		price: number
		rowIndex: number
	}>
): ProfitChartExecution[] => {
	const sorted = sortByTime(rawExecutions)
	const totalQty = sorted.reduce((sum, e) => sum + e.quantity, 0)
	const targetEntryQty = Math.floor(totalQty / 2)

	let entryQty = 0
	return sorted.map((exec) => {
		const isEntry = entryQty < targetEntryQty
		if (isEntry) entryQty += exec.quantity
		return { ...exec, type: isEntry ? "entry" : "exit" } as ProfitChartExecution
	})
}

/**
 * Collect data points from vertical text lines
 */
const collectVerticalData = (
	lines: string[]
): {
	assets: LineData<string>[]
	times: LineData<string>[]
	prices: LineData<number>[]
	quantities: LineData<number>[]
} => {
	const assets: LineData<string>[] = []
	const times: LineData<string>[] = []
	const prices: LineData<number>[] = []
	const quantities: LineData<number>[] = []

	let prevNumberLine: LineData<number> | null = null

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim()
		if (!line) continue

		// Standalone "C" or "V" indicates previous number was a summary quantity
		if (/^[CV]$/i.test(line)) {
			if (prevNumberLine) {
				const idx = quantities.findIndex((q) => q.line === prevNumberLine?.line)
				if (idx !== -1) quantities.splice(idx, 1)
			}
			prevNumberLine = null
			continue
		}

		// Asset (WING 26, WIN G 26, WDOH25, etc.)
		const assetMatch = line.match(B3_ASSET_REGEX)
		if (assetMatch) {
			const reconstructed =
				`${assetMatch[1]}${assetMatch[2] ?? ""}${assetMatch[3] ?? ""}`.toUpperCase()
			assets.push({ line: i, value: reconstructed })
			prevNumberLine = null
			continue
		}

		// Time (HH:MM:SS)
		const timeMatch = line.match(/^(\d{1,2}:\d{2}:\d{2})$/)
		if (timeMatch) {
			times.push({ line: i, value: timeMatch[1] })
			prevNumberLine = null
			continue
		}

		// Price (185.875 or 185,875 or 185875)
		const priceMatch = line.match(/^(\d{3}[.,]?\d{3})$/)
		if (priceMatch) {
			const price = parseBrazilianNumber(priceMatch[1])
			if (price && price > 100) {
				prices.push({ line: i, value: price })
			}
			prevNumberLine = null
			continue
		}

		// Skip summary quantities with C/V suffix
		if (/^(\d{1,2})\s*[CV]$/i.test(line)) {
			prevNumberLine = null
			continue
		}

		// Pure quantity numbers (executions only)
		const qtyMatch = line.match(/^(\d{1,2})$/)
		if (qtyMatch) {
			const qty = parseInt(qtyMatch[1], 10)
			if (qty > 0 && qty < 100) {
				quantities.push({ line: i, value: qty })
				prevNumberLine = { line: i, value: qty }
			}
			continue
		}

		prevNumberLine = null
	}

	return { assets, times, prices, quantities }
}

/**
 * Build a single trade from proportionally distributed data
 */
const buildTradeFromData = (
	assetValue: string,
	tradeTimes: LineData<string>[],
	tradePrices: LineData<number>[],
	tradeQuantities: LineData<number>[],
	tradeIndex: number
): ParsedTrade | null => {
	if (tradeTimes.length < 1 || tradePrices.length < 1) return null

	const normalized = normalizeB3Asset(assetValue)

	// First two times/prices are summary (opening/closing, avg buy/sell)
	const openingTime = tradeTimes[0]?.value ?? ""
	const closingTime = tradeTimes[1]?.value ?? null
	const avgBuyPrice = tradePrices[0]?.value ?? null
	const avgSellPrice = tradePrices[1]?.value ?? null

	// Execution data starts after summary entries
	const execTimes = tradeTimes.slice(2)
	const execPrices = tradePrices.slice(2)
	const execCount = tradeQuantities.length

	// Build raw executions
	const rawExecutions: Array<{
		time: string
		quantity: number
		price: number
		rowIndex: number
	}> = []

	for (let e = 0; e < execCount; e++) {
		const time =
			execTimes[e]?.value ??
			tradeTimes[e % tradeTimes.length]?.value ??
			openingTime
		const quantity = tradeQuantities[e]?.value ?? 1
		const price =
			execPrices[e]?.value ??
			tradePrices[e % tradePrices.length]?.value ??
			avgBuyPrice ??
			0

		if (time && price > 0) {
			rawExecutions.push({ time, quantity, price, rowIndex: e + 1 })
		}
	}

	// Fallback: create single execution from summary data
	if (rawExecutions.length === 0 && avgBuyPrice) {
		rawExecutions.push({
			time: openingTime,
			quantity: 1,
			price: avgBuyPrice,
			rowIndex: 1,
		})
	}

	if (rawExecutions.length === 0) return null

	const executions = classifyEntryExit(rawExecutions)
	const totalQty = executions.reduce((sum, e) => sum + e.quantity, 0)

	return {
		id: `trade-vertical-${tradeIndex}`,
		summary: {
			asset: normalized.normalizedSymbol,
			originalContractCode: normalized.originalCode,
			openingTime,
			closingTime,
			totalQuantity: totalQty,
			avgBuyPrice,
			avgSellPrice,
			direction: "long",
		},
		executions,
	}
}

/**
 * Build an unknown trade when no assets are detected
 */
const buildUnknownTrade = (
	times: LineData<string>[],
	prices: LineData<number>[],
	quantities: LineData<number>[]
): ParsedTrade | null => {
	const execCount = Math.max(
		quantities.length,
		Math.min(times.length, prices.length)
	)
	const executions: ProfitChartExecution[] = []

	for (let e = 0; e < execCount; e++) {
		const time = times[e]?.value ?? times[0]?.value
		const quantity = quantities[e]?.value ?? 1
		const price = prices[e]?.value ?? 0

		if (time && price > 0) {
			executions.push({
				time,
				quantity,
				price,
				type: e === 0 ? "entry" : "exit",
				rowIndex: e + 1,
			})
		}
	}

	if (executions.length === 0) return null

	return {
		id: "trade-vertical-unknown",
		summary: {
			asset: "UNKNOWN",
			originalContractCode: "UNKNOWN",
			openingTime: times[0]?.value ?? "",
			closingTime: times[1]?.value ?? null,
			totalQuantity: executions.reduce((sum, e) => sum + e.quantity, 0),
			avgBuyPrice: prices[0]?.value ?? null,
			avgSellPrice: prices[1]?.value ?? null,
			direction: "long",
		},
		executions,
	}
}

/**
 * Parse vertically-structured text (Google Vision format)
 *
 * Google Vision reads columns top-to-bottom, left-to-right, producing:
 * - All assets together (WING 26, WING 26)
 * - All times together (09:48:01, 09:50:51, ...)
 * - All quantities together (10, 4, 3, 3, ...)
 * - All prices together (185.875, 185.964, ...)
 *
 * Strategy: Divide data proportionally among detected assets
 */
const parseVerticalText = (
	lines: string[]
): { trades: ParsedTrade[]; warnings: OcrWarning[] } => {
	const warnings: OcrWarning[] = []
	const trades: ParsedTrade[] = []

	const { assets, times, prices, quantities } = collectVerticalData(lines)

	if (assets.length > 0) {
		const numTrades = assets.length
		const timesPerTrade = Math.floor(times.length / numTrades)
		const pricesPerTrade = Math.floor(prices.length / numTrades)
		const executionsPerTrade = Math.floor(quantities.length / numTrades)

		for (let a = 0; a < numTrades; a++) {
			const assetInfo = assets[a]
			const tradeTimes = sliceTradeData(times, a, timesPerTrade)
			const tradePrices = sliceTradeData(prices, a, pricesPerTrade)
			const tradeQuantities = sliceTradeData(quantities, a, executionsPerTrade)

			const trade = buildTradeFromData(
				assetInfo.value,
				tradeTimes,
				tradePrices,
				tradeQuantities,
				a
			)

			if (trade) trades.push(trade)
		}
	} else if (times.length > 0 && prices.length > 0) {
		const unknownTrade = buildUnknownTrade(times, prices, quantities)
		if (unknownTrade) trades.push(unknownTrade)
	}

	return { trades, warnings }
}

// ==========================================
// Main Parser
// ==========================================

/**
 * Generate unique trade ID
 */
let tradeIdCounter = 0
const generateTradeId = (): string => `trade-${Date.now()}-${tradeIdCounter++}`

/** Regex for detecting standalone B3 assets in vertical format */
const STANDALONE_ASSET_REGEX = new RegExp(
	`^(${B3_ASSET_CODES})\\s*[GHJKMNQUVXZ]?\\s*\\d{0,2}$`,
	"i"
)

/** Maximum lines to check for format detection */
const FORMAT_DETECTION_LINE_LIMIT = 50

/** Minimum standalone data points to confirm vertical format */
const MIN_STANDALONE_DATA_POINTS = 2

/**
 * Detect if text is in vertical format (Google Vision style)
 * Vertical format has assets, times, prices on separate lines
 */
const isVerticalFormat = (lines: string[]): boolean => {
	let standaloneAssets = 0
	let standaloneTimes = 0
	let standalonePrices = 0

	for (const line of lines.slice(0, FORMAT_DETECTION_LINE_LIMIT)) {
		const trimmed = line.trim()
		if (!trimmed) continue

		if (STANDALONE_ASSET_REGEX.test(trimmed)) standaloneAssets++
		if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) standaloneTimes++
		if (/^\d{3}[.,]?\d{3}$/.test(trimmed)) standalonePrices++
	}

	return (
		standaloneAssets > 0 &&
		(standaloneTimes > MIN_STANDALONE_DATA_POINTS ||
			standalonePrices > MIN_STANDALONE_DATA_POINTS)
	)
}

/**
 * Parse OCR result into structured trade data
 * Supports multiple trades in a single screenshot
 * Auto-detects vertical (Google) vs horizontal (Tesseract) format
 */
export const parseProfitChartOcr = (
	ocrResult: OcrRawResult
): OcrParseResult => {
	const errors: OcrError[] = []
	const warnings: OcrWarning[] = []
	let trades: ParsedTrade[] = []

	const { lines, confidence, text } = ocrResult

	if (lines.length < 2) {
		errors.push({
			line: 0,
			code: "INSUFFICIENT_DATA",
			message: "ocr.errors.insufficientData",
		})
		return {
			success: false,
			summary: null,
			executions: [],
			trades: [],
			rawText: text,
			confidence,
			columnDetection: {
				columns: [],
				missingRequired: REQUIRED_COLUMNS,
				hasAllRequired: false,
			},
			errors,
			warnings,
		}
	}

	// Detect format and use appropriate parser
	if (isVerticalFormat(lines)) {
		const verticalResult = parseVerticalText(lines)
		trades = verticalResult.trades
		warnings.push(...verticalResult.warnings)

		if (trades.length > 0) {
			const firstTrade = trades[0]
			return {
				success: true,
				summary: firstTrade?.summary ?? null,
				executions: firstTrade?.executions ?? [],
				trades,
				rawText: text,
				confidence,
				columnDetection: {
					columns: [],
					missingRequired: [],
					hasAllRequired: true,
				},
				errors,
				warnings,
			}
		}
	}

	// Try to detect columns from first few lines (header might not be first)
	let columnDetection: ColumnDetectionResult = {
		columns: [],
		missingRequired: REQUIRED_COLUMNS,
		hasAllRequired: false,
	}

	for (let i = 0; i < Math.min(3, lines.length); i++) {
		const detection = detectColumns(lines[i])
		if (detection.columns.length > columnDetection.columns.length) {
			columnDetection = detection
		}
	}

	// Track current trade being built
	let currentTrade: {
		summary: ProfitChartSummary
		executions: ProfitChartExecution[]
	} | null = null

	// Helper to finalize current trade
	const finalizeCurrentTrade = () => {
		if (currentTrade && currentTrade.executions.length > 0) {
			// Determine direction from first execution
			const firstExecution = currentTrade.executions[0]
			currentTrade.summary.direction =
				firstExecution.type === "entry" ? "long" : "short"

			trades.push({
				id: generateTradeId(),
				summary: currentTrade.summary,
				executions: currentTrade.executions,
			})
		}
		currentTrade = null
	}

	// If column detection found enough columns, use column-based parsing
	if (columnDetection.columns.length >= 3) {
		// Parse data rows
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i]
			const rowNum = i + 1

			const parsed = parseDataRow(line, columnDetection.columns)

			if (!parsed) {
				if (line.match(/\d{1,2}:\d{2}:\d{2}/)) {
					warnings.push({
						line: rowNum,
						message: `ocr.warnings.couldNotParseLine|${line.substring(0, 50)}`,
					})
				}
				continue
			}

			// Summary row (has asset name) - starts a NEW trade
			if (parsed.isSummary && parsed.asset) {
				// Finalize previous trade if exists
				finalizeCurrentTrade()

				const assetInfo = normalizeB3Asset(parsed.asset)

				currentTrade = {
					summary: {
						asset: assetInfo.normalizedSymbol,
						originalContractCode: assetInfo.originalCode,
						openingTime: parsed.time ?? "",
						closingTime: parsed.closingTime ?? null,
						totalQuantity: parsed.quantity ?? 0,
						avgBuyPrice: parsed.buyPrice ?? null,
						avgSellPrice: parsed.sellPrice ?? null,
						direction: null,
					},
					executions: [],
				}
				continue
			}

			// Execution row - add to current trade
			if (currentTrade && parsed.time && parsed.quantity) {
				let executionType: "entry" | "exit"
				let price: number

				if (parsed.buyPrice && !parsed.sellPrice) {
					executionType = "entry"
					price = parsed.buyPrice
				} else if (parsed.sellPrice && !parsed.buyPrice) {
					executionType = "exit"
					price = parsed.sellPrice
				} else if (parsed.buyPrice && parsed.sellPrice) {
					warnings.push({
						line: rowNum,
						message: "ocr.warnings.bothPricesPresent",
					})
					executionType = "entry"
					price = parsed.buyPrice
				} else if (parsed.buyPrice || parsed.sellPrice) {
					price = parsed.buyPrice ?? parsed.sellPrice!
					executionType = parsed.buyPrice ? "entry" : "exit"
				} else {
					warnings.push({
						line: rowNum,
						message: "ocr.warnings.noPriceFound",
					})
					continue
				}

				currentTrade.executions.push({
					time: parsed.time,
					quantity: parsed.quantity,
					price,
					type: executionType,
					rowIndex: rowNum,
				})
			}
		}

		// Don't forget the last trade
		finalizeCurrentTrade()
	} else {
		// Fall back to pattern-based extraction
		warnings.push({
			line: 0,
			message: "ocr.warnings.columnDetectionFailed",
		})

		const patternResult = parseWithPatterns(lines)
		trades.push(...patternResult.trades)
		warnings.push(...patternResult.warnings)
	}

	// Validate we have minimum data
	const hasData = trades.length > 0
	const success = hasData && errors.length === 0

	if (trades.length === 0) {
		errors.push({
			line: 0,
			code: "NO_DATA",
			message: "ocr.errors.noTradeData",
		})
	}

	// For backwards compatibility, also populate summary and executions from first trade
	const firstTrade = trades[0]
	const summary = firstTrade?.summary ?? null
	const executions = firstTrade?.executions ?? []

	return {
		success,
		summary,
		executions,
		trades,
		rawText: text,
		confidence,
		columnDetection,
		errors,
		warnings,
	}
}

/**
 * Convert a single parsed trade to import input format
 */
const convertTradeToImportInput = (
	trade: ParsedTrade,
	baseDate: Date
): OcrImportInput => {
	const { summary, executions } = trade

	// Convert time strings to full dates using base date
	const parseTimeToDate = (timeStr: string): Date => {
		const [hours, minutes, seconds] = timeStr.split(":").map(Number)
		const date = new Date(baseDate)
		date.setHours(hours, minutes, seconds, 0)
		return date
	}

	// Sort executions by time
	const sortedExecutions = [...executions].sort((a, b) => {
		const timeA = a.time.replace(/:/g, "")
		const timeB = b.time.replace(/:/g, "")
		return timeA.localeCompare(timeB)
	})

	const firstExecution = sortedExecutions[0]
	const lastExecution = sortedExecutions[sortedExecutions.length - 1]

	// Determine entry/exit dates
	const entryDate = parseTimeToDate(firstExecution.time)
	const exitDate = summary.closingTime
		? parseTimeToDate(summary.closingTime)
		: lastExecution.type === "exit"
			? parseTimeToDate(lastExecution.time)
			: undefined

	return {
		asset: summary.asset,
		originalContractCode: summary.originalContractCode,
		direction: summary.direction ?? "long",
		entryDate,
		exitDate,
		executions: sortedExecutions.map((ex) => ({
			executionType: ex.type,
			executionDate: parseTimeToDate(ex.time),
			price: ex.price,
			quantity: ex.quantity,
		})),
	}
}

/**
 * Convert all parsed trades to import input format
 */
export const toImportInputs = (
	parseResult: OcrParseResult,
	baseDate: Date
): OcrImportInput[] => {
	return parseResult.trades
		.filter((trade) => trade.executions.length > 0)
		.map((trade) => convertTradeToImportInput(trade, baseDate))
}

/**
 * Convert parsed data to import input format (single trade - backwards compatible)
 * @deprecated Use toImportInputs for multiple trades support
 */
export const toImportInput = (
	parseResult: OcrParseResult,
	baseDate: Date
): OcrImportInput | null => {
	const { summary, executions } = parseResult

	if (!summary || executions.length === 0) return null

	// Convert time strings to full dates using base date
	const parseTimeToDate = (timeStr: string): Date => {
		const [hours, minutes, seconds] = timeStr.split(":").map(Number)
		const date = new Date(baseDate)
		date.setHours(hours, minutes, seconds, 0)
		return date
	}

	// Sort executions by time
	const sortedExecutions = [...executions].sort((a, b) => {
		const timeA = a.time.replace(/:/g, "")
		const timeB = b.time.replace(/:/g, "")
		return timeA.localeCompare(timeB)
	})

	const firstExecution = sortedExecutions[0]
	const lastExecution = sortedExecutions[sortedExecutions.length - 1]

	// Determine entry/exit dates
	const entryDate = parseTimeToDate(firstExecution.time)
	const exitDate = summary.closingTime
		? parseTimeToDate(summary.closingTime)
		: lastExecution.type === "exit"
			? parseTimeToDate(lastExecution.time)
			: undefined

	return {
		asset: summary.asset,
		originalContractCode: summary.originalContractCode,
		direction: summary.direction ?? "long",
		entryDate,
		exitDate,
		executions: sortedExecutions.map((ex) => ({
			executionType: ex.type,
			executionDate: parseTimeToDate(ex.time),
			price: ex.price,
			quantity: ex.quantity,
		})),
	}
}

export {
	type OcrParseResult,
	type ProfitChartSummary,
	type ProfitChartExecution,
	type AssetNormalizationResult,
}
