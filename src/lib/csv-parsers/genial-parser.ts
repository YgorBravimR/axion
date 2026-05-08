/**
 * Genial Broker CSV Parser
 * Parses: Data,Horário,Ativo,Tipo de Operação,Qtde,Preço Unit.,Corretagem
 * Example: 25/02/2026,09:15:30,WIN,COMPRA,2,5200.00,15.00
 */

import type { RawExecution } from "./types"

interface GenialCsvRow {
	data: string // DD/MM/YYYY
	horario: string // HH:MM:SS
	ativo: string // e.g., WIN, WDO, PETR4
	tipoOperacao: string // COMPRA or VENDA
	qtde: string // Quantity
	precoUnit: string // Unit price
	corretagem: string // Brokerage fee
}

interface ParseGenialCSVOptions {
	delimiter?: string
}

/**
 * Parse Brazilian number format
 */
const parseBrazilianNumber = (value: string): number => {
	if (!value || value === "-" || value === "0") {
		return 0
	}

	const trimmed = value.trim()

	if (trimmed.includes(".") && trimmed.includes(",")) {
		const lastDot = trimmed.lastIndexOf(".")
		const lastComma = trimmed.lastIndexOf(",")

		if (lastComma > lastDot) {
			return parseFloat(trimmed.replace(/\./g, "").replace(",", "."))
		} else {
			return parseFloat(trimmed.replace(/,/g, ""))
		}
	}

	if (trimmed.includes(",") && !trimmed.includes(".")) {
		return parseFloat(trimmed.replace(",", "."))
	}

	if (trimmed.includes(".") && !trimmed.includes(",")) {
		const parts = trimmed.split(".")
		const afterDot = parts[parts.length - 1]!
		if (afterDot.length > 2) {
			return parseFloat(parts.join(""))
		} else {
			return parseFloat(parts.join(""))
		}
	}

	return parseFloat(trimmed)
}

/**
 * Parse Genial date
 */
const parseGenialDate = (dateStr: string): string => {
	return dateStr.trim()
}

/**
 * Parse operation type
 */
const parseOperationType = (tipoOperacao: string): "BUY" | "SELL" => {
	const normalized = tipoOperacao.toUpperCase().trim()
	if (normalized === "COMPRA" || normalized === "C") {
		return "BUY"
	}
	if (normalized === "VENDA" || normalized === "V") {
		return "SELL"
	}
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
 * Parse CSV line
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
 * Map headers to Genial columns
 */
const mapHeadersToColumns = (
	headers: string[]
): Record<keyof GenialCsvRow, number> => {
	const headerMap: Partial<Record<keyof GenialCsvRow, number>> = {}

	const headerNames: Record<keyof GenialCsvRow, string[]> = {
		data: ["data", "date"],
		horario: ["horário", "horario", "time"],
		ativo: ["ativo", "asset", "symbol"],
		tipoOperacao: [
			"tipo de operação",
			"tipo de operacao",
			"operação",
			"operacao",
			"type",
		],
		qtde: ["qtde", "quantidade", "qty", "contracts"],
		precoUnit: [
			"preço unit",
			"preco unit",
			"preço unitário",
			"preco unitario",
			"price",
		],
		corretagem: ["corretagem", "brokerage", "commission", "taxa"],
	}

	for (const [key, names] of Object.entries(headerNames)) {
		const normalizedNames = names.map((n) =>
			n
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
		)

		for (let i = 0; i < headers.length; i++) {
			const normalizedHeader = headers[i]!.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")

			if (normalizedNames.includes(normalizedHeader)) {
				headerMap[key as keyof GenialCsvRow] = i
				break
			}
		}
	}

	return headerMap as Record<keyof GenialCsvRow, number>
}

/**
 * Parse Genial broker CSV statement
 */
export const parseGenialCSV = (
	csvContent: string,
	options: ParseGenialCSVOptions = {}
): RawExecution[] => {
	const delimiter = options.delimiter || detectDelimiter(csvContent)
	const lines = csvContent
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)

	if (lines.length < 2) {
		throw new Error("imports.errors.csvMinRows")
	}

	// Parse header
	const headerLine = lines[0]!
	const headers = parseCSVLine(headerLine, delimiter).map((h) =>
		h
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
	)

	const columnMap = mapHeadersToColumns(headers)

	// Verify required columns
	const requiredColumns: (keyof GenialCsvRow)[] = [
		"data",
		"horario",
		"ativo",
		"tipoOperacao",
		"qtde",
		"precoUnit",
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
		if (!line) {
			continue
		}

		const values = parseCSVLine(line, delimiter)

		try {
			const row: Partial<GenialCsvRow> = {}

			for (const [key, columnIndex] of Object.entries(columnMap)) {
				const columnIdx = columnIndex as number
				row[key as keyof GenialCsvRow] = values[columnIdx] || ""
			}

			// Skip empty rows
			if (!row.ativo) {
				continue
			}

			// Parse fields
			const date = parseGenialDate(row.data || "")
			const time = (row.horario || "").trim()
			const asset = (row.ativo || "").trim().toUpperCase()
			const side = parseOperationType(row.tipoOperacao || "")
			const quantity = parseBrazilianNumber(row.qtde || "0")
			const price = parseBrazilianNumber(row.precoUnit || "0")
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
				broker: "GENIAL",
				rawDate: row.data,
				rawTime: row.horario,
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
 * Validate Genial CSV
 */
export const validateGenialCSV = (
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

		const headers = parseCSVLine(lines[0]!, delimiter)
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
