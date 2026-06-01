import { describe, it, expect } from "vitest"
import { computeParetoFrontier } from "@/lib/optimize/pareto"
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
	profitFactor: 1.5,
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
	id: string,
	overrides: Partial<BacktestSummary> = {},
	extra: Partial<OptimizationRun> = {}
): OptimizationRun => ({
	id,
	label: `Run ${id}`,
	recipe: { displayName: id } as StrategyRecipe,
	summary: summary(overrides),
	equityCurve: [],
	trades: [],
	dayBreakdown: [],
	pinned: false,
	createdAt: "2026-05-30T00:00:00Z",
	...extra,
})

describe("computeParetoFrontier", () => {
	it("excludes profit losers by default (PF<1 cut)", () => {
		const runs = [
			run("a", { profitFactor: 1.8, maxDrawdownCents: -500 }),
			run("loser", { profitFactor: 0.6, maxDrawdownCents: -100 }),
		]
		const points = computeParetoFrontier(runs)
		expect(points.map((p) => p.runId).sort()).toEqual(["a"])
	})

	it("default axes (drawdown, PF): minimize x, maximize y", () => {
		const runs = [
			run("a", { profitFactor: 1.8, maxDrawdownCents: -500 }),
			run("b", { profitFactor: 2.4, maxDrawdownCents: -1200 }),
			run("c", { profitFactor: 1.2, maxDrawdownCents: -300 }),
			run("d", { profitFactor: 1.5, maxDrawdownCents: -800 }), // dominated by a
		]
		const points = computeParetoFrontier(runs)
		const frontier = points.filter((p) => p.isFrontier).map((p) => p.runId)
		expect(frontier.sort()).toEqual(["a", "b", "c"])
	})

	it("axis combo (assertivity, avgR): both max — frontier is competing tradeoff", () => {
		const runs = [
			run("hi-acc-low-r", { winRate: 80, avgRMultiple: 0.3 }),
			run("balanced", { winRate: 60, avgRMultiple: 1.0 }),
			run("lo-acc-hi-r", { winRate: 40, avgRMultiple: 2.0 }),
			run("dominated", { winRate: 50, avgRMultiple: 0.8 }),
		]
		const points = computeParetoFrontier(runs, "assertivity", "avgR")
		const frontier = points.filter((p) => p.isFrontier).map((p) => p.runId)
		expect(frontier.sort()).toEqual(["balanced", "hi-acc-low-r", "lo-acc-hi-r"])
	})

	it("respects minTrades constraint", () => {
		const runs = [
			run("low", { profitFactor: 5.0, totalTrades: 5 }),
			run("ok", { profitFactor: 1.5, totalTrades: 50 }),
		]
		const points = computeParetoFrontier(runs, "maxDrawdown", "profitFactor", {
			minTrades: 30,
		})
		expect(points.map((p) => p.runId)).toEqual(["ok"])
	})

	it("respects robustOnly constraint", () => {
		const runs = [
			run("robust", { profitFactor: 1.6 }, { oosRobust: true }),
			run("fragile", { profitFactor: 2.5 }, { oosRobust: false }),
			run("unknown", { profitFactor: 1.8 }),
		]
		const points = computeParetoFrontier(runs, "maxDrawdown", "profitFactor", {
			robustOnly: true,
		})
		expect(points.map((p) => p.runId)).toEqual(["robust"])
	})

	it("respects minMatchRate constraint and drops runs without matchRate", () => {
		const runs = [
			run("good", { profitFactor: 1.5 }, { matchRate: 0.7 }),
			run("bad", { profitFactor: 1.5 }, { matchRate: 0.3 }),
			run("missing", { profitFactor: 1.5 }),
		]
		const points = computeParetoFrontier(runs, "maxDrawdown", "profitFactor", {
			minMatchRate: 0.5,
		})
		expect(points.map((p) => p.runId)).toEqual(["good"])
	})

	it("opting out of profitOnly admits PF<1 runs", () => {
		const runs = [
			run("loser", { profitFactor: 0.6, maxDrawdownCents: -100 }),
			run("winner", { profitFactor: 1.5, maxDrawdownCents: -500 }),
		]
		const points = computeParetoFrontier(runs, "maxDrawdown", "profitFactor", {
			profitOnly: false,
		})
		expect(points.map((p) => p.runId).sort()).toEqual(["loser", "winner"])
		// On (drawdown asc, PF desc), loser has best drawdown so it's on frontier
		// alongside winner with best PF.
		const frontier = points.filter((p) => p.isFrontier).map((p) => p.runId)
		expect(frontier.sort()).toEqual(["loser", "winner"])
	})

	it("OOS axis returns null for legacy runs (no summaryOOS); excludes them", () => {
		const legacy = run("legacy", { profitFactor: 2.0 })
		const wf = run(
			"wf",
			{ profitFactor: 1.5 },
			{ summaryOOS: summary({ profitFactor: 1.3, maxDrawdownCents: -400 }) }
		)
		const points = computeParetoFrontier(
			[legacy, wf],
			"maxDrawdownOOS",
			"profitFactorOOS"
		)
		expect(points.map((p) => p.runId)).toEqual(["wf"])
	})

	it("PF=Infinity (no losing trades) is normalized to a finite high value", () => {
		const runs = [
			run("perfect", { profitFactor: Infinity, maxDrawdownCents: -200 }),
			run("good", { profitFactor: 2.0, maxDrawdownCents: -100 }),
		]
		const points = computeParetoFrontier(runs)
		const perfect = points.find((p) => p.runId === "perfect")
		expect(perfect?.y).toBeGreaterThan(2.0)
		expect(perfect?.isFrontier).toBe(true)
	})
})
