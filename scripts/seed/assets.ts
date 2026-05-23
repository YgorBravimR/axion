import type { SeedSql } from "./helpers/sql"
import type { SeededAccounts } from "./accounts"

export interface AssetMap {
	WIN: string
	WDO: string
}

export const seedAssets = async (
	sql: SeedSql,
	accounts: SeededAccounts
): Promise<{ assetMap: AssetMap }> => {
	console.log("\n📦 Seeding asset types...")
	await sql`
		INSERT INTO asset_types (id, code, name, description, is_active) VALUES
			(gen_random_uuid(), 'FUTURE_INDEX', 'Future Index', 'Index futures contracts', true),
			(gen_random_uuid(), 'FUTURE_FX', 'Future FX', 'Currency futures contracts', true)
		ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
	`
	console.log("✅ Asset types seeded")

	console.log("\n📦 Seeding assets...")
	const assetTypes = (await sql`SELECT id, code FROM asset_types`) as {
		id: string
		code: string
	}[]
	const typeMap = new Map(assetTypes.map((t) => [t.code, t.id]))

	// tick_value is stored in cents per tick (1 tick = tick_size points).
	// WIN: R$0.20/pt × 5 pts/tick = R$1.00/tick = 100 cents.
	// WDO: R$10.00/pt × 0.5 pts/tick = R$5.00/tick = 500 cents.
	await sql`
		INSERT INTO assets (id, symbol, name, asset_type_id, tick_size, tick_value, currency, multiplier, is_active) VALUES
			(gen_random_uuid(), 'WIN', 'Mini Índice Bovespa', ${typeMap.get("FUTURE_INDEX")}, 5, 100, 'BRL', 1, true),
			(gen_random_uuid(), 'WDO', 'Mini Dólar', ${typeMap.get("FUTURE_FX")}, 0.5, 500, 'BRL', 1, true)
		ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, tick_size = EXCLUDED.tick_size, tick_value = EXCLUDED.tick_value
	`
	console.log("✅ Assets seeded")

	const assetsData = (await sql`SELECT id, symbol FROM assets`) as {
		id: string
		symbol: string
	}[]
	const assetMap: AssetMap = {
		WIN: assetsData.find((a) => a.symbol === "WIN")?.id ?? "",
		WDO: assetsData.find((a) => a.symbol === "WDO")?.id ?? "",
	}
	if (!assetMap.WIN || !assetMap.WDO) {
		throw new Error("Failed to seed assets — WIN or WDO missing")
	}

	console.log("\n📦 Seeding account assets...")
	for (const account of accounts.all) {
		await sql`
			INSERT INTO account_assets (id, account_id, asset_id, is_enabled) VALUES
				(gen_random_uuid(), ${account.id}, ${assetMap.WIN}, true),
				(gen_random_uuid(), ${account.id}, ${assetMap.WDO}, true)
		`
	}
	console.log(`✅ Account assets seeded (${accounts.all.length} accounts)`)

	return { assetMap }
}
