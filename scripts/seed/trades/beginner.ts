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

// Beginner — small capital, weekly lock cadence, very conservative.
// Only ships Jan-Mar 2026 (still learning, low volume). Net deltas:
// Jan -R$200 (wash), Feb +R$400 (first green month), Mar +R$300.
// Total +R$500 across the quarter — the "barely starting to find an edge"
// arc that contrasts with Greenline's smooth growth.
const BEGINNER_NET_CENTS = [
	-20_000, // Jan -R$200 (wash month)
	40_000, // Feb +R$400 (first green)
	30_000, // Mar +R$300
]

const BEGINNER_STRATEGY_CODES = ["TREND", "SR"]

export const seedBeginnerTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	cascades: CascadesByAccount,
	strategyMap: StrategyMap
): Promise<void> => {
	console.log(
		"\n📦 Generating Beginner trades (Jan–Mar 2026, conservative learning arc)..."
	)

	const beginnerYears = cascades.get(accounts.beginner.id)
	const cascade2026 = beginnerYears?.find((y) => y.year === 2026)
	if (!cascade2026) {
		throw new Error("Missing Beginner 2026 cascade")
	}

	const months: ProceduralMonthSpec[] = []
	for (let m = 1; m <= 3; m++) {
		const meta = cascade2026.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Beginner monthly_plan ${m}/2026`)
		}
		const target = BEGINNER_NET_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing Beginner target for month ${m}`)
		}
		months.push({
			year: 2026,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}

	const trades = generateProceduralTrades({
		accountId: accounts.beginner.id,
		prngSeed: 2024,
		months,
		strategyPicker: uniformStrategyPicker(BEGINNER_STRATEGY_CODES),
		positionSizeScale: 0.7, // sized down — still learning, mostly minimum contracts
		planConformityRate: 0.65, // moderate adherence — knows the rules, slips sometimes
	})

	await insertTrades(sql, accounts.beginner.id, trades, strategyMap.beginner)
	console.log(`✅ Beginner trades seeded (${trades.length} trades)`)
}
