import "dotenv/config"
import { ADMIN_EMAIL, seedAdminUser } from "./seed/admin-user"
import { seedAccounts } from "./seed/accounts"
import { seedAssets } from "./seed/assets"
import { cleanup } from "./seed/cleanup"
import { seedTradingConditions } from "./seed/conditions"
import { seedHawksScenarios } from "./seed/hawks-scenarios"
import { seedHawksPlaybooks } from "./seed/playbooks-hawks"
import { seedHawksRenkoAndOco } from "./seed/hawks-renko-oco"
import { seedPlanCascades } from "./seed/plans"
import { closeSeedSql, createSeedSql } from "./seed/helpers/sql"
import { seedSettings } from "./seed/settings"
import { seedStrategies } from "./seed/strategies"
import { seedTags } from "./seed/tags"
import { seedTimeframes } from "./seed/timeframes"
import { seedAtomFundedTrades } from "./seed/trades/atom-funded"
import { seedPersonalTrades } from "./seed/trades/personal"
import { verify } from "./seed/verify"

/**
 * Axion seed orchestrator
 * Run with: pnpm db:seed (requires ADMIN_PASSWORD env var).
 *
 * Subjects:
 *   1. Cleanup        → scripts/seed/cleanup.ts
 *   2. Admin user     → scripts/seed/admin-user.ts
 *   3. Accounts       → scripts/seed/accounts.ts          (7 accounts incl. Hawks Pro)
 *   4-5.1. Assets     → scripts/seed/assets.ts
 *   6. Timeframes     → scripts/seed/timeframes.ts
 *   7. Strategies     → scripts/seed/strategies.ts        (per-account legacy)
 *   8. Tags           → scripts/seed/tags.ts
 *   9. Settings       → scripts/seed/settings.ts
 *  10. Hawks scenarios   → scripts/seed/hawks-scenarios.ts (global, 24 rows)
 *  11. Trading conditions→ scripts/seed/conditions.ts      (18 user-scoped)
 *  12. Hawks playbooks   → scripts/seed/playbooks-hawks.ts (4 strategies + tiered conditions)
 *  13. Plan cascades     → scripts/seed/plans.ts           (6 accounts, 2025+2026)
 *  14. Renko + OCO       → scripts/seed/hawks-renko-oco.ts (Hawks Pro 22 weeks)
 *  15. Personal trades   → scripts/seed/trades/personal.ts (Jan–May 2026)
 *  16. Atom Funded trades→ scripts/seed/trades/atom-funded.ts (Jan 2025 – Mar 2026)
 *  17. Hawks Pro trades  → upcoming commit #7b
 *  18. Greenline trades  → upcoming commit #7c
 *  19. Stop Loss Lab     → upcoming commit #7d
 *  20. Beginner trades   → upcoming commit #7e
 *  21. Verify            → scripts/seed/verify.ts
 *
 * B3 trading hours: 09:00–17:55 São Paulo (12:00–20:55 UTC).
 */

const runSeed = async (): Promise<void> => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("❌ DATABASE_URL environment variable is not set")
		process.exit(1)
	}

	const sql = createSeedSql(databaseUrl)
	console.log("🔗 Connected to database\n")

	await cleanup(sql)
	const admin = await seedAdminUser(sql)
	const accounts = await seedAccounts(sql, admin.id)
	await seedAssets(sql, accounts)
	await seedTimeframes(sql)
	const strategyMap = await seedStrategies(sql, accounts)
	await seedTags(sql, accounts)
	await seedSettings(sql)

	// Hawks methodology: global scenarios + user-scoped conditions + playbooks.
	await seedHawksScenarios(sql)
	const conditionMap = await seedTradingConditions(sql, admin.id)
	const hawksPlaybooks = await seedHawksPlaybooks(sql, admin.id, conditionMap)

	// Plan cascades + Hawks Renko/OCO.
	const cascades = await seedPlanCascades(sql, accounts, hawksPlaybooks)
	await seedHawksRenkoAndOco(sql, accounts)

	// Trade generation per account narrative.
	await seedPersonalTrades(sql, accounts, cascades, strategyMap)
	await seedAtomFundedTrades(sql, accounts, cascades, strategyMap)
	// Hawks Pro / Greenline / Stop Loss Lab / Beginner — upcoming commits.

	await verify(sql)

	console.log("\n🎉 Seed completed!")
	console.log("\n📝 Login credentials:")
	console.log(`   Email:    ${ADMIN_EMAIL}`)
	console.log(`   Password: (from $ADMIN_PASSWORD)`)

	await closeSeedSql(sql)
	process.exit(0)
}

runSeed().catch((err) => {
	console.error("❌ Seed failed:", err)
	process.exit(1)
})
