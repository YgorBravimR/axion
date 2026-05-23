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

// Personal account — Jan–May 2026, R$3k → R$24k ladder progression.
// March is intentionally a losing month so DARF carryover surfaces.
const MONTHLY_NET_TARGETS_CENTS = [450_000, 450_000, -300_000, 600_000, 600_000]

const PERSONAL_STRATEGY_CODES = ["BREAKOUT", "TREND", "REVERSION", "SR"]

export const seedPersonalTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	cascades: CascadesByAccount,
	strategyMap: StrategyMap
): Promise<void> => {
	console.log("\n📦 Generating Personal trades (Jan–May 2026)...")

	const personalYears = cascades.get(accounts.personal.id)
	const cascade2026 = personalYears?.find((y) => y.year === 2026)
	if (!cascade2026) {
		throw new Error("Missing Personal 2026 cascade")
	}

	const months: ProceduralMonthSpec[] = []
	for (let m = 1; m <= 5; m++) {
		const meta = cascade2026.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Personal monthly_plan ${m}/2026`)
		}
		const target = MONTHLY_NET_TARGETS_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing target for month ${m}`)
		}
		months.push({
			year: 2026,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}

	const trades = generateProceduralTrades({
		accountId: accounts.personal.id,
		prngSeed: 42,
		months,
		strategyPicker: uniformStrategyPicker(PERSONAL_STRATEGY_CODES),
	})

	await insertTrades(sql, accounts.personal.id, trades, strategyMap.personal)
	console.log(`✅ Personal trades seeded (${trades.length} trades)`)
}
