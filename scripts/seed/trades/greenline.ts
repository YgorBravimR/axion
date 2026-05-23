import type { SeedSql } from "../helpers/sql"
import type { SeededAccounts } from "../accounts"
import type { CascadesByAccount } from "../plans"
import type { StrategyMap } from "../strategies"
import {
	generateProceduralTrades,
	insertTrades,
	uniformStrategyPicker,
	type ProceduralMonthSpec,
} from "./generate"

// Greenline — good-arc account, every month profitable. Plan cascade has
// monthlyStartCents R$50k → R$108k across 2026. We ship Jan-May trades
// matching the early-year deltas: +R$4k / +R$5k / +R$6k / +R$7k / +R$8k.
// Smooth ladder graduation (no losing months — that's the identity).
const GREENLINE_NET_CENTS = [
	400_000, // Jan +R$4k
	500_000, // Feb +R$5k
	600_000, // Mar +R$6k
	700_000, // Apr +R$7k
	800_000, // May +R$8k
]

const GREENLINE_STRATEGY_CODES = ["BREAKOUT", "TREND", "REVERSION", "SR"]

export const seedGreenlineTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	cascades: CascadesByAccount,
	strategyMap: StrategyMap
): Promise<void> => {
	console.log("\n📦 Generating Greenline trades (Jan–May 2026, good arc)...")

	const greenlineYears = cascades.get(accounts.greenline.id)
	const cascade2026 = greenlineYears?.find((y) => y.year === 2026)
	if (!cascade2026) {
		throw new Error("Missing Greenline 2026 cascade")
	}

	const months: ProceduralMonthSpec[] = []
	for (let m = 1; m <= 5; m++) {
		const meta = cascade2026.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Greenline monthly_plan ${m}/2026`)
		}
		const target = GREENLINE_NET_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing Greenline target for month ${m}`)
		}
		months.push({
			year: 2026,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}

	const trades = generateProceduralTrades({
		accountId: accounts.greenline.id,
		prngSeed: 9001,
		months,
		strategyPicker: uniformStrategyPicker(GREENLINE_STRATEGY_CODES),
		planConformityRate: 0.8,
	})

	await insertTrades(sql, accounts.greenline.id, trades, strategyMap.greenline)
	console.log(`✅ Greenline trades seeded (${trades.length} trades)`)
}
