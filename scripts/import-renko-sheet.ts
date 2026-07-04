import "dotenv/config"
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"
import { parseRenkoSizeSheetCsv } from "@/lib/enrichment/renko-sheet-csv"

const main = async () => {
	const path = process.argv[2]
	if (!path) {
		console.error("usage: pnpm tsx scripts/import-renko-sheet.ts <csv-path>")
		process.exit(1)
	}
	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}

	const text = readFileSync(path, "utf8")
	const rows = parseRenkoSizeSheetCsv(text)
	if (rows.length === 0) {
		console.error("No valid rows")
		process.exit(1)
	}

	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	const assetRows = (await sql`
		SELECT id, symbol FROM assets WHERE symbol = 'WIN'
	`) as Array<{ id: string; symbol: string }>
	const win = assetRows[0]
	if (!win) {
		console.error("WIN asset not found")
		process.exit(1)
	}

	let inserted = 0
	for (const r of rows) {
		await sql`
			INSERT INTO hawks_renko_sizes
				(asset_id, effective_date, week_number, size_1m, size_5m, size_15m, size_60m, size_1d)
			VALUES
				(${win.id}, ${r.effectiveDate}, ${r.weekNumber}, ${r.size1m}, ${r.size5m}, ${r.size15m}, ${r.size60m}, ${r.size1d})
			ON CONFLICT (asset_id, effective_date) DO UPDATE SET
				week_number = EXCLUDED.week_number,
				size_1m = EXCLUDED.size_1m,
				size_5m = EXCLUDED.size_5m,
				size_15m = EXCLUDED.size_15m,
				size_60m = EXCLUDED.size_60m,
				size_1d = EXCLUDED.size_1d
		`
		inserted++
	}
	console.log(`upserted ${inserted} rows`)
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
