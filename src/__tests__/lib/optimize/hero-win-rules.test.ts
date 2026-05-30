import { describe, it, expect } from "vitest"
import {
	evaluateHeroGates,
	suggestPresetId,
	snapshotMetrics,
	HERO_WIN_RULES,
} from "@/lib/optimize/hero-win-rules"
import type {
	OptimizationRun,
	BacktestSummary,
	StrategyRecipe,
} from "@/types/backtest"

const summary = (
	overrides: Partial<BacktestSummary> = {}
): BacktestSummary => ({
	totalTrades: 50,
	wins: 30,
	losses: 18,
	breakevens: 2,
	winRate: 60,
	profitFactor: 2.0,
	totalPnlCents: 50_000,
	avgPnlCents: 1000,
	avgWinCents: 2000,
	avgLossCents: -1500,
	avgRMultiple: 0.5,
	maxDrawdownCents: -1000,
	maxConsecutiveLosses: 3,
	maxConsecutiveWins: 5,
	sharpeRatio: 1.2,
	expectancy: 0.5,
	totalDays: 30,
	tradingDays: 25,
	...overrides,
})

const run = (
	overrides: Partial<BacktestSummary> = {},
	extra: Partial<OptimizationRun> = {}
): OptimizationRun => ({
	id: "r1",
	label: "Run",
	recipe: { displayName: "x" } as StrategyRecipe,
	summary: summary(overrides),
	equityCurve: [],
	trades: [],
	dayBreakdown: [],
	pinned: false,
	createdAt: "2026-05-30T00:00:00Z",
	...extra,
})

describe("evaluateHeroGates", () => {
	it("passes when all gates clear (PF≥1.5, OOS robust, trades≥30)", () => {
		const r = run({ profitFactor: 1.8, totalTrades: 50 }, { oosRobust: true })
		const result = evaluateHeroGates(r)
		expect(result.passes).toBe(true)
		expect(result.failures).toEqual([])
	})

	it("fails when PF is below threshold", () => {
		const r = run({ profitFactor: 1.2, totalTrades: 50 }, { oosRobust: true })
		const result = evaluateHeroGates(r)
		expect(result.passes).toBe(false)
		expect(result.failures.map((f) => f.ruleId)).toEqual(["minProfitFactor"])
	})

	it("fails when oosRobust is false", () => {
		const r = run({ profitFactor: 1.8, totalTrades: 50 }, { oosRobust: false })
		const result = evaluateHeroGates(r)
		expect(result.passes).toBe(false)
		expect(result.failures.map((f) => f.ruleId)).toEqual(["requireOOSRobust"])
	})

	it("fails when oosRobust is undefined (walk-forward not run)", () => {
		const r = run({ profitFactor: 1.8, totalTrades: 50 })
		const result = evaluateHeroGates(r)
		expect(result.passes).toBe(false)
		expect(result.failures.map((f) => f.ruleId)).toContain("requireOOSRobust")
	})

	it("fails when trades is below threshold", () => {
		const r = run({ profitFactor: 1.8, totalTrades: 10 }, { oosRobust: true })
		const result = evaluateHeroGates(r)
		expect(result.passes).toBe(false)
		expect(result.failures.map((f) => f.ruleId)).toEqual(["minTrades"])
	})

	it("reports multiple failures at once", () => {
		const r = run({ profitFactor: 1.0, totalTrades: 5 }, { oosRobust: false })
		const result = evaluateHeroGates(r)
		expect(result.passes).toBe(false)
		expect(result.failures.length).toBe(3)
	})
})

describe("suggestPresetId", () => {
	it("appends _tuned_<ISO date>", () => {
		const id = suggestPresetId("hawks_v0", new Date("2026-05-30T12:34:56Z"))
		expect(id).toBe("hawks_v0_tuned_2026-05-30")
	})
})

describe("snapshotMetrics", () => {
	it("captures all required metrics from a run", () => {
		const r = run(
			{
				profitFactor: 1.8,
				totalTrades: 50,
				maxDrawdownCents: -500,
				winRate: 64,
			},
			{ oosRobust: true, matchRate: 0.7 }
		)
		const snap = snapshotMetrics(r)
		expect(snap.profitFactor).toBe(1.8)
		expect(snap.trades).toBe(50)
		expect(snap.oosRobust).toBe(true)
		expect(snap.matchRate).toBe(0.7)
		expect(snap.maxDrawdownCents).toBe(-500)
		expect(snap.winRate).toBe(64)
	})

	it("normalizes oosRobust=undefined to false in the snapshot", () => {
		const r = run({}, {})
		const snap = snapshotMetrics(r)
		expect(snap.oosRobust).toBe(false)
	})
})

describe("HERO_WIN_RULES export", () => {
	it("exposes thresholds (matches design defaults)", () => {
		expect(HERO_WIN_RULES.minProfitFactor).toBe(1.5)
		expect(HERO_WIN_RULES.requireOOSRobust).toBe(true)
		expect(HERO_WIN_RULES.minTrades).toBe(30)
	})
})
