import type { SeedSql } from "./helpers/sql"

interface CountRow {
	users: number | string
	accounts: number | string
	asset_types: number | string
	assets: number | string
	timeframes: number | string
	strategies: number | string
	tags: number | string
	trades: number | string
	settings: number | string
}

interface AccountBreakdownRow {
	account_name: string
	account_type: string
	trade_count: number | string
	strategy_count: number | string
	tag_count: number | string
}

export const verify = async (sql: SeedSql): Promise<void> => {
	console.log("\n📊 Verifying seeded data...")
	const counts = (await sql`
		SELECT
			(SELECT COUNT(*) FROM users) as users,
			(SELECT COUNT(*) FROM trading_accounts) as accounts,
			(SELECT COUNT(*) FROM asset_types) as asset_types,
			(SELECT COUNT(*) FROM assets) as assets,
			(SELECT COUNT(*) FROM timeframes) as timeframes,
			(SELECT COUNT(*) FROM strategies) as strategies,
			(SELECT COUNT(*) FROM tags) as tags,
			(SELECT COUNT(*) FROM trades) as trades,
			(SELECT COUNT(*) FROM settings) as settings
	`) as CountRow[]

	const c = counts[0]
	if (!c) {
		throw new Error("Verify query returned no rows")
	}
	console.log(`   Users:          ${c.users}`)
	console.log(`   Accounts:       ${c.accounts}`)
	console.log(`   Asset Types:    ${c.asset_types}`)
	console.log(`   Assets:         ${c.assets}`)
	console.log(`   Timeframes:     ${c.timeframes}`)
	console.log(`   Strategies:     ${c.strategies}`)
	console.log(`   Tags:           ${c.tags}`)
	console.log(`   Trades:         ${c.trades}`)
	console.log(`   Settings:       ${c.settings}`)

	const accountCounts = (await sql`
		SELECT
			ta.name as account_name,
			ta.account_type,
			(SELECT COUNT(*) FROM trades WHERE account_id = ta.id) as trade_count,
			(SELECT COUNT(*) FROM strategies WHERE account_id = ta.id) as strategy_count,
			(SELECT COUNT(*) FROM tags WHERE account_id = ta.id) as tag_count
		FROM trading_accounts ta
		ORDER BY ta.is_default DESC, ta.name
	`) as AccountBreakdownRow[]

	console.log("\n📊 Per-account breakdown:")
	for (const acc of accountCounts) {
		console.log(`   ${acc.account_name} (${acc.account_type}):`)
		console.log(`      - Trades: ${acc.trade_count}`)
		console.log(`      - Strategies: ${acc.strategy_count}`)
		console.log(`      - Tags: ${acc.tag_count}`)
	}
}
