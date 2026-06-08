/**
 * One-shot probe — verify DuckDB can read Parquet from R2 via httpfs.
 *
 *  1. Generate a 10-row synthetic candle Parquet via DuckDB locally.
 *  2. Upload to R2 at `candles/_probe/sample.parquet`.
 *  3. Query it back from R2 via DuckDB httpfs + a `s3://` URI.
 *  4. Measure cold + warm latency, assert row count matches.
 *  5. Delete the probe object from R2.
 *
 * Delete this file after phase 2 lands.
 */
import "dotenv/config"
import { readFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { uploadFile, deleteFile, getStorageConfig } from "@/lib/storage"

const PROBE_KEY = "candles/_probe/sample.parquet"
const ROW_COUNT = 10

const stripScheme = (e: string): string => e.replace(/^https?:\/\//i, "")

const stringify = (v: unknown): string =>
	JSON.stringify(v, (_k, val: unknown) =>
		typeof val === "bigint" ? Number(val) : val
	)

const main = async () => {
	const cfg = getStorageConfig()
	const localPath = join(tmpdir(), `axion-r2-probe-${Date.now()}.parquet`)

	console.log("→ generating sample parquet via DuckDB…")
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const safeLocal = localPath.replace(/'/g, "''")
	await conn.run(
		`COPY (
			SELECT
				TIMESTAMP '2026-06-01 09:00:00' + (i * INTERVAL '5 minutes') AS timestamp,
				100.0 + i AS open,
				101.5 + i AS high,
				 99.0 + i AS low,
				100.5 + i AS close,
				i::INTEGER AS candle_index,
				50.0 + i * 0.1 AS mme27,
				60.0 + i * 0.1 AS mme55
			FROM range(${ROW_COUNT}) AS t(i)
		) TO '${safeLocal}' (FORMAT PARQUET)`
	)
	const localBytes = (await readFile(localPath)).byteLength
	console.log(`  local parquet: ${localBytes} bytes`)

	console.log(`→ uploading to R2 at ${PROBE_KEY}…`)
	const body = await readFile(localPath)
	const uploaded = await uploadFile({
		key: PROBE_KEY,
		body,
		contentType: "application/octet-stream",
	})
	console.log(`  uploaded: ${uploaded.url}`)

	console.log("→ configuring DuckDB httpfs for R2…")
	await conn.run("INSTALL httpfs")
	await conn.run("LOAD httpfs")
	await conn.run(`SET s3_endpoint='${stripScheme(cfg.endpoint)}'`)
	await conn.run(`SET s3_region='${cfg.region}'`)
	await conn.run(`SET s3_url_style='path'`)
	await conn.run(`SET s3_use_ssl=true`)
	await conn.run(`SET s3_access_key_id='${cfg.accessKeyId}'`)
	await conn.run(`SET s3_secret_access_key='${cfg.secretAccessKey}'`)

	const s3Uri = `s3://${cfg.bucket}/${PROBE_KEY}`
	console.log(`→ cold read from ${s3Uri}…`)
	const t0 = Date.now()
	const cold = await conn.runAndReadAll(
		`SELECT COUNT(*) AS n, MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts
		 FROM read_parquet('${s3Uri}')`
	)
	const coldMs = Date.now() - t0
	const coldRows = cold.getRowObjects()
	console.log(`  cold: ${coldMs}ms — ${stringify(coldRows[0])}`)

	console.log("→ warm read…")
	const t1 = Date.now()
	const warm = await conn.runAndReadAll(
		`SELECT timestamp, open, high, low, close, candle_index, mme27, mme55
		 FROM read_parquet('${s3Uri}')
		 ORDER BY timestamp ASC`
	)
	const warmMs = Date.now() - t1
	const warmRows = warm.getRowObjects()
	console.log(`  warm: ${warmMs}ms — ${warmRows.length} rows`)
	console.log("  first row:", stringify(warmRows[0]))
	console.log("  last  row:", stringify(warmRows[warmRows.length - 1]))

	const got = warmRows.length
	const ok = got === ROW_COUNT
	console.log(ok ? `✓ row count OK (${got})` : `✗ row count mismatch: ${got}`)

	console.log("→ cleanup local + R2…")
	await unlink(localPath).catch(() => {})
	await deleteFile(PROBE_KEY)
	console.log("✓ probe complete")

	if (!ok) {
		process.exit(1)
	}
}

main().catch((e) => {
	console.error("✗ probe failed:", e)
	process.exit(1)
})
