import "dotenv/config"
import { seedAccounts } from "./seed/accounts"
import { ADMIN_EMAIL, seedAdminUser } from "./seed/admin-user"
import { seedAssets } from "./seed/assets"
import { seedTradingConditions } from "./seed/conditions"
import { cleanup } from "./seed/cleanup"
import { seedHawksRenkoAndOco } from "./seed/hawks-renko-oco"
import { seedHawksScenarios } from "./seed/hawks-scenarios"
import { closeSeedSql, createSeedSql } from "./seed/helpers/sql"
import { seedSettings } from "./seed/settings"
import { seedStrategies } from "./seed/strategies"
import { seedTags } from "./seed/tags"
import { seedTimeframes } from "./seed/timeframes"
import { verify } from "./seed/verify"

/**
 * Axion seed orchestrator — Hawks reseed, rebuilt 2026-09-01.
 * Run with: pnpm db:seed (ADMIN_PASSWORD comes from .env).
 *
 * This replaces a seed that produced seven demo-persona accounts with generated
 * trade narratives. Everything here is reference data derived from the merged
 * Hawks doctrine in ~/vault. No trades are seeded: the journal starts empty on
 * purpose, because the 208-trade backtest set it used to import was computed
 * against a synthetic Renko table (plan artifact §C1/§B5).
 *
 *   1. Cleanup      → dynamic TRUNCATE of all public tables
 *   2. Admin user   → one user
 *   3. Account      → one account, Hawks mode, default
 *   4. Assets       → WIN + WDO, asset types, account_assets
 *   5. Timeframes   → 1m, 5m, 15m, 60m, 1d (the triple-screen ladder)
 *   6. Strategies   → 8 Hawks families covering all 47 codes, 7 active
 *   7. Tags         → 32 rows on four prefix axes, derived from the active codes
 *   8. Settings     → global defaults
 *   9. Renko + OCO  → 268 measured rows per table, both assets, 134 weeks
 *  10. Scenarios    → 24 global setups, Hawks mean periods only
 *  11. Conditions   → 22 checklist items, Cláudia corrected to the Hawks Cloud
 *  12. Verify       → asserts counts and derivation, throws on mismatch
 */
const runSeed = async (): Promise<void> => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("❌ DATABASE_URL environment variable is not set")
		process.exit(1)
	}

	const sql = createSeedSql(databaseUrl)
	console.log("🔗 Connected to database")

	await cleanup(sql)
	const admin = await seedAdminUser(sql)
	const accounts = await seedAccounts(sql, admin.id)
	const { assetMap } = await seedAssets(sql, accounts)
	await seedTimeframes(sql)
	await seedStrategies(sql, admin.id)
	await seedTags(sql, admin.id)
	await seedSettings(sql)
	await seedHawksRenkoAndOco(sql, assetMap, accounts.primary.id)
	await seedHawksScenarios(sql)
	await seedTradingConditions(sql, admin.id)
	await verify(sql)

	console.log("\n🎉 Seed completed!")
	console.log(`\n📝 Login: ${ADMIN_EMAIL} (password from $ADMIN_PASSWORD)`)

	await closeSeedSql(sql)
	process.exit(0)
}

runSeed().catch((err) => {
	console.error("❌ Seed failed:", err)
	process.exit(1)
})
