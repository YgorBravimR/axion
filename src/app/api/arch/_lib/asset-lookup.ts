import { db } from "@/db/drizzle"
import { assets, tradingAccounts, accountAssets } from "@/db/schema"
import { eq, and, inArray } from "drizzle-orm"

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

const extractB3Prefix = (symbol: string): string | null => {
	const upper = symbol.toUpperCase()
	return B3_FUT_PREFIXES.find((prefix) => upper.startsWith(prefix)) ?? null
}

interface AssetConfig {
	id: string
	symbol: string
	tickSize: string
	tickValue: number
}

/**
 * Looks up an asset by symbol with B3 futures prefix fallback.
 * Tries exact match first, then prefix, then prefixFUT.
 *
 * @param symbol - The asset symbol to look up
 * @returns The asset config or null
 */
const getAssetBySymbol = async (
	symbol: string
): Promise<AssetConfig | null> => {
	const upper = symbol.toUpperCase()
	const prefix = extractB3Prefix(upper)

	if (prefix) {
		const candidates = [...new Set([upper, prefix, `${prefix}FUT`])]
		const results = await db.query.assets.findMany({
			where: inArray(assets.symbol, candidates),
		})
		return (
			results.find((asset) => asset.symbol === upper) ??
			results.find((asset) => asset.symbol === prefix) ??
			results.find((asset) => asset.symbol === `${prefix}FUT`) ??
			null
		)
	}

	const result = await db.query.assets.findFirst({
		where: eq(assets.symbol, upper),
	})
	return result ?? null
}

/**
 * Resolves breakeven ticks for an asset within a trading account.
 * Falls back to account default, then to 2 if no account found.
 *
 * @param assetSymbol - The asset symbol to look up
 * @param accountId - The trading account ID
 * @returns The breakeven ticks value
 */
const getBreakevenTicks = async (
	assetSymbol: string,
	accountId: string
): Promise<number> => {
	const account = await db.query.tradingAccounts.findFirst({
		where: eq(tradingAccounts.id, accountId),
	})
	if (!account) return 2

	const asset = await db.query.assets.findFirst({
		where: eq(assets.symbol, assetSymbol),
	})
	if (!asset) return account.defaultBreakevenTicks

	const assetConfig = await db.query.accountAssets.findFirst({
		where: and(
			eq(accountAssets.accountId, accountId),
			eq(accountAssets.assetId, asset.id)
		),
	})
	return assetConfig?.breakevenTicksOverride ?? account.defaultBreakevenTicks
}

export { getAssetBySymbol, getBreakevenTicks }
export type { AssetConfig }
