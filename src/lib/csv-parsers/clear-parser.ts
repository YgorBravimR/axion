/**
 * Clear Broker CSV Parser
 * Parses: Data,Hora,Tipo,Ativo,Quantidade,Preço,Juros,Corretagem,Liquidação,Observações
 * Example: 25/02/2026,09:15:30,COMPRA,WIN,2,5200.00,0,15.00,25/02/2026,
 */

import type { RawExecution } from "./types"

interface ClearCsvRow {
	data: string // DD/MM/YYYY
	hora: string // HH:MM:SS
	tipo: string // COMPRA or VENDA
	ativo: string // e.g., WIN, WDO, PETR4
	quantidade: string // e.g., "2"
	preço: string // Brazilian format: 5200.00 or 5.200,00
	juros?: string // Interest (usually 0)
	corretagem: string // Brokerage fee
	liquidacao?: string // Settlement date
	observações?: string // Notes
}

interface ParseClearCSVOptions {
	delimiter?: string // "," or ";"
}

/**
 * Parse Brazilian number format: can be 1.234,56 (common) or 1234.56 (common in exports)
 * Handles both formats gracefully.
 */
const parseBrazilianNumber = (value: string): number => {
	if (!value || value === "-" || value === "0") {
		return 0
	}

	const trimmed = value.trim()

	// If it contains both . and ,, use the last occurrence to determine decimal separator
	if (trimmed.includes(".") && trimmed.includes(",")) {
		const lastDot = trimmed.lastIndexOf(".")
		const lastComma = trimmed.lastIndexOf(",")

		if (lastComma > lastDot) {
			// comma is decimal: 1.234,56 → 1234.56
			return parseFloat(trimmed.replace(/\./g, "").replace(",", "."))
		} else {
			// dot is decimal: 1,234.56 → 1234.56
			return parseFloat(trimmed.replace(/,/g, ""))
		}
	}

	// Only comma present: assume decimal separator
	if (trimmed.includes(",") && !trimmed.includes(".")) {
		return parseFloat(trimmed.replace(",", "."))
	}

	// Only dot present: could be thousands or decimal
	if (trimmed.includes(".") && !trimmed.includes(",")) {
		// If more than 3 digits after last dot, it's decimal
		const parts = trimmed.split(".")
		const afterDot = parts[parts.length - 1]
		if (afterDot.length > 2) {
			// Likely decimal, remove all other dots
			return parseFloat(parts.join(""))
		} else {
			// Likely thousands separator
			return parseFloat(parts.join(""))
		}
	}

	return parseFloat(trimmed)
}

/**
 * Parse Clear CSV date format: DD/MM/YYYY
 */
const parseClearDate = (dateStr: string): string => {
	// Already in DD/MM/YYYY format or ISO, return as-is
	return dateStr.trim()
}

/**
 * Parse Clear operation type and determine BUY/SELL side
 */
const parseOperationType = (tipo: string): "BUY" | "SELL" => {
	const normalized = tipo.toUpperCase().trim()
	if (normalized === "COMPRA") {
		return "BUY"
	}
	if (normalized === "VENDA") {
		return "SELL"
	}
	// Default to BUY if unclear
	return "BUY"
}

/**
 * Detect CSV delimiter by sampling first 5 lines
 */
const detectDelimiter = (csvContent: string): string => {
	const lines = csvContent.split("\n").slice(0, 5)
	let commaCount = 0
	let semicolonCount = 0

	for (const line of lines) {
		commaCount += (line.match(/,/g) || []).length
		semicolonCount += (line.match(/;/g) || []).length
	}

	return semicolonCount > commaCount ? ";" : ","
}

/**
 * Parse CSV line handling quoted values
 */
const parseCSVLine = (line: string, delimiter: string): string[] => {
	const result: string[] = []
	let current = ""
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const char = line[i]
		const nextChar = line[i + 1]

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				current += '"'
				i++
			} else {
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

/**
 * Map header row to Clear CSV columns
 */
const mapHeadersToColumns = (
	headers: string[]
): Record<keyof ClearCsvRow, number> => {
	const headerMap: Partial<Record<keyof ClearCsvRow, number>> = {}

	const headerNames: Record<keyof ClearCsvRow, string[]> = {
		data: ["data", "date", "data da operação"],
		hora: ["hora", "time", "horário"],
		tipo: ["tipo", "operação", "type"],
		ativo: ["ativo", "asset", "symbol"],
		quantidade: ["quantidade", "qty", "qtd", "contracts"],
		preço: ["preço", "price", "preco"],
		juros: ["juros", "interest"],
		corretagem: ["corretagem", "brokerage", "commission"],
		liquidacao: ["liquidação", "settlement", "liquidacao"],
		observações: ["observações", "notes", "observacoes"],
	}

	for (const [key, names] of Object.entries(headerNames)) {
		const normalizedNames = names.map((n) =>
			n
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
		)

		for (let i = 0; i < headers.length; i++) {
			const normalizedHeader = headers[i]
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")

			if (normalizedNames.includes(normalizedHeader)) {
				headerMap[key as keyof ClearCsvRow] = i
				break
			}
		}
	}

	return headerMap as Record<keyof ClearCsvRow, number>
}

/**
 * Parse Clear broker CSV statement.
 * Returns array of raw executions (one per row).
 */
export const parseClearCSV = (
	csvContent: string,
	options: ParseClearCSVOptions = {}
): RawExecution[] => {
	const delimiter = options.delimiter || detectDelimiter(csvContent)
	const lines = csvContent
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)

	if (lines.length < 2) {
		throw new Error("imports.errors.csvMinRows")
	}

	// Parse header row
	const headerLine = lines[0]
	const headers = parseCSVLine(headerLine, delimiter).map((h) =>
		h
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
	)

	const columnMap = mapHeadersToColumns(headers)

	// Verify required columns exist
	const requiredColumns: (keyof ClearCsvRow)[] = [
		"data",
		"hora",
		"tipo",
		"ativo",
		"quantidade",
		"preço",
		"corretagem",
	]
	for (const col of requiredColumns) {
		if (columnMap[col] === undefined) {
			throw new Error(
				`imports.errors.missingRequiredColumn|${col}|${headers.join(", ")}`
			)
		}
	}

	const executions: RawExecution[] = []

	// Parse data rows (starting from row 1)
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]
		if (!line) {
			continue
		}

		const values = parseCSVLine(line, delimiter)

		try {
			const row: Partial<ClearCsvRow> = {}

			for (const [key, columnIndex] of Object.entries(columnMap)) {
				const columnIdx = columnIndex as number
				row[key as keyof ClearCsvRow] = values[columnIdx] || ""
			}

			// Skip empty rows
			if (!row.ativo) {
				continue
			}

			// Parse required fields
			const date = parseClearDate(row.data || "")
			const time = (row.hora || "").trim()
			const asset = (row.ativo || "").trim().toUpperCase()
			const side = parseOperationType(row.tipo || "")
			const quantity = parseBrazilianNumber(row.quantidade || "0")
			const price = parseBrazilianNumber(row.preço || "0")
			const commission = parseBrazilianNumber(row.corretagem || "0")

			// Skip if essential data is missing
			if (!date || !time || !asset || quantity <= 0 || price <= 0) {
				continue
			}

			executions.push({
				date,
				time,
				asset,
				side,
				quantity,
				price,
				commission,
				broker: "CLEAR",
				rawDate: row.data,
				rawTime: row.hora,
			})
		} catch {
			// Skip malformed rows
			continue
		}
	}

	if (executions.length === 0) {
		throw new Error("imports.errors.noValidExecutions")
	}

	return executions
}

/**
 * Validate Clear CSV structure before parsing
 * Returns { valid, error? }
 */
export const validateClearCSV = (
	csvContent: string
): { valid: boolean; error?: string } => {
	try {
		const delimiter = detectDelimiter(csvContent)
		const lines = csvContent
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)

		if (lines.length < 2) {
			return { valid: false, error: "imports.errors.csvMinRows" }
		}

		const headers = parseCSVLine(lines[0], delimiter)
		if (headers.length < 7) {
			return {
				valid: false,
				error: `imports.errors.expectedMinColumns|7|${headers.length}`,
			}
		}

		return { valid: true }
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Unknown error",
		}
	}
}
