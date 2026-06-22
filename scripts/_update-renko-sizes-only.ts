/**
 * _update-renko-sizes-only.ts
 *
 * Refresh the `hawks_renko_sizes` table from `data/hawks/renko-sizes.csv`
 * WITHOUT re-running parquet writes / candle ingestion. Use when Pedro
 * drops a fresh weekly OCO update and you've already loaded candles.
 *
 * Usage:
 *   pnpm tsx scripts/_update-renko-sizes-only.ts
 */

import "dotenv/config"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { importHawksRenkoSizes } from "@/app/actions/hawks-renko"

const CSV_PATH = resolve(process.cwd(), "data/hawks/renko-sizes.csv")

const main = async () => {
	const csvText = readFileSync(CSV_PATH, "utf-8")
	const result = await importHawksRenkoSizes(csvText, "WIN")
	if (!result.success) {
		console.error(`FAIL: ${result.error}`)
		process.exit(1)
	}
	console.log(`OK: ${result.imported} renko-size rows refreshed (WIN)`)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
