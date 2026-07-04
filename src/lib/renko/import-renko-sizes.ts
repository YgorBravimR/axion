import { dbWs } from "@/db/drizzle-ws"
import { assets, hawksRenkoSizes } from "@/db/schema"
import { eq, sql } from "drizzle-orm"
import type { RenkoSizeRow } from "@/app/actions/hawks-renko.types"

/**
 * Parse the master Renko size CSV (semicolon-delimited, DD/MM/YY dates).
 *
 * Expected header (minimum): WEEK;DATA;5m;15m;60m. An optional `ASSET`
 * column tags each row with an asset symbol (e.g. "WIN", "WDO"); rows
 * with no ASSET column inherit the caller-supplied default.
 *
 * Example row:     20;11/05/26;21;39;84
 *   → effectiveDate "2026-05-11", weekNumber 20, size5m 21, size15m 39, size60m 84
 *
 * Rejects csvText over 1MB or 5000 lines.
 */
export const parseRenkoSizeCsv = (csvText: string): RenkoSizeRow[] => {
	if (csvText.length > 1024 * 1024) {
		throw new Error("CSV text exceeds 1MB limit")
	}

	const lines = csvText
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)

	if (lines.length > 5000) {
		throw new Error("CSV exceeds 5000 lines")
	}

	if (lines.length < 2) {
		throw new Error(
			"Renko size CSV must have a header row and at least one data row"
		)
	}

	const [headerLine, ...dataLines] = lines
	const headers = headerLine!.split(";").map((h) => h.trim().toUpperCase())

	const weekIdx = headers.indexOf("WEEK")
	const dateIdx = headers.indexOf("DATA")
	const oneIdx = headers.indexOf("1M")
	const fiveIdx = headers.indexOf("5M")
	const fifteenIdx = headers.indexOf("15M")
	const sixtyIdx = headers.indexOf("60M")
	const dailyIdx = headers.indexOf("1D")
	const assetIdx = headers.indexOf("ASSET")

	if ([weekIdx, dateIdx, fiveIdx, fifteenIdx, sixtyIdx].some((i) => i === -1)) {
		throw new Error(
			"Renko size CSV missing required columns: WEEK, DATA, 5m, 15m, 60m"
		)
	}

	const intOrNull = (raw: string | undefined): number | null => {
		if (!raw || !raw.trim()) {
			return null
		}
		const n = parseInt(raw.trim(), 10)
		return Number.isFinite(n) ? n : null
	}

	const rows: RenkoSizeRow[] = []

	for (const line of dataLines) {
		const cols = line.split(";")
		const rawDate = cols[dateIdx]?.trim()
		if (!rawDate) {
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

		const rawAsset = assetIdx >= 0 ? cols[assetIdx]?.trim() : ""
		rows.push({
			effectiveDate,
			weekNumber: parseInt(cols[weekIdx]!, 10),
			size1m: oneIdx >= 0 ? intOrNull(cols[oneIdx]) : null,
			size5m: parseInt(cols[fiveIdx]!, 10),
			size15m: parseInt(cols[fifteenIdx]!, 10),
			size60m: parseInt(cols[sixtyIdx]!, 10),
			size1d: dailyIdx >= 0 ? intOrNull(cols[dailyIdx]) : null,
			assetSymbol: rawAsset ? rawAsset.toUpperCase() : null,
		})
	}

	return rows
}

/**
 * Core logic for importing Renko sizes from parsed rows.
 * Does NOT perform auth checks — caller responsible.
 */
export const importRenkoSizesCore = async (
	rows: RenkoSizeRow[],
	assetSymbol: string = "WIN"
): Promise<{ success: boolean; imported: number; error?: string }> => {
	try {
		if (rows.length === 0) {
			return {
				success: false,
				imported: 0,
				error: "No valid rows found in CSV",
			}
		}

		const symbolToAssetId = new Map<string, string>()
		const distinctSymbols = new Set<string>()
		for (const r of rows) {
			distinctSymbols.add((r.assetSymbol ?? assetSymbol).toUpperCase())
		}
		const lookups = await Promise.all(
			Array.from(distinctSymbols).map(async (sym) => ({
				sym,
				found: await dbWs.query.assets.findFirst({
					where: eq(assets.symbol, sym),
				}),
			}))
		)
		for (const { sym, found } of lookups) {
			if (!found) {
				return {
					success: false,
					imported: 0,
					error: `Asset symbol not found in DB: ${sym}`,
				}
			}
			symbolToAssetId.set(sym, found.id)
		}

		await dbWs
			.insert(hawksRenkoSizes)
			.values(
				rows.map((r) => {
					const sym = (r.assetSymbol ?? assetSymbol).toUpperCase()
					return {
						assetId: symbolToAssetId.get(sym)!,
						effectiveDate: r.effectiveDate,
						weekNumber: r.weekNumber,
						size1m: r.size1m,
						size5m: r.size5m,
						size15m: r.size15m,
						size60m: r.size60m,
						size1d: r.size1d,
					}
				})
			)
			.onConflictDoUpdate({
				target: [hawksRenkoSizes.assetId, hawksRenkoSizes.effectiveDate],
				set: {
					weekNumber: sql`EXCLUDED.week_number`,
					size1m: sql`EXCLUDED.size_1m`,
					size5m: sql`EXCLUDED.size_5m`,
					size15m: sql`EXCLUDED.size_15m`,
					size60m: sql`EXCLUDED.size_60m`,
					size1d: sql`EXCLUDED.size_1d`,
				},
			})

		return { success: true, imported: rows.length }
	} catch (error) {
		return {
			success: false,
			imported: 0,
			error: error instanceof Error ? error.message : "Unknown import error",
		}
	}
}
