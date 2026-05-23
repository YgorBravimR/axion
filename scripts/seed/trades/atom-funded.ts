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

// Atom Funded — long-history prop account, Jan 2025 → Mar 2026.
// Net target arc per month (cents). Cumulative ~+R$18k by Mar 2026
// (matching the "realistic mixed" arc choice). Mixed monthly results:
// 4 losing months out of 15 scattered across the timeline, drawdown
// weeks within profit months, profitable overall.
//
// Year 2025 (12 months) — net +R$25k cumulative:
const ATOM_2025_NET_CENTS = [
	250_000, // Jan + R$2.5k
	-180_000, // Feb − R$1.8k  (early prop drawdown)
	220_000, // Mar + R$2.2k
	300_000, // Apr + R$3.0k
	-150_000, // May − R$1.5k
	280_000, // Jun + R$2.8k
	250_000, // Jul + R$2.5k
	-220_000, // Aug − R$2.2k  (summer chop)
	320_000, // Sep + R$3.2k
	270_000, // Oct + R$2.7k
	240_000, // Nov + R$2.4k
	220_000, // Dec + R$2.2k
]
// Year 2026 (only Jan-Mar — account stops after Mar by design):
const ATOM_2026_NET_CENTS = [
	180_000, // Jan + R$1.8k
	-200_000, // Feb − R$2.0k
	220_000, // Mar + R$2.2k
	0, // Apr (no trades)
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
]

const ATOM_STRATEGY_CODES = ["BREAKOUT", "TREND", "SCALP"]

export const seedAtomFundedTrades = async (
	sql: SeedSql,
	accounts: SeededAccounts,
	cascades: CascadesByAccount,
	strategyMap: StrategyMap
): Promise<void> => {
	console.log(
		"\n📦 Generating Atom Funded trades (Jan 2025 – Mar 2026, 15 months)..."
	)

	const propYears = cascades.get(accounts.prop.id)
	const cascade2025 = propYears?.find((y) => y.year === 2025)
	const cascade2026 = propYears?.find((y) => y.year === 2026)
	if (!cascade2025 || !cascade2026) {
		throw new Error("Missing Atom Funded cascade for 2025 or 2026")
	}

	const months: ProceduralMonthSpec[] = []
	for (let m = 1; m <= 12; m++) {
		const meta = cascade2025.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Atom 2025/${m} monthly_plan`)
		}
		const target = ATOM_2025_NET_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing 2025 target month ${m}`)
		}
		months.push({
			year: 2025,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}
	// 2026: only Jan-Mar have non-zero targets; we still pass zero-target months
	// for Apr-Dec to skip them (generator yields 0 trades when target=0 and
	// loserRatio*tradingDays rounds down to 0).
	for (let m = 1; m <= 3; m++) {
		const meta = cascade2026.monthlyByMonth.get(m)
		if (!meta) {
			throw new Error(`Missing Atom 2026/${m} monthly_plan`)
		}
		const target = ATOM_2026_NET_CENTS[m - 1]
		if (target === undefined) {
			throw new Error(`Missing 2026 target month ${m}`)
		}
		months.push({
			year: 2026,
			month: m,
			netTargetCents: target,
			monthMeta: meta,
		})
	}

	const trades = generateProceduralTrades({
		accountId: accounts.prop.id,
		prngSeed: 1337, // distinct seed from Personal so daily P&L paths differ
		months,
		strategyPicker: uniformStrategyPicker(ATOM_STRATEGY_CODES),
		planConformityRate: 0.85, // prop accounts demand higher plan adherence
	})

	await insertTrades(sql, accounts.prop.id, trades, strategyMap.prop)
	const cumulativeCents = trades.reduce((sum, t) => sum + t.pnlCents, 0)
	console.log(
		`✅ Atom Funded trades seeded (${trades.length} trades, cum R$${(cumulativeCents / 100).toFixed(2)})`
	)
}
