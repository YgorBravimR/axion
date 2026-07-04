"use server"

import { dbWs } from "@/db/drizzle-ws"
import { assets, hawksRenkoSizes } from "@/db/schema"
import { weekStart, getIsoWeekOfDate } from "@/lib/calendar/iso-week"
import { eq, desc, sql } from "drizzle-orm"
import { format } from "date-fns"
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth-utils"
import {
	parseRenkoSizeCsv,
	importRenkoSizesCore,
} from "@/lib/renko/import-renko-sizes"
import type { RenkoSizeRecord, UpsertRenkoSizeInput } from "./hawks-renko.types"

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Parse and upsert the weekly Renko brick size table from the master CSV.
 * Idempotent — re-importing the same CSV produces the same result.
 * Requires admin role. Used by /dev/renko-sizes page and data import scripts.
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
	await requireRole("admin")

	try {
		const rows = parseRenkoSizeCsv(csvText)
		return await importRenkoSizesCore(rows, assetSymbol)
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
 * List all renko-size rows ordered by effectiveDate desc.
 * The /dev/renko-sizes table reads this.
 * Requires authenticated session (admin role, checked by page).
 */
export const listHawksRenkoSizes = async (
	assetSymbol: string = "WIN"
): Promise<RenkoSizeRecord[]> => {
	await requireRole("admin")

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

/**
 * Upsert a single renko-size row. Used by the "Add this week" modal.
 * Requires admin role. Normalizes effectiveDate to the ISO-week Monday
 * so the join key matches how trades pick up the row.
 */
export const upsertHawksRenkoSize = async (
	input: UpsertRenkoSizeInput,
	assetSymbol: string = "WIN"
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")

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
 * Requires authenticated session (admin role, checked by page).
 */
export const currentWeekAnchor = async (): Promise<{
	effectiveDate: string
	weekNumber: number
}> => {
	await requireRole("admin")

	const now = new Date()
	const monday = weekStart(now)
	const weekNumber = getIsoWeekOfDate(now)
	return {
		effectiveDate: format(monday, "yyyy-MM-dd"),
		weekNumber,
	}
}
