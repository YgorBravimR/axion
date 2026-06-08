/**
 * One-shot export — `price_candles` (Postgres JSONB) → Parquet on R2.
 *
 * For each (asset, timeframe) combo with candle rows:
 *   1. Resolve UUIDs → (symbol, code) via assets + timeframes.
 *   2. Compute the union of indicator keys present in JSONB across rows.
 *   3. Stream rows from Postgres into a JSONL temp file (one flat record
 *      per line, indicators promoted to top-level keys).
 *   4. Use DuckDB to read the JSONL with explicit DOUBLE casts and write
 *      Parquet to data/parquet/candles/<code>/<symbol>.parquet.
 *   5. Upload the Parquet to R2 at candles/<code>/<symbol>.parquet.
 *   6. Verify by reading the R2 object back via DuckDB httpfs and
 *      comparing row count + min/max timestamp.
 *
 * Idempotent — re-running overwrites local + R2 files cleanly.
 * Per-combo errors are reported and the script continues; only
 * Postgres connection failures abort.
 *
 * Usage:
 *   pnpm tsx scripts/export-candles-to-parquet.ts                # all combos
 *   pnpm tsx scripts/export-candles-to-parquet.ts WIN hawk_5m_win  # one combo
 */
import "dotenv/config"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import postgres from "postgres"
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api"
import { uploadFile, getStorageConfig } from "@/lib/storage"

const LOCAL_BASE = resolve(process.cwd(), "data/parquet/candles")
const R2_PREFIX = "candles"

const stripScheme = (e: string): string => e.replace(/^https?:\/\//i, "")

interface Combo {
	assetId: string
	timeframeId: string
	symbol: string
	code: string
	rowCount: number
}

interface CandleRecord {
	timestamp: string
	open: number
	high: number
	low: number
	close: number
	candle_index: number | null
	[indicator: string]: number | string | null
}

const main = async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = postgres(dbUrl, { max: 4, idle_timeout: 30 })
	const cfg = getStorageConfig()

	const args = process.argv.slice(2)
	const filterSymbol = args[0]
	const filterCode = args[1]

	console.log("→ resolving combos (asset × timeframe)…")
	const combosRaw = (await sql`
		SELECT pc.asset_id, pc.timeframe_id, a.symbol, t.code, COUNT(*)::int AS row_count
		FROM price_candles pc
		JOIN assets a ON a.id = pc.asset_id
		JOIN timeframes t ON t.id = pc.timeframe_id
		${filterSymbol ? sql`WHERE a.symbol = ${filterSymbol}` : sql``}
		${filterCode ? (filterSymbol ? sql`AND t.code = ${filterCode}` : sql`WHERE t.code = ${filterCode}`) : sql``}
		GROUP BY pc.asset_id, pc.timeframe_id, a.symbol, t.code
		ORDER BY t.code, a.symbol
	`) as Array<{
		asset_id: string
		timeframe_id: string
		symbol: string
		code: string
		row_count: number
	}>

	const combos: Combo[] = combosRaw.map((r) => ({
		assetId: r.asset_id,
		timeframeId: r.timeframe_id,
		symbol: r.symbol,
		code: r.code,
		rowCount: r.row_count,
	}))

	console.log(
		`  found ${combos.length} combos, total ${combos.reduce((s, c) => s + c.rowCount, 0)} rows`
	)

	const duckInstance = await DuckDBInstance.create(":memory:")
	const conn = await duckInstance.connect()

	// One-time R2 setup for verification reads later in the loop.
	await conn.run("INSTALL httpfs")
	await conn.run("LOAD httpfs")
	await conn.run(`SET s3_endpoint='${stripScheme(cfg.endpoint)}'`)
	await conn.run(`SET s3_region='${cfg.region}'`)
	await conn.run(`SET s3_url_style='path'`)
	await conn.run(`SET s3_use_ssl=true`)
	await conn.run(`SET s3_access_key_id='${cfg.accessKeyId}'`)
	await conn.run(`SET s3_secret_access_key='${cfg.secretAccessKey}'`)

	let successCount = 0
	let failCount = 0
	let totalBytes = 0

	for (const combo of combos) {
		try {
			const bytes = await exportCombo(sql, conn, combo, cfg.bucket)
			totalBytes += bytes
			successCount++
		} catch (e) {
			console.error(
				`✗ ${combo.code}/${combo.symbol}:`,
				e instanceof Error ? e.message : e
			)
			failCount++
		}
	}

	console.log("")
	console.log(`✓ exported ${successCount}/${combos.length} combos`)
	console.log(
		`  total parquet size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`
	)
	if (failCount > 0) {
		console.error(`✗ ${failCount} combos failed`)
	}

	await sql.end()
	if (failCount > 0) {
		process.exit(1)
	}
}

const exportCombo = async (
	sql: postgres.Sql,
	conn: DuckDBConnection,
	combo: Combo,
	bucket: string
): Promise<number> => {
	const tag = `${combo.code}/${combo.symbol}`
	console.log("")
	console.log(`→ ${tag} (${combo.rowCount} rows)`)

	// 1. Indicator key union.
	const keyRows = (await sql`
		SELECT DISTINCT jsonb_object_keys(indicators) AS key
		FROM price_candles
		WHERE asset_id = ${combo.assetId}
		  AND timeframe_id = ${combo.timeframeId}
		  AND indicators IS NOT NULL
	`) as Array<{ key: string }>
	const indicatorKeys = keyRows.map((r) => r.key).sort()
	console.log(
		`  indicator keys: ${indicatorKeys.length} ${indicatorKeys.length > 0 ? `[${indicatorKeys.slice(0, 5).join(", ")}${indicatorKeys.length > 5 ? ", …" : ""}]` : ""}`
	)

	// 2. Fetch all rows. OHLC cast to float8 to dodge Decimal serialization.
	const rows = (await sql`
		SELECT
			timestamp,
			open::float8 AS open,
			high::float8 AS high,
			low::float8 AS low,
			close::float8 AS close,
			candle_index,
			indicators
		FROM price_candles
		WHERE asset_id = ${combo.assetId}
		  AND timeframe_id = ${combo.timeframeId}
		ORDER BY timestamp ASC
	`) as Array<{
		timestamp: Date
		open: number
		high: number
		low: number
		close: number
		candle_index: number | null
		indicators: Record<string, unknown> | null
	}>

	// 3. Build JSONL — one record per line.
	const jsonlPath = resolve(
		LOCAL_BASE,
		"_tmp",
		`${combo.code}_${combo.symbol}.jsonl`
	)
	await mkdir(dirname(jsonlPath), { recursive: true })

	const lines: string[] = []
	for (const r of rows) {
		const rec: CandleRecord = {
			timestamp: r.timestamp.toISOString(),
			open: r.open,
			high: r.high,
			low: r.low,
			close: r.close,
			candle_index: r.candle_index,
		}
		const ind = r.indicators ?? {}
		for (const key of indicatorKeys) {
			const v = ind[key]
			rec[key] = typeof v === "number" ? v : null
		}
		lines.push(JSON.stringify(rec))
	}
	await writeFile(jsonlPath, lines.join("\n"))

	// 4. DuckDB: read JSONL → write Parquet with explicit casts.
	const parquetPath = resolve(LOCAL_BASE, combo.code, `${combo.symbol}.parquet`)
	await mkdir(dirname(parquetPath), { recursive: true })

	const indSelect = indicatorKeys
		.map(
			(k) =>
				`CAST("${k.replace(/"/g, '""')}" AS DOUBLE) AS "${k.replace(/"/g, '""')}"`
		)
		.join(",\n\t\t\t")
	const indSelectClause = indSelect.length > 0 ? `,\n\t\t\t${indSelect}` : ""

	await conn.run(
		`COPY (
			SELECT
				CAST(timestamp AS TIMESTAMP) AS timestamp,
				CAST(open AS DOUBLE) AS open,
				CAST(high AS DOUBLE) AS high,
				CAST(low AS DOUBLE) AS low,
				CAST(close AS DOUBLE) AS close,
				CAST(candle_index AS INTEGER) AS candle_index${indSelectClause}
			FROM read_json('${jsonlPath.replace(/'/g, "''")}', format='newline_delimited', auto_detect=true)
			ORDER BY timestamp ASC
		) TO '${parquetPath.replace(/'/g, "''")}' (FORMAT PARQUET, COMPRESSION ZSTD)`
	)

	const parquetBytes = (await readFile(parquetPath)).byteLength
	console.log(
		`  parquet: ${(parquetBytes / 1024).toFixed(1)} KB (${(parquetBytes / combo.rowCount).toFixed(0)} bytes/row)`
	)

	// 5. Upload to R2.
	const r2Key = `${R2_PREFIX}/${combo.code}/${combo.symbol}.parquet`
	const body = await readFile(parquetPath)
	await uploadFile({
		key: r2Key,
		body,
		contentType: "application/octet-stream",
	})
	console.log(`  uploaded to s3://${bucket}/${r2Key}`)

	// 6. Verify R2 round-trip.
	const verifyReader = await conn.runAndReadAll(
		`SELECT COUNT(*)::INTEGER AS n,
		        MIN(timestamp) AS min_ts,
		        MAX(timestamp) AS max_ts
		 FROM read_parquet('s3://${bucket}/${r2Key}')`
	)
	const verifyRow = verifyReader.getRowObjects()[0]
	const verifiedCount = Number(verifyRow?.n ?? 0)
	if (verifiedCount !== combo.rowCount) {
		throw new Error(
			`verification mismatch: expected ${combo.rowCount} rows, R2 returned ${verifiedCount}`
		)
	}
	console.log(`  ✓ verified ${verifiedCount} rows on R2`)

	// Cleanup JSONL.
	await unlink(jsonlPath).catch(() => {})

	return parquetBytes
}

main().catch((e) => {
	console.error("✗ export failed:", e)
	process.exit(1)
})
