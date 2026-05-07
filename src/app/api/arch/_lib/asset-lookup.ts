import { db } from "@/db/drizzle"
import { assets, tradingAccounts, accountAssets } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { resolveTradeAsset } from "@/lib/asset-resolution"
import { getRegisteredAssetSymbols } from "@/app/actions/assets"

interface AssetConfig {
	id: string
	symbol: string
	tickSize: string
	tickValue: number
}

/**
 * Looks up an asset by symbol using the centralized resolution pipeline.
 * Resolves B3 futures variants (WING26, WINFUT) to the canonical symbol (WIN).
 *
 * @param symbol - The asset symbol to look up
 * @returns The asset config or null
 */
const getAssetBySymbol = async (
	symbol: string
): Promise<AssetConfig | null> => {
	const registeredSymbols = await getRegisteredAssetSymbols()
	const resolved = resolveTradeAsset(symbol, registeredSymbols)

	const result = await db.query.assets.findFirst({
		where: eq(assets.symbol, resolved.symbol),
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
	if (!account) {
		return 2
	}

	const asset = await db.query.assets.findFirst({
		where: eq(assets.symbol, assetSymbol),
	})
	if (!asset) {
		return account.defaultBreakevenTicks
	}

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
