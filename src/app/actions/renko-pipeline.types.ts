/**
 * Types for the Renko pipeline server actions.
 *
 * Why a sibling `.types.ts` file? Next.js `"use server"` modules will
 * silently leak local type declarations at runtime in Turbopack dev —
 * `export type { Foo }` from a `"use server"` file is fine *only* if
 * `Foo` is re-exported from another module, not declared locally. We
 * declare here, the action re-exports, the consumer imports from here.
 * See docs/gotchas.md → "use server type-export leak".
 */

interface RegenerateRenkoResult {
	readonly assetSymbol: string
	readonly rawBarsLoaded: number
	readonly perTimeframe: {
		readonly code: "renko-5m-cal" | "renko-15m-cal" | "renko-60m-cal"
		readonly bricksGenerated: number
		readonly warnings: readonly string[]
	}[]
	readonly weeksCovered: number
}

interface ImportRawOhlcResult {
	readonly assetSymbol: string
	readonly timeframeCode: "1m"
	readonly rowsImported: number
	readonly rowsSkipped: number
	readonly dateFrom: string | null
	readonly dateTo: string | null
}

export type { RegenerateRenkoResult, ImportRawOhlcResult }
