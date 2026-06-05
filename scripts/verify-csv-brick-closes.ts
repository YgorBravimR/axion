/**
 * verify-csv-brick-closes.ts
 *
 * Step 1 of the 90-day Hawks brick-data audit (post catalog regeneration).
 *
 * For every (date, brickIndex, closePrice) tuple in data/hawks/user-entries/,
 * fetch the matching row in `price_candles` (asset=WIN, timeframe=5m,
 * candle_index = brickIndex, BRT day = date) and compare:
 *   - presence (does Axion have a brick at this (date, index)?)
 *   - close   (does Axion's close == catalog FECHAMENTO BOX, within tolerance?)
 *
 * Unit handling: Axion stores close as decimal(18,8) — typically as raw
 * points (e.g., 182100). CSV closePrice is raw integer points.
 * Tolerance: 5 pts (1 WIN tick). Anything beyond is a real divergence.
 *
 * Usage:
 *   pnpm tsx scripts/verify-csv-brick-closes.ts
 *   pnpm tsx scripts/verify-csv-brick-closes.ts 2026-05-13   # one day
 */

import "dotenv/config"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

const ASSET_SYMBOL = "WIN"
const TIMEFRAME_CODE = "5m"
const TOLERANCE_POINTS = 5 // 1 WIN tick

interface CatalogEntry {
	date: string
	brickIndex: number
	direction: string
	label?: string
	expectedResult?: string
	closePrice?: number
}

const loadCatalog = (filterDate: string | null): CatalogEntry[] => {
	const dir = resolve(process.cwd(), "data/hawks/user-entries")
	const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
	const all: CatalogEntry[] = []
	for (const f of files) {
		const date = f.replace(".json", "")
		if (filterDate && date !== filterDate) {
			continue
		}
		const rows = JSON.parse(
			readFileSync(resolve(dir, f), "utf-8")
		) as CatalogEntry[]
		all.push(...rows)
	}
	return all
}

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}

	const filterDate = process.argv[2] ?? null
	const catalog = loadCatalog(filterDate)
	if (catalog.length === 0) {
		console.error(
			"no catalog rows found" + (filterDate ? ` for ${filterDate}` : "")
		)
		process.exit(1)
	}
	console.log(
		`loaded ${catalog.length} catalog entries across ${new Set(catalog.map((e) => e.date)).size} days`
	)

	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	// Resolve asset + timeframe ids
	const [{ id: assetId }] = (await sql`
		SELECT id FROM assets WHERE symbol = ${ASSET_SYMBOL} LIMIT 1
	`) as Array<{ id: string }>
	const [{ id: timeframeId }] = (await sql`
		SELECT id FROM timeframes WHERE code = ${TIMEFRAME_CODE} LIMIT 1
	`) as Array<{ id: string }>

	if (!assetId || !timeframeId) {
		console.error(
			`asset/timeframe not found (assetId=${assetId} tfId=${timeframeId})`
		)
		process.exit(1)
	}

	let pass = 0
	let mismatch = 0
	let missing = 0
	const divergences: Array<{
		date: string
		brickIndex: number
		expected: number
		actual: number | null
		delta: number | null
		label?: string
	}> = []

	for (const entry of catalog) {
		if (entry.closePrice === undefined) {
			continue
		}
		const rows = (await sql`
			SELECT close::float8 AS close
			FROM price_candles
			WHERE asset_id = ${assetId}
			  AND timeframe_id = ${timeframeId}
			  AND candle_index = ${entry.brickIndex}
			  AND (timestamp AT TIME ZONE 'America/Sao_Paulo')::date = ${entry.date}::date
			LIMIT 1
		`) as Array<{ close: number }>

		if (rows.length === 0) {
			missing++
			divergences.push({
				date: entry.date,
				brickIndex: entry.brickIndex,
				expected: entry.closePrice,
				actual: null,
				delta: null,
				label: entry.label,
			})
			continue
		}
		const actual = Number(rows[0]!.close)
		const delta = actual - entry.closePrice
		if (Math.abs(delta) > TOLERANCE_POINTS) {
			mismatch++
			divergences.push({
				date: entry.date,
				brickIndex: entry.brickIndex,
				expected: entry.closePrice,
				actual,
				delta,
				label: entry.label,
			})
		} else {
			pass++
		}
	}

	console.log("")
	console.log("=== VERIFY-CSV-BRICK-CLOSES REPORT ===")
	console.log(`pass:     ${pass}`)
	console.log(`mismatch: ${mismatch}  (|delta| > ${TOLERANCE_POINTS} pts)`)
	console.log(`missing:  ${missing}  (no DB row at (date, index))`)
	console.log("")
	if (divergences.length > 0) {
		console.log("=== DIVERGENCES ===")
		for (const d of divergences) {
			const actualStr = d.actual === null ? "NO ROW" : d.actual.toFixed(0)
			const deltaStr =
				d.delta === null
					? ""
					: ` (delta=${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(0)})`
			console.log(
				`  ${d.date} brick=${d.brickIndex.toString().padStart(3, " ")} ${d.label ?? ""}  expected=${d.expected}  actual=${actualStr}${deltaStr}`
			)
		}
	}

	process.exit(mismatch + missing === 0 ? 0 : 1)
}

void run()
