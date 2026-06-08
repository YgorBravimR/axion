/**
 * backfill-candle-date-range.ts
 *
 * One-shot backfill for `price_data_versions.first_candle_at` /
 * `last_candle_at`. Migration `0018_salty_norman_osborn.sql` added the
 * columns nullable; existing 53 rows have NULL until a loader re-runs.
 * This script reads each Parquet from R2 via DuckDB httpfs, computes
 * MIN/MAX timestamp, and UPDATEs the registry row. Idempotent — re-run
 * safe (overwrites with the same values).
 *
 * Usage: `pnpm tsx scripts/backfill-candle-date-range.ts`
 */
import "dotenv/config"
import postgres from "postgres"
import { DuckDBInstance } from "@duckdb/node-api"

const DATABASE_URL = process.env.DATABASE_URL
const S3_BUCKET = process.env.S3_BUCKET
const S3_ENDPOINT = process.env.S3_ENDPOINT
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY
const S3_REGION = process.env.S3_REGION ?? "auto"

if (
	!DATABASE_URL ||
	!S3_BUCKET ||
	!S3_ENDPOINT ||
	!S3_ACCESS_KEY_ID ||
	!S3_SECRET_ACCESS_KEY
) {
	console.error(
		"missing one of: DATABASE_URL, S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
	)
	process.exit(1)
}

const toIsoFromDuck = (v: unknown): string | null => {
	if (v === null || v === undefined) {
		return null
	}
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "string") {
		return new Date(v).toISOString()
	}
	if (typeof v === "object" && v !== null && "micros" in v) {
		const micros = (v as { micros: bigint }).micros
		return new Date(Number(micros / 1000n)).toISOString()
	}
	return null
}

const main = async () => {
	const sql = postgres(DATABASE_URL, { max: 1 })
	const duck = await DuckDBInstance.create()
	const conn = await duck.connect()
	await conn.run("INSTALL httpfs; LOAD httpfs;")
	await conn.run(`SET s3_endpoint='${S3_ENDPOINT.replace(/^https?:\/\//, "")}'`)
	await conn.run(`SET s3_region='${S3_REGION}'`)
	await conn.run(`SET s3_url_style='path'`)
	await conn.run(`SET s3_use_ssl=true`)
	await conn.run(`SET s3_access_key_id='${S3_ACCESS_KEY_ID}'`)
	await conn.run(`SET s3_secret_access_key='${S3_SECRET_ACCESS_KEY}'`)

	const rows = await sql<
		{
			id: string
			asset_symbol: string
			timeframe_code: string
		}[]
	>`
		SELECT v.id, a.symbol AS asset_symbol, t.code AS timeframe_code
		FROM price_data_versions v
		JOIN assets a ON a.id = v.asset_id
		JOIN timeframes t ON t.id = v.timeframe_id
		ORDER BY a.symbol, t.code
	`
	console.log(`Found ${rows.length} registry rows to backfill.`)

	let ok = 0
	let skipped = 0
	for (const row of rows) {
		const r2Path = `s3://${S3_BUCKET}/candles/${row.timeframe_code}/${row.asset_symbol}.parquet`
		try {
			const reader = await conn.runAndReadAll(
				`SELECT MIN(timestamp) AS first_at, MAX(timestamp) AS last_at FROM read_parquet('${r2Path}')`
			)
			const result = reader.getRowObjects()[0]
			const firstAt = toIsoFromDuck(result?.first_at)
			const lastAt = toIsoFromDuck(result?.last_at)

			if (!firstAt || !lastAt) {
				console.log(
					`  skip ${row.timeframe_code}/${row.asset_symbol} — no rows`
				)
				skipped++
				continue
			}

			await sql`
				UPDATE price_data_versions
				SET first_candle_at = ${firstAt}, last_candle_at = ${lastAt}, updated_at = NOW()
				WHERE id = ${row.id}
			`
			console.log(
				`  ✓ ${row.timeframe_code}/${row.asset_symbol}: ${firstAt} → ${lastAt}`
			)
			ok++
		} catch (err) {
			console.error(
				`  ✗ ${row.timeframe_code}/${row.asset_symbol}:`,
				err instanceof Error ? err.message : err
			)
			skipped++
		}
	}

	console.log(`\nDone. backfilled=${ok}, skipped=${skipped}`)
	await sql.end()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
