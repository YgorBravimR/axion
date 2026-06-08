import { describe, it, expect } from "vitest"
import {
	computeBreakevenRate,
	countBreakevens,
	filterOutBreakevens,
	recomputeDayBreakdown,
	recomputeWithoutBreakevens,
} from "@/lib/backtest/breakeven-filter"
import type {
	BacktestResult,
	BacktestSummary,
	BacktestTrade,
	DayBreakdown,
	EquityCurvePoint,
} from "@/types/backtest"

// Minimal trade fixture — only the fields the filter & metrics read.
const trade = (
	id: number,
	exitReason: BacktestTrade["exitReason"],
	netPnlCents: number
): BacktestTrade => ({
	id,
	dayKey: "2026-05-13",
	direction: "short",
	entryPrice: 182000,
	entryTime: "2026-05-13T09:10:00Z",
	exitPrice: 181000,
	exitTime: "2026-05-13T09:30:00Z",
	exitReason,
	contracts: 1,
	grossPnlCents: netPnlCents,
	slippageCostCents: 0,
	netPnlCents,
	rMultiple: netPnlCents / 100,
	label: "T1",
})

const summary = (overrides?: Partial<BacktestSummary>): BacktestSummary => ({
	totalTrades: 0,
	wins: 0,
	losses: 0,
	breakevens: 0,
	winRate: 0,
	profitFactor: 0,
	totalPnlCents: 0,
	avgPnlCents: 0,
	avgWinCents: 0,
	avgLossCents: 0,
	avgRMultiple: 0,
	maxDrawdownCents: 0,
	maxConsecutiveLosses: 0,
	maxConsecutiveWins: 0,
	sharpeRatio: 0,
	rSharpe: 0,
	cagr: null,
	annualizedVolatility: 0,
	expectancy: 0,
	totalDays: 1,
	tradingDays: 0,
	...overrides,
})

describe("filterOutBreakevens", () => {
	it("removes only breakeven_stop exits", () => {
		const trades = [
			trade(1, "target1", 100),
			trade(2, "breakeven_stop", 0),
			trade(3, "stop", -50),
			trade(4, "breakeven_stop", 0),
		]
		const filtered = filterOutBreakevens(trades)
		expect(filtered.map((t) => t.id)).toEqual([1, 3])
	})
})

describe("countBreakevens / computeBreakevenRate", () => {
	it("counts BE-stop exits and computes rate to 0.1%", () => {
		const trades = [
			trade(1, "target1", 100),
			trade(2, "breakeven_stop", 0),
			trade(3, "breakeven_stop", 0),
			trade(4, "stop", -50),
		]
		expect(countBreakevens(trades)).toBe(2)
		expect(computeBreakevenRate(trades)).toBe(50) // 2/4 = 50.0%
	})

	it("returns 0 / 0 for empty array", () => {
		expect(countBreakevens([])).toBe(0)
		expect(computeBreakevenRate([])).toBe(0)
	})
})

describe("recomputeDayBreakdown", () => {
	it("rebuilds per-day rollups, preserves range fields, zeroes empty days", () => {
		const trades: BacktestTrade[] = [
			{ ...trade(1, "target1", 100), dayKey: "2026-05-13" },
			{ ...trade(2, "stop", -50), dayKey: "2026-05-14" },
		]
		const original: DayBreakdown[] = [
			{
				dayKey: "2026-05-13",
				trades: 3,
				pnlCents: 999,
				rangeHigh: 100,
				rangeLow: 90,
			},
			{
				dayKey: "2026-05-14",
				trades: 1,
				pnlCents: -50,
				rangeHigh: null,
				rangeLow: null,
			},
			{
				dayKey: "2026-05-15",
				trades: 5,
				pnlCents: 200,
				rangeHigh: null,
				rangeLow: null,
			},
		]
		const next = recomputeDayBreakdown(trades, original)
		expect(next[0]).toEqual({
			dayKey: "2026-05-13",
			trades: 1,
			pnlCents: 100,
			rangeHigh: 100,
			rangeLow: 90,
		})
		expect(next[1]?.trades).toBe(1)
		expect(next[1]?.pnlCents).toBe(-50)
		// Day with no remaining trades drops to 0 but stays in the row list
		expect(next[2]?.trades).toBe(0)
		expect(next[2]?.pnlCents).toBe(0)
	})
})

describe("recomputeWithoutBreakevens", () => {
	it("recomputes summary + equity curve from filtered trades", () => {
		const beTrade = trade(2, "breakeven_stop", 0)
		const equityCurve: EquityCurvePoint[] = [
			{
				tradeIndex: 0,
				cumulativePnlCents: 100,
				drawdownCents: 0,
				dayKey: "2026-05-13",
			},
			{
				tradeIndex: 1,
				cumulativePnlCents: 100,
				drawdownCents: 0,
				dayKey: "2026-05-13",
			},
			{
				tradeIndex: 2,
				cumulativePnlCents: 50,
				drawdownCents: 50,
				dayKey: "2026-05-13",
			},
		]
		const result: BacktestResult = {
			trades: [trade(1, "target1", 100), beTrade, trade(3, "stop", -50)],
			equityCurve,
			summary: summary({ totalTrades: 3, wins: 1, losses: 1, breakevens: 1 }),
			dayBreakdown: [
				{
					dayKey: "2026-05-13",
					trades: 3,
					pnlCents: 50,
					rangeHigh: null,
					rangeLow: null,
				},
			],
		}
		const filtered = recomputeWithoutBreakevens(result)
		expect(filtered.trades.length).toBe(2)
		expect(filtered.summary.totalTrades).toBe(2)
		expect(filtered.summary.breakevens).toBe(0)
		expect(filtered.summary.wins).toBe(1)
		expect(filtered.summary.losses).toBe(1)
		// New equity curve reindexed from 0
		expect(filtered.equityCurve.map((p) => p.tradeIndex)).toEqual([0, 1])
		// Day breakdown trade count reflects only non-BE trades
		expect(filtered.dayBreakdown[0]?.trades).toBe(2)
	})
})
