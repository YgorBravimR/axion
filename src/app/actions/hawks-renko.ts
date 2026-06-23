"use server"

import { dbWs } from "@/db/drizzle-ws"
import { assets, hawksRenkoSizes } from "@/db/schema"
import { weekStart, getIsoWeekOfDate } from "@/lib/calendar/iso-week"
import { eq, sql, desc } from "drizzle-orm"
import { format } from "date-fns"
import { revalidatePath } from "next/cache"
import type { RenkoSizeRecord, RenkoSizeRow } from "./hawks-renko.types"

// ─── CSV parser ───────────────────────────────────────────────────────────────

/**
 * Parse the master Renko size CSV (semicolon-delimited, DD/MM/YY dates).
 *
 * Expected header (minimum): WEEK;DATA;5m;15m;60m. An optional `ASSET`
 * column tags each row with an asset symbol (e.g. "WIN", "WDO"); rows
 * with no ASSET column inherit the caller-supplied default.
 *
 * Example row:     20;11/05/26;21;39;84
 *   → effectiveDate "2026-05-11", weekNumber 20, size5m 21, size15m 39, size60m 84
 */
const parseRenkoSizeCsv = (csvText: string): RenkoSizeRow[] => {
	const lines = csvText
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)

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

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Parse and upsert the weekly Renko brick size table from the master CSV.
 * Idempotent — re-importing the same CSV produces the same result.
 *
 * Asset resolution per row:
 *   1. If the CSV row has an `ASSET` column with a non-empty value, use it.
 *   2. Otherwise fall back to the `assetSymbol` arg (default "WIN").
 * The resolved symbol is looked up in `assets.symbol` once per distinct
 * value; missing assets fail the import.
 *
 * @param csvText - Raw text of hawk-renkos(Renkos).csv
 * @param assetSymbol - Default asset for rows missing an ASSET column.
 */
export const importHawksRenkoSizes = async (
	csvText: string,
	assetSymbol: string = "WIN"
): Promise<{ success: boolean; imported: number; error?: string }> => {
	try {
		const rows = parseRenkoSizeCsv(csvText)

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

// ─── Table actions (UI) ───────────────────────────────────────────────────────

/**
 * List all WIN renko-size rows ordered by effectiveDate desc.
 * The /dev/renko-sizes table reads this.
 */
export const listHawksRenkoSizes = async (
	assetSymbol: string = "WIN"
): Promise<RenkoSizeRecord[]> => {
	const sym = assetSymbol.toUpperCase()
	const asset = await dbWs.query.assets.findFirst({
		where: eq(assets.symbol, sym),
	})
	if (!asset) {
		return []
	}

	const rows = await dbWs
		.select({
			id: hawksRenkoSizes.id,
			effectiveDate: hawksRenkoSizes.effectiveDate,
			weekNumber: hawksRenkoSizes.weekNumber,
			size1m: hawksRenkoSizes.size1m,
			size5m: hawksRenkoSizes.size5m,
			size15m: hawksRenkoSizes.size15m,
			size60m: hawksRenkoSizes.size60m,
			size1d: hawksRenkoSizes.size1d,
		})
		.from(hawksRenkoSizes)
		.where(eq(hawksRenkoSizes.assetId, asset.id))
		.orderBy(desc(hawksRenkoSizes.effectiveDate))

	return rows
}

interface UpsertRenkoSizeInput {
	effectiveDate: string // ISO YYYY-MM-DD (Monday of the ISO week)
	weekNumber: number
	size1m: number | null
	size5m: number
	size15m: number
	size60m: number
	size1d: number | null
}

/**
 * Upsert a single WIN renko-size row. Used by the "Add this week" modal.
 * Normalizes effectiveDate to the ISO-week Monday so the join key matches
 * how trades pick up the row.
 */
export const upsertHawksRenkoSize = async (
	input: UpsertRenkoSizeInput,
	assetSymbol: string = "WIN"
): Promise<{ success: boolean; error?: string }> => {
	try {
		const sym = assetSymbol.toUpperCase()
		const asset = await dbWs.query.assets.findFirst({
			where: eq(assets.symbol, sym),
		})
		if (!asset) {
			return { success: false, error: `Asset ${sym} not found` }
		}

		const monday = weekStart(new Date(`${input.effectiveDate}T00:00:00Z`))
		const effectiveDate = format(monday, "yyyy-MM-dd")

		await dbWs
			.insert(hawksRenkoSizes)
			.values({
				assetId: asset.id,
				effectiveDate,
				weekNumber: input.weekNumber,
				size1m: input.size1m,
				size5m: input.size5m,
				size15m: input.size15m,
				size60m: input.size60m,
				size1d: input.size1d,
			})
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

		revalidatePath("/dev/renko-sizes")
		return { success: true }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown upsert error",
		}
	}
}

/**
 * Returns the ISO-week Monday for the current week so the modal can default
 * to "this week" without leaking date-math into the client.
 */
export const currentWeekAnchor = async (): Promise<{
	effectiveDate: string
	weekNumber: number
}> => {
	const now = new Date()
	const monday = weekStart(now)
	const weekNumber = getIsoWeekOfDate(now)
	return {
		effectiveDate: format(monday, "yyyy-MM-dd"),
		weekNumber,
	}
}
