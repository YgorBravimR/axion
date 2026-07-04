/**
 * Types for the Hawks Renko server actions.
 *
 * Why a sibling `.types.ts` file? Next.js `"use server"` modules will
 * silently leak local type declarations at runtime in Turbopack dev —
 * `export type { Foo }` from a `"use server"` file is fine *only* if
 * `Foo` is re-exported from another module, not declared locally. We
 * declare here, the action re-exports, the consumer imports from here.
 * See docs/gotchas.md → "use server type-export leak".
 */

interface RenkoSizeRow {
	effectiveDate: string // ISO "YYYY-MM-DD"
	weekNumber: number
	size1m: number | null
	size5m: number
	size15m: number
	size60m: number
	size1d: number | null
	/**
	 * Per-row asset symbol from the optional `ASSET` column in the CSV.
	 * `null` falls back to the `assetSymbol` arg passed to
	 * `importHawksRenkoSizes` (which defaults to "WIN").
	 */
	assetSymbol?: string | null
}

interface RenkoSizeRecord {
	id: string
	effectiveDate: string
	weekNumber: number
	size1m: number | null
	size5m: number
	size15m: number
	size60m: number
	size1d: number | null
}

interface UpsertRenkoSizeInput {
	effectiveDate: string // ISO YYYY-MM-DD (Monday of the ISO week)
	weekNumber: number
	size1m: number | null
	size5m: number
	size15m: number
	size60m: number
	size1d: number | null
}

export type { RenkoSizeRow, RenkoSizeRecord, UpsertRenkoSizeInput }
