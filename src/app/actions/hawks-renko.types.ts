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
	size5m: number
	size15m: number
	size60m: number
	/**
	 * Per-row asset symbol from the optional `ASSET` column in the CSV.
	 * `null` falls back to the `assetSymbol` arg passed to
	 * `importHawksRenkoSizes` (which defaults to "WIN").
	 */
	assetSymbol?: string | null
}

export type { RenkoSizeRow }
