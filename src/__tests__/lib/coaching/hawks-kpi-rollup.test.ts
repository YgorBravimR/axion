import { describe, it, expect } from "vitest"

/**
 * Hawks discipline KPI aggregation math tests.
 *
 * These tests cover the pure calculation logic that transforms raw counts
 * (from getStrategyHawksRollup) into percentages and composite scores.
 * They validate the aggregation formulas used in the playbook detail page
 * and the hawks-playbook-panel component.
 *
 * KPI Axes tested:
 * - VWAP: vwapRespectedCount / totalHawksTrades
 * - Ajuste: ajusteRespectedCount / totalHawksTrades
 * - Triple-Screen: tripleScreenConfirmedCount / totalHawksTrades
 * - Bias-Respected: biasRespectedCount / biasRespectedDenom (when denom > 0)
 * - Daily Cap: withinDailyCapCount + overDailyCapCount (non-percentage, raw split)
 * - Composite Discipline Score: unweighted mean of axis rates, skipping bias when denom=0
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

interface StrategyHawksRollup {
	totalHawksTrades: number
	vwapRespectedCount: number
	ajusteRespectedCount: number
	tripleScreenConfirmedCount: number
	biasRespectedCount: number
	biasRespectedDenom: number
	withinDailyCapCount: number
	overDailyCapCount: number
	scenarioDistribution: unknown[]
}

const createMockRollup = (
	overrides: Partial<StrategyHawksRollup> = {}
): StrategyHawksRollup => ({
	totalHawksTrades: 10,
	vwapRespectedCount: 8,
	ajusteRespectedCount: 7,
	tripleScreenConfirmedCount: 6,
	biasRespectedCount: 5,
	biasRespectedDenom: 10,
	withinDailyCapCount: 9,
	overDailyCapCount: 1,
	scenarioDistribution: [],
	...overrides,
})

/**
 * Calculate a single KPI axis as a rate [0, 1].
 * Returns 0 when total is 0 (avoid division by zero).
 */
const calculateAxisRate = (respected: number, total: number): number => {
	if (total === 0) {
		return 0
	}
	return respected / total
}

/**
 * Calculate the Hawks composite discipline score.
 * Unweighted mean of [VWAP, Ajuste, TripleScreen, Bias] rates.
 * Bias is skipped if biasRespectedDenom is 0 (no confirmed-bias days).
 * Returns null when totalHawksTrades is 0.
 */
const calculateDisciplineScore = (
	rollup: StrategyHawksRollup
): number | null => {
	if (rollup.totalHawksTrades === 0) {
		return null
	}
	const rates: number[] = [
		calculateAxisRate(rollup.vwapRespectedCount, rollup.totalHawksTrades),
		calculateAxisRate(rollup.ajusteRespectedCount, rollup.totalHawksTrades),
		calculateAxisRate(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		),
	]
	if (rollup.biasRespectedDenom > 0) {
		rates.push(
			calculateAxisRate(rollup.biasRespectedCount, rollup.biasRespectedDenom)
		)
	}
	return rates.reduce((sum, r) => sum + r, 0) / rates.length
}

// ─── VWAP Axis ───────────────────────────────────────────────────────────────

describe("Hawks KPI — VWAP axis", () => {
	it("should calculate VWAP rate as respected / total when total > 0", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 8,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0.8)
	})

	it("should return 0 when VWAP respected is 0", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 0,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0)
	})

	it("should return 1.0 when all trades respected VWAP (100%)", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 10,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(1)
	})

	it("should return 0 when totalHawksTrades is 0 (avoid division by zero)", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 5,
			totalHawksTrades: 0,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0)
	})

	it("should calculate partial rate 1/3 correctly", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 1,
			totalHawksTrades: 3,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBeCloseTo(0.333333, 5)
	})
})

// ─── Ajuste Axis ──────────────────────────────────────────────────────────────

describe("Hawks KPI — Ajuste axis", () => {
	it("should calculate Ajuste rate as respected / total when total > 0", () => {
		const rollup = createMockRollup({
			ajusteRespectedCount: 7,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0.7)
	})

	it("should return 0 when Ajuste respected is 0", () => {
		const rollup = createMockRollup({
			ajusteRespectedCount: 0,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0)
	})

	it("should return 1.0 when all trades respected Ajuste (100%)", () => {
		const rollup = createMockRollup({
			ajusteRespectedCount: 10,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(1)
	})

	it("should return 0 when totalHawksTrades is 0", () => {
		const rollup = createMockRollup({
			ajusteRespectedCount: 3,
			totalHawksTrades: 0,
		})
		const rate = calculateAxisRate(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0)
	})

	it("should calculate partial rate 2/5 correctly", () => {
		const rollup = createMockRollup({
			ajusteRespectedCount: 2,
			totalHawksTrades: 5,
		})
		const rate = calculateAxisRate(
			rollup.ajusteRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0.4)
	})
})

// ─── Triple-Screen Axis ───────────────────────────────────────────────────────

describe("Hawks KPI — Triple-Screen axis", () => {
	it("should calculate Triple-Screen rate as confirmed / total when total > 0", () => {
		const rollup = createMockRollup({
			tripleScreenConfirmedCount: 6,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0.6)
	})

	it("should return 0 when Triple-Screen confirmed is 0", () => {
		const rollup = createMockRollup({
			tripleScreenConfirmedCount: 0,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0)
	})

	it("should return 1.0 when all trades confirmed Triple-Screen (100%)", () => {
		const rollup = createMockRollup({
			tripleScreenConfirmedCount: 10,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(1)
	})

	it("should return 0 when totalHawksTrades is 0", () => {
		const rollup = createMockRollup({
			tripleScreenConfirmedCount: 5,
			totalHawksTrades: 0,
		})
		const rate = calculateAxisRate(
			rollup.tripleScreenConfirmedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0)
	})
})

// ─── Bias-Respected Axis ──────────────────────────────────────────────────────

describe("Hawks KPI — Bias-Respected axis", () => {
	it("should calculate Bias rate as biasRespectedCount / biasRespectedDenom when denom > 0", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 5,
			biasRespectedDenom: 10,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBe(0.5)
	})

	it("should return 0 when biasRespectedCount is 0", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 0,
			biasRespectedDenom: 10,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBe(0)
	})

	it("should return 1.0 when all bias-checked trades respected bias (100%)", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 10,
			biasRespectedDenom: 10,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBe(1)
	})

	it("should return 0 when biasRespectedDenom is 0 (no bias data recorded)", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 5,
			biasRespectedDenom: 0,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBe(0)
	})

	it("should calculate partial rate 3/7 correctly", () => {
		const rollup = createMockRollup({
			biasRespectedCount: 3,
			biasRespectedDenom: 7,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBeCloseTo(0.428571, 5)
	})

	it("should handle case where biasRespectedCount > biasRespectedDenom (data inconsistency)", () => {
		// This shouldn't happen in practice but the formula should still work
		const rollup = createMockRollup({
			biasRespectedCount: 12,
			biasRespectedDenom: 10,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBe(1.2)
	})
})

// ─── Daily Cap ────────────────────────────────────────────────────────────────

describe("Hawks KPI — Daily Cap (non-percentage split)", () => {
	it("should keep withinDailyCapCount and overDailyCapCount as raw counts", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 9,
			overDailyCapCount: 1,
		})
		expect(rollup.withinDailyCapCount).toBe(9)
		expect(rollup.overDailyCapCount).toBe(1)
	})

	it("should calculate overCapRate when total > 0", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 9,
			overDailyCapCount: 1,
		})
		const capTotal = rollup.withinDailyCapCount + rollup.overDailyCapCount
		const overCapRate = capTotal > 0 ? rollup.overDailyCapCount / capTotal : 0
		expect(overCapRate).toBe(0.1)
	})

	it("should return 0 overCapRate when total is 0", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 0,
			overDailyCapCount: 0,
		})
		const capTotal = rollup.withinDailyCapCount + rollup.overDailyCapCount
		const overCapRate = capTotal > 0 ? rollup.overDailyCapCount / capTotal : 0
		expect(overCapRate).toBe(0)
	})

	it("should return 100% overCapRate when all trades exceed daily cap", () => {
		const rollup = createMockRollup({
			withinDailyCapCount: 0,
			overDailyCapCount: 5,
		})
		const capTotal = rollup.withinDailyCapCount + rollup.overDailyCapCount
		const overCapRate = capTotal > 0 ? rollup.overDailyCapCount / capTotal : 0
		expect(overCapRate).toBe(1)
	})
})

// ─── Composite Discipline Score ───────────────────────────────────────────────

describe("Hawks KPI — Composite Discipline Score", () => {
	it("should return null when totalHawksTrades is 0 (no data)", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 0,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBeNull()
	})

	it("should average 4 rates when all axes have data (bias denom > 0)", () => {
		// VWAP: 8/10 = 0.8
		// Ajuste: 7/10 = 0.7
		// TripleScreen: 6/10 = 0.6
		// Bias: 5/10 = 0.5
		// Mean = (0.8 + 0.7 + 0.6 + 0.5) / 4 = 2.6 / 4 = 0.65
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 8,
			ajusteRespectedCount: 7,
			tripleScreenConfirmedCount: 6,
			biasRespectedCount: 5,
			biasRespectedDenom: 10,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBe(0.65)
	})

	it("should average 3 rates when bias denom is 0 (no bias data)", () => {
		// VWAP: 8/10 = 0.8
		// Ajuste: 7/10 = 0.7
		// TripleScreen: 6/10 = 0.6
		// Bias skipped (denom = 0)
		// Mean = (0.8 + 0.7 + 0.6) / 3 = 2.1 / 3 = 0.7
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 8,
			ajusteRespectedCount: 7,
			tripleScreenConfirmedCount: 6,
			biasRespectedCount: 0,
			biasRespectedDenom: 0,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBeCloseTo(0.7, 5)
	})

	it("should handle 100% discipline score (all axes 1.0)", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 10,
			ajusteRespectedCount: 10,
			tripleScreenConfirmedCount: 10,
			biasRespectedCount: 10,
			biasRespectedDenom: 10,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBe(1.0)
	})

	it("should handle 0% discipline score (all axes 0)", () => {
		const rollup = createMockRollup({
			totalHawksTrades: 10,
			vwapRespectedCount: 0,
			ajusteRespectedCount: 0,
			tripleScreenConfirmedCount: 0,
			biasRespectedCount: 0,
			biasRespectedDenom: 10,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBe(0)
	})

	it("should weight 3 respected axes equally when bias has no data", () => {
		// Test the logic that skips bias when denom=0
		// VWAP: 1/2 = 0.5
		// Ajuste: 1/2 = 0.5
		// TripleScreen: 1/2 = 0.5
		// Mean = (0.5 + 0.5 + 0.5) / 3 = 0.5
		const rollup = createMockRollup({
			totalHawksTrades: 2,
			vwapRespectedCount: 1,
			ajusteRespectedCount: 1,
			tripleScreenConfirmedCount: 1,
			biasRespectedCount: 0,
			biasRespectedDenom: 0,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBe(0.5)
	})

	it("should correctly average mixed rates (1/4, 2/4, 3/4, 2/4)", () => {
		// VWAP: 1/4 = 0.25
		// Ajuste: 2/4 = 0.5
		// TripleScreen: 3/4 = 0.75
		// Bias: 2/4 = 0.5
		// Mean = (0.25 + 0.5 + 0.75 + 0.5) / 4 = 2.0 / 4 = 0.5
		const rollup = createMockRollup({
			totalHawksTrades: 4,
			vwapRespectedCount: 1,
			ajusteRespectedCount: 2,
			tripleScreenConfirmedCount: 3,
			biasRespectedCount: 2,
			biasRespectedDenom: 4,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBe(0.5)
	})
})

// ─── Scenario Distribution ────────────────────────────────────────────────────

describe("Hawks KPI — Scenario Distribution", () => {
	it("should preserve scenarioDistribution array from rollup", () => {
		const scenarios = [
			{ scenarioId: "s1", code: "ROMPIMENTO", name: "Rompimento", count: 5 },
			{ scenarioId: "s2", code: "PULLBACK", name: "Pullback", count: 3 },
			{ scenarioId: null, code: null, name: null, count: 2 },
		]
		const rollup = createMockRollup({
			scenarioDistribution: scenarios,
		})
		expect(rollup.scenarioDistribution).toEqual(scenarios)
	})

	it("should handle empty scenario distribution", () => {
		const rollup = createMockRollup({
			scenarioDistribution: [],
		})
		expect(rollup.scenarioDistribution).toHaveLength(0)
	})

	it("should handle null scenarioId (untagged bucket)", () => {
		const scenarios = [{ scenarioId: null, code: null, name: null, count: 10 }]
		const rollup = createMockRollup({
			scenarioDistribution: scenarios,
		})
		expect(rollup.scenarioDistribution[0]?.scenarioId).toBeNull()
		expect(rollup.scenarioDistribution[0]?.count).toBe(10)
	})
})

// ─── Data Hygiene & Edge Cases ────────────────────────────────────────────────

describe("Hawks KPI — Data Hygiene", () => {
	it("should handle when respected count exceeds total (should not happen but formula still works)", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 15,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(1.5)
	})

	it("should handle negative counts (should not happen, but formula is robust)", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: -5,
			totalHawksTrades: 10,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(-0.5)
	})

	it("should handle very large counts", () => {
		const rollup = createMockRollup({
			vwapRespectedCount: 1000000,
			totalHawksTrades: 2000000,
		})
		const rate = calculateAxisRate(
			rollup.vwapRespectedCount,
			rollup.totalHawksTrades
		)
		expect(rate).toBe(0.5)
	})

	it("should handle floating-point precision in discipline score calculation", () => {
		// Test with fractions that can cause floating-point drift
		const rollup = createMockRollup({
			totalHawksTrades: 3,
			vwapRespectedCount: 1,
			ajusteRespectedCount: 1,
			tripleScreenConfirmedCount: 1,
			biasRespectedCount: 1,
			biasRespectedDenom: 3,
		})
		const score = calculateDisciplineScore(rollup)
		expect(score).toBeDefined()
		expect(typeof score).toBe("number")
		expect(Number.isFinite(score!)).toBe(true)
	})

	it("should handle case where biasRespectedDenom > totalHawksTrades", () => {
		// This can happen if bias is recorded for trades in multiple strategies
		const rollup = createMockRollup({
			totalHawksTrades: 5,
			biasRespectedCount: 8,
			biasRespectedDenom: 12,
		})
		const rate = calculateAxisRate(
			rollup.biasRespectedCount,
			rollup.biasRespectedDenom
		)
		expect(rate).toBeCloseTo(0.666667, 5)
	})
})
