/**
 * XP Broker CSV Parser
 * Parses: Data,Hora,Ativo,Operação,Quantidade,Preço,Corretagem
 * Example: 25/02/2026,09:15:30,WIN,COMPRA,2,5200.00,15.00
 */

import type { RawExecution } from "./types"

interface XPCsvRow {
	data: string // DD/MM/YYYY
	hora: string // HH:MM:SS
	ativo: string // e.g., WIN, WDO, PETR4
	operacao: string // COMPRA or VENDA
	quantidade: string // e.g., "2"
	preco: string // 5200.00 or 5.200,00
	corretagem: string // Commission
}

interface ParseXPCSVOptions {
	delimiter?: string // "," or ";"
}

/**
 * Parse Brazilian number format: 1.234,56 or 1234.56
 */
const parseBrazilianNumber = (value: string): number => {
	if (!value || value === "-" || value === "0") return 0

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

	// Only dot present
	if (trimmed.includes(".") && !trimmed.includes(",")) {
		const parts = trimmed.split(".")
		const afterDot = parts[parts.length - 1]
		if (afterDot.length > 2) {
			return parseFloat(parts.join(""))
		} else {
			return parseFloat(parts.join(""))
		}
	}

	return parseFloat(trimmed)
}

/**
 * Parse XP date format: DD/MM/YYYY
 */
const parseXPDate = (dateStr: string): string => {
	return dateStr.trim()
}

/**
 * Parse XP operation type
 */
const parseOperationType = (operacao: string): "BUY" | "SELL" => {
	const normalized = operacao.toUpperCase().trim()
	if (normalized === "COMPRA" || normalized === "C") return "BUY"
	if (normalized === "VENDA" || normalized === "V") return "SELL"
	return "BUY"
}

/**
 * Detect CSV delimiter
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
 * Map header row to XP CSV columns
 */
const mapHeadersToColumns = (
	headers: string[]
): Record<keyof XPCsvRow, number> => {
	const headerMap: Partial<Record<keyof XPCsvRow, number>> = {}

	const headerNames: Record<keyof XPCsvRow, string[]> = {
		data: ["data", "date", "data da operação"],
		hora: ["hora", "time", "horário"],
		ativo: ["ativo", "asset", "symbol"],
		operacao: ["operação", "operacao", "type", "operation"],
		quantidade: ["quantidade", "qty", "qtd", "contracts"],
		preco: ["preço", "preco", "price"],
		corretagem: ["corretagem", "brokerage", "commission", "taxa"],
	}

	for (const [key, names] of Object.entries(headerNames)) {
		const normalizedNames = names.map((n) =>
			n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		)

		for (let i = 0; i < headers.length; i++) {
			const normalizedHeader = headers[i]
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")

			if (normalizedNames.includes(normalizedHeader)) {
				headerMap[key as keyof XPCsvRow] = i
				break
			}
		}
	}

	return headerMap as Record<keyof XPCsvRow, number>
}

/**
 * Parse XP broker CSV statement.
 * Returns array of raw executions.
 */
export const parseXPCSV = (
	csvContent: string,
	options: ParseXPCSVOptions = {}
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
		h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
	)

	const columnMap = mapHeadersToColumns(headers)

	// Verify required columns
	const requiredColumns: (keyof XPCsvRow)[] = [
		"data",
		"hora",
		"ativo",
		"operacao",
		"quantidade",
		"preco",
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

	// Parse data rows
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]
		if (!line) continue

		const values = parseCSVLine(line, delimiter)

		try {
			const row: Partial<XPCsvRow> = {}

			for (const [key, columnIndex] of Object.entries(columnMap)) {
				const columnIdx = columnIndex as number
				row[key as keyof XPCsvRow] = values[columnIdx] || ""
			}

			// Skip empty rows
			if (!row.ativo) continue

			// Parse fields
			const date = parseXPDate(row.data || "")
			const time = (row.hora || "").trim()
			const asset = (row.ativo || "").trim().toUpperCase()
			const side = parseOperationType(row.operacao || "")
			const quantity = parseBrazilianNumber(row.quantidade || "0")
			const price = parseBrazilianNumber(row.preco || "0")
			const commission = parseBrazilianNumber(row.corretagem || "0")

			// Skip if essential data missing
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
				broker: "XP",
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
 * Validate XP CSV structure
 */
export const validateXPCSV = (
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
