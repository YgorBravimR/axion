import { createDuckDbCandleStore } from "./duckdb-impl"
import type { CandleStore } from "./interface"

/**
 * Candle store factory. After the phase-5 cutover, candle data lives in
 * R2 Parquet only — there is no Postgres-backed fallback. The factory
 * remains as a seam so future stores (different bucket layout, alternate
 * Parquet provider, etc.) can plug in at the same boundary.
 *
 * Base path is read from `CANDLE_STORE_DUCKDB_BASE_PATH`:
 *   - Local disk: `data/parquet/candles` (default for dev)
 *   - R2 / S3:    `s3://<bucket>/candles` (production)
 *
 * When the base path is `s3://...`, the factory pulls the existing
 * `S3_*` credentials (used by src/lib/storage.ts for images) and hands
 * them to DuckDB's httpfs extension. No new env vars to provision.
 *
 * Extension cache location is configurable via `DUCKDB_EXTENSION_DIR`.
 * On Vercel serverless, HOME may not be writable — set this to
 * `/tmp/duckdb-extensions` in the deploy config.
 */
const DEFAULT_DUCKDB_BASE_PATH = "data/parquet/candles"

const getCandleStore = (): CandleStore => {
	const basePath =
		process.env.CANDLE_STORE_DUCKDB_BASE_PATH ?? DEFAULT_DUCKDB_BASE_PATH
	const isRemote = basePath.startsWith("s3://")
	if (isRemote) {
		const endpoint = process.env.S3_ENDPOINT
		const accessKeyId = process.env.S3_ACCESS_KEY_ID
		const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
		const region = process.env.S3_REGION ?? "auto"
		if (!endpoint || !accessKeyId || !secretAccessKey) {
			throw new Error(
				"candle-store: s3:// basePath requires S3_ENDPOINT, " +
					"S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY env vars"
			)
		}
		return createDuckDbCandleStore({
			basePath,
			s3Config: { endpoint, region, accessKeyId, secretAccessKey },
			extensionDirectory: process.env.DUCKDB_EXTENSION_DIR,
		})
	}
	return createDuckDbCandleStore({ basePath })
}

export { getCandleStore, createDuckDbCandleStore }
export type { CandleStore, FetchRangeParams } from "./interface"
