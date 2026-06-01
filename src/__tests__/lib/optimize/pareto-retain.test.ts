import { describe, it, expect } from "vitest"
import { paretoRetain } from "@/lib/optimize/pareto-retain"
import type { OptimizationRun } from "@/types/backtest"

const mockRun = (
	id: string,
	pf: number,
	pnl: number,
	sharpe: number,
	tradeCount = 100
): OptimizationRun => {
	const recipe = {
		entry: { type: "orb_breakout", config: {} },
		stop: { initial: { type: "fixed_points", points: 100 } },
		target: { mode: "r_multiple", levels: [{ r: 2 }] },
		sizing: { type: "fixed_lots", lots: 1 },
	} as unknown as OptimizationRun["recipe"]

	const trades = Array.from({ length: tradeCount }, () => ({
		entryDate: "2024-01-01",
		entryPrice: 100,
		exitPrice: 105,
		positionSize: 1,
		pnlCents: 500,
		rMultiple: 1,
	})) as unknown as OptimizationRun["trades"]

	return {
		id,
		label: `Run ${id}`,
		recipe,
		summary: {
			totalTrades: tradeCount,
			wins: Math.floor(tradeCount * 0.5),
			losses: Math.floor(tradeCount * 0.5),
			breakevens: 0,
			winRate: 50,
			profitFactor: pf,
			totalPnlCents: pnl,
			avgPnlCents: Math.floor(pnl / tradeCount),
			avgWinCents: 500,
			avgLossCents: -500,
			avgRMultiple: 1.5,
			maxDrawdownCents: 1000,
			maxConsecutiveLosses: 3,
			maxConsecutiveWins: 5,
			sharpeRatio: sharpe,
			expectancy: 1.5,
			totalDays: 252,
			tradingDays: 200,
		},
		equityCurve: [],
		trades,
		dayBreakdown: [],
		pinned: false,
		createdAt: new Date().toISOString(),
	}
}

describe("paretoRetain", () => {
	it("keeps all runs on the 3-axis Pareto front", () => {
		// Three runs: A dominates none, B dominates none, C dominates A
		const runs = [
			mockRun("A", 1.5, 10000, 0.8, 100),
			mockRun("B", 1.8, 5000, 1.2, 100),
			mockRun("C", 2.0, 15000, 1.0, 100), // best on PF and PnL
		]

		const retained = paretoRetain(runs)

		// C dominates A on both PF and PnL (and is on the front)
		expect(retained.find((r) => r.id === "A")?.tradesRetained).toBe(false)
		// B is not dominated (lower PnL but higher Sharpe)
		expect(retained.find((r) => r.id === "B")?.tradesRetained).toBe(true)
		// C is the best on PF and PnL
		expect(retained.find((r) => r.id === "C")?.tradesRetained).toBe(true)
	})

	it("includes single-metric extremes even if dominated overall", () => {
		const runs = [
			mockRun("A", 1.0, 5000, 0.5, 100), // dominated on all axes
			mockRun("B", 2.0, 10000, 1.0, 100), // best PF
			mockRun("C", 1.5, 20000, 0.8, 100), // best PnL
		]

		const retained = paretoRetain(runs)

		// A is dominated, not a single-metric extreme → stripped
		expect(retained.find((r) => r.id === "A")?.tradesRetained).toBe(false)
		// B is best by PF → kept
		expect(retained.find((r) => r.id === "B")?.tradesRetained).toBe(true)
		// C is best by PnL → kept
		expect(retained.find((r) => r.id === "C")?.tradesRetained).toBe(true)
	})

	it("strips trades for non-retained runs", () => {
		const runs = [
			mockRun("A", 2.0, 10000, 1.0, 100), // on front
			mockRun("B", 1.0, 5000, 0.5, 100), // dominated
		]

		const retained = paretoRetain(runs)

		const a = retained.find((r) => r.id === "A")
		const b = retained.find((r) => r.id === "B")

		expect(a?.trades.length).toBe(100) // keeps trades
		expect(a?.tradesRetained).toBe(true)

		expect(b?.trades.length).toBe(0) // strips trades
		expect(b?.tradesRetained).toBe(false)
	})

	it("handles empty run list gracefully", () => {
		const retained = paretoRetain([])
		expect(retained).toEqual([])
	})

	it("preserves summary metrics on stripped runs", () => {
		const runs = [
			mockRun("A", 2.0, 10000, 1.0, 100),
			mockRun("B", 1.0, 5000, 0.5, 100),
		]

		const retained = paretoRetain(runs)
		const b = retained.find((r) => r.id === "B")

		expect(b?.summary.profitFactor).toBe(1.0)
		expect(b?.summary.totalPnlCents).toBe(5000)
		expect(b?.summary.sharpeRatio).toBe(0.5)
		expect(b?.trades.length).toBe(0)
	})

	it("handles ties on metrics correctly", () => {
		const runs = [
			mockRun("A", 2.0, 10000, 1.0, 100), // best on all three axes
			mockRun("B", 2.0, 10000, 0.8, 100), // dominated by A (ties on PF/PnL, loses on Sharpe)
			mockRun("C", 1.5, 5000, 0.5, 100), // dominated on all axes
		]

		const retained = paretoRetain(runs)

		// A is on the front
		expect(retained.find((r) => r.id === "A")?.tradesRetained).toBe(true)
		// B is dominated by A (even though tied on some axes, A beats it on Sharpe)
		expect(retained.find((r) => r.id === "B")?.tradesRetained).toBe(false)
		// C is dominated
		expect(retained.find((r) => r.id === "C")?.tradesRetained).toBe(false)
	})

	it("sets tradesRetained flag correctly on all runs", () => {
		const runs = [
			mockRun("A", 2.0, 10000, 1.0, 100),
			mockRun("B", 1.5, 8000, 0.8, 100),
			mockRun("C", 1.0, 5000, 0.5, 100),
		]

		const retained = paretoRetain(runs)

		for (const run of retained) {
			expect("tradesRetained" in run).toBe(true)
			expect(typeof run.tradesRetained).toBe("boolean")
		}
	})
})
