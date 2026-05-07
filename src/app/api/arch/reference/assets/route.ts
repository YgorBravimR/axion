import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { assets, assetTypes, trades } from "@/db/schema"
import { eq, asc, inArray } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"

const GET = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const configuredAssets = await db
			.select({
				id: assets.id,
				symbol: assets.symbol,
				name: assets.name,
				assetTypeName: assetTypes.name,
				tickSize: assets.tickSize,
				tickValue: assets.tickValue,
				currency: assets.currency,
				multiplier: assets.multiplier,
				isActive: assets.isActive,
			})
			.from(assets)
			.innerJoin(assetTypes, eq(assets.assetTypeId, assetTypes.id))
			.orderBy(asc(assets.symbol))

		const tradedSymbolRows = await db
			.selectDistinct({ asset: trades.asset })
			.from(trades)
			.where(inArray(trades.accountId, auth.allAccountIds))
			.orderBy(asc(trades.asset))

		const tradedSymbols = tradedSymbolRows.map((row) => row.asset)

		return archSuccess("Assets retrieved successfully", {
			configuredAssets,
			tradedSymbols,
		})
	} catch (error) {
		return archError(
			"Failed to fetch assets",
			[{ code: "FETCH_FAILED", detail: String(error) }],
			500
		)
	}
}

export { GET }
