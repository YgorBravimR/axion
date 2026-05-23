import "dotenv/config"
import { ADMIN_EMAIL, seedAdminUser } from "./seed/admin-user"
import { seedAccounts, type SeededAccounts } from "./seed/accounts"
import { seedAssets } from "./seed/assets"
import { cleanup } from "./seed/cleanup"
import { calculatePnl, WIN_PER_POINT, WDO_PER_POINT } from "./seed/helpers/pnl"
import { createPrng, pickFrom } from "./seed/helpers/prng"
import { closeSeedSql, createSeedSql, type SeedSql } from "./seed/helpers/sql"
import {
	generateExitTime,
	getTradingDays,
	randomTradingTime,
} from "./seed/helpers/trading-days"
import { seedSettings } from "./seed/settings"
import { seedStrategies, type StrategyMap } from "./seed/strategies"
import { seedTags } from "./seed/tags"
import { seedTimeframes } from "./seed/timeframes"
import { verify } from "./seed/verify"

/**
 * Axion seed orchestrator
 * Run with: pnpm db:seed (requires ADMIN_PASSWORD env var).
 *
 * Subjects:
 *  1. Cleanup        → scripts/seed/cleanup.ts
 *  2. Admin user     → scripts/seed/admin-user.ts
 *  3. Accounts       → scripts/seed/accounts.ts          (expands to 7 in commit #3)
 *  4. Asset types    → scripts/seed/assets.ts
 *  5. Assets         → scripts/seed/assets.ts
 *  5.1 Account assets→ scripts/seed/assets.ts
 *  6. Timeframes     → scripts/seed/timeframes.ts
 *  7. Strategies     → scripts/seed/strategies.ts        (Hawks playbooks added in commit #4)
 *  8. Tags           → scripts/seed/tags.ts
 *  9. Settings       → scripts/seed/settings.ts
 *  10.5 Plan cascade → inline (modularized in commit #5)
 *  10.6 Personal trades (Jan–May 2026) → inline (modularized in commit #7)
 *  11. Prop trades   → inline (modularized in commit #7)
 *  12. Verify        → scripts/seed/verify.ts
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

	const { monthlyPlanByMonth } = await seedPlanCascade2026(sql, accounts)
	await seedPersonalProceduralTrades(
		sql,
		accounts,
		strategyMap,
		monthlyPlanByMonth
	)
	await seedPropTradesPlaceholder(sql, accounts, strategyMap)

	await verify(sql)

	console.log("\n🎉 Seed completed!")
	console.log("\n📝 Login credentials:")
	console.log(`   Email:    ${ADMIN_EMAIL}`)
	console.log(`   Password: (from $ADMIN_PASSWORD)`)

	await closeSeedSql(sql)
	process.exit(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline sections — to be modularized in upcoming commits.
// 10.5 Plan cascade · 10.6 Personal procedural trades · 11. Prop trades.
// ─────────────────────────────────────────────────────────────────────────────

interface MonthMeta {
	id: string
	oneRCents: number
	tierIndex: number
	startCents: number
}

interface LadderTier {
	minCapitalCents: number
	maxCapitalCents: number
	oneRCents: number
}

const LADDER: LadderTier[] = [
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
		const tier = LADDER[i]
		if (
			tier &&
			capCents >= tier.minCapitalCents &&
			capCents <= tier.maxCapitalCents
		) {
			return { tierIndex: i, oneRCents: tier.oneRCents }
		}
	}
	const top = LADDER[LADDER.length - 1]
	if (!top) {
		throw new Error("LADDER is empty")
	}
	return { tierIndex: LADDER.length - 1, oneRCents: top.oneRCents }
}

const seedPlanCascade2026 = async (
	sql: SeedSql,
	accounts: SeededAccounts
): Promise<{ monthlyPlanByMonth: Map<number, MonthMeta> }> => {
	console.log("\n📦 Seeding fractal plan cascade for 2026...")

	// Anchor account lifecycle so reporting + balance chain start Jan 2026.
	await sql`
		UPDATE trading_accounts
		SET starting_balance_cents = 300000,
		    account_start_year = 2026,
		    account_start_month = 1,
		    withdrawal_target_percent = 0
		WHERE id = ${accounts.personal.id}
	`

	// Compound start-balance per month (cents). Jan→May ladders R$3k → R$30k.
	const MONTHLY_START_CENTS = [
		300_000, 750_000, 1_200_000, 1_800_000, 2_400_000, 3_000_000, 3_000_000,
		3_000_000, 3_000_000, 3_000_000, 3_000_000, 3_000_000,
	]

	const [yearlyPlan2026] = (await sql`
		INSERT INTO yearly_plans (
			id, account_id, year, initial_capital_cents, ir_tax_rate, trading_days_per_week,
			ladder_rules, start_week,
			default_daily_loss_r, default_daily_win_r,
			default_weekly_loss_r, default_weekly_win_r,
			default_monthly_loss_r, default_monthly_win_r,
			notes
		) VALUES (
			gen_random_uuid(), ${accounts.personal.id}, 2026, 300000, 30.00, 5,
			${JSON.stringify(LADDER)}::jsonb, 1,
			2.0, 4.0, 5.0, 8.0, 10.0, 20.0,
			'Seeded ladder progression — R$3k Jan → R$30k May 2026'
		)
		RETURNING id
	`) as { id: string }[]
	if (!yearlyPlan2026) {
		throw new Error("Failed to seed yearly_plan 2026")
	}

	const quarterlyIds: string[] = []
	for (let q = 1; q <= 4; q++) {
		const [row] = (await sql`
			INSERT INTO quarterly_plan (id, yearly_plan_id, quarter)
			VALUES (gen_random_uuid(), ${yearlyPlan2026.id}, ${q})
			RETURNING id
		`) as { id: string }[]
		if (!row) {
			throw new Error(`Failed to seed quarterly_plan Q${q}`)
		}
		quarterlyIds.push(row.id)
	}

	const monthlyPlanByMonth = new Map<number, MonthMeta>()
	for (let m = 1; m <= 12; m++) {
		const startCents = MONTHLY_START_CENTS[m - 1] ?? 300_000
		const { tierIndex, oneRCents } = resolveOneR(startCents)
		const qIndex = Math.floor((m - 1) / 3)
		const quarterlyId = quarterlyIds[qIndex]
		if (!quarterlyId) {
			throw new Error(`Missing quarterly_plan for month ${m}`)
		}
		const computedAt = new Date(
			Date.UTC(2026, m - 1, 1, 12, 0, 0)
		).toISOString()
		const [row] = (await sql`
			INSERT INTO monthly_plan (
				id, quarterly_plan_id, year, month,
				snapshot_capital_cents, snapshot_one_r_cents, snapshot_tier_index,
				snapshot_computed_at, snapshot_reason
			) VALUES (
				gen_random_uuid(), ${quarterlyId}, 2026, ${m},
				${startCents}, ${oneRCents}, ${tierIndex},
				${computedAt}, 'month_start'
			)
			RETURNING id
		`) as { id: string }[]
		if (!row) {
			throw new Error(`Failed to seed monthly_plan ${m}`)
		}
		monthlyPlanByMonth.set(m, {
			id: row.id,
			oneRCents,
			tierIndex,
			startCents,
		})
	}
	console.log("✅ Yearly + 4 quarterly + 12 monthly plans seeded")

	return { monthlyPlanByMonth }
}

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

const seedPersonalProceduralTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	strategyMap: StrategyMap,
	monthlyPlanByMonth: Map<number, MonthMeta>
): Promise<void> => {
	console.log("\n📦 Generating procedural trades (Jan–May 2026)...")

	// Per-month NET pnl target (cents). March is intentionally a losing month
	// so DARF carryover/compensation logic surfaces in tests.
	const MONTHLY_NET_TARGETS_CENTS = [
		450_000, 450_000, -300_000, 600_000, 600_000,
	]

	const rand = createPrng(42)

	const personalTradesGenerated: SeedTrade[] = []
	for (let m = 1; m <= 5; m++) {
		const meta = monthlyPlanByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing monthly_plan meta for month ${m}`)
		}
		const oneRReais = meta.oneRCents / 100
		const tradingDays = getTradingDays(
			new Date(Date.UTC(2026, m - 1, 1)),
			new Date(Date.UTC(2026, m, 0))
		)
		const targetCents = MONTHLY_NET_TARGETS_CENTS[m - 1] ?? 0
		const targetReais = targetCents / 100

		const isLossMonth = targetReais < 0
		const loserRatio = isLossMonth ? 0.65 : 0.3
		const numLosers = Math.floor(tradingDays.length * loserRatio)
		const dayIndices = tradingDays.map((_, i) => i)
		for (let i = dayIndices.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1))
			const a = dayIndices[i]
			const b = dayIndices[j]
			if (a === undefined || b === undefined) {
				continue
			}
			dayIndices[i] = b
			dayIndices[j] = a
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
				const jitter = 0.55 + rand() * 0.9
				dailyPnls.push(avgWinnerReais * jitter)
			}
		}
		const winnerSum = dailyPnls.reduce(
			(a, b, i) => (loserIdx.has(i) ? a : a + b),
			0
		)
		const scale = winnerSum !== 0 ? winnersTotalReais / winnerSum : 1
		for (let i = 0; i < dailyPnls.length; i++) {
			if (!loserIdx.has(i)) {
				const cur = dailyPnls[i]
				if (cur !== undefined) {
					dailyPnls[i] = cur * scale
				}
			}
		}

		for (let dayIdx = 0; dayIdx < tradingDays.length; dayIdx++) {
			const day = tradingDays[dayIdx]
			const dayPnl = dailyPnls[dayIdx]
			if (!day || dayPnl === undefined) {
				continue
			}
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
				const ppc = asset === "WIN" ? WIN_PER_POINT : WDO_PER_POINT
				const refStopPoints = asset === "WDO" ? 50 : 100
				const size = Math.max(1, Math.round(oneRReais / (refStopPoints * ppc)))
				const priceDiffPoints = tradePnl / (size * ppc)
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
				const stopPoints = oneRReais / (size * ppc)
				const sl = dir === "long" ? entryP - stopPoints : entryP + stopPoints
				const tp =
					dir === "long" ? entryP + stopPoints * 2 : entryP - stopPoints * 2

				const entryTime = randomTradingTime(day, rand)
				const exitTime = generateExitTime(entryTime, rand)

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
					strat: pickFrom(["BREAKOUT", "TREND", "REVERSION", "SR"], rand),
					oneRSnapshotCents: meta.oneRCents,
					rOutcome,
					plannedRiskAmountCents: meta.oneRCents,
				})
			}
		}
	}

	for (const t of personalTradesGenerated) {
		const strategyId = strategyMap.personal.get(t.strat) ?? null
		await sql`
			INSERT INTO trades (
				id, account_id, asset, direction, timeframe_id, entry_date, exit_date,
				entry_price, exit_price, position_size, stop_loss, take_profit,
				planned_risk_amount, realized_r_multiple,
				pnl, outcome, followed_plan, strategy_id, is_archived,
				one_r_snapshot_cents, r_outcome, source
			) VALUES (
				gen_random_uuid(), ${accounts.personal.id}, ${t.asset}, ${t.dir}, NULL, ${t.entryTime}, ${t.exitTime},
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
}

// Prop trades: the legacy hand-crafted list was commented out; this is a
// placeholder no-op until commit #7a replaces it with the Atom Funded
// Jan 2025 – Mar 2026 procedural generator.
const seedPropTradesPlaceholder = async (
	_sql: SeedSql,
	_accounts: SeededAccounts,
	_strategyMap: StrategyMap
): Promise<void> => {
	console.log(
		"\n📦 Seeding trades for Prop account... (skipped — pending commit #7a)"
	)
}

runSeed().catch((err) => {
	console.error("❌ Seed failed:", err)
	process.exit(1)
})
