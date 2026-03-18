import type { CreateTradeInput } from "./validations/trade"
import { normalizeB3Asset } from "@/lib/ocr"
import { BRT_OFFSET } from "@/lib/dates"

// Extended type that includes strategy code, timeframe code, and asset normalization for CSV import
export interface CsvTradeInput extends CreateTradeInput {
	strategyCode?: string
	timeframeCode?: string
	tagNames?: string[]
	// Asset normalization fields (for B3 futures: WING26 → WIN)
	normalizedAsset: string
	originalAssetCode: string
	isFutures: boolean
	// Replay mode flag (ProfitChart exports prefix assets with [R] in replay mode)
	isReplayTrade: boolean
}

export interface CsvParseResult {
	success: boolean
	trades: CsvTradeInput[]
	errors: Array<{
		row: number
		field: string
		message: string
	}>
	warnings: Array<{
		row: number
		message: string
	}>
}

export interface CsvColumn {
	header: string
	field: keyof CreateTradeInput | null
	required: boolean
}

// ProfitChart specific column mappings (Portuguese)
// These map to a special "profitchart" field that we handle separately
type ProfitChartField =
	| "pc_asset"
	| "pc_openDateTime"
	| "pc_closeDateTime"
	| "pc_side"
	| "pc_buyQty"
	| "pc_sellQty"
	| "pc_buyPrice"
	| "pc_sellPrice"
	| "pc_pnl"
	| "pc_mfe"
	| "pc_mae"

const PROFITCHART_COLUMN_MAPPINGS: Record<string, ProfitChartField> = {
	// Asset
	ativo: "pc_asset",
	// Dates
	abertura: "pc_openDateTime",
	fechamento: "pc_closeDateTime",
	// Side (C = Compra/Buy/Long, V = Venda/Sell/Short)
	lado: "pc_side",
	// Quantities (with encoding fallbacks)
	qtd_compra: "pc_buyQty",
	qtdcompra: "pc_buyQty",
	qtd_venda: "pc_sellQty",
	qtdvenda: "pc_sellQty",
	// Prices (with encoding fallbacks - "Preço" can become "preco", "preo", or "pre_o")
	preco_compra: "pc_buyPrice",
	precocompra: "pc_buyPrice",
	preo_compra: "pc_buyPrice", // Encoding issue: ç stripped
	preocompra: "pc_buyPrice",
	pre_o_compra: "pc_buyPrice", // Encoding issue: ç becomes _o_
	preco_venda: "pc_sellPrice",
	precovenda: "pc_sellPrice",
	preo_venda: "pc_sellPrice", // Encoding issue: ç stripped
	preovenda: "pc_sellPrice",
	pre_o_venda: "pc_sellPrice", // Encoding issue: ç becomes _o_
	// Results (with encoding fallbacks - "Operação" can have issues)
	res_intervalo_bruto: "pc_pnl",
	resintervalobruto: "pc_pnl",
	res_operacao: "pc_pnl",
	resoperacao: "pc_pnl",
	res_opera_o: "pc_pnl", // Encoding issue: ç stripped
	res_operaao: "pc_pnl", // Another encoding variant
	// MFE/MAE
	ganho_max: "pc_mfe",
	ganhomax: "pc_mfe",
	ganho_max_: "pc_mfe",
	perda_max: "pc_mae",
	perdamax: "pc_mae",
	perda_max_: "pc_mae",
}

// Headers that indicate ProfitChart format
const PROFITCHART_INDICATOR_HEADERS = [
	"ativo",
	"abertura",
	"fechamento",
	"lado",
]

// Expected CSV columns mapping (standard format)
const COLUMN_MAPPINGS: Record<string, keyof CreateTradeInput> = {
	// Asset
	asset: "asset",
	symbol: "asset",
	ticker: "asset",
	pair: "asset",

	// Direction
	direction: "direction",
	side: "direction",
	type: "direction",

	// Dates
	entry_date: "entryDate",
	entrydate: "entryDate",
	entry: "entryDate",
	open_date: "entryDate",
	opendate: "entryDate",
	exit_date: "exitDate",
	exitdate: "exitDate",
	close_date: "exitDate",
	closedate: "exitDate",

	// Prices
	entry_price: "entryPrice",
	entryprice: "entryPrice",
	open_price: "entryPrice",
	openprice: "entryPrice",
	exit_price: "exitPrice",
	exitprice: "exitPrice",
	close_price: "exitPrice",
	closeprice: "exitPrice",

	// Position
	position_size: "positionSize",
	positionsize: "positionSize",
	size: "positionSize",
	quantity: "positionSize",
	qty: "positionSize",
	amount: "positionSize",
	contracts: "positionSize",

	// Risk Management
	stop_loss: "stopLoss",
	stoploss: "stopLoss",
	sl: "stopLoss",
	take_profit: "takeProfit",
	takeprofit: "takeProfit",
	tp: "takeProfit",
	// Note: plannedRiskAmount and plannedRMultiple are always calculated, not imported

	// Results
	pnl: "pnl",
	profit: "pnl",
	profit_loss: "pnl",
	profitloss: "pnl",
	realized_r: "realizedRMultiple",
	realizedr: "realizedRMultiple",
	r_multiple: "realizedRMultiple",
	rmultiple: "realizedRMultiple",

	// MFE/MAE
	mfe: "mfe",
	mae: "mae",
	max_favorable: "mfe",
	maxfavorable: "mfe",
	max_adverse: "mae",
	maxadverse: "mae",

	// Notes
	notes: "preTradeThoughts",
	pre_trade_thoughts: "preTradeThoughts",
	pretradethoughts: "preTradeThoughts",
	setup: "preTradeThoughts",
	post_trade_reflection: "postTradeReflection",
	posttradereflection: "postTradeReflection",
	reflection: "postTradeReflection",
	review: "postTradeReflection",
	lesson: "lessonLearned",
	lessonlearned: "lessonLearned",
	lesson_learned: "lessonLearned",

	// Compliance
	followed_plan: "followedPlan",
	followedplan: "followedPlan",
	discipline: "followedPlan",
	discipline_notes: "disciplineNotes",
	disciplinenotes: "disciplineNotes",
}

// Strategy column mappings (separate because it's not part of CreateTradeInput)
const STRATEGY_COLUMN_NAMES = [
	"strategy",
	"strategy_code",
	"strategycode",
	"strat",
]

// Timeframe column mappings (separate because it's resolved to timeframeId during import)
const TIMEFRAME_COLUMN_NAMES = ["timeframe", "tf", "time_frame"]

// Tag column mappings (separate because tags are resolved by name during import)
const TAG_COLUMN_NAMES = ["tags", "tag", "labels"]

const REQUIRED_FIELDS: Array<keyof CreateTradeInput> = [
	"asset",
	"direction",
	"entryDate",
	"entryPrice",
	"positionSize",
]

// ProfitChart required fields (different from standard)
const PROFITCHART_REQUIRED_FIELDS: ProfitChartField[] = [
	"pc_asset",
	"pc_openDateTime",
	"pc_side",
	"pc_buyPrice",
	"pc_sellPrice",
]

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

const parseDirection = (value: string): "long" | "short" | null => {
	const normalized = value.toLowerCase().trim()
	if (normalized === "long" || normalized === "buy") return "long"
	if (normalized === "short" || normalized === "sell") return "short"
	return null
}

// Parse ProfitChart side (C = Compra/Buy/Long, V = Venda/Sell/Short)
const parseProfitChartSide = (value: string): "long" | "short" | null => {
	const normalized = value.toUpperCase().trim()
	if (normalized === "C") return "long"
	if (normalized === "V") return "short"
	return null
}

/** Pad a number to 2 digits for ISO date construction */
const pad2 = (n: number): string => String(n).padStart(2, "0")

/**
 * Parse date strings in various standard formats.
 * All times are interpreted as BRT (UTC-3) since this app is for B3 trading.
 * We construct ISO strings with the BRT offset to avoid system timezone dependency.
 */
const parseDate = (value: string): Date | null => {
	if (!value) return null

	// Try ISO format first — if it already has timezone info, respect it
	if (
		value.includes("T") &&
		(value.includes("Z") || value.includes("+") || /T.*-\d{2}:/.test(value))
	) {
		const date = new Date(value)
		if (!isNaN(date.getTime())) return date
	}

	// Try date+time formats first (before date-only)
	const dateTimeFormats = [
		/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/, // YYYY-MM-DD HH:MM[:SS]
		/^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/, // YYYY-MM-DDTHH:MM[:SS] (no tz)
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/, // MM/DD/YYYY HH:MM[:SS]
		/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/, // MM-DD-YYYY HH:MM[:SS]
	]

	for (const fmt of dateTimeFormats) {
		const match = value.match(fmt)
		if (match) {
			const [, p1, p2, p3, hours, minutes, seconds] = match
			const h = parseInt(hours)
			const m = parseInt(minutes)
			const s = seconds ? parseInt(seconds) : 0

			let year: number, month: number, day: number
			if (p1.length === 4) {
				year = parseInt(p1)
				month = parseInt(p2)
				day = parseInt(p3)
			} else if (p3.length === 4) {
				year = parseInt(p3)
				month = parseInt(p1)
				day = parseInt(p2)
			} else {
				continue
			}

			const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(h)}:${pad2(m)}:${pad2(s)}${BRT_OFFSET}`
			const date = new Date(iso)
			if (!isNaN(date.getTime())) return date
		}
	}

	// Try date-only formats — midnight BRT
	const dateOnlyFormats = [
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
		/^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
		/^(\d{1,2})-(\d{1,2})-(\d{4})$/, // MM-DD-YYYY or DD-MM-YYYY
	]

	for (const fmt of dateOnlyFormats) {
		const match = value.match(fmt)
		if (match) {
			const [, part1, part2, part3] = match
			let year: number, month: number, day: number
			if (part1.length === 4) {
				year = parseInt(part1)
				month = parseInt(part2)
				day = parseInt(part3)
			} else if (part3.length === 4) {
				year = parseInt(part3)
				month = parseInt(part1)
				day = parseInt(part2)
			} else {
				continue
			}

			const iso = `${year}-${pad2(month)}-${pad2(day)}T00:00:00${BRT_OFFSET}`
			const date = new Date(iso)
			if (!isNaN(date.getTime())) return date
		}
	}

	return null
}

/**
 * Parse Brazilian date/time format: DD/MM/YYYY HH:MM:SS
 * Times from ProfitChart are in BRT (America/Sao_Paulo, UTC-3).
 * We construct an ISO string with BRT_OFFSET so the resulting Date
 * stores the correct UTC instant regardless of the server's local timezone.
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

const parseNumber = (value: string): number | null => {
	if (!value) return null
	// Remove currency symbols and commas
	const cleaned = value.replace(/[$,€£]/g, "").trim()
	const num = parseFloat(cleaned)
	return isNaN(num) ? null : num
}

// Parse Brazilian number format: 1.234,56 (dots for thousands, comma for decimals)
const parseBrazilianNumber = (value: string): number | null => {
	if (!value || value === "-") return null
	// Remove thousand separators (dots) and replace decimal comma with dot
	const cleaned = value.replace(/\./g, "").replace(",", ".").trim()
	const num = parseFloat(cleaned)
	return isNaN(num) ? null : num
}

const parseBoolean = (value: string): boolean | null => {
	const normalized = value.toLowerCase().trim()
	if (["true", "yes", "1", "y", "sim"].includes(normalized)) return true
	if (["false", "no", "0", "n", "não", "nao"].includes(normalized)) return false
	return null
}

// Detect CSV delimiter (comma or semicolon) by analyzing multiple lines
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

// Detect if the CSV is in ProfitChart format
const isProfitChartFormat = (headers: string[]): boolean => {
	const normalizedHeaders = headers.map(normalizeHeader)
	const matchCount = PROFITCHART_INDICATOR_HEADERS.filter((indicator) =>
		normalizedHeaders.some((h) => h.includes(indicator))
	).length
	// If we match at least 3 of the 4 indicators, it's ProfitChart format
	return matchCount >= 3
}

// Find the actual header row in ProfitChart format (skip metadata rows)
const findHeaderRow = (lines: string[], delimiter: string): number => {
	for (let i = 0; i < Math.min(lines.length, 10); i++) {
		const line = lines[i]
		const values = line.split(delimiter)
		const normalizedValues = values.map(normalizeHeader)

		// Check if this line contains ProfitChart headers
		const hasAtivoHeader = normalizedValues.some((v) => v === "ativo")
		const hasAberturaHeader = normalizedValues.some((v) => v === "abertura")

		if (hasAtivoHeader && hasAberturaHeader) {
			return i
		}
	}
	return 0 // Fallback to first line
}

// Strip [R] replay prefix from asset codes (e.g., "[R] WING26" → "WING26")
const stripReplayPrefix = (
	assetCode: string
): { cleanAsset: string; isReplay: boolean } => {
	const trimmed = assetCode.trim()
	const match = trimmed.match(/^\[R\]\s*(.+)$/)
	if (match) return { cleanAsset: match[1].trim(), isReplay: true }
	return { cleanAsset: trimmed, isReplay: false }
}

export const parseCsvContent = (content: string): CsvParseResult => {
	const result: CsvParseResult = {
		success: true,
		trades: [],
		errors: [],
		warnings: [],
	}

	// Split into lines and handle different line endings
	const lines = content.split(/\r?\n/).filter((line) => line.trim())

	if (lines.length < 2) {
		result.success = false
		result.errors.push({
			row: 0,
			field: "file",
			message: "imports.errors.csvMinRows",
		})
		return result
	}

	// Detect delimiter from multiple lines (handles metadata rows)
	const delimiter = detectDelimiter(lines)

	// Find the actual header row (ProfitChart has metadata rows before headers)
	const headerRowIndex = findHeaderRow(lines, delimiter)

	// Parse header row
	const headerLine = lines[headerRowIndex]
	const headers = parseCSVLine(headerLine, delimiter).map(normalizeHeader)

	// Check if this is ProfitChart format
	const isProfitChart = isProfitChartFormat(headers)

	if (isProfitChart) {
		return parseProfitChartContent(
			lines,
			headerRowIndex,
			headers,
			delimiter,
			result
		)
	}

	// Standard format parsing
	return parseStandardContent(lines, headers, delimiter, result)
}

// Parse ProfitChart specific format
const parseProfitChartContent = (
	lines: string[],
	headerRowIndex: number,
	headers: string[],
	delimiter: string,
	result: CsvParseResult
): CsvParseResult => {
	// Map headers to ProfitChart fields
	const columnMap: Array<{ index: number; field: ProfitChartField }> = []
	const unmappedHeaders: string[] = []

	for (const [index, header] of headers.entries()) {
		const field = PROFITCHART_COLUMN_MAPPINGS[header]
		if (field) {
			columnMap.push({ index, field })
		} else if (header && header !== "") {
			unmappedHeaders.push(header)
		}
	}

	// Check for required ProfitChart fields
	const mappedFields = columnMap.map((c) => c.field)
	const missingRequired = PROFITCHART_REQUIRED_FIELDS.filter(
		(f) => !mappedFields.includes(f)
	)

	if (missingRequired.length > 0) {
		result.success = false
		const missingReadable = missingRequired.map((f) => {
			const readableNames: Record<ProfitChartField, string> = {
				pc_asset: "Ativo",
				pc_openDateTime: "Abertura",
				pc_closeDateTime: "Fechamento",
				pc_side: "Lado",
				pc_buyQty: "Qtd Compra",
				pc_sellQty: "Qtd Venda",
				pc_buyPrice: "Preço Compra",
				pc_sellPrice: "Preço Venda",
				pc_pnl: "Res. Operação",
				pc_mfe: "Ganho Max.",
				pc_mae: "Perda Max.",
			}
			return readableNames[f] || f
		})
		result.errors.push({
			row: headerRowIndex + 1,
			field: "headers",
			message: `imports.errors.missingRequiredColumns|${missingReadable.join(", ")}`,
		})
		return result
	}

	// Warn about ignored columns
	if (unmappedHeaders.length > 0) {
		result.warnings.push({
			row: headerRowIndex + 1,
			message: `imports.warnings.ignoredColumns|${unmappedHeaders.slice(0, 5).join(", ")}${unmappedHeaders.length > 5 ? `|${unmappedHeaders.length - 5}` : ""}`,
		})
	}

	// Parse data rows (starting after header row)
	for (let i = headerRowIndex + 1; i < lines.length; i++) {
		const rowNumber = i + 1
		const line = lines[i].trim()

		if (!line) continue

		const values = parseCSVLine(line, delimiter)

		// Extract raw values
		const rawData: Partial<Record<ProfitChartField, string>> = {}
		for (const { index, field } of columnMap) {
			rawData[field] = values[index]?.trim() || ""
		}

		// Skip rows without essential data
		if (!rawData.pc_asset || !rawData.pc_side) {
			continue
		}

		// Parse side first (determines price logic)
		const direction = parseProfitChartSide(rawData.pc_side || "")
		if (!direction) {
			result.errors.push({
				row: rowNumber,
				field: "direction",
				message: `imports.errors.invalidSide|${rawData.pc_side}`,
			})
			continue
		}

		// Parse dates
		const entryDate = parseBrazilianDateTime(rawData.pc_openDateTime || "")
		if (!entryDate) {
			result.errors.push({
				row: rowNumber,
				field: "entryDate",
				message: `imports.errors.invalidEntryDate|${rawData.pc_openDateTime}`,
			})
			continue
		}

		const exitDate = parseBrazilianDateTime(rawData.pc_closeDateTime || "")

		// Parse prices based on direction
		// Long (C/Compra): Buy = Entry, Sell = Exit
		// Short (V/Venda): Sell = Entry, Buy = Exit
		const buyPrice = parseBrazilianNumber(rawData.pc_buyPrice || "")
		const sellPrice = parseBrazilianNumber(rawData.pc_sellPrice || "")

		let entryPrice: number | null
		let exitPrice: number | null

		if (direction === "long") {
			entryPrice = buyPrice
			exitPrice = sellPrice
		} else {
			entryPrice = sellPrice
			exitPrice = buyPrice
		}

		if (entryPrice === null) {
			result.errors.push({
				row: rowNumber,
				field: "entryPrice",
				message: "imports.errors.invalidEntryPrice",
			})
			continue
		}

		// Parse quantity (use buy or sell qty based on direction)
		const buyQty = parseBrazilianNumber(rawData.pc_buyQty || "")
		const sellQty = parseBrazilianNumber(rawData.pc_sellQty || "")
		const positionSize = direction === "long" ? buyQty : sellQty

		if (positionSize === null || positionSize <= 0) {
			result.errors.push({
				row: rowNumber,
				field: "positionSize",
				message: "imports.errors.invalidPositionSize",
			})
			continue
		}

		// Parse PnL
		const pnl = parseBrazilianNumber(rawData.pc_pnl || "")

		// Parse MFE/MAE
		const mfe = parseBrazilianNumber(rawData.pc_mfe || "")
		const mae = parseBrazilianNumber(rawData.pc_mae || "")

		// Strip [R] replay prefix before normalizing asset
		const { cleanAsset, isReplay } = stripReplayPrefix(rawData.pc_asset || "")
		const assetInfo = normalizeB3Asset(cleanAsset)

		// Build trade object
		const trade: CsvTradeInput = {
			asset: assetInfo.normalizedSymbol, // Use normalized symbol (WIN, WDO, etc.)
			direction,
			entryDate,
			entryPrice,
			positionSize,
			// Asset normalization fields
			normalizedAsset: assetInfo.normalizedSymbol,
			originalAssetCode: assetInfo.originalCode,
			isFutures: assetInfo.isFutures,
			isReplayTrade: isReplay,
		}

		if (exitDate) trade.exitDate = exitDate
		if (exitPrice !== null && exitPrice !== 0) trade.exitPrice = exitPrice
		if (pnl !== null) trade.pnl = pnl
		if (mfe !== null && mfe > 0) trade.mfe = mfe
		if (mae !== null && mae < 0) trade.mae = Math.abs(mae) // MAE should be positive in our system

		result.trades.push(trade)
	}

	if (result.errors.length > 0 && result.trades.length === 0) {
		result.success = false
	}

	return result
}

// Parse standard CSV format
const parseStandardContent = (
	lines: string[],
	headers: string[],
	delimiter: string,
	result: CsvParseResult
): CsvParseResult => {
	// Map headers to fields
	const columnMap: Array<{ index: number; field: keyof CreateTradeInput }> = []
	const unmappedHeaders: string[] = []
	let strategyColumnIndex: number | null = null
	let timeframeColumnIndex: number | null = null
	let tagColumnIndex: number | null = null

	for (const [index, header] of headers.entries()) {
		// Check if it's a strategy column
		if (STRATEGY_COLUMN_NAMES.includes(header)) {
			strategyColumnIndex = index
			continue
		}

		// Check if it's a timeframe column
		if (TIMEFRAME_COLUMN_NAMES.includes(header)) {
			timeframeColumnIndex = index
			continue
		}

		// Check if it's a tag column
		if (TAG_COLUMN_NAMES.includes(header)) {
			tagColumnIndex = index
			continue
		}

		const field = COLUMN_MAPPINGS[header]
		if (field) {
			columnMap.push({ index, field })
		} else if (header) {
			unmappedHeaders.push(header)
		}
	}

	// Check for required fields
	const mappedFields = columnMap.map((c) => c.field)
	const missingRequired = REQUIRED_FIELDS.filter(
		(f) => !mappedFields.includes(f)
	)

	if (missingRequired.length > 0) {
		result.success = false
		result.errors.push({
			row: 1,
			field: "headers",
			message: `imports.errors.missingRequiredColumns|${missingRequired.join(", ")}`,
		})
		return result
	}

	// Warn about unmapped headers
	if (unmappedHeaders.length > 0) {
		result.warnings.push({
			row: 1,
			message: `imports.warnings.ignoredColumns|${unmappedHeaders.join(", ")}`,
		})
	}

	// Parse data rows
	for (let i = 1; i < lines.length; i++) {
		const rowNumber = i + 1
		const line = lines[i].trim()

		if (!line) continue

		const values = parseCSVLine(line, delimiter)
		const trade: Partial<CsvTradeInput> = {}
		let rowHasErrors = false

		// Extract strategy code if column exists
		if (strategyColumnIndex !== null) {
			const strategyCode = values[strategyColumnIndex]?.trim().toUpperCase()
			if (strategyCode) {
				trade.strategyCode = strategyCode
			}
		}

		// Extract timeframe code if column exists
		if (timeframeColumnIndex !== null) {
			const timeframeCode = values[timeframeColumnIndex]?.trim().toUpperCase()
			if (timeframeCode) {
				trade.timeframeCode = timeframeCode
			}
		}

		// Extract tag names if column exists (comma or pipe-separated)
		if (tagColumnIndex !== null) {
			const tagValue = values[tagColumnIndex]?.trim()
			if (tagValue) {
				trade.tagNames = tagValue
					.split(/[,|]/)
					.map((t) => t.trim())
					.filter(Boolean)
			}
		}

		for (const { index, field } of columnMap) {
			const value = values[index]?.trim() || ""

			if (!value) {
				if (REQUIRED_FIELDS.includes(field)) {
					result.errors.push({
						row: rowNumber,
						field,
						message: `imports.errors.fieldRequired|${field}`,
					})
					rowHasErrors = true
				}
				continue
			}

			// Parse based on field type
			switch (field) {
				case "asset": {
					// Strip [R] replay prefix before normalizing asset
					const { cleanAsset, isReplay } = stripReplayPrefix(value)
					const assetInfo = normalizeB3Asset(cleanAsset)
					trade.asset = assetInfo.normalizedSymbol
					trade.normalizedAsset = assetInfo.normalizedSymbol
					trade.originalAssetCode = assetInfo.originalCode
					trade.isFutures = assetInfo.isFutures
					trade.isReplayTrade = isReplay
					break
				}

				case "direction": {
					const direction = parseDirection(value)
					if (direction) {
						trade.direction = direction
					} else {
						result.errors.push({
							row: rowNumber,
							field,
							message: `imports.errors.invalidDirection|${value}`,
						})
						rowHasErrors = true
					}
					break
				}

				case "entryDate":
				case "exitDate": {
					const date = parseDate(value)
					if (date) {
						trade[field] = date
					} else {
						if (field === "entryDate") {
							result.errors.push({
								row: rowNumber,
								field,
								message: `imports.errors.invalidDateFormat|${value}`,
							})
							rowHasErrors = true
						} else {
							result.warnings.push({
								row: rowNumber,
								message: `imports.warnings.invalidExitDate|${value}`,
							})
						}
					}
					break
				}

				case "entryPrice":
				case "exitPrice":
				case "positionSize":
				case "stopLoss":
				case "takeProfit":
				case "pnl":
				case "realizedRMultiple":
				case "mfe":
				case "mae": {
					const num = parseNumber(value)
					if (num !== null) {
						trade[field] = num
					} else {
						if (REQUIRED_FIELDS.includes(field)) {
							result.errors.push({
								row: rowNumber,
								field,
								message: `imports.errors.invalidNumber|${value}`,
							})
							rowHasErrors = true
						} else {
							result.warnings.push({
								row: rowNumber,
								message: `imports.warnings.invalidNumberField|${field}|${value}`,
							})
						}
					}
					break
				}

				case "followedPlan": {
					const bool = parseBoolean(value)
					if (bool !== null) {
						trade.followedPlan = bool
					}
					break
				}

				case "preTradeThoughts":
				case "postTradeReflection":
				case "lessonLearned":
				case "disciplineNotes":
					trade[field] = value
					break
			}
		}

		if (!rowHasErrors) {
			result.trades.push(trade as CsvTradeInput)
		}
	}

	if (result.errors.length > 0) {
		result.success = false
	}

	return result
}

// Parse a single CSV line handling quoted values
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

// Generate a sample CSV template
export const generateCsvTemplate = (): string => {
	const headers = [
		"asset",
		"direction",
		"entry_date",
		"exit_date",
		"entry_price",
		"exit_price",
		"position_size",
		"stop_loss",
		"take_profit",
		"pnl",
		"strategy",
		"timeframe",
		"tags",
		"notes",
		"followed_plan",
	]

	const sampleRow = [
		"BTCUSD",
		"long",
		"2024-01-15 09:30:00",
		"2024-01-15 14:45:00",
		"42000",
		"43500",
		"0.5",
		"41000",
		"44000",
		"750",
		"Breakout",
		"4h",
		'"trend,breakout"',
		"Breakout setup",
		"yes",
	]

	return `${headers.join(",")}\n${sampleRow.join(",")}`
}
