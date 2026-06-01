import { describe, it, expect } from "vitest"
import { minePatterns, topDrivers } from "@/lib/optimize/loser-pattern"
import type {
	OptimizationRun,
	BacktestSummary,
	StrategyRecipe,
} from "@/types/backtest"

const summary = (
	pf: number,
	overrides: Partial<BacktestSummary> = {}
): BacktestSummary => ({
	totalTrades: 50,
	wins: 30,
	losses: 18,
	breakevens: 2,
	winRate: 60,
	profitFactor: pf,
	totalPnlCents: 0,
	avgPnlCents: 0,
	avgWinCents: 0,
	avgLossCents: 0,
	avgRMultiple: 0,
	maxDrawdownCents: -1000,
	maxConsecutiveLosses: 3,
	maxConsecutiveWins: 5,
	sharpeRatio: 1,
	expectancy: 0,
	totalDays: 30,
	tradingDays: 25,
	...overrides,
})

const run = (
	id: string,
	pf: number,
	recipe: Partial<StrategyRecipe>
): OptimizationRun => ({
	id,
	label: id,
	recipe: recipe as StrategyRecipe,
	summary: summary(pf),
	equityCurve: [],
	trades: [],
	dayBreakdown: [],
	pinned: false,
	createdAt: "2026-05-30T00:00:00Z",
})

describe("minePatterns", () => {
	it("returns empty drivers when no winners or no losers", () => {
		const result = minePatterns({
			runs: [
				run("a", 2.0, { displayName: "x" }),
				run("b", 1.8, { displayName: "y" }),
			],
			leafPaths: ["displayName"],
		})
		expect(result.winners).toBe(2)
		expect(result.losers).toBe(0)
		expect(result.drivers).toEqual([])
	})

	it("flags strong winner-leaning values with negative delta", () => {
		const winners = [
			run("w1", 2.0, {
				stop: { initial: { points: 100 } },
			} as Partial<StrategyRecipe>),
			run("w2", 2.0, {
				stop: { initial: { points: 100 } },
			} as Partial<StrategyRecipe>),
			run("w3", 2.0, {
				stop: { initial: { points: 100 } },
			} as Partial<StrategyRecipe>),
		]
		const losers = [
			run("l1", 0.5, {
				stop: { initial: { points: 200 } },
			} as Partial<StrategyRecipe>),
			run("l2", 0.5, {
				stop: { initial: { points: 200 } },
			} as Partial<StrategyRecipe>),
			run("l3", 0.5, {
				stop: { initial: { points: 200 } },
			} as Partial<StrategyRecipe>),
		]
		const result = minePatterns({
			runs: [...winners, ...losers],
			leafPaths: ["stop.initial.points"],
		})
		const winnerDriver = result.drivers.find((d) => d.value === 100)
		const loserDriver = result.drivers.find((d) => d.value === 200)
		expect(winnerDriver?.delta).toBe(-1) // winnerFreq=1, loserFreq=0
		expect(loserDriver?.delta).toBe(1) // winnerFreq=0, loserFreq=1
	})

	it("sorts drivers by absolute delta descending", () => {
		const runs = [
			run("w1", 2.0, { a: "x", b: "p" } as unknown as Partial<StrategyRecipe>),
			run("w2", 2.0, { a: "x", b: "q" } as unknown as Partial<StrategyRecipe>),
			run("l1", 0.5, { a: "y", b: "p" } as unknown as Partial<StrategyRecipe>),
			run("l2", 0.5, { a: "y", b: "q" } as unknown as Partial<StrategyRecipe>),
		]
		const result = minePatterns({ runs, leafPaths: ["a", "b"] })
		expect(Math.abs(result.drivers[0]!.delta)).toBeGreaterThanOrEqual(
			Math.abs(result.drivers[result.drivers.length - 1]!.delta)
		)
	})

	it("ignores runs in the gray zone (PF between loserMax and winnerMin)", () => {
		const result = minePatterns({
			runs: [
				run("w", 2.0, { a: "x" } as unknown as Partial<StrategyRecipe>),
				run("g", 1.2, { a: "y" } as unknown as Partial<StrategyRecipe>), // gray
				run("l", 0.5, { a: "z" } as unknown as Partial<StrategyRecipe>),
			],
			leafPaths: ["a"],
		})
		expect(result.winners).toBe(1)
		expect(result.losers).toBe(1)
		const allValues = result.drivers.map((d) => d.value)
		expect(allValues).not.toContain("y")
	})

	it("custom thresholds reshape the pools", () => {
		const result = minePatterns({
			runs: [
				run("a", 1.3, { mode: "alpha" } as unknown as Partial<StrategyRecipe>),
				run("b", 0.9, { mode: "beta" } as unknown as Partial<StrategyRecipe>),
			],
			leafPaths: ["mode"],
			winnerPfMin: 1.2,
			loserPfMax: 1.0,
		})
		expect(result.winners).toBe(1)
		expect(result.losers).toBe(1)
		expect(result.drivers.length).toBe(2)
	})

	it("handles bool and number leaves alongside strings", () => {
		const result = minePatterns({
			runs: [
				run("w1", 2.0, {
					breakeven: { enabled: true },
					stop: { initial: { points: 100 } },
				} as unknown as Partial<StrategyRecipe>),
				run("l1", 0.5, {
					breakeven: { enabled: false },
					stop: { initial: { points: 200 } },
				} as unknown as Partial<StrategyRecipe>),
			],
			leafPaths: ["breakeven.enabled", "stop.initial.points"],
		})
		// 1 winner + 1 loser; every leaf has 100% concentration on each side ⇒ |delta|=1
		expect(result.drivers.every((d) => Math.abs(d.delta) === 1)).toBe(true)
	})
})

describe("topDrivers", () => {
	it("limits to N drivers above minAbsDelta", () => {
		const result = minePatterns({
			runs: [
				run("w1", 2.0, {
					a: "x",
					b: "p",
				} as unknown as Partial<StrategyRecipe>),
				run("w2", 2.0, {
					a: "x",
					b: "p",
				} as unknown as Partial<StrategyRecipe>),
				run("l1", 0.5, {
					a: "y",
					b: "p",
				} as unknown as Partial<StrategyRecipe>),
				run("l2", 0.5, {
					a: "y",
					b: "p",
				} as unknown as Partial<StrategyRecipe>),
			],
			leafPaths: ["a", "b"],
		})
		// `a` flips (delta±1), `b` doesn't (delta=0). minAbsDelta=0.5 drops `b`.
		const top = topDrivers(result, 10, 0.5)
		expect(top.every((d) => d.leafPath === "a")).toBe(true)
	})

	it("respects the limit param", () => {
		const result = minePatterns({
			runs: [
				run("w1", 2.0, {
					a: "x",
					b: "p",
					c: "m",
				} as unknown as Partial<StrategyRecipe>),
				run("l1", 0.5, {
					a: "y",
					b: "q",
					c: "n",
				} as unknown as Partial<StrategyRecipe>),
			],
			leafPaths: ["a", "b", "c"],
		})
		// 6 driver rows total; limit=2 caps the list.
		const top = topDrivers(result, 2, 0)
		expect(top.length).toBeLessThanOrEqual(2)
	})
})
