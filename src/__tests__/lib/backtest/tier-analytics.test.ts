import { describe, it, expect } from "vitest"
import {
	computeTierBreakdown,
	hasAnyTierData,
} from "@/lib/backtest/tier-analytics"
import type { BacktestTrade, QualityTier } from "@/types/backtest"

// Minimal trade fixture; only the fields the analytics function reads are
// populated. Anything else gets sensible defaults.
const trade = (
	id: number,
	tier: QualityTier | undefined,
	netPnlCents: number,
	rMultiple: number
): BacktestTrade => ({
	id,
	dayKey: "2026-05-13",
	direction: "short",
	entryPrice: 182000,
	entryTime: "2026-05-13T09:10:00Z",
	exitPrice: 181000,
	exitTime: "2026-05-13T09:30:00Z",
	exitReason: "target1",
	contracts: 1,
	grossPnlCents: netPnlCents,
	slippageCostCents: 0,
	netPnlCents,
	rMultiple,
	label: "T1",
	quality: tier ? { tier, score: 0, contributions: [] } : undefined,
})

describe("computeTierBreakdown", () => {
	it("returns empty array for empty trades", () => {
		expect(computeTierBreakdown([])).toEqual([])
	})

	it("buckets trades by tier and sorts AAA → untiered", () => {
		const rows = computeTierBreakdown([
			trade(1, "B", 100, 1),
			trade(2, "AAA", 200, 2),
			trade(3, undefined, 50, 0.5),
			trade(4, "AA", 150, 1.5),
		])
		expect(rows.map((r) => r.tier)).toEqual(["AAA", "AA", "B", "untiered"])
	})

	it("computes winRate excluding breakevens", () => {
		// 2 wins, 1 loss, 1 breakeven → 2/3 ≈ 66.7%
		const rows = computeTierBreakdown([
			trade(1, "AAA", 100, 1),
			trade(2, "AAA", -100, -1),
			trade(3, "AAA", 200, 2),
			trade(4, "AAA", 0, 0),
		])
		expect(rows[0]?.winRate).toBe(66.7)
		expect(rows[0]?.count).toBe(4)
	})

	it("computes running drawdown over the tier's own sequence", () => {
		// Sequence: +100, -300, +50. Cumulative: 100, -200, -150.
		// Peak = 100 → drawdown bottom at -200 ⇒ -300.
		const rows = computeTierBreakdown([
			trade(1, "AAA", 100, 1),
			trade(2, "AAA", -300, -3),
			trade(3, "AAA", 50, 0.5),
		])
		expect(rows[0]?.maxDrawdownCents).toBe(-300)
		expect(rows[0]?.totalPnlCents).toBe(-150)
	})

	it("computes 0%% winRate when no decided trades", () => {
		// All breakevens
		const rows = computeTierBreakdown([
			trade(1, "AA", 0, 0),
			trade(2, "AA", 0, 0),
		])
		expect(rows[0]?.winRate).toBe(0)
	})

	it("avgRMultiple is rounded to two decimals", () => {
		// Mean = 1.50 exactly. Picking a midpoint like 1.235 would hit IEEE-754
		// edge cases where (1.234 + 1.236) / 2 ≠ 1.235 in floating point.
		const rows = computeTierBreakdown([
			trade(1, "AAA", 100, 1.0),
			trade(2, "AAA", 100, 2.0),
		])
		expect(rows[0]?.avgRMultiple).toBe(1.5)
	})
})

describe("hasAnyTierData", () => {
	it("returns true if any trade carries quality", () => {
		expect(
			hasAnyTierData([trade(1, undefined, 0, 0), trade(2, "A", 0, 0)])
		).toBe(true)
	})

	it("returns false if no trade carries quality", () => {
		expect(
			hasAnyTierData([trade(1, undefined, 0, 0), trade(2, undefined, 0, 0)])
		).toBe(false)
	})

	it("returns false for empty array", () => {
		expect(hasAnyTierData([])).toBe(false)
	})
})
