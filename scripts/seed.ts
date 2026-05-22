import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import bcrypt from "bcryptjs"
import { isNeonUrl } from "@/db/url"

/**
 * Seed script for Axion
 * Run with: pnpm db:seed
 *
 * Creates:
 * - 1 Admin user (admin@axion.com / Admin123!)
 * - 3 Trading accounts:
 *   1. Personal (default) - with trades (Nov 2025 - Jan 2026)
 *   2. Atom Prop Firm - with trades (Nov 2025 - Jan 2026)
 *   3. Demo Account - empty (no trades)
 *
 * B3 Trading Hours: 09:00-17:55 (São Paulo, UTC-3)
 * Asset P&L Calculations (per point per contract):
 * - WIN: R$0.20/pt (tick_size=5, tick_value=R$1.00/tick = 100 cents)
 * - WDO: R$10.00/pt (tick_size=0.5, tick_value=R$5.00/tick = 500 cents)
 *
 * Date Range: November 1, 2025 to January 31, 2026
 */

const ADMIN_EMAIL = "admin@axion.com"
const ADMIN_PASSWORD = "Admin123!"
const SALT_ROUNDS = 12

// Asset P&L multipliers (per point per contract)
const WIN_PER_POINT = 0.2 // R$0.20 per point per contract
const WDO_PER_POINT = 10.0 // R$10.00 per point per contract

// Helper to calculate P&L based on asset
const calculatePnl = (
	asset: string,
	direction: string,
	entryPrice: number,
	exitPrice: number,
	size: number
): number => {
	const pointsPerContract = asset === "WIN" ? WIN_PER_POINT : WDO_PER_POINT
	const priceDiff =
		direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
	return Math.round(priceDiff * size * pointsPerContract * 100) / 100
}

// Brazilian holidays in the date range (B3 closed)
const B3_HOLIDAYS = [
	"2025-11-15", // Proclamação da República (Saturday)
	"2025-12-24", // Christmas Eve
	"2025-12-25", // Christmas
	"2025-12-31", // New Year's Eve
	"2026-01-01", // New Year
]

// Check if date is a trading day (Mon-Fri, not holiday)
const isTradingDay = (date: Date): boolean => {
	const dayOfWeek = date.getDay()
	if (dayOfWeek === 0 || dayOfWeek === 6) {
		return false
	} // Weekend
	const dateStr = date.toISOString().split("T")[0]
	return !B3_HOLIDAYS.includes(dateStr)
}

// Get trading days in a range
const getTradingDays = (startDate: Date, endDate: Date): Date[] => {
	const days: Date[] = []
	const current = new Date(startDate)
	while (current <= endDate) {
		if (isTradingDay(current)) {
			days.push(new Date(current))
		}
		current.setDate(current.getDate() + 1)
	}
	return days
}

// Generate random time within B3 trading hours (09:00-17:55 São Paulo = 12:00-20:55 UTC)
const randomTradingTime = (
	date: Date,
	startHour = 12,
	endHour = 20
): string => {
	const hour = startHour + Math.floor(Math.random() * (endHour - startHour))
	const minute = Math.floor(Math.random() * 60)
	const d = new Date(date)
	d.setUTCHours(hour, minute, 0, 0)
	return d.toISOString().replace("T", " ").replace("Z", "+00")
}

// Generate exit time 15min to 4h after entry
const generateExitTime = (entryTime: string): string => {
	const entry = new Date(entryTime.replace(" ", "T").replace("+00", "Z"))
	const durationMinutes = 15 + Math.floor(Math.random() * 225) // 15min to 4h
	entry.setMinutes(entry.getMinutes() + durationMinutes)
	// Cap at 20:55 UTC (17:55 São Paulo)
	if (entry.getUTCHours() >= 21) {
		entry.setUTCHours(20, 55, 0, 0)
	}
	return entry.toISOString().replace("T", " ").replace("Z", "+00")
}

const runSeed = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("❌ DATABASE_URL environment variable is not set")
		process.exit(1)
	}

	// Pick driver by URL: Neon HTTPS for prod/staging, postgres-js for local
	// or any other wire-protocol Postgres (e.g. per-worktree dbs). Both expose
	// the same tagged-template `sql\`…\`` API used throughout this seed.
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)
	console.log("🔗 Connected to database\n")

	// ==========================================
	// 1. Clean up existing data (in order due to FK constraints)
	// ==========================================
	console.log("🧹 Cleaning existing data...")
	await sql`DELETE FROM trade_tags`
	await sql`DELETE FROM trade_executions`
	await sql`DELETE FROM trades`
	await sql`DELETE FROM strategies WHERE account_id IS NOT NULL`
	await sql`DELETE FROM tags WHERE account_id IS NOT NULL`
	await sql`DELETE FROM account_assets`
	await sql`DELETE FROM account_timeframes`
	await sql`DELETE FROM sessions`
	await sql`DELETE FROM trading_accounts`
	await sql`DELETE FROM users`
	console.log("✅ Existing user data cleaned")

	// ==========================================
	// 2. Create Admin User
	// ==========================================
	console.log("\n👤 Creating admin user...")
	const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS)

	const [adminUser] = await sql`
		INSERT INTO users (id, name, email, password_hash, is_admin, role, preferred_locale, theme)
		VALUES (gen_random_uuid(), 'Admin User', ${ADMIN_EMAIL}, ${passwordHash}, true, 'admin', 'en', 'dark')
		RETURNING id
	`
	console.log(`✅ Admin user created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)

	// ==========================================
	// 3. Create Trading Accounts
	// ==========================================
	console.log("\n💼 Creating trading accounts...")

	// Account 1: Personal (default)
	const [personalAccount] = await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			default_currency
		) VALUES (
			gen_random_uuid(), ${adminUser.id}, 'Personal', 'My personal trading account',
			true, 'personal', 'BRL'
		)
		RETURNING id
	`
	console.log("   ✅ Personal account created (default)")

	// Account 2: Prop Firm (Atom)
	const [propAccount] = await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			prop_firm_name, profit_share_percentage,
			default_currency, show_prop_calculations
		) VALUES (
			gen_random_uuid(), ${adminUser.id}, 'Atom Funded', 'My Atom prop firm account',
			false, 'prop', 'Atom', 80.00, 'BRL', true
		)
		RETURNING id
	`
	console.log("   ✅ Atom Prop account created (80% profit share)")

	// Account 3: Demo (empty)
	const [demoAccount] = await sql`
		INSERT INTO trading_accounts (
			id, user_id, name, description, is_default, account_type,
			default_currency
		) VALUES (
			gen_random_uuid(), ${adminUser.id}, 'Demo Account', 'Practice account - no real trades',
			false, 'personal', 'BRL'
		)
		RETURNING id
	`
	console.log("   ✅ Demo account created (empty)")

	// ==========================================
	// 4. Asset Types
	// ==========================================
	console.log("\n📦 Seeding asset types...")
	await sql`
		INSERT INTO asset_types (id, code, name, description, is_active) VALUES
			(gen_random_uuid(), 'FUTURE_INDEX', 'Future Index', 'Index futures contracts', true),
			(gen_random_uuid(), 'FUTURE_FX', 'Future FX', 'Currency futures contracts', true)
		ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
	`
	console.log("✅ Asset types seeded")

	// ==========================================
	// 5. Assets
	// ==========================================
	console.log("\n📦 Seeding assets...")
	const assetTypes = await sql`SELECT id, code FROM asset_types`
	const typeMap = new Map(assetTypes.map((t) => [t.code, t.id]))

	// tick_value is stored in cents per tick (1 tick = tickSize points)
	// WIN: R$0.20/pt × 5 pts/tick = R$1.00/tick = 100 cents
	// WDO: R$10.00/pt × 0.5 pts/tick = R$5.00/tick = 500 cents
	await sql`
		INSERT INTO assets (id, symbol, name, asset_type_id, tick_size, tick_value, currency, multiplier, is_active) VALUES
			(gen_random_uuid(), 'WIN', 'Mini Índice Bovespa', ${typeMap.get("FUTURE_INDEX")}, 5, 100, 'BRL', 1, true),
			(gen_random_uuid(), 'WDO', 'Mini Dólar', ${typeMap.get("FUTURE_FX")}, 0.5, 500, 'BRL', 1, true)
		ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, tick_size = EXCLUDED.tick_size, tick_value = EXCLUDED.tick_value
	`
	console.log("✅ Assets seeded")

	// Get asset IDs for account_assets
	const assetsData = await sql`SELECT id, symbol FROM assets`
	const assetMap = new Map(assetsData.map((a) => [a.symbol, a.id]))

	// ==========================================
	// 5.1 Account Assets (commission/fees per account)
	// ==========================================
	console.log("\n📦 Seeding account assets...")

	// Personal account - enable both assets
	await sql`
		INSERT INTO account_assets (id, account_id, asset_id, is_enabled) VALUES
			(gen_random_uuid(), ${personalAccount.id}, ${assetMap.get("WIN")}, true),
			(gen_random_uuid(), ${personalAccount.id}, ${assetMap.get("WDO")}, true)
	`

	// Prop account - enable both assets
	await sql`
		INSERT INTO account_assets (id, account_id, asset_id, is_enabled) VALUES
			(gen_random_uuid(), ${propAccount.id}, ${assetMap.get("WIN")}, true),
			(gen_random_uuid(), ${propAccount.id}, ${assetMap.get("WDO")}, true)
	`

	// Demo account - enable both assets
	await sql`
		INSERT INTO account_assets (id, account_id, asset_id, is_enabled) VALUES
			(gen_random_uuid(), ${demoAccount.id}, ${assetMap.get("WIN")}, true),
			(gen_random_uuid(), ${demoAccount.id}, ${assetMap.get("WDO")}, true)
	`
	console.log("✅ Account assets seeded")

	// ==========================================
	// 6. Timeframes
	// ==========================================
	console.log("\n📦 Seeding timeframes...")
	await sql`
		INSERT INTO timeframes (id, code, name, type, value, unit, sort_order, is_active) VALUES
			(gen_random_uuid(), '1m', '1 Minute', 'time_based', 1, 'minutes', 1, true),
			(gen_random_uuid(), '5m', '5 Minutes', 'time_based', 5, 'minutes', 2, true),
			(gen_random_uuid(), '15m', '15 Minutes', 'time_based', 15, 'minutes', 3, true),
			(gen_random_uuid(), '1h', '1 Hour', 'time_based', 1, 'hours', 5, true),
			(gen_random_uuid(), '1d', 'Daily', 'time_based', 1, 'days', 7, true)
		ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
	`
	console.log("✅ Timeframes seeded")

	// ==========================================
	// 7. Strategies (per account)
	// ==========================================
	console.log("\n📦 Seeding strategies...")

	// Delete existing global strategies and recreate per-account
	await sql`DELETE FROM strategies`

	// Personal account strategies
	await sql`
		INSERT INTO strategies (id, account_id, name, code, description, final_r, max_risk_percent, is_active) VALUES
			(gen_random_uuid(), ${personalAccount.id}, 'Breakout', 'BREAKOUT', 'Trade breakouts from consolidation', 2.0, 1.0, true),
			(gen_random_uuid(), ${personalAccount.id}, 'Trend Following', 'TREND', 'Follow established trends', 3.0, 2.0, true),
			(gen_random_uuid(), ${personalAccount.id}, 'Mean Reversion', 'REVERSION', 'Fade extreme moves back to mean', 1.5, 0.5, true),
			(gen_random_uuid(), ${personalAccount.id}, 'Support/Resistance', 'SR', 'Trade bounces from key levels', 2.0, 1.0, true)
	`

	// Prop account strategies (similar but separate)
	await sql`
		INSERT INTO strategies (id, account_id, name, code, description, final_r, max_risk_percent, is_active) VALUES
			(gen_random_uuid(), ${propAccount.id}, 'Breakout', 'BREAKOUT', 'Trade breakouts from consolidation', 2.0, 0.5, true),
			(gen_random_uuid(), ${propAccount.id}, 'Trend Following', 'TREND', 'Follow established trends', 3.0, 1.0, true),
			(gen_random_uuid(), ${propAccount.id}, 'Scalping', 'SCALP', 'Quick in-and-out trades', 1.0, 0.25, true)
	`

	// Demo account strategies
	await sql`
		INSERT INTO strategies (id, account_id, name, code, description, final_r, max_risk_percent, is_active) VALUES
			(gen_random_uuid(), ${demoAccount.id}, 'Test Strategy', 'TEST', 'For testing purposes', 1.0, 1.0, true)
	`
	console.log("✅ Strategies seeded (per account)")

	// ==========================================
	// 8. Tags (per account)
	// ==========================================
	console.log("\n📦 Seeding tags...")

	// Delete existing global tags and recreate per-account
	await sql`DELETE FROM tags`

	// Personal account tags
	await sql`
		INSERT INTO tags (id, account_id, name, type, color, description) VALUES
			(gen_random_uuid(), ${personalAccount.id}, 'Breakout', 'setup', '#22c55e', 'Price breaking out of consolidation'),
			(gen_random_uuid(), ${personalAccount.id}, 'Pullback', 'setup', '#3b82f6', 'Entry on pullback in trend'),
			(gen_random_uuid(), ${personalAccount.id}, 'Reversal', 'setup', '#8b5cf6', 'Counter-trend reversal trade'),
			(gen_random_uuid(), ${personalAccount.id}, 'Momentum', 'setup', '#f59e0b', 'Trading strong momentum moves'),
			(gen_random_uuid(), ${personalAccount.id}, 'FOMO', 'mistake', '#ef4444', 'Entered due to fear of missing out'),
			(gen_random_uuid(), ${personalAccount.id}, 'Revenge Trade', 'mistake', '#991b1b', 'Traded to recover losses'),
			(gen_random_uuid(), ${personalAccount.id}, 'No Plan', 'mistake', '#b91c1c', 'Entered without clear plan'),
			(gen_random_uuid(), ${personalAccount.id}, 'Overtrading', 'mistake', '#f97316', 'Took too many trades')
	`

	// Prop account tags
	await sql`
		INSERT INTO tags (id, account_id, name, type, color, description) VALUES
			(gen_random_uuid(), ${propAccount.id}, 'A+ Setup', 'setup', '#22c55e', 'Perfect textbook setup'),
			(gen_random_uuid(), ${propAccount.id}, 'B Setup', 'setup', '#3b82f6', 'Good setup, minor flaws'),
			(gen_random_uuid(), ${propAccount.id}, 'Scalp', 'setup', '#8b5cf6', 'Quick scalping trade'),
			(gen_random_uuid(), ${propAccount.id}, 'Risk Violation', 'mistake', '#ef4444', 'Violated risk rules'),
			(gen_random_uuid(), ${propAccount.id}, 'Early Exit', 'mistake', '#f97316', 'Exited too early')
	`

	// Demo account tags
	await sql`
		INSERT INTO tags (id, account_id, name, type, color, description) VALUES
			(gen_random_uuid(), ${demoAccount.id}, 'Test Tag', 'general', '#6b7280', 'For testing')
	`
	console.log("✅ Tags seeded (per account)")

	// ==========================================
	// 9. Settings (global)
	// ==========================================
	console.log("\n📦 Seeding settings...")
	await sql`
		INSERT INTO settings (id, key, value, description) VALUES
			(gen_random_uuid(), 'default_risk_percent', '1.0', 'Default risk percentage per trade'),
			(gen_random_uuid(), 'default_currency', 'BRL', 'Default currency for P&L display'),
			(gen_random_uuid(), 'timezone', 'America/Sao_Paulo', 'User timezone')
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
	`
	console.log("✅ Settings seeded")

	// ==========================================
	// 10. Trades - Personal Account (Nov 2025 - Jan 2026)
	// ==========================================
	console.log("\n📦 Seeding trades for Personal account...")

	// Get strategy IDs for personal account
	const personalStrategies =
		await sql`SELECT id, code FROM strategies WHERE account_id = ${personalAccount.id}`
	const personalStrategyMap = new Map(
		personalStrategies.map((s) => [s.code, s.id])
	)

	// Comprehensive trades from Nov 2025 to Jan 2026
	// P&L calculated using: WIN = R$0.20/pt/contract, WDO = R$10/pt/contract
	// const personalTrades = [
	// 	// ========== NOVEMBER 2025 ==========
	// 	// Nov 3 (Mon) - First day of month, cautious start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-03 12:15:00+00", exit: "2025-11-03 13:45:00+00", entryP: 125000, exitP: 125350, size: 4, sl: 124800, tp: 125600, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Opening breakout, conservative size" },
	// 	{ asset: "WDO", dir: "short", tf: "15m", entry: "2025-11-03 14:00:00+00", exit: "2025-11-03 16:30:00+00", entryP: 5120, exitP: 5095, size: 2, sl: 5135, tp: 5080, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness on risk-on day" },

	// 	// Nov 4 (Tue) - Good momentum day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-04 12:10:00+00", exit: "2025-11-04 14:30:00+00", entryP: 125500, exitP: 126200, size: 6, sl: 125200, tp: 126500, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend continuation" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-04 15:00:00+00", exit: "2025-11-04 17:30:00+00", entryP: 126100, exitP: 126800, size: 5, sl: 125800, tp: 127000, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon momentum" },

	// 	// Nov 5 (Wed) - Choppy day, small loss
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-05 12:30:00+00", exit: "2025-11-05 13:15:00+00", entryP: 126500, exitP: 126700, size: 4, sl: 126750, tp: 126100, outcome: "loss", plan: true, strat: "REVERSION", thoughts: "Failed reversal attempt" },
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-05 14:00:00+00", exit: "2025-11-05 15:30:00+00", entryP: 5085, exitP: 5100, size: 3, sl: 5070, tp: 5115, outcome: "win", plan: true, strat: "SR", thoughts: "Bounce from support" },

	// 	// Nov 6 (Thu) - Big winning day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-06 12:15:00+00", exit: "2025-11-06 15:00:00+00", entryP: 126800, exitP: 128000, size: 8, sl: 126500, tp: 128200, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Strong gap up continuation" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-06 13:00:00+00", exit: "2025-11-06 15:30:00+00", entryP: 5095, exitP: 5050, size: 4, sl: 5110, tp: 5040, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse with index rally" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-06 16:00:00+00", exit: "2025-11-06 18:30:00+00", entryP: 127900, exitP: 128500, size: 5, sl: 127600, tp: 128700, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon continuation" },

	// 	// Nov 7 (Fri) - Profit taking day
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-07 12:30:00+00", exit: "2025-11-07 14:00:00+00", entryP: 128200, exitP: 127600, size: 5, sl: 128450, tp: 127400, outcome: "win", plan: true, strat: "REVERSION", thoughts: "End of week profit taking" },
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-07 14:30:00+00", exit: "2025-11-07 16:00:00+00", entryP: 5055, exitP: 5080, size: 3, sl: 5040, tp: 5095, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Dollar bounce" },

	// 	// Nov 10 (Mon) - DRAWDOWN DAY (overconfidence after good week)
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-10 12:10:00+00", exit: "2025-11-10 12:40:00+00", entryP: 127800, exitP: 127200, size: 10, sl: 127500, tp: 128500, outcome: "loss", plan: false, strat: null, thoughts: "Too aggressive on open" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-10 13:00:00+00", exit: "2025-11-10 13:30:00+00", entryP: 127300, exitP: 126800, size: 8, sl: 127000, tp: 127800, outcome: "loss", plan: false, strat: null, thoughts: "Revenge trade - doubled down" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-10 14:00:00+00", exit: "2025-11-10 14:45:00+00", entryP: 5100, exitP: 5130, size: 5, sl: 5120, tp: 5070, outcome: "loss", plan: false, strat: null, thoughts: "Wrong direction on dollar" },

	// 	// Nov 11 (Tue) - Recovery attempt
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-11 13:00:00+00", exit: "2025-11-11 16:00:00+00", entryP: 126500, exitP: 127500, size: 5, sl: 126100, tp: 127800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Patient entry, waited for confirmation" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-11 14:30:00+00", exit: "2025-11-11 16:30:00+00", entryP: 5140, exitP: 5110, size: 3, sl: 5155, tp: 5100, outcome: "win", plan: true, strat: "TREND", thoughts: "Following dollar weakness" },

	// 	// Nov 12 (Wed) - Solid day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-12 12:20:00+00", exit: "2025-11-12 14:00:00+00", entryP: 127600, exitP: 128100, size: 5, sl: 127350, tp: 128300, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Morning momentum" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-12 15:30:00+00", exit: "2025-11-12 17:00:00+00", entryP: 128300, exitP: 127800, size: 4, sl: 128550, tp: 127600, outcome: "win", plan: true, strat: "REVERSION", thoughts: "End of day mean reversion" },

	// 	// Nov 13 (Thu) - Volatile day
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-13 12:15:00+00", exit: "2025-11-13 13:30:00+00", entryP: 5100, exitP: 5070, size: 4, sl: 5085, tp: 5130, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "False breakout on dollar" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-13 14:00:00+00", exit: "2025-11-13 17:00:00+00", entryP: 127500, exitP: 128200, size: 6, sl: 127200, tp: 128400, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Nov 14 (Fri) - Good close to week
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-14 12:10:00+00", exit: "2025-11-14 14:30:00+00", entryP: 128000, exitP: 128600, size: 5, sl: 127750, tp: 128800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean breakout setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-14 13:00:00+00", exit: "2025-11-14 15:00:00+00", entryP: 5080, exitP: 5050, size: 3, sl: 5095, tp: 5040, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Nov 17 (Mon) - Start of new week
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-17 12:30:00+00", exit: "2025-11-17 14:00:00+00", entryP: 128500, exitP: 128100, size: 5, sl: 128700, tp: 127900, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Gap fade" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-17 15:00:00+00", exit: "2025-11-17 18:00:00+00", entryP: 128000, exitP: 128700, size: 6, sl: 127700, tp: 129000, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon rally" },

	// 	// Nov 18 (Tue) - Small day
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-18 12:15:00+00", exit: "2025-11-18 14:00:00+00", entryP: 5040, exitP: 5065, size: 3, sl: 5025, tp: 5075, outcome: "win", plan: true, strat: "SR", thoughts: "Support bounce on dollar" },

	// 	// Nov 19 (Wed) - Choppy day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-19 12:20:00+00", exit: "2025-11-19 13:00:00+00", entryP: 128600, exitP: 128400, size: 4, sl: 128400, tp: 128900, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-19 14:30:00+00", exit: "2025-11-19 16:00:00+00", entryP: 128300, exitP: 127900, size: 4, sl: 128500, tp: 127700, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Mean reversion worked" },

	// 	// Nov 20 (Thu) - Consciência Negra (B3 open, state holiday)
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-20 12:30:00+00", exit: "2025-11-20 16:00:00+00", entryP: 127800, exitP: 128500, size: 5, sl: 127500, tp: 128700, outcome: "win", plan: true, strat: "TREND", thoughts: "Low volume trend day" },

	// 	// Nov 21 (Fri) - End of week
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-21 12:15:00+00", exit: "2025-11-21 14:30:00+00", entryP: 128400, exitP: 129000, size: 5, sl: 128150, tp: 129200, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Strong momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-21 13:00:00+00", exit: "2025-11-21 15:30:00+00", entryP: 5070, exitP: 5040, size: 3, sl: 5085, tp: 5030, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Nov 24 (Mon) - Week start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-24 12:10:00+00", exit: "2025-11-24 13:30:00+00", entryP: 129000, exitP: 129400, size: 5, sl: 128800, tp: 129600, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Gap up continuation" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-24 15:00:00+00", exit: "2025-11-24 16:30:00+00", entryP: 129500, exitP: 129100, size: 4, sl: 129700, tp: 128900, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Afternoon pullback" },

	// 	// Nov 25 (Tue) - Mixed day
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-25 12:30:00+00", exit: "2025-11-25 13:45:00+00", entryP: 5030, exitP: 5010, size: 3, sl: 5015, tp: 5055, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed dollar breakout" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-25 14:30:00+00", exit: "2025-11-25 17:30:00+00", entryP: 129000, exitP: 129700, size: 6, sl: 128700, tp: 129900, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Nov 26 (Wed) - Solid day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-26 12:15:00+00", exit: "2025-11-26 14:00:00+00", entryP: 129600, exitP: 130100, size: 5, sl: 129400, tp: 130300, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean breakout" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-26 13:30:00+00", exit: "2025-11-26 15:30:00+00", entryP: 5015, exitP: 4985, size: 3, sl: 5030, tp: 4975, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Nov 27 (Thu) - THANKSGIVING (US closed, B3 open but low volume)
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-27 13:00:00+00", exit: "2025-11-27 17:00:00+00", entryP: 130000, exitP: 130400, size: 4, sl: 129750, tp: 130600, outcome: "win", plan: true, strat: "TREND", thoughts: "Low volume day, small size" },

	// 	// Nov 28 (Fri) - End of November
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-28 12:30:00+00", exit: "2025-11-28 14:00:00+00", entryP: 130500, exitP: 130000, size: 5, sl: 130700, tp: 129800, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Month-end profit taking" },
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-28 14:30:00+00", exit: "2025-11-28 16:30:00+00", entryP: 4970, exitP: 5000, size: 3, sl: 4955, tp: 5015, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Dollar bounce" },

	// 	// ========== DECEMBER 2025 ==========
	// 	// Dec 1 (Mon) - New month start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-01 12:10:00+00", exit: "2025-12-01 14:30:00+00", entryP: 129800, exitP: 130500, size: 6, sl: 129550, tp: 130700, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "December rally start" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-01 13:00:00+00", exit: "2025-12-01 15:00:00+00", entryP: 5010, exitP: 4980, size: 3, sl: 5025, tp: 4970, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 2 (Tue) - Continuation
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-02 12:30:00+00", exit: "2025-12-02 16:00:00+00", entryP: 130400, exitP: 131200, size: 6, sl: 130100, tp: 131400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong uptrend" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-02 17:00:00+00", exit: "2025-12-02 18:30:00+00", entryP: 131300, exitP: 130900, size: 4, sl: 131500, tp: 130700, outcome: "win", plan: true, strat: "REVERSION", thoughts: "End of day pullback" },

	// 	// Dec 3 (Wed) - Choppy
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-12-03 12:15:00+00", exit: "2025-12-03 13:30:00+00", entryP: 4975, exitP: 4950, size: 3, sl: 4960, tp: 5000, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "False breakout" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-03 14:30:00+00", exit: "2025-12-03 16:00:00+00", entryP: 130800, exitP: 131200, size: 5, sl: 130550, tp: 131400, outcome: "win", plan: true, strat: "SR", thoughts: "Support bounce" },

	// 	// Dec 4 (Thu) - BIG WINNING DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-04 12:10:00+00", exit: "2025-12-04 15:00:00+00", entryP: 131000, exitP: 132500, size: 10, sl: 130700, tp: 132700, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong bullish day" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-04 12:30:00+00", exit: "2025-12-04 15:30:00+00", entryP: 4990, exitP: 4920, size: 5, sl: 5010, tp: 4910, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-04 16:00:00+00", exit: "2025-12-04 19:00:00+00", entryP: 132400, exitP: 133000, size: 6, sl: 132100, tp: 133200, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon continuation" },

	// 	// Dec 5 (Fri) - Consolidation
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-05 12:30:00+00", exit: "2025-12-05 14:00:00+00", entryP: 133000, exitP: 132500, size: 5, sl: 133200, tp: 132300, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Profit taking" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-05 15:00:00+00", exit: "2025-12-05 16:30:00+00", entryP: 132400, exitP: 132200, size: 4, sl: 132200, tp: 132700, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout" },

	// 	// Dec 8 (Mon) - Recovery
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-08 12:15:00+00", exit: "2025-12-08 14:30:00+00", entryP: 132000, exitP: 132700, size: 6, sl: 131750, tp: 132900, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Monday momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-08 13:00:00+00", exit: "2025-12-08 15:30:00+00", entryP: 4960, exitP: 4925, size: 3, sl: 4975, tp: 4915, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 9 (Tue) - BAD DAY (FOMO)
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-09 12:10:00+00", exit: "2025-12-09 12:45:00+00", entryP: 133000, exitP: 132300, size: 12, sl: 132700, tp: 133500, outcome: "loss", plan: false, strat: null, thoughts: "FOMO on gap up" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-09 13:00:00+00", exit: "2025-12-09 13:30:00+00", entryP: 132200, exitP: 132600, size: 8, sl: 132500, tp: 131800, outcome: "loss", plan: false, strat: null, thoughts: "Revenge trade" },

	// 	// Dec 10 (Wed) - Recovery
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-10 13:00:00+00", exit: "2025-12-10 17:00:00+00", entryP: 131800, exitP: 132800, size: 5, sl: 131500, tp: 133000, outcome: "win", plan: true, strat: "TREND", thoughts: "Patient entry" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-10 14:30:00+00", exit: "2025-12-10 16:30:00+00", entryP: 4950, exitP: 4920, size: 3, sl: 4965, tp: 4910, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Dec 11 (Thu) - Solid day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-11 12:20:00+00", exit: "2025-12-11 14:30:00+00", entryP: 132700, exitP: 133300, size: 5, sl: 132450, tp: 133500, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean setup" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-11 15:30:00+00", exit: "2025-12-11 18:30:00+00", entryP: 133200, exitP: 133800, size: 4, sl: 132950, tp: 134000, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Dec 12 (Fri) - Good close to week
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-12 12:15:00+00", exit: "2025-12-12 14:00:00+00", entryP: 4915, exitP: 4885, size: 4, sl: 4930, tp: 4875, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-12 14:30:00+00", exit: "2025-12-12 16:30:00+00", entryP: 133600, exitP: 134100, size: 5, sl: 133350, tp: 134300, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Afternoon breakout" },

	// 	// Dec 15 (Mon) - Start of holiday week
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-15 12:15:00+00", exit: "2025-12-15 14:00:00+00", entryP: 133800, exitP: 134300, size: 5, sl: 133550, tp: 134500, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Strong open" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-15 13:30:00+00", exit: "2025-12-15 15:30:00+00", entryP: 4880, exitP: 4855, size: 3, sl: 4895, tp: 4845, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Dec 16 (Tue) - Volatility
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-16 12:30:00+00", exit: "2025-12-16 13:30:00+00", entryP: 134200, exitP: 134500, size: 5, sl: 134450, tp: 133800, outcome: "loss", plan: true, strat: "REVERSION", thoughts: "Failed reversal" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-16 14:30:00+00", exit: "2025-12-16 17:30:00+00", entryP: 134400, exitP: 135200, size: 6, sl: 134100, tp: 135400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend" },

	// 	// Dec 17 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-17 12:10:00+00", exit: "2025-12-17 14:30:00+00", entryP: 135000, exitP: 135600, size: 5, sl: 134750, tp: 135800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Continuation" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-17 13:00:00+00", exit: "2025-12-17 15:00:00+00", entryP: 4850, exitP: 4820, size: 3, sl: 4865, tp: 4810, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 18 (Thu) - Small day
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-18 12:30:00+00", exit: "2025-12-18 14:00:00+00", entryP: 135500, exitP: 135100, size: 4, sl: 135700, tp: 134900, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Pullback" },

	// 	// Dec 19 (Fri) - Pre-holiday
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-19 12:15:00+00", exit: "2025-12-19 14:30:00+00", entryP: 135000, exitP: 135400, size: 4, sl: 134800, tp: 135600, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Pre-holiday buying" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-19 13:00:00+00", exit: "2025-12-19 15:00:00+00", entryP: 4830, exitP: 4805, size: 3, sl: 4845, tp: 4795, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weak" },

	// 	// Dec 22 (Mon) - Pre-Christmas
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-22 12:30:00+00", exit: "2025-12-22 16:00:00+00", entryP: 135200, exitP: 135800, size: 4, sl: 135000, tp: 136000, outcome: "win", plan: true, strat: "TREND", thoughts: "Low volume day" },

	// 	// Dec 23 (Tue) - Christmas Eve Eve
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-23 12:30:00+00", exit: "2025-12-23 14:00:00+00", entryP: 135700, exitP: 135300, size: 4, sl: 135900, tp: 135100, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Profit taking" },
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-12-23 13:30:00+00", exit: "2025-12-23 15:00:00+00", entryP: 4800, exitP: 4825, size: 3, sl: 4785, tp: 4840, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Dollar bounce" },

	// 	// Dec 24, 25, 31 - HOLIDAYS (no trades)

	// 	// Dec 26 (Fri) - Post-Christmas
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-26 12:15:00+00", exit: "2025-12-26 14:30:00+00", entryP: 135000, exitP: 135500, size: 4, sl: 134800, tp: 135700, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Post-holiday buying" },

	// 	// Dec 29 (Mon) - Year-end
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-29 12:30:00+00", exit: "2025-12-29 16:30:00+00", entryP: 135400, exitP: 136200, size: 5, sl: 135150, tp: 136400, outcome: "win", plan: true, strat: "TREND", thoughts: "Year-end rally" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-29 13:00:00+00", exit: "2025-12-29 15:30:00+00", entryP: 4840, exitP: 4810, size: 3, sl: 4855, tp: 4800, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 30 (Tue) - Last trading day of year
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-30 12:30:00+00", exit: "2025-12-30 14:00:00+00", entryP: 136000, exitP: 135500, size: 4, sl: 136200, tp: 135300, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Year-end profit taking" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-30 15:00:00+00", exit: "2025-12-30 17:00:00+00", entryP: 135400, exitP: 135800, size: 4, sl: 135200, tp: 136000, outcome: "win", plan: true, strat: "SR", thoughts: "Support bounce" },

	// 	// ========== JANUARY 2026 ==========
	// 	// Jan 1 - HOLIDAY (no trades)

	// 	// Jan 2 (Fri) - New Year start, BIG DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-02 12:15:00+00", exit: "2026-01-02 14:45:00+00", entryP: 135500, exitP: 136300, size: 6, sl: 135250, tp: 136500, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "New year momentum" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-02 15:30:00+00", exit: "2026-01-02 18:00:00+00", entryP: 136200, exitP: 137100, size: 8, sl: 135900, tp: 137300, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend day" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-02 13:00:00+00", exit: "2026-01-02 15:30:00+00", entryP: 4820, exitP: 4780, size: 4, sl: 4835, tp: 4770, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness on risk-on" },

	// 	// Jan 5 (Mon) - Consolidation
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-05 12:30:00+00", exit: "2026-01-05 13:45:00+00", entryP: 137000, exitP: 137350, size: 5, sl: 137300, tp: 136600, outcome: "loss", plan: true, strat: "REVERSION", thoughts: "Failed fade" },
	// 	{ asset: "WDO", dir: "long", tf: "15m", entry: "2026-01-05 14:00:00+00", exit: "2026-01-05 17:30:00+00", entryP: 4775, exitP: 4810, size: 3, sl: 4760, tp: 4825, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar recovery" },

	// 	// Jan 6 (Tue) - DRAWDOWN DAY (revenge trading)
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-06 12:10:00+00", exit: "2026-01-06 12:35:00+00", entryP: 136800, exitP: 136000, size: 12, sl: 136400, tp: 137400, outcome: "loss", plan: false, strat: null, thoughts: "FOMO on gap down" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-06 12:45:00+00", exit: "2026-01-06 13:10:00+00", entryP: 135900, exitP: 135100, size: 15, sl: 135500, tp: 136500, outcome: "loss", plan: false, strat: null, thoughts: "Revenge trade, doubled down" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-06 13:30:00+00", exit: "2026-01-06 14:00:00+00", entryP: 135200, exitP: 135700, size: 10, sl: 135600, tp: 134600, outcome: "loss", plan: false, strat: null, thoughts: "Another revenge trade" },

	// 	// Jan 7 (Wed) - Recovery
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-07 13:00:00+00", exit: "2026-01-07 17:00:00+00", entryP: 134800, exitP: 136200, size: 6, sl: 134400, tp: 136500, outcome: "win", plan: true, strat: "TREND", thoughts: "Patient entry, waited for confirmation" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-07 14:00:00+00", exit: "2026-01-07 16:30:00+00", entryP: 4850, exitP: 4810, size: 4, sl: 4865, tp: 4800, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Jan 8 (Thu) - Consistent
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-08 12:20:00+00", exit: "2026-01-08 14:45:00+00", entryP: 136100, exitP: 136800, size: 5, sl: 135850, tp: 137000, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean breakout" },
	// 	{ asset: "WIN", dir: "short", tf: "15m", entry: "2026-01-08 16:00:00+00", exit: "2026-01-08 18:30:00+00", entryP: 137000, exitP: 136400, size: 5, sl: 137250, tp: 136200, outcome: "win", plan: true, strat: "REVERSION", thoughts: "End of day pullback" },

	// 	// Jan 9 (Fri) - Mixed
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2026-01-09 12:30:00+00", exit: "2026-01-09 13:15:00+00", entryP: 4800, exitP: 4770, size: 5, sl: 4785, tp: 4830, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Wrong read on dollar" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-09 14:30:00+00", exit: "2026-01-09 16:00:00+00", entryP: 136200, exitP: 136000, size: 6, sl: 136000, tp: 136600, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Stopped on spike" },

	// 	// Jan 12 (Mon) - Good start to week
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-12 12:15:00+00", exit: "2026-01-12 14:30:00+00", entryP: 135800, exitP: 136500, size: 6, sl: 135550, tp: 136700, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Morning momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-12 13:00:00+00", exit: "2026-01-12 15:30:00+00", entryP: 4820, exitP: 4780, size: 4, sl: 4835, tp: 4770, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-12 15:30:00+00", exit: "2026-01-12 18:30:00+00", entryP: 136400, exitP: 137200, size: 5, sl: 136150, tp: 137400, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Jan 13 (Tue) - Mixed
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-13 12:30:00+00", exit: "2026-01-13 13:45:00+00", entryP: 137300, exitP: 136800, size: 5, sl: 137500, tp: 136600, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Quick scalp" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-13 14:30:00+00", exit: "2026-01-13 15:15:00+00", entryP: 136700, exitP: 136400, size: 5, sl: 136450, tp: 137100, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout" },

	// 	// Jan 14 (Wed) - BIG WINNING DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-14 12:10:00+00", exit: "2026-01-14 15:00:00+00", entryP: 136500, exitP: 138500, size: 10, sl: 136200, tp: 138700, outcome: "win", plan: true, strat: "TREND", thoughts: "Gap up continuation, A+ setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-14 12:30:00+00", exit: "2026-01-14 15:30:00+00", entryP: 4800, exitP: 4720, size: 6, sl: 4815, tp: 4710, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },

	// 	// Jan 15 (Thu) - Consolidation
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-15 12:30:00+00", exit: "2026-01-15 13:30:00+00", entryP: 138400, exitP: 138700, size: 4, sl: 138650, tp: 138000, outcome: "loss", plan: true, strat: "REVERSION", thoughts: "Counter-trend failed" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-15 14:30:00+00", exit: "2026-01-15 17:00:00+00", entryP: 138600, exitP: 138400, size: 4, sl: 138350, tp: 139000, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Chopped out" },

	// 	// Jan 16 (Fri) - Good close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-16 12:20:00+00", exit: "2026-01-16 14:30:00+00", entryP: 138200, exitP: 139000, size: 6, sl: 137950, tp: 139200, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Strong momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-16 13:00:00+00", exit: "2026-01-16 15:30:00+00", entryP: 4740, exitP: 4700, size: 4, sl: 4755, tp: 4690, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Jan 19 (Mon) - Week start
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-19 13:00:00+00", exit: "2026-01-19 17:00:00+00", entryP: 138800, exitP: 139600, size: 5, sl: 138550, tp: 139800, outcome: "win", plan: true, strat: "TREND", thoughts: "Waited for confirmation" },

	// 	// Jan 20 (Tue) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-20 12:30:00+00", exit: "2026-01-20 16:30:00+00", entryP: 139200, exitP: 140200, size: 6, sl: 138900, tp: 140400, outcome: "win", plan: true, strat: "TREND", thoughts: "Patient entry" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-20 13:30:00+00", exit: "2026-01-20 15:30:00+00", entryP: 4720, exitP: 4685, size: 4, sl: 4735, tp: 4675, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Jan 21 (Wed) - Solid
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-21 12:20:00+00", exit: "2026-01-21 14:00:00+00", entryP: 140000, exitP: 140600, size: 5, sl: 139750, tp: 140800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Continuation" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-21 16:00:00+00", exit: "2026-01-21 17:30:00+00", entryP: 140800, exitP: 140400, size: 4, sl: 141000, tp: 140200, outcome: "win", plan: true, strat: "REVERSION", thoughts: "End of day fade" },

	// 	// Jan 22 (Thu) - Mixed
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2026-01-22 12:30:00+00", exit: "2026-01-22 13:15:00+00", entryP: 4680, exitP: 4655, size: 3, sl: 4665, tp: 4705, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Wrong direction" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-22 14:00:00+00", exit: "2026-01-22 17:30:00+00", entryP: 140200, exitP: 140900, size: 5, sl: 139950, tp: 141100, outcome: "win", plan: true, strat: "TREND", thoughts: "Recovered with clean setup" },

	// 	// Jan 23 (Fri) - Strong close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-23 12:15:00+00", exit: "2026-01-23 15:00:00+00", entryP: 140800, exitP: 142000, size: 8, sl: 140550, tp: 142200, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend day" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-23 13:00:00+00", exit: "2026-01-23 15:30:00+00", entryP: 4670, exitP: 4620, size: 5, sl: 4685, tp: 4610, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Jan 26 (Mon) - New week
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-26 12:15:00+00", exit: "2026-01-26 14:30:00+00", entryP: 141800, exitP: 142400, size: 5, sl: 141550, tp: 142600, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Monday momentum" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-26 15:30:00+00", exit: "2026-01-26 17:00:00+00", entryP: 142500, exitP: 142100, size: 4, sl: 142700, tp: 141900, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Afternoon pullback" },

	// 	// Jan 27 (Tue) - Choppy
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2026-01-27 12:30:00+00", exit: "2026-01-27 13:30:00+00", entryP: 4610, exitP: 4580, size: 3, sl: 4595, tp: 4635, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "False breakout" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-27 14:30:00+00", exit: "2026-01-27 17:30:00+00", entryP: 142000, exitP: 142700, size: 5, sl: 141750, tp: 142900, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Jan 28 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-28 12:20:00+00", exit: "2026-01-28 14:30:00+00", entryP: 142500, exitP: 143200, size: 6, sl: 142250, tp: 143400, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-28 13:00:00+00", exit: "2026-01-28 15:30:00+00", entryP: 4600, exitP: 4565, size: 4, sl: 4615, tp: 4555, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Jan 29 (Thu) - Mixed
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-29 12:30:00+00", exit: "2026-01-29 13:30:00+00", entryP: 143100, exitP: 143400, size: 5, sl: 143350, tp: 142700, outcome: "loss", plan: true, strat: "REVERSION", thoughts: "Failed fade" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-29 14:30:00+00", exit: "2026-01-29 18:00:00+00", entryP: 143300, exitP: 144000, size: 5, sl: 143050, tp: 144200, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon rally" },

	// 	// Jan 30 (Fri) - Month end
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-30 12:15:00+00", exit: "2026-01-30 14:30:00+00", entryP: 143800, exitP: 144500, size: 6, sl: 143550, tp: 144700, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Month-end rally" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-30 13:00:00+00", exit: "2026-01-30 15:30:00+00", entryP: 4570, exitP: 4530, size: 4, sl: 4585, tp: 4520, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-30 16:30:00+00", exit: "2026-01-30 18:00:00+00", entryP: 144600, exitP: 144200, size: 4, sl: 144800, tp: 144000, outcome: "win", plan: true, strat: "REVERSION", thoughts: "Month-end profit taking" },
	// ]

	// for (const t of personalTrades) {
	// 	const timeframeId = timeframeMap.get(t.tf) || null
	// 	const strategyId = t.strat ? personalStrategyMap.get(t.strat) : null
	// 	// Calculate P&L based on asset type
	// 	const pnl = calculatePnl(t.asset, t.dir, t.entryP, t.exitP, t.size)
	// 	const riskValues = calculateRiskValues(t.dir, t.entryP, t.sl, t.size, pnl)

	// 	await sql`
	// 		INSERT INTO trades (
	// 			id, account_id, asset, direction, timeframe_id, entry_date, exit_date,
	// 			entry_price, exit_price, position_size, stop_loss, take_profit,
	// 			planned_risk_amount, realized_r_multiple,
	// 			pnl, outcome, followed_plan, strategy_id, pre_trade_thoughts, is_archived
	// 		) VALUES (
	// 			gen_random_uuid(), ${personalAccount.id}, ${t.asset}, ${t.dir}, ${timeframeId}, ${t.entry}, ${t.exit},
	// 			${t.entryP}, ${t.exitP}, ${t.size}, ${t.sl}, ${t.tp},
	// 			${riskValues.plannedRiskAmount}, ${riskValues.realizedRMultiple},
	// 			${toCents(pnl)}, ${t.outcome}, ${t.plan}, ${strategyId}, ${t.thoughts}, false
	// 		)
	// 	`
	// }
	// console.log(`✅ Personal account trades seeded (${personalTrades.length} trades)`)

	// ==========================================
	// 10.5 Fractal Plan Cascade — 2026 (yearly + quarterly + monthly)
	// ==========================================
	console.log("\n📦 Seeding fractal plan cascade for 2026...")

	// Anchor account lifecycle so reporting + balance chain start Jan 2026
	await sql`
		UPDATE trading_accounts
		SET starting_balance_cents = 300000,
		    account_start_year = 2026,
		    account_start_month = 1,
		    withdrawal_target_percent = 0
		WHERE id = ${personalAccount.id}
	`

	const LADDER = [
		{ minCapitalCents: 300_000, maxCapitalCents: 749_999, oneRCents: 10_000 },
		{ minCapitalCents: 750_000, maxCapitalCents: 1_499_999, oneRCents: 20_000 },
		{
			minCapitalCents: 1_500_000,
			maxCapitalCents: 2_999_999,
			oneRCents: 30_000,
		},
		{
			minCapitalCents: 3_000_000,
			maxCapitalCents: 9_999_999,
			oneRCents: 50_000,
		},
		{
			minCapitalCents: 10_000_000,
			maxCapitalCents: 99_999_999_999,
			oneRCents: 100_000,
		},
	]

	const resolveOneR = (
		capCents: number
	): { tierIndex: number; oneRCents: number } => {
		for (let i = 0; i < LADDER.length; i++) {
			if (
				capCents >= LADDER[i].minCapitalCents &&
				capCents <= LADDER[i].maxCapitalCents
			) {
				return { tierIndex: i, oneRCents: LADDER[i].oneRCents }
			}
		}
		const top = LADDER[LADDER.length - 1]
		return { tierIndex: LADDER.length - 1, oneRCents: top.oneRCents }
	}

	// Compound start-balance per month (cents). Jan→May ladders R$3k → R$30k.
	// Jun-Dec retain R$30k (no trades; projection layer extrapolates).
	const MONTHLY_START_CENTS = [
		300_000, // Jan: tier 0, 1R = R$100
		750_000, // Feb: tier 1, 1R = R$200
		1_200_000, // Mar: tier 1, 1R = R$200
		1_800_000, // Apr: tier 2, 1R = R$300
		2_400_000, // May: tier 2, 1R = R$300
		3_000_000, // Jun
		3_000_000,
		3_000_000,
		3_000_000,
		3_000_000,
		3_000_000,
		3_000_000,
	]

	const [yearlyPlan2026] = await sql`
		INSERT INTO yearly_plans (
			id, account_id, year, initial_capital_cents, ir_tax_rate, trading_days_per_week,
			ladder_rules, start_week,
			default_daily_loss_r, default_daily_win_r,
			default_weekly_loss_r, default_weekly_win_r,
			default_monthly_loss_r, default_monthly_win_r,
			notes
		) VALUES (
			gen_random_uuid(), ${personalAccount.id}, 2026, 300000, 30.00, 5,
			${JSON.stringify(LADDER)}::jsonb, 1,
			2.0, 4.0, 5.0, 8.0, 10.0, 20.0,
			'Seeded ladder progression — R$3k Jan → R$30k May 2026'
		)
		RETURNING id
	`

	const quarterlyIds: string[] = []
	for (let q = 1; q <= 4; q++) {
		const [row] = await sql`
			INSERT INTO quarterly_plan (id, yearly_plan_id, quarter)
			VALUES (gen_random_uuid(), ${yearlyPlan2026.id}, ${q})
			RETURNING id
		`
		quarterlyIds.push(row.id)
	}

	interface MonthMeta {
		id: string
		oneRCents: number
		tierIndex: number
		startCents: number
	}
	const monthlyPlanByMonth = new Map<number, MonthMeta>()
	for (let m = 1; m <= 12; m++) {
		const startCents = MONTHLY_START_CENTS[m - 1]
		const { tierIndex, oneRCents } = resolveOneR(startCents)
		const qIndex = Math.floor((m - 1) / 3)
		const computedAt = new Date(
			Date.UTC(2026, m - 1, 1, 12, 0, 0)
		).toISOString()
		const [row] = await sql`
			INSERT INTO monthly_plan (
				id, quarterly_plan_id, year, month,
				snapshot_capital_cents, snapshot_one_r_cents, snapshot_tier_index,
				snapshot_computed_at, snapshot_reason
			) VALUES (
				gen_random_uuid(), ${quarterlyIds[qIndex]}, 2026, ${m},
				${startCents}, ${oneRCents}, ${tierIndex},
				${computedAt}, 'month_start'
			)
			RETURNING id
		`
		monthlyPlanByMonth.set(m, { id: row.id, oneRCents, tierIndex, startCents })
	}
	console.log("✅ Yearly + 4 quarterly + 12 monthly plans seeded")

	// ==========================================
	// 10.6 Procedural trades — Jan–May 2026
	// ==========================================
	console.log("\n📦 Generating procedural trades (Jan–May 2026)...")

	// Per-month NET pnl target (cents). March is intentionally a losing month
	// so DARF carryover/compensation logic surfaces in tests (March loss reduces
	// April's taxable base before IR is computed).
	const MONTHLY_NET_TARGETS_CENTS = [
		450_000, // Jan: +R$4500
		450_000, // Feb: +R$4500
		-300_000, // Mar: -R$3000  (loser month → seeds carryover into April)
		600_000, // Apr: +R$6000  (taxable base reduced by March carryover)
		600_000, // May: +R$6000
	]

	// Deterministic PRNG so the seed is reproducible.
	let prngState = 42
	const rand = (): number => {
		prngState = (prngState * 1103515245 + 12345) & 0x7fffffff
		return prngState / 0x7fffffff
	}
	const pickFrom = <T>(arr: readonly T[]): T =>
		arr[Math.floor(rand() * arr.length)]

	interface SeedTrade {
		asset: "WIN" | "WDO"
		dir: "long" | "short"
		entryTime: string
		exitTime: string
		entryP: number
		exitP: number
		size: number
		sl: number
		tp: number
		pnlCents: number
		outcome: "win" | "loss"
		plan: boolean
		strat: string
		oneRSnapshotCents: number
		rOutcome: string
		plannedRiskAmountCents: number
	}

	const personalTradesGenerated: SeedTrade[] = []

	for (let m = 1; m <= 5; m++) {
		const meta = monthlyPlanByMonth.get(m)!
		const oneRReais = meta.oneRCents / 100
		const tradingDays = getTradingDays(
			new Date(Date.UTC(2026, m - 1, 1)),
			new Date(Date.UTC(2026, m, 0))
		)
		const targetReais = MONTHLY_NET_TARGETS_CENTS[m - 1] / 100

		// Loser-day ratio scales with sign: profit months → 30% losers, loss months → 65%.
		const isLossMonth = targetReais < 0
		const loserRatio = isLossMonth ? 0.65 : 0.3
		const numLosers = Math.floor(tradingDays.length * loserRatio)
		const dayIndices = tradingDays.map((_, i) => i)
		for (let i = dayIndices.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1))
			;[dayIndices[i], dayIndices[j]] = [dayIndices[j], dayIndices[i]]
		}
		const loserIdx = new Set(dayIndices.slice(0, numLosers))
		const numWinners = tradingDays.length - numLosers
		const totalLossReais = -1 * numLosers * oneRReais
		const winnersTotalReais = targetReais - totalLossReais
		const avgWinnerReais = winnersTotalReais / numWinners

		const dailyPnls: number[] = []
		for (let i = 0; i < tradingDays.length; i++) {
			if (loserIdx.has(i)) {
				dailyPnls.push(-1 * oneRReais)
			} else {
				const jitter = 0.55 + rand() * 0.9 // 0.55x..1.45x
				dailyPnls.push(avgWinnerReais * jitter)
			}
		}
		// Renormalize non-loser days so monthly sum hits target exactly (works for
		// both profit months and loss months — winnerSum may be negative when target < 0).
		const winnerSum = dailyPnls.reduce(
			(a, b, i) => (loserIdx.has(i) ? a : a + b),
			0
		)
		const scale = winnerSum !== 0 ? winnersTotalReais / winnerSum : 1
		for (let i = 0; i < dailyPnls.length; i++) {
			if (!loserIdx.has(i)) {
				dailyPnls[i] *= scale
			}
		}

		for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
			const day = tradingDays[dayIdx]
			const dayPnl = dailyPnls[dayIdx]
			const numTrades = rand() < 0.55 ? 1 : 2
			const tradesPnl =
				numTrades === 1
					? [dayPnl]
					: (() => {
							const split = 0.4 + rand() * 0.2
							return [dayPnl * split, dayPnl * (1 - split)]
						})()

			for (const tradePnl of tradesPnl) {
				const asset: "WIN" | "WDO" = rand() < 0.55 ? "WDO" : "WIN"
				const dir: "long" | "short" = rand() < 0.6 ? "long" : "short"
				const pointsPerContract =
					asset === "WIN" ? WIN_PER_POINT : WDO_PER_POINT
				// Position size scaled to monthly 1R: ~1R risk on a ~50pt (WDO) / 100pt (WIN) stop.
				const refStopPoints = asset === "WDO" ? 50 : 100
				const size = Math.max(
					1,
					Math.round(oneRReais / (refStopPoints * pointsPerContract))
				)
				const priceDiffPoints = tradePnl / (size * pointsPerContract)
				const basePrice =
					asset === "WIN"
						? 130000 + Math.floor(rand() * 6000)
						: 5000 + Math.floor(rand() * 200)
				const entryP = basePrice
				const rawExit =
					dir === "long"
						? basePrice + priceDiffPoints
						: basePrice - priceDiffPoints
				const exitP =
					asset === "WIN"
						? Math.round(rawExit / 5) * 5
						: Math.round(rawExit * 2) / 2
				const stopPoints = oneRReais / (size * pointsPerContract)
				const sl = dir === "long" ? entryP - stopPoints : entryP + stopPoints
				const tp =
					dir === "long" ? entryP + stopPoints * 2 : entryP - stopPoints * 2

				const entryTime = randomTradingTime(day)
				const exitTime = generateExitTime(entryTime)

				// Recompute pnl from actual rounded prices so journal math is internally consistent.
				const realizedReais = calculatePnl(asset, dir, entryP, exitP, size)
				const pnlCents = Math.round(realizedReais * 100)
				const outcome: "win" | "loss" = pnlCents >= 0 ? "win" : "loss"
				const rOutcome = (pnlCents / meta.oneRCents).toFixed(2)
				const plan = outcome === "win" || rand() < 0.7

				personalTradesGenerated.push({
					asset,
					dir,
					entryTime,
					exitTime,
					entryP,
					exitP,
					size,
					sl: Math.round(sl * 100) / 100,
					tp: Math.round(tp * 100) / 100,
					pnlCents,
					outcome,
					plan,
					strat: pickFrom(["BREAKOUT", "TREND", "REVERSION", "SR"]),
					oneRSnapshotCents: meta.oneRCents,
					rOutcome,
					plannedRiskAmountCents: meta.oneRCents,
				})
			}
		}
	}

	for (const t of personalTradesGenerated) {
		const strategyId = personalStrategyMap.get(t.strat) ?? null
		await sql`
			INSERT INTO trades (
				id, account_id, asset, direction, timeframe_id, entry_date, exit_date,
				entry_price, exit_price, position_size, stop_loss, take_profit,
				planned_risk_amount, realized_r_multiple,
				pnl, outcome, followed_plan, strategy_id, is_archived,
				one_r_snapshot_cents, r_outcome, source
			) VALUES (
				gen_random_uuid(), ${personalAccount.id}, ${t.asset}, ${t.dir}, NULL, ${t.entryTime}, ${t.exitTime},
				${t.entryP.toString()}, ${t.exitP.toString()}, ${t.size.toString()},
				${t.sl.toString()}, ${t.tp.toString()},
				${t.plannedRiskAmountCents.toString()}, ${t.rOutcome},
				${t.pnlCents.toString()}, ${t.outcome}, ${t.plan}, ${strategyId}, false,
				${t.oneRSnapshotCents}, ${t.rOutcome}, 'manual'
			)
		`
	}
	console.log(
		`✅ Personal account trades seeded (${personalTradesGenerated.length} trades, Jan–May 2026)`
	)

	// ==========================================
	// 11. Trades - Prop Account (Nov 2025 - Jan 2026)
	// ==========================================
	console.log("\n📦 Seeding trades for Prop account...")

	// Prop account trades - more disciplined, better risk management
	// const propTrades = [
	// 	// ========== NOVEMBER 2025 ==========
	// 	// Nov 3 (Mon) - Careful start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-03 12:20:00+00", exit: "2025-11-03 14:30:00+00", entryP: 125000, exitP: 125600, size: 6, sl: 124750, tp: 125800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean breakout with volume" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-03 13:30:00+00", exit: "2025-11-03 15:30:00+00", entryP: 5115, exitP: 5085, size: 4, sl: 5130, tp: 5075, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Nov 4 (Tue) - Strong day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-04 12:15:00+00", exit: "2025-11-04 15:00:00+00", entryP: 125500, exitP: 126400, size: 8, sl: 125250, tp: 126600, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong uptrend" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-04 16:00:00+00", exit: "2025-11-04 19:00:00+00", entryP: 126300, exitP: 127000, size: 6, sl: 126050, tp: 127200, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon momentum" },

	// 	// Nov 5 (Wed) - Choppy
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-05 12:30:00+00", exit: "2025-11-05 13:30:00+00", entryP: 126800, exitP: 127000, size: 4, sl: 127050, tp: 126400, outcome: "loss", plan: true, strat: "SCALP", thoughts: "Failed fade" },
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-05 14:30:00+00", exit: "2025-11-05 16:00:00+00", entryP: 5080, exitP: 5105, size: 3, sl: 5065, tp: 5115, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar bounce" },

	// 	// Nov 6 (Thu) - BIG DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-06 12:10:00+00", exit: "2025-11-06 15:30:00+00", entryP: 126700, exitP: 128200, size: 10, sl: 126450, tp: 128400, outcome: "win", plan: true, strat: "TREND", thoughts: "Gap and go - perfect setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-06 12:30:00+00", exit: "2025-11-06 15:00:00+00", entryP: 5100, exitP: 5040, size: 5, sl: 5115, tp: 5030, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },

	// 	// Nov 7 (Fri) - Profit taking
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-07 12:30:00+00", exit: "2025-11-07 14:00:00+00", entryP: 128000, exitP: 127400, size: 6, sl: 128200, tp: 127200, outcome: "win", plan: true, strat: "SCALP", thoughts: "Quick scalp on profit taking" },

	// 	// Nov 10 (Mon) - Controlled (no revenge like personal)
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-10 13:00:00+00", exit: "2025-11-10 17:00:00+00", entryP: 127200, exitP: 127900, size: 5, sl: 126950, tp: 128100, outcome: "win", plan: true, strat: "TREND", thoughts: "Patient entry after morning chop" },

	// 	// Nov 11 (Tue) - Solid
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-11 12:20:00+00", exit: "2025-11-11 14:30:00+00", entryP: 127800, exitP: 128500, size: 6, sl: 127550, tp: 128700, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean breakout" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-11 13:30:00+00", exit: "2025-11-11 15:30:00+00", entryP: 5070, exitP: 5040, size: 4, sl: 5085, tp: 5030, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Nov 12 (Wed) - Mixed
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-12 12:15:00+00", exit: "2025-11-12 13:15:00+00", entryP: 128400, exitP: 128200, size: 5, sl: 128200, tp: 128700, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-12 14:30:00+00", exit: "2025-11-12 17:30:00+00", entryP: 128100, exitP: 128800, size: 6, sl: 127850, tp: 129000, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Nov 13 (Thu) - Consistent
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-13 12:30:00+00", exit: "2025-11-13 14:30:00+00", entryP: 5050, exitP: 5020, size: 4, sl: 5065, tp: 5010, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-13 15:00:00+00", exit: "2025-11-13 17:00:00+00", entryP: 128600, exitP: 129100, size: 5, sl: 128350, tp: 129300, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon momentum" },

	// 	// Nov 14 (Fri) - Good week close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-14 12:15:00+00", exit: "2025-11-14 14:30:00+00", entryP: 128900, exitP: 129600, size: 6, sl: 128650, tp: 129800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Strong momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-14 13:00:00+00", exit: "2025-11-14 15:00:00+00", entryP: 5025, exitP: 4995, size: 4, sl: 5040, tp: 4985, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Nov 17 (Mon) - New week
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-17 12:30:00+00", exit: "2025-11-17 16:30:00+00", entryP: 129400, exitP: 130200, size: 6, sl: 129150, tp: 130400, outcome: "win", plan: true, strat: "TREND", thoughts: "Monday trend" },

	// 	// Nov 18 (Tue) - Small day
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-18 12:30:00+00", exit: "2025-11-18 14:00:00+00", entryP: 130100, exitP: 129700, size: 4, sl: 130300, tp: 129500, outcome: "win", plan: true, strat: "SCALP", thoughts: "Quick scalp" },

	// 	// Nov 19 (Wed) - Choppy
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-19 12:20:00+00", exit: "2025-11-19 13:15:00+00", entryP: 5000, exitP: 4975, size: 3, sl: 4985, tp: 5025, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-19 14:30:00+00", exit: "2025-11-19 16:30:00+00", entryP: 129600, exitP: 130100, size: 5, sl: 129350, tp: 130300, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon recovery" },

	// 	// Nov 20 (Thu) - Solid
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-20 12:15:00+00", exit: "2025-11-20 14:30:00+00", entryP: 130000, exitP: 130600, size: 5, sl: 129750, tp: 130800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-20 13:00:00+00", exit: "2025-11-20 15:30:00+00", entryP: 4990, exitP: 4960, size: 4, sl: 5005, tp: 4950, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Nov 21 (Fri) - Good close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-21 12:20:00+00", exit: "2025-11-21 15:00:00+00", entryP: 130400, exitP: 131200, size: 6, sl: 130150, tp: 131400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend" },

	// 	// Nov 24 (Mon) - Week start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-24 12:15:00+00", exit: "2025-11-24 14:30:00+00", entryP: 131000, exitP: 131600, size: 5, sl: 130750, tp: 131800, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Gap continuation" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-24 16:00:00+00", exit: "2025-11-24 17:30:00+00", entryP: 131700, exitP: 131300, size: 4, sl: 131900, tp: 131100, outcome: "win", plan: true, strat: "SCALP", thoughts: "End of day pullback" },

	// 	// Nov 25 (Tue) - Mixed
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-11-25 12:30:00+00", exit: "2025-11-25 14:30:00+00", entryP: 4960, exitP: 4930, size: 4, sl: 4975, tp: 4920, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Nov 26 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-11-26 12:30:00+00", exit: "2025-11-26 17:00:00+00", entryP: 131200, exitP: 132200, size: 6, sl: 130950, tp: 132400, outcome: "win", plan: true, strat: "TREND", thoughts: "All day trend" },

	// 	// Nov 27 (Thu) - Low volume
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-11-27 13:00:00+00", exit: "2025-11-27 15:30:00+00", entryP: 132000, exitP: 132400, size: 4, sl: 131800, tp: 132600, outcome: "win", plan: true, strat: "TREND", thoughts: "Low volume, small size" },

	// 	// Nov 28 (Fri) - Month end
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-11-28 12:30:00+00", exit: "2025-11-28 14:30:00+00", entryP: 132300, exitP: 131800, size: 5, sl: 132500, tp: 131600, outcome: "win", plan: true, strat: "SCALP", thoughts: "Month-end profit taking" },
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2025-11-28 14:00:00+00", exit: "2025-11-28 16:00:00+00", entryP: 4925, exitP: 4955, size: 3, sl: 4910, tp: 4970, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar bounce" },

	// 	// ========== DECEMBER 2025 ==========
	// 	// Dec 1 (Mon) - Strong start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-01 12:15:00+00", exit: "2025-12-01 15:00:00+00", entryP: 131800, exitP: 132800, size: 8, sl: 131550, tp: 133000, outcome: "win", plan: true, strat: "TREND", thoughts: "December rally" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-01 12:30:00+00", exit: "2025-12-01 15:30:00+00", entryP: 4970, exitP: 4920, size: 5, sl: 4985, tp: 4910, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Dec 2 (Tue) - Continuation
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-02 12:30:00+00", exit: "2025-12-02 17:00:00+00", entryP: 132600, exitP: 133600, size: 6, sl: 132350, tp: 133800, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong uptrend" },

	// 	// Dec 3 (Wed) - Mixed
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-03 12:30:00+00", exit: "2025-12-03 13:30:00+00", entryP: 133500, exitP: 133700, size: 4, sl: 133750, tp: 133100, outcome: "loss", plan: true, strat: "SCALP", thoughts: "Failed fade" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-03 14:30:00+00", exit: "2025-12-03 16:30:00+00", entryP: 133600, exitP: 134100, size: 5, sl: 133350, tp: 134300, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Afternoon breakout" },

	// 	// Dec 4 (Thu) - BIG DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-04 12:10:00+00", exit: "2025-12-04 16:00:00+00", entryP: 133800, exitP: 135500, size: 12, sl: 133550, tp: 135700, outcome: "win", plan: true, strat: "TREND", thoughts: "Perfect trend day - A+ setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-04 12:30:00+00", exit: "2025-12-04 15:30:00+00", entryP: 4920, exitP: 4850, size: 6, sl: 4935, tp: 4840, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },

	// 	// Dec 5 (Fri) - Consolidation
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-05 12:30:00+00", exit: "2025-12-05 14:30:00+00", entryP: 135400, exitP: 134800, size: 5, sl: 135600, tp: 134600, outcome: "win", plan: true, strat: "SCALP", thoughts: "Profit taking scalp" },

	// 	// Dec 8 (Mon) - Week start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-08 12:20:00+00", exit: "2025-12-08 15:00:00+00", entryP: 134600, exitP: 135400, size: 6, sl: 134350, tp: 135600, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Monday momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-08 13:00:00+00", exit: "2025-12-08 15:30:00+00", entryP: 4870, exitP: 4835, size: 4, sl: 4885, tp: 4825, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 9 (Tue) - Small loss (controlled, unlike personal)
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-09 12:15:00+00", exit: "2025-12-09 13:00:00+00", entryP: 135300, exitP: 135000, size: 5, sl: 135050, tp: 135600, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout - quick exit" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-09 14:30:00+00", exit: "2025-12-09 17:30:00+00", entryP: 134800, exitP: 135500, size: 5, sl: 134550, tp: 135700, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon recovery" },

	// 	// Dec 10 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-10 12:20:00+00", exit: "2025-12-10 15:00:00+00", entryP: 135400, exitP: 136200, size: 6, sl: 135150, tp: 136400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-10 13:00:00+00", exit: "2025-12-10 15:30:00+00", entryP: 4850, exitP: 4815, size: 4, sl: 4865, tp: 4805, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Dec 11 (Thu) - Consistent
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-11 12:15:00+00", exit: "2025-12-11 14:30:00+00", entryP: 136000, exitP: 136700, size: 6, sl: 135750, tp: 136900, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean setup" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-11 15:30:00+00", exit: "2025-12-11 18:30:00+00", entryP: 136600, exitP: 137200, size: 5, sl: 136350, tp: 137400, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Dec 12 (Fri) - Good close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-12 12:20:00+00", exit: "2025-12-12 15:00:00+00", entryP: 137000, exitP: 137800, size: 6, sl: 136750, tp: 138000, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-12 12:30:00+00", exit: "2025-12-12 15:30:00+00", entryP: 4820, exitP: 4780, size: 4, sl: 4835, tp: 4770, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 15 (Mon) - Holiday week start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-15 12:15:00+00", exit: "2025-12-15 14:30:00+00", entryP: 137600, exitP: 138200, size: 5, sl: 137350, tp: 138400, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Strong open" },

	// 	// Dec 16 (Tue) - Mixed
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-16 12:30:00+00", exit: "2025-12-16 13:30:00+00", entryP: 138100, exitP: 138350, size: 4, sl: 138400, tp: 137700, outcome: "loss", plan: true, strat: "SCALP", thoughts: "Failed fade" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-16 14:30:00+00", exit: "2025-12-16 17:30:00+00", entryP: 138300, exitP: 139000, size: 5, sl: 138050, tp: 139200, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Dec 17 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-17 12:15:00+00", exit: "2025-12-17 15:00:00+00", entryP: 138800, exitP: 139600, size: 6, sl: 138550, tp: 139800, outcome: "win", plan: true, strat: "TREND", thoughts: "Continuation" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-17 12:30:00+00", exit: "2025-12-17 15:30:00+00", entryP: 4790, exitP: 4750, size: 4, sl: 4805, tp: 4740, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Dec 18 (Thu) - Small day
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-18 12:30:00+00", exit: "2025-12-18 14:30:00+00", entryP: 139500, exitP: 139000, size: 4, sl: 139700, tp: 138800, outcome: "win", plan: true, strat: "SCALP", thoughts: "Pullback scalp" },

	// 	// Dec 19 (Fri) - Pre-holiday
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-19 12:20:00+00", exit: "2025-12-19 14:30:00+00", entryP: 139000, exitP: 139500, size: 4, sl: 138800, tp: 139700, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Pre-holiday buying" },

	// 	// Dec 22 (Mon) - Pre-Christmas
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-22 12:30:00+00", exit: "2025-12-22 17:00:00+00", entryP: 139300, exitP: 140000, size: 4, sl: 139100, tp: 140200, outcome: "win", plan: true, strat: "TREND", thoughts: "Low volume trend" },

	// 	// Dec 23 (Tue) - Eve Eve
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-23 12:30:00+00", exit: "2025-12-23 14:30:00+00", entryP: 139900, exitP: 139400, size: 4, sl: 140100, tp: 139200, outcome: "win", plan: true, strat: "SCALP", thoughts: "Profit taking" },

	// 	// Dec 26 (Fri) - Post-Christmas
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2025-12-26 12:20:00+00", exit: "2025-12-26 14:30:00+00", entryP: 139200, exitP: 139700, size: 4, sl: 139000, tp: 139900, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Post-holiday buying" },

	// 	// Dec 29 (Mon) - Year end
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2025-12-29 12:30:00+00", exit: "2025-12-29 17:00:00+00", entryP: 139600, exitP: 140600, size: 5, sl: 139350, tp: 140800, outcome: "win", plan: true, strat: "TREND", thoughts: "Year-end rally" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2025-12-29 13:00:00+00", exit: "2025-12-29 15:30:00+00", entryP: 4750, exitP: 4715, size: 4, sl: 4765, tp: 4705, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Dec 30 (Tue) - Last day
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2025-12-30 12:30:00+00", exit: "2025-12-30 14:30:00+00", entryP: 140500, exitP: 140000, size: 4, sl: 140700, tp: 139800, outcome: "win", plan: true, strat: "SCALP", thoughts: "Year-end profit taking" },

	// 	// ========== JANUARY 2026 ==========
	// 	// Jan 2 (Fri) - New Year start
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-02 12:15:00+00", exit: "2026-01-02 15:00:00+00", entryP: 140200, exitP: 141200, size: 8, sl: 139950, tp: 141400, outcome: "win", plan: true, strat: "TREND", thoughts: "New year rally" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-02 12:30:00+00", exit: "2026-01-02 15:30:00+00", entryP: 4720, exitP: 4670, size: 5, sl: 4735, tp: 4660, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-02 16:00:00+00", exit: "2026-01-02 19:00:00+00", entryP: 141100, exitP: 141800, size: 6, sl: 140850, tp: 142000, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon continuation" },

	// 	// Jan 5 (Mon) - Consolidation
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-05 12:30:00+00", exit: "2026-01-05 13:45:00+00", entryP: 141700, exitP: 142000, size: 4, sl: 141950, tp: 141300, outcome: "loss", plan: true, strat: "SCALP", thoughts: "Failed fade" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-05 14:30:00+00", exit: "2026-01-05 17:30:00+00", entryP: 141900, exitP: 142500, size: 5, sl: 141650, tp: 142700, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon recovery" },

	// 	// Jan 6 (Tue) - Controlled (no revenge like personal)
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-06 12:30:00+00", exit: "2026-01-06 13:15:00+00", entryP: 142200, exitP: 141800, size: 5, sl: 141950, tp: 142600, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout - stopped out" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-06 14:30:00+00", exit: "2026-01-06 18:00:00+00", entryP: 141600, exitP: 142400, size: 5, sl: 141350, tp: 142600, outcome: "win", plan: true, strat: "TREND", thoughts: "Patient recovery" },

	// 	// Jan 7 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-07 12:20:00+00", exit: "2026-01-07 15:00:00+00", entryP: 142300, exitP: 143200, size: 6, sl: 142050, tp: 143400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-07 12:30:00+00", exit: "2026-01-07 15:30:00+00", entryP: 4680, exitP: 4640, size: 4, sl: 4695, tp: 4630, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Jan 8 (Thu) - Consistent
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-08 12:15:00+00", exit: "2026-01-08 14:30:00+00", entryP: 143000, exitP: 143700, size: 6, sl: 142750, tp: 143900, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Clean breakout" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-08 16:00:00+00", exit: "2026-01-08 17:30:00+00", entryP: 143800, exitP: 143400, size: 4, sl: 144000, tp: 143200, outcome: "win", plan: true, strat: "SCALP", thoughts: "End of day pullback" },

	// 	// Jan 9 (Fri) - Mixed
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2026-01-09 12:30:00+00", exit: "2026-01-09 13:30:00+00", entryP: 4635, exitP: 4610, size: 3, sl: 4620, tp: 4660, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Wrong direction" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-09 14:30:00+00", exit: "2026-01-09 16:30:00+00", entryP: 143200, exitP: 143700, size: 5, sl: 142950, tp: 143900, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon recovery" },

	// 	// Jan 12 (Mon) - BIG DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-12 12:15:00+00", exit: "2026-01-12 15:30:00+00", entryP: 143500, exitP: 145000, size: 10, sl: 143250, tp: 145200, outcome: "win", plan: true, strat: "TREND", thoughts: "Perfect trend day" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-12 12:30:00+00", exit: "2026-01-12 15:30:00+00", entryP: 4630, exitP: 4560, size: 6, sl: 4645, tp: 4550, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },

	// 	// Jan 13 (Tue) - Mixed
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-13 12:30:00+00", exit: "2026-01-13 14:00:00+00", entryP: 145000, exitP: 144400, size: 5, sl: 145200, tp: 144200, outcome: "win", plan: true, strat: "SCALP", thoughts: "Quick scalp" },
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-13 15:00:00+00", exit: "2026-01-13 15:45:00+00", entryP: 144300, exitP: 144000, size: 4, sl: 144050, tp: 144700, outcome: "loss", plan: true, strat: "BREAKOUT", thoughts: "Failed breakout" },

	// 	// Jan 14 (Wed) - HUGE DAY
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-14 12:10:00+00", exit: "2026-01-14 16:00:00+00", entryP: 144200, exitP: 146500, size: 12, sl: 143950, tp: 146700, outcome: "win", plan: true, strat: "TREND", thoughts: "Gap up continuation - A+ setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-14 12:30:00+00", exit: "2026-01-14 16:00:00+00", entryP: 4580, exitP: 4490, size: 8, sl: 4595, tp: 4480, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },

	// 	// Jan 15 (Thu) - Small loss
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-15 12:30:00+00", exit: "2026-01-15 13:30:00+00", entryP: 146400, exitP: 146700, size: 4, sl: 146650, tp: 146000, outcome: "loss", plan: true, strat: "SCALP", thoughts: "Failed fade" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-15 14:30:00+00", exit: "2026-01-15 17:30:00+00", entryP: 146600, exitP: 147000, size: 4, sl: 146350, tp: 147200, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon recovery" },

	// 	// Jan 16 (Fri) - Good close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-16 12:20:00+00", exit: "2026-01-16 15:00:00+00", entryP: 146800, exitP: 147800, size: 6, sl: 146550, tp: 148000, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong momentum" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-16 12:30:00+00", exit: "2026-01-16 15:30:00+00", entryP: 4510, exitP: 4465, size: 4, sl: 4525, tp: 4455, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },

	// 	// Jan 19 (Mon) - Week start
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-19 12:30:00+00", exit: "2026-01-19 17:00:00+00", entryP: 147500, exitP: 148500, size: 5, sl: 147250, tp: 148700, outcome: "win", plan: true, strat: "TREND", thoughts: "Waited for confirmation" },

	// 	// Jan 20 (Tue) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-20 12:20:00+00", exit: "2026-01-20 15:00:00+00", entryP: 148300, exitP: 149200, size: 6, sl: 148050, tp: 149400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-20 12:30:00+00", exit: "2026-01-20 15:30:00+00", entryP: 4480, exitP: 4435, size: 4, sl: 4495, tp: 4425, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Jan 21 (Wed) - Solid
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-21 12:15:00+00", exit: "2026-01-21 14:30:00+00", entryP: 149000, exitP: 149700, size: 5, sl: 148750, tp: 149900, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Continuation" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-21 16:00:00+00", exit: "2026-01-21 17:30:00+00", entryP: 149800, exitP: 149400, size: 4, sl: 150000, tp: 149200, outcome: "win", plan: true, strat: "SCALP", thoughts: "End of day fade" },

	// 	// Jan 22 (Thu) - Mixed
	// 	{ asset: "WDO", dir: "long", tf: "5m", entry: "2026-01-22 12:30:00+00", exit: "2026-01-22 13:15:00+00", entryP: 4430, exitP: 4455, size: 3, sl: 4415, tp: 4455, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Dollar bounce" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-22 14:30:00+00", exit: "2026-01-22 18:00:00+00", entryP: 149200, exitP: 150000, size: 5, sl: 148950, tp: 150200, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon rally" },

	// 	// Jan 23 (Fri) - Strong close
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-23 12:15:00+00", exit: "2026-01-23 15:30:00+00", entryP: 149800, exitP: 151200, size: 8, sl: 149550, tp: 151400, outcome: "win", plan: true, strat: "TREND", thoughts: "Strong trend day" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-23 12:30:00+00", exit: "2026-01-23 15:30:00+00", entryP: 4450, exitP: 4390, size: 5, sl: 4465, tp: 4380, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar collapse" },

	// 	// Jan 26 (Mon) - New week
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-26 12:15:00+00", exit: "2026-01-26 14:30:00+00", entryP: 151000, exitP: 151700, size: 5, sl: 150750, tp: 151900, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Monday momentum" },

	// 	// Jan 27 (Tue) - Mixed
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-27 12:30:00+00", exit: "2026-01-27 13:30:00+00", entryP: 151600, exitP: 151900, size: 4, sl: 151850, tp: 151200, outcome: "loss", plan: true, strat: "SCALP", thoughts: "Failed fade" },
	// 	{ asset: "WIN", dir: "long", tf: "15m", entry: "2026-01-27 14:30:00+00", exit: "2026-01-27 18:00:00+00", entryP: 151800, exitP: 152600, size: 5, sl: 151550, tp: 152800, outcome: "win", plan: true, strat: "TREND", thoughts: "Afternoon trend" },

	// 	// Jan 28 (Wed) - Good day
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-28 12:20:00+00", exit: "2026-01-28 15:00:00+00", entryP: 152400, exitP: 153300, size: 6, sl: 152150, tp: 153500, outcome: "win", plan: true, strat: "TREND", thoughts: "Clean setup" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-28 12:30:00+00", exit: "2026-01-28 15:30:00+00", entryP: 4400, exitP: 4355, size: 4, sl: 4415, tp: 4345, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar selloff" },

	// 	// Jan 29 (Thu) - Solid
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-29 12:15:00+00", exit: "2026-01-29 14:30:00+00", entryP: 153100, exitP: 153800, size: 5, sl: 152850, tp: 154000, outcome: "win", plan: true, strat: "BREAKOUT", thoughts: "Continuation" },
	// 	{ asset: "WIN", dir: "short", tf: "5m", entry: "2026-01-29 16:00:00+00", exit: "2026-01-29 17:30:00+00", entryP: 153900, exitP: 153500, size: 4, sl: 154100, tp: 153300, outcome: "win", plan: true, strat: "SCALP", thoughts: "End of day pullback" },

	// 	// Jan 30 (Fri) - Month end
	// 	{ asset: "WIN", dir: "long", tf: "5m", entry: "2026-01-30 12:15:00+00", exit: "2026-01-30 15:00:00+00", entryP: 153600, exitP: 154500, size: 6, sl: 153350, tp: 154700, outcome: "win", plan: true, strat: "TREND", thoughts: "Month-end rally" },
	// 	{ asset: "WDO", dir: "short", tf: "5m", entry: "2026-01-30 12:30:00+00", exit: "2026-01-30 15:30:00+00", entryP: 4365, exitP: 4320, size: 4, sl: 4380, tp: 4310, outcome: "win", plan: true, strat: "TREND", thoughts: "Dollar weakness" },
	// ]

	// for (const t of propTrades) {
	// 	const timeframeId = timeframeMap.get(t.tf) || null
	// 	const strategyId = t.strat ? propStrategyMap.get(t.strat) : null
	// 	// Calculate P&L based on asset type
	// 	const pnl = calculatePnl(t.asset, t.dir, t.entryP, t.exitP, t.size)
	// 	const riskValues = calculateRiskValues(t.dir, t.entryP, t.sl, t.size, pnl)

	// 	await sql`
	// 		INSERT INTO trades (
	// 			id, account_id, asset, direction, timeframe_id, entry_date, exit_date,
	// 			entry_price, exit_price, position_size, stop_loss, take_profit,
	// 			planned_risk_amount, realized_r_multiple,
	// 			pnl, outcome, followed_plan, strategy_id, pre_trade_thoughts, is_archived
	// 		) VALUES (
	// 			gen_random_uuid(), ${propAccount.id}, ${t.asset}, ${t.dir}, ${timeframeId}, ${t.entry}, ${t.exit},
	// 			${t.entryP}, ${t.exitP}, ${t.size}, ${t.sl}, ${t.tp},
	// 			${riskValues.plannedRiskAmount}, ${riskValues.realizedRMultiple},
	// 			${toCents(pnl)}, ${t.outcome}, ${t.plan}, ${strategyId}, ${t.thoughts}, false
	// 		)
	// 	`
	// }
	// console.log(`✅ Prop account trades seeded (${propTrades.length} trades)`)

	// ==========================================
	// 12. Verify
	// ==========================================
	console.log("\n📊 Verifying seeded data...")
	const counts = await sql`
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
	`

	const c = counts[0]
	console.log(`   Users:          ${c.users}`)
	console.log(`   Accounts:       ${c.accounts}`)
	console.log(`   Asset Types:    ${c.asset_types}`)
	console.log(`   Assets:         ${c.assets}`)
	console.log(`   Timeframes:     ${c.timeframes}`)
	console.log(`   Strategies:     ${c.strategies}`)
	console.log(`   Tags:           ${c.tags}`)
	console.log(`   Trades:         ${c.trades}`)
	console.log(`   Settings:       ${c.settings}`)

	// Account-specific counts
	const accountCounts = await sql`
		SELECT
			ta.name as account_name,
			ta.account_type,
			(SELECT COUNT(*) FROM trades WHERE account_id = ta.id) as trade_count,
			(SELECT COUNT(*) FROM strategies WHERE account_id = ta.id) as strategy_count,
			(SELECT COUNT(*) FROM tags WHERE account_id = ta.id) as tag_count
		FROM trading_accounts ta
		ORDER BY ta.is_default DESC, ta.name
	`

	console.log("\n📊 Per-account breakdown:")
	for (const acc of accountCounts) {
		console.log(`   ${acc.account_name} (${acc.account_type}):`)
		console.log(`      - Trades: ${acc.trade_count}`)
		console.log(`      - Strategies: ${acc.strategy_count}`)
		console.log(`      - Tags: ${acc.tag_count}`)
	}

	console.log("\n🎉 Seed completed!")
	console.log("\n📝 Login credentials:")
	console.log(`   Email:    ${ADMIN_EMAIL}`)
	console.log(`   Password: ${ADMIN_PASSWORD}`)

	// postgres-js holds a persistent connection; without an explicit close the
	// node process won't exit. neon() is stateless HTTPS so it doesn't need this.
	if (typeof (sql as { end?: () => Promise<void> }).end === "function") {
		await (sql as { end: () => Promise<void> }).end()
	}
}

runSeed().catch((error) => {
	console.error("Seed failed:", error)
	process.exit(1)
})
