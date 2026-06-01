import { describe, it, expect } from "vitest"
import { mintJourneyId, backfillJourneyId } from "@/lib/optimize/journey"
import type {
	OptimizationRun,
	BacktestSummary,
	StrategyRecipe,
} from "@/types/backtest"

const baseSummary: BacktestSummary = {
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
}

const run = (
	id: string,
	extra: Partial<OptimizationRun> = {}
): OptimizationRun => ({
	id,
	label: `Run ${id}`,
	recipe: { displayName: id } as StrategyRecipe,
	summary: baseSummary,
	equityCurve: [],
	trades: [],
	dayBreakdown: [],
	pinned: false,
	createdAt: "2026-05-30T00:00:00Z",
	...extra,
})

describe("mintJourneyId", () => {
	it("returns a string starting with 'j-'", () => {
		const id = mintJourneyId()
		expect(id).toMatch(/^j-[a-z0-9]+-[a-z0-9]+$/)
	})

	it("two consecutive mints differ", () => {
		const a = mintJourneyId()
		const b = mintJourneyId()
		expect(a).not.toBe(b)
	})
})

describe("backfillJourneyId", () => {
	it("stamps journeyId onto matching parents without one", () => {
		const runs = [run("a"), run("b"), run("c")]
		const result = backfillJourneyId(runs, ["a", "c"], "j-test-1")
		expect(result[0]?.provenance?.journeyId).toBe("j-test-1")
		expect(result[0]?.provenance?.stage).toBe("broad")
		expect(result[1]?.provenance).toBeUndefined()
		expect(result[2]?.provenance?.journeyId).toBe("j-test-1")
	})

	it("does not overwrite parents that already have a journeyId (refine-of-refine)", () => {
		const runs = [
			run("a", {
				provenance: {
					sweepId: "s1",
					datasetHash: "d",
					candleCount: 0,
					dateRangeHash: "r",
					dateFrom: "",
					dateTo: "",
					engineVersion: "v",
					recipeHash: "h",
					schemaVersion: 3,
					stage: "refine",
					journeyId: "j-original",
				},
			}),
		]
		const result = backfillJourneyId(runs, ["a"], "j-new")
		expect(result[0]?.provenance?.journeyId).toBe("j-original")
	})

	it("preserves all other provenance fields on stamp", () => {
		const runs = [
			run("a", {
				provenance: {
					sweepId: "s1",
					datasetHash: "d-hash",
					candleCount: 100,
					dateRangeHash: "r-hash",
					dateFrom: "2026-01-01",
					dateTo: "2026-01-31",
					engineVersion: "v0.5",
					recipeHash: "rec-hash",
					schemaVersion: 3,
				},
			}),
		]
		const result = backfillJourneyId(runs, ["a"], "j-x")
		expect(result[0]?.provenance?.datasetHash).toBe("d-hash")
		expect(result[0]?.provenance?.engineVersion).toBe("v0.5")
		expect(result[0]?.provenance?.journeyId).toBe("j-x")
	})

	it("does not mutate the input array", () => {
		const runs = [run("a")]
		const result = backfillJourneyId(runs, ["a"], "j-x")
		expect(runs[0]?.provenance).toBeUndefined()
		expect(result[0]?.provenance?.journeyId).toBe("j-x")
		expect(result).not.toBe(runs)
	})

	it("returns runs unchanged when no parents match", () => {
		const runs = [run("a")]
		const result = backfillJourneyId(runs, ["nope"], "j-x")
		expect(result).toEqual(runs)
	})
})
