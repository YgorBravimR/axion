import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api"
import { db } from "@/db/drizzle"
import { assets, timeframes } from "@/db/schema"
import { eq } from "drizzle-orm"
import type { CandleRow } from "@/types/candle"
import type { CandleStore, FetchRangeParams } from "./interface"

/**
 * DuckDB + Parquet implementation. Two file-location modes:
 *
 *   - Local disk:  basePath = "data/parquet/candles"          → file:// reads
 *   - R2 / S3:     basePath = "s3://<bucket>/candles"         → httpfs reads
 *
 * The query shape is identical across both modes — only the path
 * prefix and the one-time httpfs config differ. Vercel deploys point
 * basePath at the R2 URI; local dev can stay on disk.
 *
 * File layout: <basePath>/<timeframeCode>/<assetSymbol>.parquet
 * Example:     data/parquet/candles/hawk_5m_win/WIN.parquet
 *              s3://axion-prod/candles/hawk_5m_win/WIN.parquet
 *
 * Asset/timeframe UUIDs are resolved to symbol/code via Postgres on
 * each call (one indexed lookup, ~2-5ms). The assets + timeframes
 * tables stay on PG.
 */

interface DuckDbS3Config {
	endpoint: string
	region: string
	accessKeyId: string
	secretAccessKey: string
}

interface DuckDbCandleStoreOptions {
	/**
	 * Where the Parquet files live. Either a filesystem path (relative
	 * or absolute) or a fully-qualified `s3://bucket/prefix` URI.
	 */
	basePath: string
	/**
	 * Required when basePath starts with `s3://`. Reuses the same
	 * credentials as src/lib/storage.ts (Cloudflare R2 today).
	 */
	s3Config?: DuckDbS3Config
	/**
	 * Where DuckDB writes its extension cache. Defaults to the user's
	 * HOME (`~/.duckdb`). On Vercel serverless HOME may not be writable,
	 * so deploys should set this to `/tmp/duckdb-extensions`.
	 */
	extensionDirectory?: string
}

const isS3Path = (path: string): boolean => path.startsWith("s3://")

const stripScheme = (endpoint: string): string =>
	endpoint.replace(/^https?:\/\//i, "")

const sqlEscape = (value: string): string => value.replace(/'/g, "''")

/**
 * DuckDB returns:
 *   - DECIMAL columns as `{ width, scale, value }` where `value/10^scale = real`
 *   - BIGINT as JS BigInt
 *   - DOUBLE/REAL as JS number
 *
 * Export writes DOUBLE for OHLC + indicators (phase 3), but this stays
 * defensive in case the schema ever drifts. NaN on unknown shape — caller
 * decides whether to surface or skip.
 */
const toNumber = (v: unknown): number => {
	if (typeof v === "number") {
		return v
	}
	if (typeof v === "bigint") {
		return Number(v)
	}
	if (v !== null && typeof v === "object" && "value" in v && "scale" in v) {
		const { value, scale } = v as { value: number | bigint; scale: number }
		return Number(value) / Math.pow(10, scale)
	}
	if (v === null || v === undefined) {
		return NaN
	}
	return Number(v)
}

/**
 * DuckDB returns TIMESTAMP columns as `{ micros: bigint }` (microseconds
 * since epoch). Convert to ISO string. Falls back to Date/string/number
 * to stay tolerant of future driver changes.
 */
const toIsoString = (v: unknown): string => {
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "string") {
		return new Date(v).toISOString()
	}
	if (typeof v === "number") {
		return new Date(v).toISOString()
	}
	if (typeof v === "bigint") {
		return new Date(Number(v) / 1000).toISOString()
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		const micros = (v as { micros: number | bigint }).micros
		return new Date(Number(micros) / 1000).toISOString()
	}
	throw new Error(`candle-store(duckdb): unparseable timestamp ${String(v)}`)
}

const createDuckDbCandleStore = (
	options: DuckDbCandleStoreOptions
): CandleStore => {
	const isRemote = isS3Path(options.basePath)
	const basePath = isRemote ? options.basePath : resolve(options.basePath)

	if (isRemote && !options.s3Config) {
		throw new Error("candle-store(duckdb): s3:// basePath requires s3Config")
	}

	// Lazy-init: one DuckDB instance + connection per process. The httpfs
	// extension load happens once on first query against an s3:// path.
	let cachedSetup: Promise<DuckDBConnection> | null = null

	// Memoize Parquet column names per file path. Files are immutable post-export,
	// so the cache is safe for the lifetime of the connection.
	const columnsByPath = new Map<string, Set<string>>()

	const setupConnection = async (): Promise<DuckDBConnection> => {
		const instance = await DuckDBInstance.create(":memory:")
		const connection = await instance.connect()
		if (isRemote && options.s3Config) {
			if (options.extensionDirectory) {
				await connection.run(
					`SET extension_directory='${sqlEscape(options.extensionDirectory)}'`
				)
			}
			await connection.run("INSTALL httpfs")
			await connection.run("LOAD httpfs")
			const cfg = options.s3Config
			// R2 requires path-style URLs and treats region as 'auto'.
			await connection.run(
				`SET s3_endpoint='${sqlEscape(stripScheme(cfg.endpoint))}'`
			)
			await connection.run(`SET s3_region='${sqlEscape(cfg.region)}'`)
			await connection.run(`SET s3_url_style='path'`)
			await connection.run(`SET s3_use_ssl=true`)
			await connection.run(
				`SET s3_access_key_id='${sqlEscape(cfg.accessKeyId)}'`
			)
			await connection.run(
				`SET s3_secret_access_key='${sqlEscape(cfg.secretAccessKey)}'`
			)
		}
		return connection
	}

	const getConnection = (): Promise<DuckDBConnection> => {
		if (!cachedSetup) {
			cachedSetup = setupConnection()
		}
		return cachedSetup
	}

	const resolveSymbolAndCode = async (
		assetId: string,
		timeframeId: string
	): Promise<{ symbol: string; code: string }> => {
		const [assetRow] = await db
			.select({ symbol: assets.symbol })
			.from(assets)
			.where(eq(assets.id, assetId))
			.limit(1)
		if (!assetRow) {
			throw new Error(`candle-store: asset ${assetId} not found`)
		}
		const [tfRow] = await db
			.select({ code: timeframes.code })
			.from(timeframes)
			.where(eq(timeframes.id, timeframeId))
			.limit(1)
		if (!tfRow) {
			throw new Error(`candle-store: timeframe ${timeframeId} not found`)
		}
		return { symbol: assetRow.symbol, code: tfRow.code }
	}

	const buildPath = (code: string, symbol: string): string => {
		if (isRemote) {
			return `${basePath.replace(/\/$/, "")}/${code}/${symbol}.parquet`
		}
		return resolve(basePath, code, `${symbol}.parquet`)
	}

	const BASE_COLS = [
		"timestamp",
		"open",
		"high",
		"low",
		"close",
		"candle_index",
	]
	const BASE_COL_SET = new Set(BASE_COLS)

	const getParquetColumns = async (
		connection: DuckDBConnection,
		filePath: string
	): Promise<Set<string>> => {
		if (columnsByPath.has(filePath)) {
			return columnsByPath.get(filePath)!
		}

		// Query schema via DESCRIBE on read_parquet. Returns one row per column.
		const reader = await connection.runAndReadAll(
			`DESCRIBE SELECT * FROM read_parquet('${sqlEscape(filePath)}')`
		)
		const rows = reader.getRowObjects()
		const cols = new Set(rows.map((row) => String(row.column_name)))
		columnsByPath.set(filePath, cols)
		return cols
	}

	const buildSelectColumns = (
		indicatorKeys: string[] | "*" | undefined,
		availableColumns: Set<string>
	): string => {
		if (indicatorKeys === "*") {
			// Read everything — base + every indicator column in the file.
			return "*"
		}
		if (!indicatorKeys || indicatorKeys.length === 0) {
			return BASE_COLS.join(", ")
		}
		// Build list of base cols + indicators. For missing indicators,
		// project NULL AS "key" to maintain row-shape contract.
		const cols = [...BASE_COLS]
		for (const key of indicatorKeys) {
			const safeName = key.replace(/"/g, '""')
			if (availableColumns.has(key)) {
				cols.push(`"${safeName}"`)
			} else {
				cols.push(`NULL AS "${safeName}"`)
			}
		}
		return cols.join(", ")
	}

	return {
		async fetchRange(params: FetchRangeParams): Promise<CandleRow[]> {
			const { symbol, code } = await resolveSymbolAndCode(
				params.assetId,
				params.timeframeId
			)
			const filePath = buildPath(code, symbol)
			if (!isRemote && !existsSync(filePath)) {
				throw new Error(
					`candle-store(duckdb): Parquet not found at ${filePath} — ` +
						`run scripts/export-candles-to-parquet.ts to generate it`
				)
			}

			const connection = await getConnection()

			// Probe Parquet schema to handle recipes requesting indicators
			// that the file doesn't have. Missing indicators are aliased to NULL.
			const availableColumns = await getParquetColumns(connection, filePath)
			const columns = buildSelectColumns(params.indicatorKeys, availableColumns)

			const fromIso = params.from.toISOString()
			const toIso = params.to.toISOString()

			// CRITICAL: tie-break by candle_index so duplicate timestamps stay
			// in the original platform-painted order. Profitchart stamps every
			// brick painted during a single tick burst (session-open, post-
			// pause, fast tape) with the same second-resolution timestamp —
			// we see up to 80 bricks sharing one timestamp at session opens
			// (probed 2026-06-30, _probe-hawks-monsters.ts: 74 clusters >5).
			// Without the tie-break, DuckDB returns the cluster in arbitrary
			// order, which paints a vertical staircase going the wrong way
			// (the May 12 "downward staircase that should have been an upward
			// gap" bug). `candle_index` is the canonical sequence the loader
			// stamped — sort by it second.
			const reader = await connection.runAndReadAll(
				`SELECT ${columns} FROM read_parquet('${sqlEscape(filePath)}')
				 WHERE timestamp >= TIMESTAMP '${fromIso}'
				   AND timestamp <= TIMESTAMP '${toIso}'
				 ORDER BY timestamp ASC, candle_index ASC`
			)

			const rows = reader.getRowObjects()
			const wantAll = params.indicatorKeys === "*"
			const wantedList = Array.isArray(params.indicatorKeys)
				? params.indicatorKeys
				: []
			return rows.map((row) => {
				const indicators: Record<string, number> = {}
				if (wantAll) {
					for (const [key, v] of Object.entries(row)) {
						if (BASE_COL_SET.has(key)) {
							continue
						}
						if (v !== null && v !== undefined) {
							const n = toNumber(v)
							if (!Number.isNaN(n)) {
								indicators[key] = n
							}
						}
					}
				} else {
					for (const key of wantedList) {
						const v = row[key]
						if (v !== null && v !== undefined) {
							const n = toNumber(v)
							if (!Number.isNaN(n)) {
								indicators[key] = n
							}
						}
					}
				}
				return {
					timestamp: toIsoString(row.timestamp),
					open: toNumber(row.open),
					high: toNumber(row.high),
					low: toNumber(row.low),
					close: toNumber(row.close),
					candleIndex:
						row.candle_index === null || row.candle_index === undefined
							? null
							: toNumber(row.candle_index),
					indicators,
				}
			})
		},
	}
}

export {
	createDuckDbCandleStore,
	type DuckDbCandleStoreOptions,
	type DuckDbS3Config,
}
