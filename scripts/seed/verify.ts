import type { SeedSql } from "./helpers/sql"

// Counts by `user_id`, not the deprecated `account_id`.
//
// `strategies` and `tags` both carry a canonical `user_id` and an
// `@deprecated account_id`. The previous seeders wrote only `account_id`,
// leaving `user_id` NULL, which meant the unique indexes on
// (user_id, code) and (user_id, name) enforced nothing and every
// user-scoped read in the app returned zero rows. Verifying by user_id is
// what catches a regression back to that.

interface CountRow {
	[key: string]: number | string
}

const EXPECTED = {
	users: 1,
	trading_accounts: 1,
	timeframes: 5,
	assets: 2,
	strategies: 8,
	tags: 32,
	hawks_renko_sizes: 268,
	hawks_weekly_oco: 268,
	hawks_scenarios: 24,
	trading_conditions: 22,
} as const

export const verify = async (sql: SeedSql): Promise<void> => {
	console.log("\n📊 Verifying seeded data...")

	const rows = (await sql`
		SELECT
			(SELECT COUNT(*) FROM users) as users,
			(SELECT COUNT(*) FROM trading_accounts) as trading_accounts,
			(SELECT COUNT(*) FROM asset_types) as asset_types,
			(SELECT COUNT(*) FROM assets) as assets,
			(SELECT COUNT(*) FROM timeframes) as timeframes,
			(SELECT COUNT(*) FROM strategies) as strategies,
			(SELECT COUNT(*) FROM strategies WHERE user_id IS NULL) as strategies_orphaned,
			(SELECT COUNT(*) FROM strategies WHERE is_active) as strategies_active,
			(SELECT COUNT(*) FROM tags) as tags,
			(SELECT COUNT(*) FROM tags WHERE user_id IS NULL) as tags_orphaned,
			(SELECT COUNT(*) FROM hawks_renko_sizes) as hawks_renko_sizes,
			(SELECT COUNT(*) FROM hawks_weekly_oco) as hawks_weekly_oco,
			(SELECT COUNT(*) FROM hawks_scenarios) as hawks_scenarios,
			(SELECT COUNT(*) FROM trading_conditions) as trading_conditions,
			(SELECT COUNT(*) FROM hawks_scenarios WHERE name_pt ILIKE '%EMA9%' OR name_pt ILIKE '%EMA21%' OR name_pt ILIKE '%EMA50%' OR name_pt ILIKE '%76.4 retra%' OR name_pt ILIKE '%76,4 retra%') as scenarios_non_hawks,
			(SELECT COUNT(*) FROM trading_conditions WHERE description ILIKE '%MACD cloud%') as conditions_bad_claudia,
			(SELECT COUNT(*) FROM trades) as trades,
			(SELECT COUNT(*) FROM settings) as settings
	`) as CountRow[]

	const c = rows[0]
	if (!c) {
		throw new Error("Verify query returned no rows")
	}

	const problems: string[] = []
	for (const [table, want] of Object.entries(EXPECTED)) {
		const got = Number(c[table])
		const ok = got === want
		console.log(
			`   ${ok ? "✅" : "❌"} ${table.padEnd(20)} ${String(got).padStart(4)}  (expected ${want})`
		)
		if (!ok) {
			problems.push(`${table}: got ${got}, expected ${want}`)
		}
	}

	const orphanStrategies = Number(c.strategies_orphaned)
	const orphanTags = Number(c.tags_orphaned)
	console.log(
		`   ${orphanStrategies === 0 ? "✅" : "❌"} strategies with NULL user_id  ${orphanStrategies}`
	)
	console.log(
		`   ${orphanTags === 0 ? "✅" : "❌"} tags with NULL user_id        ${orphanTags}`
	)
	if (orphanStrategies > 0) {
		problems.push(`${orphanStrategies} strategies have a NULL user_id`)
	}
	if (orphanTags > 0) {
		problems.push(`${orphanTags} tags have a NULL user_id`)
	}

	const nonHawks = Number(c.scenarios_non_hawks)
	const badClaudia = Number(c.conditions_bad_claudia)
	console.log(
		`   ${nonHawks === 0 ? "✅" : "❌"} scenarios on non-Hawks means   ${nonHawks} (EMA9/21/50 or 76,4% as retracement)`
	)
	console.log(
		`   ${badClaudia === 0 ? "✅" : "❌"} Cláudia defined as MACD cloud  ${badClaudia}`
	)
	if (nonHawks > 0) {
		problems.push(
			`${nonHawks} scenarios still reference non-Hawks mean periods`
		)
	}
	if (badClaudia > 0) {
		problems.push(
			`${badClaudia} conditions still define Cláudia as the MACD cloud`
		)
	}

	console.log(
		`   ℹ️  strategies active            ${c.strategies_active} (expected 7)`
	)
	console.log(
		`   ℹ️  trades                       ${c.trades} (expected 0, none seeded)`
	)
	console.log(`   ℹ️  settings                     ${c.settings}`)

	// Renko integrity: the three Carnival rows must NOT be Mondays, and the OCO
	// stop must equal 2 * size_5m for every row of both assets.
	const carnival = (await sql`
		SELECT COUNT(*) as n FROM hawks_renko_sizes
		WHERE effective_date IN ('2024-02-14', '2025-03-05', '2026-02-18')
	`) as { n: number | string }[]
	const carnivalCount = Number(carnival[0]?.n ?? 0)
	console.log(
		`   ${carnivalCount === 6 ? "✅" : "❌"} Carnival rows preserved        ${carnivalCount} (expected 6 = 3 weeks x 2 assets)`
	)
	if (carnivalCount !== 6) {
		problems.push(`Carnival rows: got ${carnivalCount}, expected 6`)
	}

	const ocoMismatch = (await sql`
		SELECT COUNT(*) as n
		FROM hawks_weekly_oco o
		JOIN assets a ON a.symbol = o.asset
		JOIN hawks_renko_sizes r
			ON r.asset_id = a.id AND r.effective_date = o.effective_date
		WHERE o.stop_ticks <> r.size_5m * 2
			OR o.breakeven_trigger_ticks <> r.size_5m * 2
			OR o.target_ticks <> r.size_5m * 6
	`) as { n: number | string }[]
	const mismatch = Number(ocoMismatch[0]?.n ?? 0)
	console.log(
		`   ${mismatch === 0 ? "✅" : "❌"} OCO derived from size_5m       ${mismatch} mismatched rows`
	)
	if (mismatch > 0) {
		problems.push(`${mismatch} OCO rows do not match 2x/6x size_5m`)
	}

	if (problems.length > 0) {
		throw new Error(`Verification failed:\n  - ${problems.join("\n  - ")}`)
	}
	console.log("\n✅ All verification checks passed")
}
