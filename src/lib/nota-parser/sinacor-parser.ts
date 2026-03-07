/**
 * SINACOR Nota de Corretagem PDF Parser
 *
 * Parses text-based PDFs from any B3 broker that uses the SINACOR standard format.
 * Validated against real Genial Investimentos notas.
 *
 * pdf-parse v2 returns an object from getText() with:
 *   { pages: [{ text, num }], text, total }
 *
 * The text is tab-delimited (\t) with newline-separated rows (\n).
 */

import type { NotaFill, NotaParseResult } from "./types"

// B3 futures contract prefixes → normalized "FUT" suffix
const B3_FUT_PREFIXES = ["WIN", "WDO", "DOL", "IND", "BGI", "CCM", "ICF", "SFI", "DI1"]

// B3 month codes: F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec
const B3_MONTH_CODES = "FGHJKMN QUVXZ" // space at index 7 is intentional (no August letter at that position)

/**
 * Parse a Brazilian-format number: 183.975,0000 → 183975.0
 * Handles: dots as thousands, comma as decimal.
 * Also handles plain numbers like "0,00" or "6,00".
 */
const parseBrazilianNumber = (value: string): number => {
	if (!value || value.trim() === "-" || value.trim() === "") return 0

	const trimmed = value.trim()

	// If contains both . and , → dots are thousands, comma is decimal
	if (trimmed.includes(".") && trimmed.includes(",")) {
		const lastDot = trimmed.lastIndexOf(".")
		const lastComma = trimmed.lastIndexOf(",")

		if (lastComma > lastDot) {
			// 183.975,0000 → comma is decimal
			return parseFloat(trimmed.replace(/\./g, "").replace(",", "."))
		}
		// 1,234.56 → dot is decimal (US format, unlikely in SINACOR but handle gracefully)
		return parseFloat(trimmed.replace(/,/g, ""))
	}

	// Only comma: treat as decimal separator (e.g., "6,00" → 6.00)
	if (trimmed.includes(",") && !trimmed.includes(".")) {
		return parseFloat(trimmed.replace(",", "."))
	}

	return parseFloat(trimmed) || 0
}

/**
 * Normalize a SINACOR asset name to match the DB asset symbol.
 * Examples:
 *   "WIN G26"  → "WINFUT"  (futures contract with expiry code)
 *   "PETR4"    → "PETR4"   (stock, no change)
 *   "WDO H26"  → "WDOFUT"
 */
const normalizeAssetName = (rawAsset: string): string => {
	const parts = rawAsset.trim().split(/\s+/)

	if (parts.length === 1) {
		// Single token: could be stock (PETR4) or already normalized
		return parts[0].toUpperCase()
	}

	// Two tokens: e.g., "WIN G26" → base="WIN", expiryCode="G26"
	const base = parts[0].toUpperCase()
	const expiryCode = parts[1].toUpperCase()

	// Validate expiry code format: single letter + 2 digits (e.g., G26)
	const isExpiryCode = /^[A-Z]\d{2}$/.test(expiryCode)

	if (isExpiryCode && B3_FUT_PREFIXES.includes(base)) {
		return `${base}FUT`
	}

	// Unknown format, join as-is
	return parts.join("").toUpperCase()
}

/**
 * Parse the session date from the header.
 * Looks for pattern like "09/02/2026" after "Data pregão" context.
 */
const parseNotaDate = (text: string): Date | null => {
	// The first few lines contain: "1 \t09/02/2026\t417577"
	// or sometimes: "Data pregão\t...\t09/02/2026"
	const datePattern = /(\d{2}\/\d{2}\/\d{4})/g
	const matches = [...text.matchAll(datePattern)]

	// The nota date is typically the first date in the document (in the header area)
	// It appears in "1 \t09/02/2026\t417577" format
	for (const match of matches) {
		const [day, month, year] = match[1].split("/").map(Number)
		// Validate it's a reasonable trading date (not an expiry date far in the future)
		if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			// Return as BRT midnight (Brazil doesn't observe DST since 2019)
			return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00-03:00`)
		}
	}

	return null
}

/**
 * Extract the nota number from the header.
 * Pattern: "Nr. nota" followed by a number, or from the "1 \t09/02/2026\t417577" line.
 */
const parseNotaNumber = (text: string): string => {
	// Look for the line with page number, date, and nota number
	// Format: "1 \t09/02/2026\t417577"
	const headerLineMatch = text.match(/^\d+\s*\t\d{2}\/\d{2}\/\d{4}\t(\d+)/m)
	if (headerLineMatch) return headerLineMatch[1]

	// Fallback: look for "Nr. nota" followed by a number
	const nrNotaMatch = text.match(/Nr\.\s*nota\s*\n?\s*(\d+)/i)
	if (nrNotaMatch) return nrNotaMatch[1]

	return ""
}

/**
 * Extract broker name from the header.
 * Looks for known broker patterns or the "Corretora" line.
 */
const parseBrokerName = (text: string): string => {
	// Look for known broker name patterns
	const brokerPatterns = [
		/GENIAL\s+CCTVM\s+S\/A/i,
		/CLEAR\s+CORRETORA/i,
		/XP\s+INVESTIMENTOS/i,
		/RICO\s+INVESTIMENTOS/i,
		/BTG\s+PACTUAL/i,
		/INTER\s+DTVM/i,
		/NU\s+INVEST/i,
		/MODAL\s+DTVM/i,
	]

	for (const pattern of brokerPatterns) {
		const match = text.match(pattern)
		if (match) return match[0]
	}

	// Fallback: look for "Corretora" label followed by a name
	const corretoraMatch = text.match(/Corretora\s*\n\s*.*?\t([^\t\n]+)/i)
	if (corretoraMatch) return corretoraMatch[1].trim()

	return "Unknown Broker"
}

/**
 * Parse trade fill rows from the nota text.
 *
 * Trade rows appear after the header line containing "C/V" and before the
 * summary section starting with "Venda disponível".
 *
 * Each row is tab-separated:
 *   C/V | Mercadoria | Vencimento | Quantidade | Preço/ajuste | Obs.(*) | Tipo do negócio | Vlr. Operação | D/C | Taxa operacional
 *
 * Real example from pdf-parse output:
 *   "V \tWIN G26 \t18/02/2026 \t1 \t183.975,0000 \tDAY TRADE \t561,00 \tD \t0,00"
 */
const parseTradeRows = (text: string): { fills: NotaFill[]; warnings: string[] } => {
	const fills: NotaFill[] = []
	const warnings: string[] = []
	const lines = text.split("\n")

	let inTradeSection = false
	let sequenceNumber = 0

	for (const line of lines) {
		const trimmedLine = line.trim()

		// Detect start of trade section (header row)
		if (trimmedLine.startsWith("C/V")) {
			inTradeSection = true
			continue
		}

		// Detect end of trade section (summary starts)
		if (inTradeSection && trimmedLine.startsWith("Venda dispon")) {
			inTradeSection = false
			continue
		}

		if (!inTradeSection) continue

		// Split by tabs
		const columns = trimmedLine.split("\t").map((col) => col.trim())

		// Trade rows start with C or V
		const side = columns[0]
		if (side !== "C" && side !== "V") continue

		// Must have at least 9 columns for a valid trade row
		if (columns.length < 8) {
			warnings.push(`Row ${sequenceNumber + 1}: insufficient columns (${columns.length}), skipping`)
			continue
		}

		sequenceNumber++

		const rawAsset = columns[1] || ""
		const expiryDate = columns[2] || null
		const quantity = parseInt(columns[3] || "0", 10)
		const price = parseBrazilianNumber(columns[4] || "0")

		// Columns 5+ can shift depending on whether Obs.(*) is present
		// Look for "DAY TRADE" to identify the trade type column
		let isDayTrade = false
		let operationValue = 0
		let debitCredit: "D" | "C" = "D"
		let operationalFee = 0

		// Find DAY TRADE marker and parse remaining columns relative to it
		const dayTradeIndex = columns.findIndex((col) => col === "DAY TRADE")

		if (dayTradeIndex >= 0) {
			isDayTrade = true
			operationValue = parseBrazilianNumber(columns[dayTradeIndex + 1] || "0")
			debitCredit = columns[dayTradeIndex + 2] === "C" ? "C" : "D"
			operationalFee = parseBrazilianNumber(columns[dayTradeIndex + 3] || "0")
		} else {
			// No "DAY TRADE" — try parsing from the end
			// Last 3 columns: operationValue, D/C, operationalFee
			const lastIdx = columns.length - 1
			operationalFee = parseBrazilianNumber(columns[lastIdx] || "0")
			debitCredit = columns[lastIdx - 1] === "C" ? "C" : "D"
			operationValue = parseBrazilianNumber(columns[lastIdx - 2] || "0")
		}

		if (quantity <= 0 || price <= 0) {
			warnings.push(`Row ${sequenceNumber}: invalid quantity (${quantity}) or price (${price}), skipping`)
			continue
		}

		const normalizedAsset = normalizeAssetName(rawAsset)

		fills.push({
			sequenceNumber,
			exchange: normalizedAsset.endsWith("FUT") ? "BMF" : "BOVESPA",
			side: side as "C" | "V",
			marketType: isDayTrade ? "DAY TRADE" : "NORMAL",
			rawAsset,
			normalizedAsset,
			expiryDate,
			quantity,
			price,
			operationValue,
			debitCredit,
			operationalFee,
			isDayTrade,
		})
	}

	return { fills, warnings }
}

/**
 * Parse the financial summary section from the nota footer.
 * Extracts: valor dos negócios, IRRF, taxas BM&F, total líquido, etc.
 */
const parseFinancialSummary = (text: string): {
	totalOperationValue: number
	totalBrokerage: number
	settlementFee: number
	registrationFee: number
	bmfFees: number
	irrf: number
	netTotal: number
	netTotalDebitCredit: "D" | "C"
} => {
	const result = {
		totalOperationValue: 0,
		totalBrokerage: 0,
		settlementFee: 0,
		registrationFee: 0,
		bmfFees: 0,
		irrf: 0,
		netTotal: 0,
		netTotalDebitCredit: "C" as "D" | "C",
	}

	// Extract "Valor dos negócios" — appears after the header row containing that label
	// The values line follows: "6,00\t0,00 \tC\t0,00\t0,00\t0,00"
	const valorNegociosMatch = text.match(/Valor dos neg[óo]cios\s*\n([^\n]+)/i)
	if (valorNegociosMatch) {
		const parts = valorNegociosMatch[1].split("\t").map((p) => p.trim())
		// The valor dos negócios value is the first or last significant number with C/D indicator
		// From real output: "6,00\t0,00 \tC\t0,00\t0,00\t0,00"
		// Here the "6,00" followed eventually by "C" tells us the net trade value
		const valueWithDC = parts.find((p) => p === "C" || p === "D")
		if (valueWithDC) {
			const valueIndex = parts.indexOf(valueWithDC)
			if (valueIndex > 0) {
				result.totalOperationValue = parseBrazilianNumber(parts[valueIndex - 1])
			}
		} else if (parts.length > 0) {
			result.totalOperationValue = parseBrazilianNumber(parts[0])
		}
	}

	// Extract "Taxa registro BM&F"
	const registroMatch = text.match(/Taxa registro BM&?F\s*\n?[^\n]*?(\d[\d.,]*)/i)
	if (registroMatch) {
		result.registrationFee = parseBrazilianNumber(registroMatch[1])
	}

	// Extract "Taxas BM&F (emol+f.gar)" — look for the value on the same line or next
	const taxasBmfMatch = text.match(/Taxas BM&?F\s*\([^)]+\)\s*\n?[^\n]*?(\d[\d.,]*)/i)
	if (taxasBmfMatch) {
		result.bmfFees = parseBrazilianNumber(taxasBmfMatch[1])
	}

	// Extract "IRRF Day Trade"
	const irrfMatch = text.match(/IRRF Day Trade[^0-9]*(\d[\d.,]*)/i)
	if (irrfMatch) {
		result.irrf = parseBrazilianNumber(irrfMatch[1])
	}

	// Extract "Total líquido da nota" — the most important value
	const totalLiquidoMatch = text.match(/Total l[íi]quido da nota\s*\n?([^\n]+)/i)
	if (totalLiquidoMatch) {
		const parts = totalLiquidoMatch[1].split("\t").map((p) => p.trim()).filter(Boolean)
		// Look for last number followed by C/D
		for (let i = parts.length - 1; i >= 0; i--) {
			if (parts[i] === "C" || parts[i] === "D") {
				result.netTotalDebitCredit = parts[i] as "D" | "C"
				if (i > 0) {
					result.netTotal = parseBrazilianNumber(parts[i - 1])
				}
				break
			}
		}
		// Fallback: if no C/D found, try last numeric value
		if (result.netTotal === 0) {
			for (let i = parts.length - 1; i >= 0; i--) {
				const num = parseBrazilianNumber(parts[i])
				if (num > 0) {
					result.netTotal = num
					break
				}
			}
		}
	}

	// Extract "Corretagem"
	const corretagemMatch = text.match(/Corretagem\s*\n?[^\n]*?(\d[\d.,]*)/i)
	if (corretagemMatch) {
		result.totalBrokerage = parseBrazilianNumber(corretagemMatch[1])
	}

	return result
}

/**
 * Parse a SINACOR nota de corretagem PDF.
 *
 * @param pdfBuffer - Raw PDF file content as Buffer/Uint8Array
 * @returns Parsed nota result with fills and financial summary
 */
const parseSinacorNota = async (pdfBuffer: Buffer | Uint8Array): Promise<NotaParseResult> => {
	const errors: string[] = []
	const warnings: string[] = []

	// Dynamic import to avoid loading pdfjs-dist at module evaluation time.
	// pdfjs-dist references DOMMatrix (browser API) which crashes Node.js SSR
	// if loaded eagerly via a top-level import.
	const { PDFParse } = await import("pdf-parse")

	// Convert Buffer to Uint8Array if needed (pdf-parse v2 requirement)
	const uint8Data = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer)

	const parser = new PDFParse(uint8Data)
	const textResult = await parser.getText()

	// pdf-parse v2 getText() returns { pages: [...], text: string, total: number }
	const fullText: string = typeof textResult === "string"
		? textResult
		: (textResult as { text: string }).text || ""

	if (!fullText || fullText.trim().length < 50) {
		return {
			success: false,
			brokerName: "",
			notaNumber: "",
			notaDate: new Date(),
			fills: [],
			fileHash: "",
			totalOperationValue: 0,
			totalBrokerage: 0,
			settlementFee: 0,
			registrationFee: 0,
			bmfFees: 0,
			irrf: 0,
			netTotal: 0,
			netTotalDebitCredit: "C",
			errors: ["PDF appears empty or contains insufficient text. Is it a scanned image?"],
			warnings: [],
		}
	}

	// Verify this is a SINACOR nota
	if (!fullText.includes("NOTA DE CORRETAGEM") && !fullText.includes("C/V")) {
		errors.push("PDF does not appear to be a SINACOR nota de corretagem")
	}

	// Extract metadata
	const notaDate = parseNotaDate(fullText)
	if (!notaDate) {
		errors.push("Could not extract session date (Data pregão) from the nota")
	}

	const notaNumber = parseNotaNumber(fullText)
	const brokerName = parseBrokerName(fullText)

	// Parse trade fills
	const { fills, warnings: tradeWarnings } = parseTradeRows(fullText)
	warnings.push(...tradeWarnings)

	if (fills.length === 0 && errors.length === 0) {
		errors.push("No trade fills found in the nota. Check the PDF format.")
	}

	// Parse financial summary
	const summary = parseFinancialSummary(fullText)

	return {
		success: errors.length === 0,
		brokerName,
		notaNumber,
		notaDate: notaDate || new Date(),
		fills,
		fileHash: "", // Computed in server action (requires Buffer from uploaded file)
		...summary,
		errors,
		warnings,
	}
}

export { parseSinacorNota, parseBrazilianNumber, normalizeAssetName }
