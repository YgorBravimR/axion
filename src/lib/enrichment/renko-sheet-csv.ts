import type { RenkoSizeRow } from "@/app/actions/hawks-renko.types"

/**
 * Parse a comma-delimited CSV (Google Sheets export) that includes both INDICE
 * and DOLAR blocks with 1m/5m/15m/60m/1d columns. WIN columns (INDICE) are the
 * canonical source for `hawks_renko_sizes`; DOLAR columns are ignored.
 *
 * Header shape:  ",,INDICE,,,,,DOLAR,,,,,..."
 *                "WEEK,DATA,1m,5m,15m,60m,1d,1m,5m,15m,60m,1d,..."
 * Date format:   DD/MM/YYYY
 */
const parseRenkoSizeSheetCsv = (csvText: string): RenkoSizeRow[] => {
	const lines = csvText
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)

	if (lines.length < 3) {
		throw new Error(
			"Sheet CSV must have 2 header rows and at least one data row"
		)
	}

	const [, headerLine, ...dataLines] = lines
	const headers = headerLine!.split(",").map((h) => h.trim().toUpperCase())

	const weekIdx = headers.indexOf("WEEK")
	const dateIdx = headers.indexOf("DATA")
	// First occurrences of 1m/5m/15m/60m/1d belong to INDICE (WIN).
	const oneIdx = headers.indexOf("1M")
	const fiveIdx = headers.indexOf("5M")
	const fifteenIdx = headers.indexOf("15M")
	const sixtyIdx = headers.indexOf("60M")
	const dailyIdx = headers.indexOf("1D")

	if (
		[weekIdx, dateIdx, oneIdx, fiveIdx, fifteenIdx, sixtyIdx, dailyIdx].some(
			(i) => i === -1
		)
	) {
		throw new Error("Sheet CSV missing required INDICE columns")
	}

	const rows: RenkoSizeRow[] = []

	for (const line of dataLines) {
		const cols = line.split(",")
		const rawDate = cols[dateIdx]?.trim()
		const rawWeek = cols[weekIdx]?.trim()
		if (!rawDate || !rawWeek) {
			continue
		}

		const parts = rawDate.split("/")
		if (parts.length !== 3) {
			continue
		}
		const [dd, mm, yy] = parts
		const yearRaw = parseInt(yy!, 10)
		const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
		const effectiveDate = `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`

		const five = parseInt(cols[fiveIdx]!, 10)
		const fifteen = parseInt(cols[fifteenIdx]!, 10)
		const sixty = parseInt(cols[sixtyIdx]!, 10)
		if (![five, fifteen, sixty].every(Number.isFinite)) {
			continue
		}

		const oneRaw = cols[oneIdx]?.trim()
		const dailyRaw = cols[dailyIdx]?.trim()

		rows.push({
			effectiveDate,
			weekNumber: parseInt(rawWeek, 10),
			size1m: oneRaw ? parseInt(oneRaw, 10) : null,
			size5m: five,
			size15m: fifteen,
			size60m: sixty,
			size1d: dailyRaw ? parseInt(dailyRaw, 10) : null,
			assetSymbol: "WIN",
		})
	}

	return rows
}

export { parseRenkoSizeSheetCsv }
