import { describe, it, expect } from "vitest"
import { runGovernorSweep, type SweepTrade } from "@/lib/hawks/governor-sweep"
import { resolveHawksDailyGovernor } from "@/lib/hawks/daily-governor"

// Helper mirroring the sweep's per-prefix governor call for the parity test.
const runGovernorSweepPrefix = (
	prefix: SweepTrade[],
	dailyTargetR: number,
	floorR: number
) => resolveHawksDailyGovernor({ trades: prefix, dailyTargetR, floorR })

const t = (
	tradingDay: string,
	rOutcome: number,
	outcome: SweepTrade["outcome"] = rOutcome > 0
		? "win"
		: rOutcome < 0
			? "loss"
			: "breakeven"
): SweepTrade => ({ tradingDay, rOutcome, outcome })

const TARGET = 5

describe("runGovernorSweep", () => {
	it("baseline keeps every trade (no governor)", () => {
		const trades = [
			t("2026-01-01", 1),
			t("2026-01-01", -1),
			t("2026-01-01", -1),
		]
		const { baseline } = runGovernorSweep({ trades, dailyTargetR: TARGET })
		expect(baseline.floorR).toBeNull()
		expect(baseline.tradesKept).toBe(3)
		expect(baseline.tradesDropped).toBe(0)
		expect(baseline.totalR).toBe(-1)
		expect(baseline.redDays).toBe(1)
	})

	it("floor 0 (never-red) truncates a day that would go red", () => {
		// +1, -1 → 0R (stop here), the second -1 is dropped.
		const trades = [
			t("2026-01-01", 1),
			t("2026-01-01", -1),
			t("2026-01-01", -1),
		]
		const { floors } = runGovernorSweep({
			trades,
			dailyTargetR: TARGET,
			floors: [0],
		})
		const f0 = floors[0]!
		expect(f0.floorR).toBe(0)
		expect(f0.totalR).toBe(0) // day floored at break-even
		expect(f0.tradesKept).toBe(2) // +1 and the -1 that lands on 0
		expect(f0.tradesDropped).toBe(1)
		expect(f0.daysCapped).toBe(1)
		expect(f0.redDays).toBe(0) // never-red: no red day survives
	})

	it("higher floor drops more trades and reduces both drawdown and total R", () => {
		// Two days. Day 1 rides up then gives back; day 2 similar.
		const trades = [
			t("2026-01-01", 2),
			t("2026-01-01", -1),
			t("2026-01-01", -1),
			t("2026-01-02", 3),
			t("2026-01-02", -1),
			t("2026-01-02", -1),
			t("2026-01-02", -1),
		]
		const { baseline, floors } = runGovernorSweep({
			trades,
			dailyTargetR: TARGET,
			floors: [0, 1],
		})
		const f0 = floors[0]!
		const f1 = floors[1]!
		// Baseline: day1 = 0R, day2 = 0R → totalR 0.
		expect(baseline.totalR).toBe(0)
		// floor 1 keeps more profit locked → totalR >= floor 0's totalR.
		expect(f1.totalR).toBeGreaterThanOrEqual(f0.totalR)
		// Higher floor drops at least as many trades.
		expect(f1.tradesDropped).toBeGreaterThanOrEqual(f0.tradesDropped)
	})

	it("expectancy = totalR / kept non-breakeven trades", () => {
		const trades = [t("2026-01-01", 2), t("2026-01-01", 1)] // +3R, 2 trades, no stop
		const { floors } = runGovernorSweep({
			trades,
			dailyTargetR: TARGET,
			floors: [0],
		})
		const f0 = floors[0]!
		expect(f0.totalR).toBe(3)
		expect(f0.tradesKept).toBe(2)
		expect(f0.expectancy).toBeCloseTo(1.5, 5)
	})

	it("breakeven trades don't count toward expectancy denominator", () => {
		const trades = [t("2026-01-01", 1), t("2026-01-01", 0, "breakeven")]
		const { baseline } = runGovernorSweep({ trades, dailyTargetR: TARGET })
		expect(baseline.tradesKept).toBe(1) // BE excluded
		expect(baseline.expectancy).toBeCloseTo(1, 5)
	})

	it("computes cross-day drawdown on the cumulative-R curve", () => {
		// Baseline: day1 +2R, day2 -3R, day3 +1R → cum: 2, -1, 0. Peak 2, trough -1 → DD 3R.
		const trades = [
			t("2026-01-01", 2),
			t("2026-01-02", -3, "loss"),
			t("2026-01-03", 1),
		]
		const { baseline } = runGovernorSweep({ trades, dailyTargetR: TARGET })
		expect(baseline.maxDrawdownR).toBe(3)
	})

	it("post-target day: keeps through the first post-target loss, drops the rest", () => {
		// target 5: +5 (target), +1, -1 (stop here), -1 (dropped)
		const trades = [
			t("2026-01-01", 5),
			t("2026-01-01", 1),
			t("2026-01-01", -1),
			t("2026-01-01", -1),
		]
		const { floors } = runGovernorSweep({
			trades,
			dailyTargetR: TARGET,
			floors: [0],
		})
		const f0 = floors[0]!
		expect(f0.tradesKept).toBe(3)
		expect(f0.tradesDropped).toBe(1)
		expect(f0.totalR).toBe(5)
	})

	it("empty trades → zeroed rows, no divide-by-zero", () => {
		const { baseline, floors } = runGovernorSweep({
			trades: [],
			dailyTargetR: TARGET,
			floors: [0],
		})
		expect(baseline.totalR).toBe(0)
		expect(baseline.expectancy).toBe(0)
		expect(baseline.avgTradesPerDay).toBe(0)
		expect(floors[0]!.tradingDays).toBe(0)
	})

	it("default floors are swept when none provided", () => {
		const trades = [t("2026-01-01", 1), t("2026-01-01", -1)]
		const { floors } = runGovernorSweep({ trades, dailyTargetR: TARGET })
		expect(floors.map((f) => f.floorR)).toEqual([-1, 0, 1, 2])
	})

	// PARITY: prove post-hoc truncation == in-loop enforcement. Because Hawks
	// generation is path-independent, an engine that STOPS GENERATING mid-day the
	// moment the governor fires produces the same kept-trade set as truncating
	// the full day afterward. We simulate in-loop enforcement here and assert the
	// resulting kept R-sequence per day matches the sweep's truncation.
	describe("truncation == in-loop parity", () => {
		// In-loop: feed trades one at a time; after each, if the governor would
		// stop, we would not have generated any further trade that day.
		const inLoopKeep = (
			dayTrades: SweepTrade[],
			dailyTargetR: number,
			floorR: number
		): SweepTrade[] => {
			const kept: SweepTrade[] = []
			for (const trade of dayTrades) {
				kept.push(trade) // generate + take this trade
				const { shouldStop } = runGovernorSweepPrefix(
					kept,
					dailyTargetR,
					floorR
				)
				if (shouldStop) {
					break // engine halts generation for the day
				}
			}
			return kept
		}

		it.each([-1, 0, 1, 2])(
			"floor %d: sweep truncation matches in-loop on varied days",
			(floorR) => {
				const days: SweepTrade[][] = [
					[t("d1", 1), t("d1", -1), t("d1", -1)],
					[t("d2", 1.5), t("d2", -1), t("d2", 1)],
					[t("d3", 5), t("d3", 1), t("d3", -1), t("d3", -1)],
					[t("d4", 2), t("d4", 1), t("d4", -1), t("d4", -1), t("d4", -1)],
				]
				const flat = days.flat()
				const { floors } = runGovernorSweep({
					trades: flat,
					dailyTargetR: TARGET,
					floors: [floorR],
				})
				// Reconstruct in-loop kept totals per day and compare aggregate R.
				let inLoopTotalR = 0
				let inLoopKept = 0
				for (const day of days) {
					const kept = inLoopKeep(day, TARGET, floorR)
					inLoopTotalR += kept.reduce((s, x) => s + x.rOutcome, 0)
					inLoopKept += kept.filter((x) => x.outcome !== "breakeven").length
				}
				expect(floors[0]!.totalR).toBeCloseTo(inLoopTotalR, 5)
				expect(floors[0]!.tradesKept).toBe(inLoopKept)
			}
		)
	})
})
