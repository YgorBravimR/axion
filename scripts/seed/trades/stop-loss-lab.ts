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

// Stop Loss Lab — bad-arc account, drawdown story. Plan cascade shows
// R$50k → R$25k by April, then forced conservative (flat) in May.
// Net deltas: -R$5k / -R$7k / -R$8k / -R$5k / R$0 (chop). Low plan
// adherence (0.4) and oversized positions (1.4x) model the typical
// "doing-the-wrong-thing" pattern: revenge trading, wider stops, no edge.
const STOP_LOSS_LAB_NET_CENTS = [
	-500_000, // Jan -R$5k
	-700_000, // Feb -R$7k
	-800_000, // Mar -R$8k
	-500_000, // Apr -R$5k
	0, // May R$0 (forced conservative, choppy day-trades net flat)
]

const STOP_LOSS_LAB_STRATEGY_CODES = ["AGGR_BREAKOUT", "COUNTER", "SCALP"]

export const seedStopLossLabTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	cascades: CascadesByAccount,
	strategyMap: StrategyMap
): Promise<void> => {
	console.log(
		"\n📦 Generating Stop Loss Lab trades (Jan–May 2026, drawdown arc)..."
	)

	const labYears = cascades.get(accounts.stopLossLab.id)
	const cascade2026 = labYears?.find((y) => y.year === 2026)
	if (!cascade2026) {
		throw new Error("Missing Stop Loss Lab 2026 cascade")
	}

	const months: ProceduralMonthSpec[] = []
	for (let m = 1; m <= 5; m++) {
		const meta = cascade2026.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Stop Loss Lab monthly_plan ${m}/2026`)
		}
		const target = STOP_LOSS_LAB_NET_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing Stop Loss Lab target for month ${m}`)
		}
		months.push({
			year: 2026,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}

	const trades = generateProceduralTrades({
		accountId: accounts.stopLossLab.id,
		prngSeed: 6660,
		months,
		strategyPicker: uniformStrategyPicker(STOP_LOSS_LAB_STRATEGY_CODES),
		positionSizeScale: 1.4, // oversized — pattern of bad discipline
		planConformityRate: 0.4, // low plan adherence — revenge trades + skipped rules
	})

	await insertTrades(
		sql,
		accounts.stopLossLab.id,
		trades,
		strategyMap.stopLossLab
	)
	console.log(`✅ Stop Loss Lab trades seeded (${trades.length} trades)`)
}
