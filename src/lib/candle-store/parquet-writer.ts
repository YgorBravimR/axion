import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { uploadFile, getStorageConfig } from "@/lib/storage"

/**
 * One-shot Parquet writer for candle data — the WRITE side of the
 * candle-store abstraction. Loaders (CSV → candles) and the export
 * script (PG → candles) both call this; one code path, one Parquet
 * schema, one R2 layout.
 *
 * Pipeline (kept simple on purpose):
 *   1. Serialize rows to JSONL at a temp path under `<base>/_tmp/`.
 *   2. DuckDB `read_json` → explicit `CAST(... AS DOUBLE)` → `COPY` to
 *      Parquet (ZSTD compressed). DOUBLE on the way in avoids the
 *      DECIMAL gotcha logged in docs/gotchas.md.
 *   3. Upload to R2 at `<r2Prefix>/<timeframeCode>/<assetSymbol>.parquet`.
 *   4. Cleanup JSONL.
 *
 * In-memory by design — at our scale (max ~100K rows per file) this
 * never exceeds ~50 MB resident. If we ever ingest a single file
 * approaching memory pressure, swap step 1 for a streaming JSONL
 * writer; everything downstream is unchanged.
 */

interface WriteRow {
	timestamp: Date | string
	open: number
	high: number
	low: number
	close: number
	candleIndex?: number | null
	indicators?: Record<string, number>
}

interface WriteOptions {
	timeframeCode: string
	assetSymbol: string
	/**
	 * Union of indicator keys to materialize as columns. Rows whose
	 * `indicators` map lacks a key produce a NULL value in that column
	 * (Parquet stores NULLs cheaply via rep/def levels). Caller is
	 * responsible for computing the union — typically `[...new Set(...)]`
	 * across the rows.
	 */
	indicatorKeys: string[]
	rows: WriteRow[]
	/** Default "data/parquet/candles" (gitignored, mirrors R2 layout). */
	localBasePath?: string
	/** Default "candles" — the R2 key prefix. */
	r2Prefix?: string
	/** If false, skip the R2 upload (local-only writes for testing). */
	uploadToR2?: boolean
}

interface WriteResult {
	localPath: string
	r2Key: string | null
	bytes: number
	rowCount: number
}

const DEFAULT_LOCAL_BASE = "data/parquet/candles"
const DEFAULT_R2_PREFIX = "candles"

const toIsoString = (v: Date | string): string =>
	v instanceof Date ? v.toISOString() : new Date(v).toISOString()

const escapeIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const writeCandleParquet = async (
	options: WriteOptions
): Promise<WriteResult> => {
	const localBase = resolve(options.localBasePath ?? DEFAULT_LOCAL_BASE)
	const r2Prefix = options.r2Prefix ?? DEFAULT_R2_PREFIX
	const uploadToR2 = options.uploadToR2 !== false

	const { timeframeCode, assetSymbol, indicatorKeys, rows } = options
	if (rows.length === 0) {
		throw new Error(
			`parquet-writer: no rows for ${timeframeCode}/${assetSymbol}`
		)
	}

	// 1. JSONL.
	const jsonlPath = resolve(
		localBase,
		"_tmp",
		`${timeframeCode}_${assetSymbol}_${Date.now()}.jsonl`
	)
	await mkdir(dirname(jsonlPath), { recursive: true })

	const lines: string[] = []
	for (const r of rows) {
		const rec: Record<string, number | string | null> = {
			timestamp: toIsoString(r.timestamp),
			open: r.open,
			high: r.high,
			low: r.low,
			close: r.close,
			candle_index: r.candleIndex ?? null,
		}
		const ind = r.indicators ?? {}
		for (const key of indicatorKeys) {
			const v = ind[key]
			rec[key] = typeof v === "number" ? v : null
		}
		lines.push(JSON.stringify(rec))
	}
	await writeFile(jsonlPath, lines.join("\n"))

	// 2. Parquet via DuckDB.
	const parquetPath = resolve(
		localBase,
		timeframeCode,
		`${assetSymbol}.parquet`
	)
	await mkdir(dirname(parquetPath), { recursive: true })

	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()

	const indSelect = indicatorKeys
		.map((k) => `CAST(${escapeIdent(k)} AS DOUBLE) AS ${escapeIdent(k)}`)
		.join(",\n\t\t\t\t")
	const indSelectClause = indSelect.length > 0 ? `,\n\t\t\t\t${indSelect}` : ""

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

	const bytes = (await readFile(parquetPath)).byteLength

	// 3. R2 upload (optional).
	let r2Key: string | null = null
	if (uploadToR2) {
		// Touch config eagerly so any misconfig errors before we hit the SDK.
		getStorageConfig()
		const key = `${r2Prefix}/${timeframeCode}/${assetSymbol}.parquet`
		const body = await readFile(parquetPath)
		await uploadFile({
			key,
			body,
			contentType: "application/octet-stream",
		})
		r2Key = key
	}

	// 4. Cleanup.
	await unlink(jsonlPath).catch(() => {})

	return {
		localPath: parquetPath,
		r2Key,
		bytes,
		rowCount: rows.length,
	}
}

export {
	writeCandleParquet,
	type WriteOptions,
	type WriteRow,
	type WriteResult,
}
