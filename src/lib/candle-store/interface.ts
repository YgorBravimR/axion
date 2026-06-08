import type { CandleRow } from "@/types/candle"

/**
 * Storage-backend-agnostic candle reader.
 *
 * Phase 1 of the price_candles → R2+DuckDB migration (docs/backlog.md
 * 2026-06-08). Every caller that today queries `priceCandles` directly
 * via Drizzle moves through this interface. Two implementations:
 *
 *   - drizzle-impl.ts  — current Postgres/JSONB path. Kept until cutover.
 *   - duckdb-impl.ts   — Parquet on local disk (phase 1) → R2 (phase 2).
 *
 * IDs in, rows out. The implementation resolves UUID → human key
 * (symbol/code) internally when needed; callers don't change.
 */
interface CandleStore {
	fetchRange(_params: FetchRangeParams): Promise<CandleRow[]>
}

interface FetchRangeParams {
	assetId: string
	timeframeId: string
	from: Date
	to: Date
	/**
	 * Which indicator columns to include in the returned rows.
	 *   - `undefined` (default) or `[]` : no indicators (just OHLC + candleIndex)
	 *   - explicit array of keys       : project only those (case-sensitive)
	 *   - the sentinel `"*"`           : return every indicator the row carries
	 *
	 * The DuckDB impl uses this to push column-projection into the
	 * Parquet read — the whole columnar-storage win. Drizzle impl
	 * honors it by filtering the JSONB read-side after the row arrives
	 * (no I/O savings, just API parity).
	 */
	indicatorKeys?: string[] | "*"
}

export type { CandleStore, FetchRangeParams }
