/**
 * Centralized asset symbol resolution pipeline.
 *
 * Every trade creation flow MUST use `resolveTradeAsset` to normalize
 * the incoming symbol to a canonical asset that exists in the database.
 *
 * Resolution order:
 *   1. Extract the B3 futures prefix if applicable (WING26 → WIN, WDOH25 → WDO)
 *   2. Build candidate symbols: [exact, prefix, prefixFUT]
 *   3. Match against registered assets in priority order
 *   4. Return the matched asset's symbol (the DB-canonical form)
 *
 * If no asset is found, the original uppercased symbol is returned
 * so existing fallback logic (simple P&L calc) still works.
 */

/** B3 futures prefixes that should be normalized to their base form */
const B3_FUT_PREFIXES = [
	"WIN",
	"WDO",
	"DOL",
	"IND",
	"BGI",
	"CCM",
	"ICF",
	"SFI",
	"DI1",
]

/**
 * Extract the B3 futures prefix from a symbol.
 *
 * @example extractB3Prefix("WING26") → "WIN"
 * @example extractB3Prefix("WDOFUT") → "WDO"
 * @example extractB3Prefix("PETR4") → null
 */
const extractB3Prefix = (symbol: string): string | null => {
	const upper = symbol.toUpperCase()
	return B3_FUT_PREFIXES.find((prefix) => upper.startsWith(prefix)) ?? null
}

interface ResolvedAsset {
	/** The canonical symbol to store in the trades table */
	symbol: string
	/** Whether the symbol was resolved against a known asset */
	found: boolean
}

/**
 * Resolve a raw asset symbol to its canonical form.
 *
 * Uses an asset lookup map (symbol → true) from the database.
 * The map should contain all registered asset symbols uppercased.
 *
 * @param rawSymbol - The incoming symbol (e.g., "WING26", "WINFUT", "WIN", "PETR4")
 * @param registeredSymbols - Set of all registered asset symbols (uppercased)
 * @returns The canonical symbol and whether it was found
 */
const resolveTradeAsset = (
	rawSymbol: string,
	registeredSymbols: Set<string>
): ResolvedAsset => {
	const upper = rawSymbol.toUpperCase().trim()
	const prefix = extractB3Prefix(upper)

	if (prefix) {
		// Build candidates in priority order: prefix first (WIN), then exact input, then FUT variant
		const candidates = [...new Set([prefix, upper, `${prefix}FUT`])]

		for (const candidate of candidates) {
			if (registeredSymbols.has(candidate)) {
				return { symbol: candidate, found: true }
			}
		}

		// No match found — preserve the original symbol to avoid silent data loss
		return { symbol: upper, found: false }
	}

	// Non-futures: try exact match
	if (registeredSymbols.has(upper)) {
		return { symbol: upper, found: true }
	}

	return { symbol: upper, found: false }
}

export { resolveTradeAsset, extractB3Prefix, B3_FUT_PREFIXES }
export type { ResolvedAsset }
